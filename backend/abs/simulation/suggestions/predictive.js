import {
  parseTimeToMinutes,
  formatMinutesToTime,
} from "../../../shared/utils/timeUtils.js";
import { BUSINESS_HOURS } from "../../../config/constants.js";
import { getBakeSpecs } from "../../repository.js";

/**
 * Constants for predictive suggestion algorithm
 */
const CONFIDENCE_TARGET_UNITS = 50;

/**
 * Round minutes to nearest 20-minute increment
 * @param {number} minutes - Minutes to round
 * @param {string} mode - 'ceil' to round up, 'round' to round to nearest (default: 'ceil')
 * @returns {number} Rounded minutes
 */
function roundToTwentyMinuteIncrement(minutes, mode = "ceil") {
  const increment = 20;
  if (mode === "round") {
    return Math.round(minutes / increment) * increment;
  }
  return Math.ceil(minutes / increment) * increment;
}

/**
 * Calculate suggested batches using predictive algorithm (forecast-driven)
 * @param {Object} simulation - Simulation state object
 * @returns {Promise<Array>} Array of suggested batch objects
 */
export async function calculatePredictiveSuggestedBatches(simulation) {
  const suggestedBatches = [];
  const currentTime = simulation.currentTime;
  const timeIntervalForecast = simulation.timeIntervalForecast || [];
  // Handle both Map and Array formats for processedOrdersByItem
  const processedOrdersRaw = simulation.processedOrdersByItem || new Map();
  const processedOrdersMap =
    processedOrdersRaw instanceof Map
      ? processedOrdersRaw
      : new Map(
          (Array.isArray(processedOrdersRaw) ? processedOrdersRaw : []).map(
            (item) => [item.itemGuid, item]
          )
        );
  const inventory = simulation.inventory || new Map();

  // Get bake specs for all items
  const bakeSpecs = await getBakeSpecs();
  const bakeSpecMap = new Map();
  bakeSpecs.forEach((spec) => {
    bakeSpecMap.set(spec.itemGuid, spec);
  });

  // Group forecast by itemGuid and time interval
  const forecastByItem = new Map();
  timeIntervalForecast.forEach((forecast) => {
    const itemGuid = forecast.itemGuid;
    if (!itemGuid) return;

    if (!forecastByItem.has(itemGuid)) {
      forecastByItem.set(itemGuid, []);
    }
    forecastByItem.get(itemGuid).push(forecast);
  });

  // Process each item that has forecast data
  forecastByItem.forEach((itemForecast, itemGuid) => {
    const bakeSpec = bakeSpecMap.get(itemGuid);
    if (!bakeSpec) return;

    // Get actual orders processed so far
    const processedItem = processedOrdersMap.get(itemGuid);

    const actualQuantity = processedItem?.totalQuantity || 0;

    // Calculate expected quantity up to current time
    let expectedQuantity = 0;
    itemForecast.forEach((forecast) => {
      if (forecast.timeInterval <= currentTime) {
        expectedQuantity += forecast.forecast || 0;
      }
    });

    // Calculate remaining expected quantity for rest of day
    let remainingExpected = 0;
    itemForecast.forEach((forecast) => {
      if (forecast.timeInterval > currentTime) {
        remainingExpected += forecast.forecast || 0;
      }
    });

    // Calculate current inventory
    const currentInventory = inventory.get(itemGuid) || 0;

    // Get parMax from bake spec (Option G: cap shortfall at parMax to prevent waste)
    const parMax =
      bakeSpec.parMax !== null && bakeSpec.parMax !== undefined
        ? bakeSpec.parMax
        : null;

    // Calculate consumption rate (actual vs expected)
    // If we've consumed more than expected, adjust the remaining forecast
    const consumptionRatio =
      expectedQuantity > 0
        ? actualQuantity / expectedQuantity
        : actualQuantity > 0
        ? 1.5
        : 1.0; // If no expected but we have actual, assume 1.5x

    // Projected remaining demand based on consumption rate
    const projectedRemainingDemand =
      remainingExpected * Math.max(1.0, consumptionRatio);

    // Calculate total needed: projected remaining demand + safety buffer
    const restockThreshold = bakeSpec.restockThreshold || 20;
    const totalNeeded = projectedRemainingDemand + restockThreshold;

    const elapsedMinutes = Math.max(
      0,
      currentTime - BUSINESS_HOURS.START_MINUTES
    );
    const observationStartTime = formatMinutesToTime(
      BUSINESS_HOURS.START_MINUTES
    );
    const observationEndTime = formatMinutesToTime(currentTime);
    const confidenceRatio = Math.min(
      1,
      expectedQuantity / CONFIDENCE_TARGET_UNITS
    );
    const confidencePercent = Math.round(confidenceRatio * 100);

    console.log(
      `[SuggestedBatches][Predictive] Confidence for ${
        bakeSpec.displayName || itemGuid
      }: ${confidencePercent}% based on ${expectedQuantity} expected units from ${observationStartTime} to ${observationEndTime} (${elapsedMinutes} minutes observed). Target volume for 100% confidence: ${CONFIDENCE_TARGET_UNITS} units.`
    );

    // Calculate how much inventory we'll have after current batches complete
    // Count batches that will become available after current time
    let futureInventory = currentInventory;
    const allBatches = [
      ...(simulation.batches || []),
      ...(simulation.completedBatches || []),
    ];
    allBatches.forEach((batch) => {
      if (batch.itemGuid === itemGuid && batch.availableTime) {
        const availableTime = parseTimeToMinutes(batch.availableTime);
        if (availableTime > currentTime && batch.status !== "available") {
          futureInventory += batch.quantity || 0;
        }
      }
    });

    // Calculate shortfall (Option G: cap at parMax if set)
    let shortfall = Math.max(0, totalNeeded - futureInventory);

    // If parMax is set, cap shortfall to prevent exceeding parMax
    if (parMax !== null && futureInventory < parMax) {
      const maxAllowedShortfall = parMax - futureInventory;
      shortfall = Math.min(shortfall, maxAllowedShortfall);
    }

    // If we have a shortfall, suggest batches
    if (shortfall > 5 && confidencePercent >= 50) {
      const batchSize = bakeSpec.capacityPerRack;
      const batchesNeeded = Math.ceil(shortfall / batchSize);

      // Calculate when batches should be available (based on when we'll run out)
      // Estimate time until we run out based on consumption rate
      const minutesUntilShortfall =
        remainingExpected > 0 && consumptionRatio > 0
          ? Math.max(
              60,
              Math.min(
                300,
                remainingExpected / consumptionRatio / (consumptionRatio * 10)
              )
            ) // Rough estimate
          : 120; // Default to 2 hours from now

      const targetAvailableTime = currentTime + minutesUntilShortfall;

      // Calculate start time (accounting for bake time + cool time)
      const bakeTime = bakeSpec.bakeTimeMinutes;
      const coolTime = bakeSpec.coolTimeMinutes || 0;
      const targetStartTime = Math.max(
        currentTime + 20, // At least 20 minutes from now
        targetAvailableTime - bakeTime - coolTime
      );

      // Round to next 20-minute increment
      const roundedStartTime = roundToTwentyMinuteIncrement(
        targetStartTime,
        "ceil"
      );

      // Calculate when batch would be available (start + bake + cool)
      const batchAvailableTime = roundedStartTime + bakeTime + coolTime;

      // Don't suggest batches that would be available within an hour of closing
      const ONE_HOUR_BEFORE_CLOSING = BUSINESS_HOURS.END_MINUTES - 60;
      if (batchAvailableTime > ONE_HOUR_BEFORE_CLOSING) {
        // Batch would be available too close to closing, skip suggesting
        return; // Skip to next item
      }

      // Create suggested batches (all at the same time)
      for (let i = 0; i < batchesNeeded; i++) {
        const batchStartTime = roundedStartTime; // All batches start at the same time

        if (batchStartTime + bakeTime <= BUSINESS_HOURS.END_MINUTES) {
          suggestedBatches.push({
            batchId: `suggested-${itemGuid}-${Date.now()}-${i}`,
            itemGuid,
            displayName: bakeSpec.displayName || itemGuid,
            quantity: batchSize,
            bakeTime,
            coolTime,
            oven: bakeSpec.oven !== undefined ? bakeSpec.oven : null,
            freshWindowMinutes: bakeSpec.freshWindowMinutes,
            restockThreshold,
            rackPosition: null, // Will be assigned when added to schedule
            startTime: formatMinutesToTime(batchStartTime),
            endTime: formatMinutesToTime(batchStartTime + bakeTime),
            availableTime: formatMinutesToTime(
              batchStartTime + bakeTime + coolTime
            ),
            status: "suggested",
            algorithm: "predictive",
            reason: {
              algorithm: "predictive",
              actualQuantity,
              expectedQuantity,
              currentInventory,
              futureInventory,
              projectedRemainingDemand,
              shortfall,
              parMax,
              consumptionRatio: Math.round(consumptionRatio * 100) / 100,
              confidencePercent,
              confidenceDetails: {
                expectedUnitsObserved: expectedQuantity,
                observationUnitsLabel: "expected",
                observationWindowStart: observationStartTime,
                observationWindowEnd: observationEndTime,
                observationMinutes: elapsedMinutes,
                targetUnitsForFullConfidence: CONFIDENCE_TARGET_UNITS,
              },
            },
          });
        }
      }
    }
  });

  return suggestedBatches;
}
