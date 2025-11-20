import {
  parseTimeToMinutes,
  formatMinutesToTime,
} from "../../../shared/utils/timeUtils.js";
import { BUSINESS_HOURS } from "../../../config/constants.js";
import { getBakeSpecs } from "../../repository.js";

/**
 * Constants for reactive suggestion algorithm
 */
const REACTIVE_WINDOW_MINUTES = 60;
const REACTIVE_MIN_OBSERVED_UNITS = 10;
const REACTIVE_MIN_CONSUMPTION_RATE = 0.1;
const REACTIVE_DEPLETION_THRESHOLD_MINUTES = 90;
const REACTIVE_TARGET_BUFFER_MINUTES = 180;
const REACTIVE_CONFIDENCE_TARGET_UNITS = 30;

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
 * Calculate suggested batches using reactive algorithm (recent demand-driven)
 * @param {Object} simulation - Simulation state object
 * @returns {Promise<Array>} Array of suggested batch objects
 */
export async function calculateReactiveSuggestedBatches(simulation) {
  const currentTime = simulation.currentTime;
  const inventory =
    simulation.inventory instanceof Map
      ? simulation.inventory
      : new Map(Object.entries(simulation.inventory || {}));
  const processedOrdersRaw = simulation.processedOrdersByItem || new Map();
  const processedOrdersMap =
    processedOrdersRaw instanceof Map
      ? processedOrdersRaw
      : new Map(
          (Array.isArray(processedOrdersRaw) ? processedOrdersRaw : []).map(
            (item) => [item.itemGuid, item]
          )
        );

  const bakeSpecs = await getBakeSpecs();
  const bakeSpecMap = new Map();
  bakeSpecs.forEach((spec) => {
    bakeSpecMap.set(spec.itemGuid, spec);
  });

  const allBatches = [
    ...(simulation.batches || []),
    ...(simulation.completedBatches || []),
  ];

  const observationStartMinutes = Math.max(
    BUSINESS_HOURS.START_MINUTES,
    currentTime - REACTIVE_WINDOW_MINUTES
  );
  const observationEndTime = formatMinutesToTime(currentTime);
  const observationStartTime = formatMinutesToTime(observationStartMinutes);
  const observedMinutes = Math.max(1, currentTime - observationStartMinutes);

  const suggestions = [];

  processedOrdersMap.forEach((processedItem, itemGuid) => {
    if (!itemGuid) {
      return;
    }
    const bakeSpec = bakeSpecMap.get(itemGuid);
    if (!bakeSpec) {
      return;
    }

    const currentInventory = inventory.get(itemGuid) || 0;
    const orders = processedItem?.orders || [];
    let observedUnits = 0;
    orders.forEach((order) => {
      const orderMinutes = parseTimeToMinutes(order.time);
      if (
        orderMinutes !== null &&
        orderMinutes >= observationStartMinutes &&
        orderMinutes <= currentTime
      ) {
        observedUnits += order.quantity || 0;
      }
    });

    if (observedUnits < REACTIVE_MIN_OBSERVED_UNITS) {
      return;
    }

    const consumptionRate = observedUnits / observedMinutes;
    if (consumptionRate < REACTIVE_MIN_CONSUMPTION_RATE) {
      return;
    }

    const futureSupplyWithinThreshold = allBatches.reduce((sum, batch) => {
      if (batch.itemGuid !== itemGuid || !batch.availableTime) {
        return sum;
      }
      const availableMinutes = parseTimeToMinutes(batch.availableTime);
      if (
        availableMinutes !== null &&
        availableMinutes > currentTime &&
        availableMinutes <= currentTime + REACTIVE_DEPLETION_THRESHOLD_MINUTES
      ) {
        return sum + (batch.quantity || 0);
      }
      return sum;
    }, 0);

    const netInventoryWithinThreshold =
      currentInventory + futureSupplyWithinThreshold;
    const minutesUntilShortage =
      consumptionRate > 0
        ? netInventoryWithinThreshold / consumptionRate
        : Infinity;

    if (minutesUntilShortage > REACTIVE_DEPLETION_THRESHOLD_MINUTES) {
      return;
    }

    const futureSupplyWithinBuffer = allBatches.reduce((sum, batch) => {
      if (batch.itemGuid !== itemGuid || !batch.availableTime) {
        return sum;
      }
      const availableMinutes = parseTimeToMinutes(batch.availableTime);
      if (
        availableMinutes !== null &&
        availableMinutes > currentTime &&
        availableMinutes <= currentTime + REACTIVE_TARGET_BUFFER_MINUTES
      ) {
        return sum + (batch.quantity || 0);
      }
      return sum;
    }, 0);

    const projectedInventory = currentInventory + futureSupplyWithinBuffer;
    const targetInventory = consumptionRate * REACTIVE_TARGET_BUFFER_MINUTES;
    let shortfall = Math.max(0, targetInventory - projectedInventory);

    if (shortfall < bakeSpec.capacityPerRack * 0.5) {
      return;
    }

    const batchSize = bakeSpec.capacityPerRack;
    const batchesNeeded = Math.ceil(shortfall / batchSize);

    const startMinutes = roundToTwentyMinuteIncrement(
      Math.max(currentTime + 10, BUSINESS_HOURS.START_MINUTES),
      "ceil"
    );
    const bakeMinutes = bakeSpec.bakeTimeMinutes || 0;
    const coolMinutes = bakeSpec.coolTimeMinutes || 0;
    const availableMinutes = startMinutes + bakeMinutes + coolMinutes;
    if (availableMinutes > BUSINESS_HOURS.END_MINUTES) {
      return;
    }

    const confidencePercent = Math.round(
      Math.min(1, observedUnits / REACTIVE_CONFIDENCE_TARGET_UNITS) * 100
    );

    console.log(
      `[SuggestedBatches][Reactive] ${
        bakeSpec.displayName || itemGuid
      } confidence ${confidencePercent}% with ${observedUnits} actual units from ${observationStartTime} to ${observationEndTime} (${observedMinutes} min).`
    );

    for (let i = 0; i < batchesNeeded; i++) {
      const batchId = `reactive-${itemGuid}-${Date.now()}-${i}`;
      suggestions.push({
        batchId,
        itemGuid,
        displayName: bakeSpec.displayName || itemGuid,
        quantity: batchSize,
        bakeTime: bakeMinutes,
        coolTime: coolMinutes,
        oven:
          bakeSpec.oven !== undefined && bakeSpec.oven !== null
            ? bakeSpec.oven
            : null,
        freshWindowMinutes: bakeSpec.freshWindowMinutes,
        restockThreshold: bakeSpec.restockThreshold || 20,
        rackPosition: null,
        startTime: formatMinutesToTime(startMinutes),
        endTime: formatMinutesToTime(startMinutes + bakeMinutes),
        availableTime: formatMinutesToTime(availableMinutes),
        status: "suggested",
        algorithm: "reactive",
        reason: {
          algorithm: "reactive",
          currentInventory,
          consumptionRate: Math.round(consumptionRate * 100) / 100,
          observedUnits,
          windowMinutes: observedMinutes,
          minutesUntilShortage: Math.round(minutesUntilShortage),
          targetBufferMinutes: REACTIVE_TARGET_BUFFER_MINUTES,
          futureSupplyWithinBuffer,
          projectedInventory,
          shortfall,
          confidencePercent,
          confidenceDetails: {
            observedUnits,
            observationUnitsLabel: "actual",
            observationWindowStart: observationStartTime,
            observationWindowEnd: observationEndTime,
            observationMinutes: observedMinutes,
            targetUnitsForFullConfidence: REACTIVE_CONFIDENCE_TARGET_UNITS,
          },
        },
      });
    }
  });

  return suggestions;
}
