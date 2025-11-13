import {
  getBakeSpecs,
  getBakeSpecByItemGuid,
  saveSchedule,
  getScheduleByDate,
  getSchedulesByDateRange,
  deleteScheduleByDate,
  updateScheduleBatch,
  getEarliestOrderDate,
} from "./repository.js";
import { getForecast } from "../forecast/service.js";
import {
  ABS_DEFAULTS,
  BUSINESS_HOURS,
  OVEN_CONFIG,
} from "../config/constants.js";
import {
  parseTimeToMinutes,
  formatMinutesToTime,
  addMinutesToTime,
} from "../shared/utils/timeUtils.js";
import { parseISO, format, addDays } from "date-fns";
import { v4 as uuidv4 } from "uuid";

/**
 * ABS Schedule service - Core schedule generation algorithm
 */

/**
 * Validate that bake spec has all required fields for scheduling
 * @param {Object} bakeSpec - Bake spec to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateBakeSpecForScheduling(bakeSpec) {
  if (
    !bakeSpec.capacityPerRack ||
    typeof bakeSpec.capacityPerRack !== "number" ||
    bakeSpec.capacityPerRack <= 0
  ) {
    return {
      valid: false,
      error: "capacityPerRack is required and must be a positive number",
    };
  }
  if (
    !bakeSpec.bakeTimeMinutes ||
    typeof bakeSpec.bakeTimeMinutes !== "number" ||
    bakeSpec.bakeTimeMinutes <= 0
  ) {
    return {
      valid: false,
      error: "bakeTimeMinutes is required and must be a positive number",
    };
  }
  if (
    bakeSpec.coolTimeMinutes === undefined ||
    bakeSpec.coolTimeMinutes === null
  ) {
    return { valid: false, error: "coolTimeMinutes is required" };
  }
  // oven is optional (can be null/undefined for "Any")
  return { valid: true };
}

/**
 * Calculate batches needed for a SKU based on forecast
 * Uses bake spec as EXCLUSIVE source - no fallbacks to defaults
 * @param {Object} forecastItem - Forecast item with forecast quantity
 * @param {Object} bakeSpec - Bake spec for the item (must have all required fields)
 * @param {number} restockThreshold - Restock threshold (fallback if not in bake spec)
 * @returns {Array} Array of batch objects
 */
function calculateBatches(
  forecastItem,
  bakeSpec,
  restockThreshold = ABS_DEFAULTS.RESTOCK_THRESHOLD
) {
  const batches = [];
  const forecastQty = forecastItem.forecast || 0;

  // Validate bake spec has all required fields - use bake spec EXCLUSIVELY
  const validation = validateBakeSpecForScheduling(bakeSpec);
  if (!validation.valid) {
    throw new Error(
      `Invalid bake spec for ${bakeSpec.itemGuid || forecastItem.itemGuid}: ${
        validation.error
      }`
    );
  }

  // Use bake spec values EXCLUSIVELY - no fallbacks
  const batchSize = bakeSpec.capacityPerRack;
  const bakeTime = bakeSpec.bakeTimeMinutes;
  const coolTime = bakeSpec.coolTimeMinutes;
  const itemRestockThreshold =
    bakeSpec.restockThreshold !== undefined
      ? bakeSpec.restockThreshold
      : restockThreshold;

  // Calculate how many batches to bake
  // We want to ensure we have enough to meet forecast + restock threshold
  const totalNeeded = forecastQty + itemRestockThreshold;
  const batchesToBake = Math.ceil(totalNeeded / batchSize);

  for (let i = 0; i < batchesToBake; i++) {
    batches.push({
      batchId: uuidv4(),
      itemGuid: forecastItem.itemGuid || bakeSpec.itemGuid,
      displayName: forecastItem.displayName || bakeSpec.displayName,
      quantity: batchSize, // From bake spec exclusively
      bakeTime: bakeTime, // From bake spec exclusively
      coolTime: coolTime, // From bake spec exclusively
      oven: bakeSpec.oven !== undefined ? bakeSpec.oven : null, // From bake spec exclusively (null means "Any")
      freshWindowMinutes: bakeSpec.freshWindowMinutes, // From bake spec exclusively
      restockThreshold: itemRestockThreshold, // From bake spec if available, otherwise parameter
      rackPosition: null, // Will be assigned during scheduling
      startTime: null, // Will be assigned during scheduling
      endTime: null, // Will be calculated during scheduling
    });
  }

  return batches;
}

/**
 * Round minutes to the next 20-minute increment
 * Batches can ONLY start at :00, :20, :40 of each hour
 * @param {number} minutes - Minutes since midnight
 * @returns {number} Rounded minutes to next 20-minute increment (0, 20, 40 of each hour)
 */
function roundToTwentyMinuteIncrement(minutes) {
  const increment = 20;
  return Math.ceil(minutes / increment) * increment;
}

/**
 * Check if a time is at a valid 20-minute increment
 * @param {number} minutes - Minutes since midnight
 * @returns {boolean} True if minutes is at :00, :20, or :40
 */
function isValidTwentyMinuteIncrement(minutes) {
  return minutes % 20 === 0;
}

/**
 * Schedule batches using PAR-based algorithm with time-interval forecasts
 * @param {Array} batches - Array of batch objects
 * @param {Array} timeIntervalForecast - Time-interval forecast data
 * @param {Map} bakeSpecMap - Map of itemGuid to bake spec
 * @param {Date} date - Schedule date
 * @returns {Array} Scheduled batches
 */
function scheduleBatchesWithPAR(
  batches,
  timeIntervalForecast,
  bakeSpecMap,
  date
) {
  const scheduled = [];
  const racks = Array(OVEN_CONFIG.TOTAL_RACKS)
    .fill(null)
    .map(() => ({
      batches: [],
      endTime: BUSINESS_HOURS.START_MINUTES,
    }));

  // Group batches by itemGuid
  const batchesByItem = new Map();
  batches.forEach((batch) => {
    if (!batchesByItem.has(batch.itemGuid)) {
      batchesByItem.set(batch.itemGuid, []);
    }
    batchesByItem.get(batch.itemGuid).push(batch);
  });

  // Group time-interval forecast by itemGuid
  const forecastByItem = new Map();
  timeIntervalForecast.forEach((forecast) => {
    const itemGuid = forecast.itemGuid;
    if (!itemGuid) return;

    if (!forecastByItem.has(itemGuid)) {
      forecastByItem.set(itemGuid, []);
    }
    forecastByItem.get(itemGuid).push(forecast);
  });

  // Process each item
  batchesByItem.forEach((itemBatches, itemGuid) => {
    const bakeSpec = bakeSpecMap.get(itemGuid);
    if (!bakeSpec) return;

    // Use flat PAR values for the whole day (not per hour)
    const parMin =
      bakeSpec.parMin !== null && bakeSpec.parMin !== undefined
        ? bakeSpec.parMin
        : 0;
    const parMax =
      bakeSpec.parMax !== null && bakeSpec.parMax !== undefined
        ? bakeSpec.parMax
        : null;
    const bakeTime = bakeSpec.bakeTimeMinutes;
    const coolTime = bakeSpec.coolTimeMinutes || 0;
    const itemForecast = forecastByItem.get(itemGuid) || [];

    // Sort forecast by time interval
    itemForecast.sort((a, b) => a.timeInterval - b.timeInterval);

    // Simulate inventory over time
    // Calculate cumulative demand and schedule batches to meet it throughout the day
    let cumulativeDemand = 0;
    let cumulativeInventory = 0;
    let batchIndex = 0;
    const requiredBatchTimes = []; // Times when batches need to be available

    // First pass: identify when batches need to be available based on cumulative demand
    // Schedule batches so cumulative inventory stays above cumulative demand + PAR min
    itemForecast.forEach((forecast) => {
      cumulativeDemand += forecast.forecast;

      // Calculate required inventory at this point: cumulative demand + PAR min buffer
      const requiredInventory = cumulativeDemand + parMin;

      // Check if we need more batches to meet this requirement
      while (
        cumulativeInventory < requiredInventory &&
        batchIndex < itemBatches.length
      ) {
        // Need batch available at this time (or slightly before to account for demand)
        const requiredAvailableTime = forecast.timeInterval;
        requiredBatchTimes.push({
          availableTime: requiredAvailableTime,
          priority: cumulativeInventory < cumulativeDemand ? 1 : 2, // Priority 1 if we're behind demand
        });
        // Add batch quantity to cumulative inventory
        cumulativeInventory += itemBatches[batchIndex].quantity;
        batchIndex++;
      }
    });

    // Second pass: check for waste (Priority 2: minimize waste)
    // Simulate inventory with scheduled batches and identify waste
    let currentInventory = 0;
    batchIndex = 0;
    const wasteDelays = new Map(); // Track which batches can be delayed

    itemForecast.forEach((forecast) => {
      // Subtract forecasted demand
      currentInventory = Math.max(0, currentInventory - forecast.forecast);

      // Check if we have batches scheduled for this time interval
      const batchesForThisTime = requiredBatchTimes.filter(
        (bt) => bt.availableTime === forecast.timeInterval
      );

      batchesForThisTime.forEach(() => {
        if (batchIndex < itemBatches.length) {
          currentInventory += itemBatches[batchIndex].quantity;

          // Check if inventory exceeds PAR max (Priority 2)
          if (parMax !== null && currentInventory > parMax) {
            // Mark this batch time for potential delay
            wasteDelays.set(forecast.timeInterval, true);
          }

          batchIndex++;
        }
      });
    });

    // Sort batch times chronologically
    requiredBatchTimes.sort((a, b) => a.availableTime - b.availableTime);

    // Schedule batches with calculated times
    batchIndex = 0;
    requiredBatchTimes.forEach((batchTime) => {
      if (batchIndex >= itemBatches.length) return;

      const batch = itemBatches[batchIndex];
      const requiredAvailableTime = batchTime.availableTime;

      // Calculate required start time: availableTime - bakeTime - coolTime
      const requiredStartTime = requiredAvailableTime - bakeTime - coolTime;

      // If delayed for waste minimization, try to schedule closer to when needed
      const targetStartTime = wasteDelays.has(requiredAvailableTime)
        ? Math.max(
            BUSINESS_HOURS.START_MINUTES,
            requiredStartTime + (parMax ? Math.floor((parMax - parMin) / 2) : 0)
          )
        : requiredStartTime;

      // Round to next 20-minute increment (:00, :20, :40)
      const roundedStartTime = roundToTwentyMinuteIncrement(
        Math.max(BUSINESS_HOURS.START_MINUTES, targetStartTime)
      );

      // Find available rack slot at the rounded time
      // Batches can ONLY start at :00, :20, :40 - use different racks for same time slot
      let bestRack = null;
      let scheduledStartTime = null;
      let currentTimeSlot = roundedStartTime;

      // Try up to 5 time slots (100 minutes) to find an available rack
      for (let slotAttempt = 0; slotAttempt < 5; slotAttempt++) {
        // Ensure we're at a valid 20-minute increment
        if (!isValidTwentyMinuteIncrement(currentTimeSlot)) {
          currentTimeSlot = roundToTwentyMinuteIncrement(currentTimeSlot);
        }

        // Check all racks at this time slot
        for (let i = 0; i < racks.length; i++) {
          const rack = racks[i];
          const rackOven = Math.floor(i / OVEN_CONFIG.RACKS_PER_OVEN) + 1;

          // Respect bake spec oven assignment
          if (
            batch.oven !== null &&
            batch.oven !== undefined &&
            rackOven !== batch.oven
          ) {
            continue;
          }

          // Rack must be free at or before this time slot
          // Batches MUST start exactly at the time slot, not earlier
          if (rack.endTime > currentTimeSlot) {
            continue;
          }

          const endTime = currentTimeSlot + batch.bakeTime;

          // Must be within business hours
          if (endTime > BUSINESS_HOURS.END_MINUTES) continue;

          // Found an available rack at this time slot
          bestRack = i;
          scheduledStartTime = currentTimeSlot; // Always use the exact time slot
          break;
        }

        // If we found a rack, break out of time slot loop
        if (bestRack !== null) break;

        // Move to next 20-minute increment
        currentTimeSlot += 20;
      }

      if (bestRack !== null && scheduledStartTime !== null) {
        const rack = racks[bestRack];
        const startTime = scheduledStartTime;
        const endTime = startTime + batch.bakeTime;
        const rackOven = Math.floor(bestRack / OVEN_CONFIG.RACKS_PER_OVEN) + 1;

        batch.rackPosition = bestRack + 1;
        batch.oven = rackOven;
        batch.startTime = formatMinutesToTime(startTime);
        batch.endTime = formatMinutesToTime(endTime);
        batch.availableTime = addMinutesToTime(batch.endTime, coolTime);

        rack.batches.push(batch);
        rack.endTime = endTime;

        scheduled.push(batch);
      } else {
        // No available slot - mark as unscheduled
        batch.rackPosition = null;
        batch.startTime = null;
        batch.endTime = null;
        batch.availableTime = null;
        scheduled.push(batch);
      }

      batchIndex++;
    });

    // Schedule any remaining batches sequentially with 20-minute increments
    while (batchIndex < itemBatches.length) {
      const batch = itemBatches[batchIndex];
      let bestRack = null;
      let scheduledStartTime = null;

      // Find the earliest available rack end time
      let earliestRackEndTime = Infinity;
      for (let i = 0; i < racks.length; i++) {
        const rack = racks[i];
        const rackOven = Math.floor(i / OVEN_CONFIG.RACKS_PER_OVEN) + 1;

        if (
          batch.oven !== null &&
          batch.oven !== undefined &&
          rackOven !== batch.oven
        ) {
          continue;
        }

        if (rack.endTime < earliestRackEndTime) {
          earliestRackEndTime = rack.endTime;
        }
      }

      // Round to next 20-minute increment (:00, :20, :40)
      const roundedStartTime = roundToTwentyMinuteIncrement(
        Math.max(BUSINESS_HOURS.START_MINUTES, earliestRackEndTime)
      );

      // Try to find an available rack at the rounded time
      // Batches can ONLY start at :00, :20, :40 - use different racks for same time slot
      let currentTimeSlot = roundedStartTime;
      for (let slotAttempt = 0; slotAttempt < 5; slotAttempt++) {
        // Ensure we're at a valid 20-minute increment
        if (!isValidTwentyMinuteIncrement(currentTimeSlot)) {
          currentTimeSlot = roundToTwentyMinuteIncrement(currentTimeSlot);
        }

        for (let i = 0; i < racks.length; i++) {
          const rack = racks[i];
          const rackOven = Math.floor(i / OVEN_CONFIG.RACKS_PER_OVEN) + 1;

          if (
            batch.oven !== null &&
            batch.oven !== undefined &&
            rackOven !== batch.oven
          ) {
            continue;
          }

          // Rack must be free at or before this time slot
          // Batches MUST start exactly at the time slot, not earlier
          if (rack.endTime > currentTimeSlot) {
            continue;
          }

          const endTime = currentTimeSlot + batch.bakeTime;
          if (endTime > BUSINESS_HOURS.END_MINUTES) continue;

          bestRack = i;
          scheduledStartTime = currentTimeSlot; // Always use the exact time slot
          break;
        }

        if (bestRack !== null) break;
        currentTimeSlot += 20;
      }

      if (bestRack !== null && scheduledStartTime !== null) {
        const rack = racks[bestRack];
        const startTime = scheduledStartTime;
        const endTime = startTime + batch.bakeTime;
        const rackOven = Math.floor(bestRack / OVEN_CONFIG.RACKS_PER_OVEN) + 1;

        batch.rackPosition = bestRack + 1;
        batch.oven = rackOven;
        batch.startTime = formatMinutesToTime(startTime);
        batch.endTime = formatMinutesToTime(endTime);
        batch.availableTime = addMinutesToTime(batch.endTime, coolTime);

        rack.batches.push(batch);
        rack.endTime = endTime;

        scheduled.push(batch);
      } else {
        batch.rackPosition = null;
        batch.startTime = null;
        batch.endTime = null;
        batch.availableTime = null;
        scheduled.push(batch);
      }

      batchIndex++;
    }
  });

  return scheduled;
}

/**
 * Schedule batches into oven racks
 * @param {Array} batches - Array of batch objects
 * @param {Date} date - Schedule date
 * @returns {Array} Scheduled batches
 */
function scheduleBatches(batches, date) {
  const scheduled = [];
  const racks = Array(OVEN_CONFIG.TOTAL_RACKS)
    .fill(null)
    .map(() => ({
      batches: [],
      endTime: BUSINESS_HOURS.START_MINUTES, // Start of business day
    }));

  // Sort batches by priority (earlier bake times first, then by quantity)
  const sortedBatches = [...batches].sort((a, b) => {
    if (a.bakeTime !== b.bakeTime) {
      return a.bakeTime - b.bakeTime;
    }
    return b.quantity - a.quantity;
  });

  // Assign batches to racks with 20-minute increments
  sortedBatches.forEach((batch) => {
    // Find the earliest available rack end time
    let earliestRackEndTime = Infinity;
    for (let i = 0; i < racks.length; i++) {
      const rack = racks[i];
      const rackOven = Math.floor(i / OVEN_CONFIG.RACKS_PER_OVEN) + 1;

      // Respect bake spec oven assignment
      if (
        batch.oven !== null &&
        batch.oven !== undefined &&
        rackOven !== batch.oven
      ) {
        continue;
      }

      if (rack.endTime < earliestRackEndTime) {
        earliestRackEndTime = rack.endTime;
      }
    }

    // Round to next 20-minute increment (:00, :20, :40)
    const roundedStartTime = roundToTwentyMinuteIncrement(
      Math.max(BUSINESS_HOURS.START_MINUTES, earliestRackEndTime)
    );

    // Find available rack at the rounded time
    // Batches can ONLY start at :00, :20, :40 - use different racks for same time slot
    let bestRack = null;
    let scheduledStartTime = null;
    let currentTimeSlot = roundedStartTime;

    // Try up to 5 time slots (100 minutes) to find an available rack
    for (let slotAttempt = 0; slotAttempt < 5; slotAttempt++) {
      // Ensure we're at a valid 20-minute increment
      if (!isValidTwentyMinuteIncrement(currentTimeSlot)) {
        currentTimeSlot = roundToTwentyMinuteIncrement(currentTimeSlot);
      }

      for (let i = 0; i < racks.length; i++) {
        const rack = racks[i];
        const rackOven = Math.floor(i / OVEN_CONFIG.RACKS_PER_OVEN) + 1;

        // Respect bake spec oven assignment
        if (
          batch.oven !== null &&
          batch.oven !== undefined &&
          rackOven !== batch.oven
        ) {
          continue;
        }

        // Rack must be free at or before this time slot
        // Batches MUST start exactly at the time slot, not earlier
        if (rack.endTime > currentTimeSlot) {
          continue;
        }

        const endTime = currentTimeSlot + batch.bakeTime;
        if (endTime > BUSINESS_HOURS.END_MINUTES) continue;

        bestRack = i;
        scheduledStartTime = currentTimeSlot; // Always use the exact time slot
        break;
      }

      if (bestRack !== null) break;
      currentTimeSlot += 20;
    }

    if (bestRack !== null && scheduledStartTime !== null) {
      const rack = racks[bestRack];
      const startTime = scheduledStartTime;
      const endTime = startTime + batch.bakeTime;
      const rackOven = Math.floor(bestRack / OVEN_CONFIG.RACKS_PER_OVEN) + 1;

      batch.rackPosition = bestRack + 1; // 1-indexed
      batch.oven = rackOven;
      batch.startTime = formatMinutesToTime(startTime);
      batch.endTime = formatMinutesToTime(endTime);
      batch.availableTime = addMinutesToTime(
        batch.endTime,
        batch.coolTime || 0
      );

      rack.batches.push(batch);
      rack.endTime = endTime;

      scheduled.push(batch);
    } else {
      // No available slot - mark as unscheduled
      batch.rackPosition = null;
      batch.startTime = null;
      batch.endTime = null;
      batch.availableTime = null;
      scheduled.push(batch);
    }
  });

  return scheduled;
}

/**
 * Generate schedule for a date
 * @param {Object} params - Schedule parameters
 * @returns {Promise<Object>} Generated schedule
 */
export async function generateSchedule(params) {
  const { date, forecastParams, restockThreshold, targetEndInventory } = params;

  if (!date) {
    throw new Error("Date is required");
  }

  const dateStr =
    typeof date === "string" ? date : format(parseISO(date), "yyyy-MM-dd");

  // Validate that date is >= earliest order date
  const earliestDate = await getEarliestOrderDate();
  if (earliestDate) {
    const scheduleDate = parseISO(dateStr);
    const earliestDateObj = parseISO(earliestDate);

    if (scheduleDate < earliestDateObj) {
      throw new Error(
        `Schedule date must be on or after ${earliestDate} (earliest order data date)`
      );
    }
  }

  // Get forecast data with time-interval granularity
  const forecastData = await getForecast({
    startDate: dateStr,
    endDate: dateStr,
    increment: "day",
    growthRate: forecastParams?.growthRate || 1.0,
    lookbackWeeks: forecastParams?.lookbackWeeks || 4,
    timeIntervalMinutes: forecastParams?.timeIntervalMinutes || 10,
  });

  if (
    !forecastData ||
    !forecastData.dailyForecast ||
    forecastData.dailyForecast.length === 0
  ) {
    throw new Error("No forecast data available for the specified date");
  }

  // Get bake specs for all items
  const bakeSpecs = await getBakeSpecs();
  const bakeSpecMap = new Map();
  bakeSpecs.forEach((spec) => {
    bakeSpecMap.set(spec.itemGuid, spec);
  });

  // Group forecast by date (should be single date)
  const forecastByDate = {};
  forecastData.dailyForecast.forEach((item) => {
    if (!forecastByDate[item.date]) {
      forecastByDate[item.date] = [];
    }
    forecastByDate[item.date].push(item);
  });

  // Generate batches for each forecast item
  const allBatches = [];
  const dateForecast = forecastByDate[dateStr] || [];

  dateForecast.forEach((forecastItem) => {
    const itemGuid = forecastItem.itemGuid;
    if (!itemGuid) {
      throw new Error(
        `Forecast item missing itemGuid: ${JSON.stringify(forecastItem)}`
      );
    }

    const bakeSpec = bakeSpecMap.get(itemGuid);

    if (!bakeSpec) {
      throw new Error(
        `No bake spec found for item: ${itemGuid} (${
          forecastItem.displayName || forecastItem.sku
        }). Bake specs are required for all items in the schedule.`
      );
    }

    // Skip inactive bake specs
    if (bakeSpec.active === false) {
      console.warn(
        `Skipping inactive bake spec for item: ${itemGuid} (${
          forecastItem.displayName || forecastItem.sku
        })`
      );
      return;
    }

    // Use bake spec's restockThreshold if available, otherwise use parameter or default
    const effectiveRestockThreshold =
      bakeSpec.restockThreshold !== undefined
        ? bakeSpec.restockThreshold
        : restockThreshold || ABS_DEFAULTS.RESTOCK_THRESHOLD;

    try {
      const batches = calculateBatches(
        forecastItem,
        bakeSpec,
        effectiveRestockThreshold
      );
      allBatches.push(...batches);
    } catch (error) {
      throw new Error(
        `Failed to calculate batches for ${itemGuid} (${
          forecastItem.displayName || forecastItem.sku
        }): ${error.message}`
      );
    }
  });

  // Build PAR config from bake specs
  const parConfig = {};
  bakeSpecs.forEach((spec) => {
    if (spec.itemGuid) {
      parConfig[spec.itemGuid] = {
        parMin: spec.parMin || 0,
        parMax: spec.parMax || null,
        parIntervalMinutes: spec.parIntervalMinutes || 60,
      };
    }
  });

  // Schedule batches using PAR-based algorithm if time-interval forecast is available
  // Always use PAR-based scheduling if time-interval forecast exists, even if some items don't have PAR set
  let scheduledBatches;
  if (
    forecastData.timeIntervalForecast &&
    forecastData.timeIntervalForecast.length > 0
  ) {
    scheduledBatches = scheduleBatchesWithPAR(
      allBatches,
      forecastData.timeIntervalForecast,
      bakeSpecMap,
      parseISO(dateStr)
    );
  } else {
    // Fall back to sequential scheduling if no time-interval forecast
    console.warn(
      "No time-interval forecast available, using sequential scheduling"
    );
    scheduledBatches = scheduleBatches(allBatches, parseISO(dateStr));
  }

  // Post-process: Ensure all start times are at 20-minute increments
  scheduledBatches.forEach((batch) => {
    if (batch.startTime && batch.rackPosition !== null) {
      const startMinutes = parseTimeToMinutes(batch.startTime);
      const roundedStartMinutes = roundToTwentyMinuteIncrement(startMinutes);

      // Only update if rounding changed the time
      if (roundedStartMinutes !== startMinutes) {
        batch.startTime = formatMinutesToTime(roundedStartMinutes);
        const endMinutes = roundedStartMinutes + batch.bakeTime;
        batch.endTime = formatMinutesToTime(endMinutes);
        batch.availableTime = addMinutesToTime(
          batch.endTime,
          batch.coolTime || 0
        );
      }
    }
  });

  // Calculate summary statistics
  const summary = {
    totalBatches: scheduledBatches.length,
    scheduledBatches: scheduledBatches.filter((b) => b.rackPosition !== null)
      .length,
    unscheduledBatches: scheduledBatches.filter((b) => b.rackPosition === null)
      .length,
    totalQuantity: scheduledBatches.reduce((sum, b) => sum + b.quantity, 0),
    estimatedDuration:
      scheduledBatches.length > 0
        ? Math.max(
            ...scheduledBatches.map((b) => {
              if (!b.endTime) return 0;
              return parseTimeToMinutes(b.endTime);
            })
          ) - BUSINESS_HOURS.START_MINUTES
        : 0,
  };

  // Create schedule object
  const schedule = {
    date: dateStr,
    batches: scheduledBatches,
    summary: summary,
    forecast: forecastData.dailyForecast,
    timeIntervalForecast: forecastData.timeIntervalForecast || [],
    parConfig: parConfig,
    parameters: {
      restockThreshold: restockThreshold || ABS_DEFAULTS.RESTOCK_THRESHOLD,
      targetEndInventory:
        targetEndInventory || ABS_DEFAULTS.TARGET_END_INVENTORY,
      forecastParams: forecastParams || {},
    },
  };

  // Save to database
  await saveSchedule(schedule);

  return schedule;
}

/**
 * Get schedule by date
 * @param {Date|string} date - Schedule date
 * @returns {Promise<Object|null>} Schedule or null
 */
export async function getSchedule(date) {
  return await getScheduleByDate(date);
}

/**
 * Get schedules by date range
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<Array>} Array of schedules
 */
export async function getSchedules(startDate, endDate) {
  return await getSchedulesByDateRange(startDate, endDate);
}

/**
 * Delete schedule by date
 * @param {Date|string} date - Schedule date
 * @returns {Promise<Object>} Delete result
 */
export async function deleteSchedule(date) {
  return await deleteScheduleByDate(date);
}

/**
 * Move batch to new time/rack
 * @param {Object} params - Move parameters
 * @returns {Promise<Object>} Updated schedule
 */
export async function moveBatch(params) {
  const { scheduleId, batchId, newStartTime, newRack } = params;

  if (!scheduleId || !batchId) {
    throw new Error("scheduleId and batchId are required");
  }

  const schedule = await getScheduleByDate(scheduleId);
  if (!schedule) {
    throw new Error("Schedule not found");
  }

  const batch = schedule.batches.find((b) => b.batchId === batchId);
  if (!batch) {
    throw new Error("Batch not found");
  }

  // Validate new start time
  if (newStartTime) {
    let startMinutes = parseTimeToMinutes(newStartTime);

    // Round to 20-minute increment
    startMinutes = roundToTwentyMinuteIncrement(startMinutes);

    if (
      startMinutes < BUSINESS_HOURS.START_MINUTES ||
      startMinutes > BUSINESS_HOURS.END_MINUTES
    ) {
      throw new Error("Start time must be within business hours");
    }

    const endMinutes = startMinutes + batch.bakeTime;
    if (endMinutes > BUSINESS_HOURS.END_MINUTES) {
      throw new Error("Batch would end after business hours");
    }

    batch.startTime = formatMinutesToTime(startMinutes);
    batch.endTime = formatMinutesToTime(endMinutes);
    // Recalculate available time: end time (pull time) + cool time
    batch.availableTime = addMinutesToTime(batch.endTime, batch.coolTime || 0);
  }

  // Validate new rack
  if (newRack !== undefined) {
    if (newRack < 1 || newRack > OVEN_CONFIG.TOTAL_RACKS) {
      throw new Error(`Rack must be between 1 and ${OVEN_CONFIG.TOTAL_RACKS}`);
    }
    batch.rackPosition = newRack;
  }

  // Save updated schedule
  await saveSchedule(schedule);

  return schedule;
}
