import {
  getScheduleByDate,
  updateScheduleBatch,
  deleteScheduleBatch,
} from "../repository.js";
import { getBakeSpecs } from "../repository.js";
import {
  parseTimeToMinutes,
  formatMinutesToTime,
  addMinutesToTime,
} from "../../shared/utils/timeUtils.js";
import { BUSINESS_HOURS, OVEN_CONFIG } from "../../config/constants.js";
import { v4 as uuidv4 } from "uuid";
import { getOrdersByDateRange } from "../../orders/repository.js";
import { toBusinessTime } from "../../config/timezone.js";
import { generateSchedule, getDefaultScheduleParams } from "../service.js";
import { getForecast } from "../../forecast/service.js";

/**
 * Simulation Service - Runs schedule simulations in real-time
 */

// Active simulations storage (in production, use Redis or database)
const activeSimulations = new Map();

/**
 * Helper functions for batch scheduling operations
 */

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
 * Calculate oven number from rack position
 * @param {number} rack - Rack position (1-12)
 * @returns {number} Oven number (1-2)
 */
function getOvenFromRack(rack) {
  return Math.floor((rack - 1) / OVEN_CONFIG.RACKS_PER_OVEN) + 1;
}

/**
 * Initialize rack end times map with all racks set to 0
 * @returns {Map} Map of rack -> end time (all initialized to 0)
 */
function initializeRackEndTimes() {
  const rackEndTimes = new Map();
  for (let rack = 1; rack <= OVEN_CONFIG.TOTAL_RACKS; rack++) {
    rackEndTimes.set(rack, 0);
  }
  return rackEndTimes;
}

/**
 * Calculate when each rack becomes available based on existing batches
 * @param {Array} batches - Array of batch objects
 * @param {Map} rackEndTimes - Map to update (rack -> end time)
 */
function calculateRackEndTimes(batches, rackEndTimes) {
  batches.forEach((batch) => {
    if (batch.rackPosition && batch.endTime) {
      const batchEndTime = parseTimeToMinutes(batch.endTime);
      const rack = batch.rackPosition;
      const currentEndTime = rackEndTimes.get(rack) || 0;
      if (batchEndTime > currentEndTime) {
        rackEndTimes.set(rack, batchEndTime);
      }
    }
  });
}

/**
 * Check if two time ranges overlap
 * @param {number} start1 - Start time of first range (minutes)
 * @param {number} end1 - End time of first range (minutes)
 * @param {number} start2 - Start time of second range (minutes)
 * @param {number} end2 - End time of second range (minutes)
 * @returns {boolean} True if ranges overlap
 */
function batchesOverlap(start1, end1, start2, end2) {
  return (
    (start1 >= start2 && start1 < end2) ||
    (end1 > start2 && end1 <= end2) ||
    (start1 <= start2 && end1 >= end2)
  );
}

/**
 * Sort batches by start time (ascending)
 * @param {Array} batches - Array of batch objects
 */
function sortBatchesByStartTime(batches) {
  batches.sort((a, b) => {
    const timeA = parseTimeToMinutes(a.startTime);
    const timeB = parseTimeToMinutes(b.startTime);
    return timeA - timeB;
  });
}

const CONFIDENCE_TARGET_UNITS = 50;
const REACTIVE_WINDOW_MINUTES = 60;
const REACTIVE_MIN_OBSERVED_UNITS = 10;
const REACTIVE_MIN_CONSUMPTION_RATE = 0.1;
const REACTIVE_DEPLETION_THRESHOLD_MINUTES = 90;
const REACTIVE_TARGET_BUFFER_MINUTES = 180;
const REACTIVE_CONFIDENCE_TARGET_UNITS = 30;

/**
 * Simulation state
 */
export class SimulationState {
  constructor(config) {
    this.id = uuidv4();
    this.scheduleDate = config.scheduleDate;
    this.scheduleId = config.scheduleId || null; // MongoDB _id of the schedule
    this.speedMultiplier = config.speedMultiplier || 60; // 60x speed by default
    this.status = "running"; // running, paused, stopped, completed
    this.currentTime = BUSINESS_HOURS.START_MINUTES; // Current simulation time in minutes
    this.startTime = Date.now(); // Real-world start time
    this.pausedAt = null;
    this.pausedDuration = 0;

    // Inventory tracking: itemGuid -> array of units with availableAt timestamps (FIFO)
    // Each unit is: { availableAt: minutes, batchId: string }
    this.inventoryUnits = new Map(); // itemGuid -> Array<{availableAt, batchId}>

    // Legacy inventory count for compatibility (derived from inventoryUnits)
    this.inventory = new Map(); // itemGuid -> quantity (computed from inventoryUnits)

    // Batch tracking
    this.batches = [];
    this.completedBatches = [];

    // Statistics
    this.stats = {
      batchesStarted: 0,
      batchesCompleted: 0,
      batchesPulled: 0,
      batchesAvailable: 0,
      totalInventory: 0,
      peakInventory: 0,
      itemsProcessed: 0,
      itemsTotal: 0,
      itemsMissed: 0,
    };

    // Track missed orders by item for stockout reporting
    this.missedOrders = new Map(); // itemGuid -> { count, totalRequested, totalAvailable, orders: [] }

    // Track processed orders by item for order reporting
    this.processedOrdersByItem = new Map(); // itemGuid -> { count, totalQuantity, orders: [] }

    // Events log
    this.events = [];

    // Mode: 'manual' or 'preset'
    this.mode = config.mode || "manual";

    // Preset orders (for preset mode)
    this.presetOrders = config.presetOrders || [];
    // Track processed orders by orderId+itemGuid to handle orders with multiple items
    this.processedOrders = new Set();

    // Catering orders tracking
    this.cateringOrders = new Map(); // orderId -> {orderId, items, requiredAvailableTime, orderPlacedAt, status, batches, movedBatches}
    this.autoApproveCatering = false; // Auto-approve catering orders flag
  }

  addEvent(type, message, data = {}) {
    this.events.push({
      timestamp: this.currentTime,
      timeString: formatMinutesToTime(this.currentTime),
      type,
      message,
      ...data,
    });
  }

  getRealTimeElapsed() {
    if (this.status === "paused") {
      return this.pausedAt - this.startTime - this.pausedDuration;
    }
    return Date.now() - this.startTime - this.pausedDuration;
  }

  getSimulationTime() {
    if (this.status === "paused") {
      return this.currentTime;
    }
    const realTimeElapsed = this.getRealTimeElapsed();
    // Calculate simulation time in minutes (allow fractional minutes for smooth progression)
    // realTimeElapsed is in milliseconds, convert to minutes then multiply by speed
    const simulationTimeElapsed =
      (realTimeElapsed / 1000 / 60) * this.speedMultiplier;
    // Round to nearest 0.1 minute for display precision while maintaining smooth progression
    return (
      BUSINESS_HOURS.START_MINUTES + Math.round(simulationTimeElapsed * 10) / 10
    );
  }
}

/**
 * Start a new simulation
 * @param {Object} config - Simulation configuration
 * @returns {Promise<SimulationState>} Simulation state
 */
export async function startSimulation(config) {
  const {
    scheduleDate,
    speedMultiplier = 60,
    mode = "manual",
    forecastScales = null,
  } = config;

  if (!scheduleDate) {
    throw new Error("scheduleDate is required");
  }

  // Load schedule, auto-generate if it doesn't exist
  // If forecastScales is provided, regenerate schedule with period-based scaled forecast
  let schedule = await getScheduleByDate(scheduleDate);
  let scheduleId = null;

  // Period boundaries (minutes from start of day)
  const PERIOD_BOUNDARIES = {
    MORNING_START: 360, // 06:00
    MORNING_END: 660, // 11:00
    AFTERNOON_END: 840, // 14:00
    EVENING_END: 1020, // 17:00
  };

  // Regenerate schedule if forecastScales is provided (even if schedule exists)
  if (forecastScales !== null && forecastScales !== undefined) {
    try {
      const defaultParams = getDefaultScheduleParams();

      // Generate forecast first
      const forecastData = await getForecast({
        startDate: scheduleDate,
        endDate: scheduleDate,
        increment: "day",
        growthRate: defaultParams.forecastParams.growthRate,
        lookbackWeeks: defaultParams.forecastParams.lookbackWeeks,
        timeIntervalMinutes: defaultParams.forecastParams.timeIntervalMinutes,
      });

      // Scale time-interval forecast based on period
      if (
        forecastData.timeIntervalForecast &&
        forecastData.timeIntervalForecast.length > 0
      ) {
        forecastData.timeIntervalForecast =
          forecastData.timeIntervalForecast.map((item) => {
            const timeInterval = item.timeInterval;
            let scale = 1.0;

            if (
              timeInterval >= PERIOD_BOUNDARIES.MORNING_START &&
              timeInterval < PERIOD_BOUNDARIES.MORNING_END
            ) {
              scale = forecastScales.morning;
            } else if (
              timeInterval >= PERIOD_BOUNDARIES.MORNING_END &&
              timeInterval < PERIOD_BOUNDARIES.AFTERNOON_END
            ) {
              scale = forecastScales.afternoon;
            } else if (
              timeInterval >= PERIOD_BOUNDARIES.AFTERNOON_END &&
              timeInterval < PERIOD_BOUNDARIES.EVENING_END
            ) {
              scale = forecastScales.evening;
            }

            return {
              ...item,
              forecast: Math.round(item.forecast * scale),
            };
          });

        // Also scale daily forecast proportionally
        // Calculate total scaled forecast
        const scaledTotal = forecastData.timeIntervalForecast.reduce(
          (sum, item) => sum + item.forecast,
          0
        );
        const originalTotal = forecastData.dailyForecast.reduce(
          (sum, item) => sum + (item.forecast || 0),
          0
        );

        if (originalTotal > 0) {
          const dailyScale = scaledTotal / originalTotal;
          forecastData.dailyForecast = forecastData.dailyForecast.map(
            (item) => ({
              ...item,
              forecast: Math.round(item.forecast * dailyScale),
            })
          );
        }
      }

      // Generate schedule with scaled forecast
      schedule = await generateSchedule({
        date: scheduleDate,
        forecastData: forecastData,
        restockThreshold: defaultParams.restockThreshold,
        targetEndInventory: defaultParams.targetEndInventory,
      });

      // After generating, reload to get the _id
      schedule = await getScheduleByDate(scheduleDate);
    } catch (error) {
      throw new Error(
        `Failed to generate schedule with forecast scales: ${error.message}`
      );
    }
  } else if (!schedule) {
    // Auto-generate schedule with default parameters (no scale)
    try {
      const defaultParams = getDefaultScheduleParams();
      schedule = await generateSchedule({
        date: scheduleDate,
        ...defaultParams,
      });
      // After generating, reload to get the _id
      schedule = await getScheduleByDate(scheduleDate);
    } catch (error) {
      throw new Error(
        `No schedule found for date: ${scheduleDate}, and failed to auto-generate: ${error.message}`
      );
    }
  }

  // Store the MongoDB _id for database updates
  if (!schedule || !schedule._id) {
    throw new Error(
      `Schedule loaded but missing _id for date: ${scheduleDate}`
    );
  }
  scheduleId = schedule._id;

  // For preset mode, load orders for the date
  let presetOrders = [];
  if (mode === "preset") {
    // Remove limit to get all orders for the date
    const orders = await getOrdersByDateRange(
      scheduleDate,
      scheduleDate,
      100000
    );
    presetOrders = orders
      .map((order) => {
        // Convert paidDate to business time and extract minutes of day
        const businessTime = toBusinessTime(order.paidDate);
        const hours = businessTime.getHours();
        const minutes = businessTime.getMinutes();
        const orderTimeMinutes = hours * 60 + minutes; // Minutes from midnight (0-1440)

        return {
          ...order,
          orderTimeMinutes, // Time in minutes from midnight
        };
      })
      // Filter orders to only include those within business hours
      .filter((order) => {
        return (
          order.orderTimeMinutes >= BUSINESS_HOURS.START_MINUTES &&
          order.orderTimeMinutes <= BUSINESS_HOURS.END_MINUTES
        );
      })
      .sort((a, b) => a.orderTimeMinutes - b.orderTimeMinutes);
  }

  // Create simulation state
  const simulation = new SimulationState({
    scheduleDate,
    scheduleId,
    speedMultiplier,
    mode,
    presetOrders,
  });

  // Sum total item quantities (not count of records)
  simulation.stats.itemsTotal = presetOrders.reduce(
    (sum, order) => sum + (order.quantity || 0),
    0
  );

  // Store forecast data from schedule for chart
  simulation.forecast = schedule.forecast || [];
  simulation.timeIntervalForecast = schedule.timeIntervalForecast || [];
  simulation.parConfig = schedule.parConfig || {};

  // Initialize batches from schedule
  const scheduledBatches = (schedule.batches || []).filter(
    (b) => b.rackPosition !== null
  );

  simulation.batches = scheduledBatches.map((batch) => ({
    ...batch,
    status: "scheduled", // scheduled, baking, pulling, cooling, available
    startedAt: null,
    pulledAt: null,
    availableAt: null,
  }));

  // Sort batches by start time
  sortBatchesByStartTime(simulation.batches);

  simulation.addEvent("simulation_started", "Simulation started", {
    totalBatches: simulation.batches.length,
    speedMultiplier,
    mode,
    totalOrders: presetOrders.length,
  });

  // Store simulation
  activeSimulations.set(simulation.id, simulation);

  return simulation;
}

/**
 * Update simulation state
 * @param {string} simulationId - Simulation ID
 * @returns {SimulationState|null} Updated simulation state
 */
export function updateSimulation(simulationId) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation || simulation.status !== "running") {
    return simulation;
  }

  const previousTime = simulation.currentTime;
  simulation.currentTime = simulation.getSimulationTime();

  // Check if simulation has reached end of business day
  if (simulation.currentTime >= BUSINESS_HOURS.END_MINUTES) {
    simulation.status = "completed";
    simulation.currentTime = BUSINESS_HOURS.END_MINUTES;
    simulation.addEvent("simulation_completed", "Simulation completed");
    return simulation;
  }

  // Process batches
  simulation.batches.forEach((batch) => {
    const batchStartTime = parseTimeToMinutes(batch.startTime);
    const batchEndTime = parseTimeToMinutes(batch.endTime);
    const batchAvailableTime = parseTimeToMinutes(batch.availableTime);

    // Start batch - if scheduled and current time has reached/passed start time
    // Only start if we haven't already started it (previousTime check prevents duplicate starts)
    if (
      batch.status === "scheduled" &&
      simulation.currentTime >= batchStartTime &&
      previousTime <= batchStartTime
    ) {
      batch.status = "baking";
      batch.startedAt = simulation.currentTime;
      simulation.stats.batchesStarted++;
      simulation.addEvent(
        "batch_started",
        `Batch started: ${batch.displayName}`,
        {
          batchId: batch.batchId,
          rack: batch.rackPosition,
          oven: batch.oven,
        }
      );
    }

    // Pull batch (end of bake time)
    if (
      batch.status === "baking" &&
      simulation.currentTime >= batchEndTime &&
      previousTime < batchEndTime
    ) {
      batch.status = "pulling";
      batch.pulledAt = simulation.currentTime;
      simulation.stats.batchesPulled++;
      simulation.addEvent(
        "batch_pulled",
        `Batch pulled: ${batch.displayName}`,
        {
          batchId: batch.batchId,
          rack: batch.rackPosition,
          oven: batch.oven,
        }
      );
    }

    // Batch becomes available (after cool time)
    if (
      batch.status === "pulling" &&
      simulation.currentTime >= batchAvailableTime &&
      previousTime < batchAvailableTime
    ) {
      batch.status = "available";
      batch.availableAt = simulation.currentTime;

      // Add individual units to inventory (FIFO tracking)
      if (!simulation.inventoryUnits.has(batch.itemGuid)) {
        simulation.inventoryUnits.set(batch.itemGuid, []);
      }
      const units = simulation.inventoryUnits.get(batch.itemGuid);

      // Add all units from this batch with their availableAt timestamp
      for (let i = 0; i < batch.quantity; i++) {
        units.push({
          availableAt: simulation.currentTime,
          batchId: batch.batchId,
        });
      }

      // Sort units by availableAt (oldest first) for FIFO
      units.sort((a, b) => a.availableAt - b.availableAt);

      // Update inventory count (for compatibility)
      const newInventory = units.length;
      simulation.inventory.set(batch.itemGuid, newInventory);

      simulation.stats.batchesAvailable++;
      simulation.stats.totalInventory = Array.from(
        simulation.inventory.values()
      ).reduce((sum, qty) => sum + qty, 0);

      if (simulation.stats.totalInventory > simulation.stats.peakInventory) {
        simulation.stats.peakInventory = simulation.stats.totalInventory;
      }

      simulation.addEvent(
        "batch_available",
        `Batch available: ${batch.displayName}`,
        {
          batchId: batch.batchId,
          quantity: batch.quantity,
          inventory: newInventory,
        }
      );

      // Move to completed batches
      simulation.completedBatches.push(batch);
    }
  });

  // Remove completed batches from active batches
  simulation.batches = simulation.batches.filter(
    (b) => b.status !== "available"
  );

  // Process preset orders (for preset mode)
  if (simulation.mode === "preset" && simulation.presetOrders.length > 0) {
    simulation.presetOrders.forEach((order) => {
      // Create unique key for this order-item combination (handles orders with multiple items)
      const orderKey = `${order.orderId}:${order.itemGuid}`;

      // Skip if already processed
      if (simulation.processedOrders.has(orderKey)) {
        return;
      }

      // orderTimeMinutes is already in absolute minutes from midnight (same as simulation.currentTime)
      // Process order if simulation time has reached/passed order time
      if (
        simulation.currentTime >= order.orderTimeMinutes &&
        previousTime < order.orderTimeMinutes
      ) {
        // Check if item is available in inventory (FIFO - consume oldest first)
        const inventoryUnits =
          simulation.inventoryUnits.get(order.itemGuid) || [];
        const requestedQuantity = order.quantity;

        if (inventoryUnits.length >= requestedQuantity) {
          // Process order - remove oldest units first (FIFO)
          // Units are already sorted by availableAt (oldest first)
          inventoryUnits.splice(0, requestedQuantity);

          // Update inventory count (for compatibility)
          const newInventory = inventoryUnits.length;
          simulation.inventory.set(order.itemGuid, newInventory);

          simulation.stats.itemsProcessed += requestedQuantity; // Sum quantities, not count records
          simulation.stats.totalInventory = Array.from(
            simulation.inventory.values()
          ).reduce((sum, qty) => sum + qty, 0);

          simulation.processedOrders.add(orderKey);

          // Track processed order by item
          if (!simulation.processedOrdersByItem.has(order.itemGuid)) {
            simulation.processedOrdersByItem.set(order.itemGuid, {
              itemGuid: order.itemGuid,
              displayName: order.displayName,
              count: 0,
              totalQuantity: 0,
              orders: [],
            });
          }

          const processedItem = simulation.processedOrdersByItem.get(
            order.itemGuid
          );
          processedItem.count++;
          processedItem.totalQuantity += requestedQuantity;
          processedItem.orders.push({
            orderId: order.orderId,
            quantity: requestedQuantity,
            time: formatMinutesToTime(simulation.currentTime),
          });

          simulation.addEvent(
            "order_processed",
            `Order processed: ${order.displayName} (${requestedQuantity} units)`,
            {
              orderId: order.orderId,
              itemGuid: order.itemGuid,
              displayName: order.displayName,
              quantity: requestedQuantity,
              remainingInventory: newInventory,
            }
          );
        } else {
          // Not enough inventory - log as missed order
          // Still mark as processed so we don't keep trying
          simulation.processedOrders.add(orderKey);
          simulation.stats.itemsMissed += requestedQuantity; // Sum quantities, not count records

          // Track missed order by item
          const availableInventory = inventoryUnits.length;
          if (!simulation.missedOrders.has(order.itemGuid)) {
            simulation.missedOrders.set(order.itemGuid, {
              itemGuid: order.itemGuid,
              displayName: order.displayName,
              count: 0,
              totalRequested: 0,
              totalAvailable: 0,
              orders: [],
            });
          }

          const missedItem = simulation.missedOrders.get(order.itemGuid);
          missedItem.count++;
          missedItem.totalRequested += requestedQuantity;
          missedItem.totalAvailable += availableInventory;
          missedItem.orders.push({
            orderId: order.orderId,
            requestedQuantity,
            availableInventory,
            time: formatMinutesToTime(simulation.currentTime),
          });

          simulation.addEvent(
            "order_missed",
            `Order missed (insufficient inventory): ${order.displayName} (requested: ${requestedQuantity}, available: ${availableInventory})`,
            {
              orderId: order.orderId,
              itemGuid: order.itemGuid,
              displayName: order.displayName,
              requestedQuantity,
              availableInventory,
            }
          );
        }
      }
    });
  }

  return simulation;
}

/**
 * Pause simulation
 * @param {string} simulationId - Simulation ID
 * @returns {SimulationState|null} Simulation state
 */
export function pauseSimulation(simulationId) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    return null;
  }

  if (simulation.status === "running") {
    simulation.status = "paused";
    simulation.pausedAt = Date.now();
    simulation.currentTime = simulation.getSimulationTime();
    simulation.addEvent("simulation_paused", "Simulation paused");
  }

  return simulation;
}

/**
 * Resume simulation
 * @param {string} simulationId - Simulation ID
 * @returns {SimulationState|null} Simulation state
 */
export function resumeSimulation(simulationId) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    return null;
  }

  if (simulation.status === "paused") {
    const pauseDuration = Date.now() - simulation.pausedAt;
    simulation.pausedDuration += pauseDuration;
    simulation.status = "running";
    simulation.pausedAt = null;
    simulation.addEvent("simulation_resumed", "Simulation resumed");
  }

  return simulation;
}

/**
 * Stop simulation
 * @param {string} simulationId - Simulation ID
 * @returns {SimulationState|null} Simulation state
 */
export function stopSimulation(simulationId) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    return null;
  }

  if (simulation.status !== "stopped" && simulation.status !== "completed") {
    simulation.status = "stopped";
    simulation.currentTime = simulation.getSimulationTime();
    simulation.addEvent("simulation_stopped", "Simulation stopped");
  }

  return simulation;
}

/**
 * Get simulation status
 * @param {string} simulationId - Simulation ID
 * @returns {SimulationState|null} Simulation state
 */
export function getSimulation(simulationId) {
  return activeSimulations.get(simulationId) || null;
}

/**
 * Get all active simulations
 * @returns {Array<SimulationState>} Array of simulation states
 */
export function getAllSimulations() {
  return Array.from(activeSimulations.values());
}

/**
 * Calculate suggested batches based on actual vs expected orders
 * @param {string} simulationId - Simulation ID
 * @returns {Promise<Array>} Array of suggested batch objects
 */
export async function calculateSuggestedBatches(simulationId, options = {}) {
  const mode =
    typeof options.mode === "string"
      ? options.mode.toLowerCase()
      : "predictive";
  if (mode === "reactive") {
    return calculateReactiveSuggestedBatches(simulationId);
  }
  return calculatePredictiveSuggestedBatches(simulationId);
}

async function calculatePredictiveSuggestedBatches(simulationId) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    return [];
  }

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
    const totalNeeded = projectedRemainingDemand;

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
    if (shortfall > 5) {
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
                observedUnits: expectedQuantity,
                observationUnitsLabel: "expected",
                targetUnitsForFullConfidence: CONFIDENCE_TARGET_UNITS,
                observationWindowStart: observationStartTime,
                observationWindowEnd: observationEndTime,
                observationMinutes: elapsedMinutes,
              },
            },
          });
        }
      }
    }
  });

  return suggestedBatches;
}

async function calculateReactiveSuggestedBatches(simulationId) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    return [];
  }

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

/**
 * Add a new batch to the simulation schedule
 * @param {string} simulationId - Simulation ID
 * @param {Object} batchData - Batch data (from suggested batch)
 * @returns {Promise<SimulationState|null>} Updated simulation state
 */
export async function addSimulationBatch(simulationId, batchData) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    return null;
  }

  // Generate a new batch ID
  const batchId = uuidv4();

  // Parse start time
  const startMinutes = parseTimeToMinutes(batchData.startTime);
  if (
    !startMinutes ||
    startMinutes < BUSINESS_HOURS.START_MINUTES ||
    startMinutes > BUSINESS_HOURS.END_MINUTES
  ) {
    throw new Error("Invalid start time - must be within business hours");
  }

  // Round to 20-minute increment
  const roundedStartMinutes = roundToTwentyMinuteIncrement(
    startMinutes,
    "ceil"
  );

  // Find an available rack at this time
  // Check all racks to find one that's free
  const allBatches = [
    ...(simulation.batches || []),
    ...(simulation.completedBatches || []),
  ];
  const rackEndTimes = initializeRackEndTimes();
  calculateRackEndTimes(allBatches, rackEndTimes);

  // Find the first available rack at the requested time
  let selectedRack = null;
  let actualStartMinutes = roundedStartMinutes;

  for (let rack = 1; rack <= OVEN_CONFIG.TOTAL_RACKS; rack++) {
    const rackEndTime = rackEndTimes.get(rack) || 0;
    const rackOven = getOvenFromRack(rack);

    // Check oven requirement
    if (
      batchData.oven !== null &&
      batchData.oven !== undefined &&
      batchData.oven !== rackOven
    ) {
      continue;
    }

    // Check if rack is available at the rounded start time
    if (rackEndTime <= roundedStartMinutes) {
      selectedRack = rack;
      break;
    }
  }

  // If no rack available at requested time, find the next available time slot
  if (!selectedRack) {
    let earliestAvailableTime = Infinity;
    let earliestRack = null;

    for (let rack = 1; rack <= OVEN_CONFIG.TOTAL_RACKS; rack++) {
      const rackEndTime = rackEndTimes.get(rack) || 0;
      const rackOven = getOvenFromRack(rack);

      // Check oven requirement
      if (
        batchData.oven !== null &&
        batchData.oven !== undefined &&
        batchData.oven !== rackOven
      ) {
        continue;
      }

      // Find when this rack becomes available
      const availableTime = rackEndTime;
      if (availableTime < earliestAvailableTime) {
        earliestAvailableTime = availableTime;
        earliestRack = rack;
      }
    }

    if (!earliestRack) {
      throw new Error(
        "No available rack found (all racks may be restricted by oven requirements)"
      );
    }

    // Round the earliest available time to the next 20-minute increment
    actualStartMinutes = roundToTwentyMinuteIncrement(
      earliestAvailableTime,
      "ceil"
    );
    selectedRack = earliestRack;

    // Verify the new time doesn't exceed business hours
    const newEndMinutes = actualStartMinutes + batchData.bakeTime;
    if (newEndMinutes > BUSINESS_HOURS.END_MINUTES) {
      throw new Error("No available time slot found before business hours end");
    }
  }

  // Calculate end time based on actual start time
  const endMinutes = actualStartMinutes + batchData.bakeTime;
  if (endMinutes > BUSINESS_HOURS.END_MINUTES) {
    throw new Error("Batch would end after business hours");
  }

  const selectedOven = getOvenFromRack(selectedRack);

  // Create new batch object
  const newBatch = {
    batchId,
    itemGuid: batchData.itemGuid,
    displayName: batchData.displayName,
    quantity: batchData.quantity,
    bakeTime: batchData.bakeTime,
    coolTime: batchData.coolTime || 0,
    oven: selectedOven,
    freshWindowMinutes: batchData.freshWindowMinutes,
    restockThreshold: batchData.restockThreshold,
    rackPosition: selectedRack,
    startTime: formatMinutesToTime(actualStartMinutes),
    endTime: formatMinutesToTime(endMinutes),
    availableTime: formatMinutesToTime(endMinutes + (batchData.coolTime || 0)),
    status: "scheduled",
    startedAt: null,
    pulledAt: null,
    availableAt: null,
  };

  // Add batch to simulation
  simulation.batches.push(newBatch);

  // Sort batches by start time
  sortBatchesByStartTime(simulation.batches);

  // Update batch in database schedule
  if (simulation.scheduleId) {
    try {
      await updateScheduleBatch(simulation.scheduleId, batchId, newBatch);
    } catch (error) {
      console.error("Failed to add batch to database:", error);
      simulation.addEvent(
        "batch_add_error",
        `Failed to save batch to database: ${error.message}`,
        { batchId, error: error.message }
      );
    }
  }

  // Log event with note if time was adjusted
  const timeAdjusted = actualStartMinutes !== roundedStartMinutes;
  simulation.addEvent(
    "batch_added",
    `Batch added: ${
      newBatch.displayName || newBatch.itemGuid
    } to Rack ${selectedRack} at ${newBatch.startTime}${
      timeAdjusted
        ? " (time adjusted - no rack available at requested time)"
        : ""
    }`,
    {
      batchId: newBatch.batchId,
      rack: selectedRack,
      startTime: newBatch.startTime,
      requestedTime: formatMinutesToTime(roundedStartMinutes),
      timeAdjusted,
    }
  );

  return simulation;
}

/**
 * Move a batch to a new time/rack in simulation
 * @param {string} simulationId - Simulation ID
 * @param {string} batchId - Batch ID
 * @param {string} newStartTime - New start time (HH:MM format)
 * @param {number} newRack - New rack position (1-12)
 * @returns {Promise<SimulationState|null>} Updated simulation state
 */
export async function moveSimulationBatch(
  simulationId,
  batchId,
  newStartTime,
  newRack
) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    return null;
  }

  // Find batch in active batches
  const batch = simulation.batches.find((b) => b.batchId === batchId);
  if (!batch) {
    throw new Error("Batch not found");
  }

  // Only allow moving scheduled batches
  if (batch.status !== "scheduled") {
    throw new Error("Only scheduled batches can be moved");
  }

  // Validate new rack (1-12)
  if (newRack < 1 || newRack > 12) {
    throw new Error("Rack must be between 1 and 12");
  }

  // Parse new start time
  const newStartMinutes = parseTimeToMinutes(newStartTime);
  if (
    !newStartMinutes ||
    newStartMinutes < BUSINESS_HOURS.START_MINUTES ||
    newStartMinutes > BUSINESS_HOURS.END_MINUTES
  ) {
    throw new Error("Invalid start time - must be within business hours");
  }

  // Round to 20-minute increment
  const roundedStartMinutes = roundToTwentyMinuteIncrement(
    newStartMinutes,
    "round"
  );

  // Calculate new end time
  const newEndMinutes = roundedStartMinutes + batch.bakeTime;
  if (newEndMinutes > BUSINESS_HOURS.END_MINUTES) {
    throw new Error("Batch would end after business hours");
  }

  // Check oven requirement
  const newOven = getOvenFromRack(newRack);
  if (
    batch.oven !== null &&
    batch.oven !== undefined &&
    batch.oven !== newOven
  ) {
    throw new Error(
      `Batch must be in Oven ${batch.oven}, but rack ${newRack} is in Oven ${newOven}`
    );
  }

  // Store old position for logging
  const oldRack = batch.rackPosition;

  // Check for conflicts on the new rack
  const conflictingBatch = simulation.batches.find((b) => {
    if (b.batchId === batchId) return false;
    if (b.rackPosition !== newRack) return false;
    if (!b.startTime || !b.endTime) return false;

    const bStart = parseTimeToMinutes(b.startTime);
    const bEnd = parseTimeToMinutes(b.endTime);

    return batchesOverlap(roundedStartMinutes, newEndMinutes, bStart, bEnd);
  });

  if (conflictingBatch) {
    throw new Error(
      `Rack ${newRack} is already occupied at ${formatMinutesToTime(
        roundedStartMinutes
      )}`
    );
  }

  // Calculate new available time
  const newEndTime = formatMinutesToTime(newEndMinutes);
  const newAvailableTime = addMinutesToTime(newEndTime, batch.coolTime || 0);

  // Update batch in simulation state
  batch.startTime = formatMinutesToTime(roundedStartMinutes);
  batch.endTime = newEndTime;
  batch.availableTime = newAvailableTime;
  batch.rackPosition = newRack;
  batch.oven = newOven;

  // Update batch in database schedule
  if (simulation.scheduleId) {
    try {
      await updateScheduleBatch(simulation.scheduleId, batchId, {
        ...batch,
        // Ensure all batch fields are included
        batchId: batch.batchId,
        itemGuid: batch.itemGuid,
        displayName: batch.displayName,
        quantity: batch.quantity,
        bakeTime: batch.bakeTime,
        coolTime: batch.coolTime,
        startTime: batch.startTime,
        endTime: batch.endTime,
        availableTime: batch.availableTime,
        rackPosition: batch.rackPosition,
        oven: batch.oven,
      });
    } catch (error) {
      // Log error but don't fail the simulation update
      console.error("Failed to update batch in database:", error);
      simulation.addEvent(
        "batch_move_error",
        `Failed to save batch move to database: ${error.message}`,
        { batchId, error: error.message }
      );
    }
  }

  simulation.addEvent(
    "batch_moved",
    `Batch moved: ${
      batch.displayName || batch.itemGuid
    } to Rack ${newRack} at ${batch.startTime}`,
    {
      batchId: batch.batchId,
      newRack,
      newStartTime: batch.startTime,
      oldRack: oldRack,
    }
  );

  return simulation;
}

/**
 * Delete a batch from simulation
 * @param {string} simulationId - Simulation ID
 * @param {string} batchId - Batch ID
 * @returns {Promise<SimulationState|null>} Updated simulation state
 */
export async function deleteSimulationBatch(simulationId, batchId) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    return null;
  }

  // Find batch in active batches
  const batchIndex = simulation.batches.findIndex((b) => b.batchId === batchId);
  if (batchIndex === -1) {
    // Also check completed batches
    const completedIndex = (simulation.completedBatches || []).findIndex(
      (b) => b.batchId === batchId
    );
    if (completedIndex === -1) {
      throw new Error("Batch not found");
    }
    const batch = simulation.completedBatches[completedIndex];
    simulation.completedBatches.splice(completedIndex, 1);

    // Delete batch from database schedule
    if (simulation.scheduleId) {
      try {
        await deleteScheduleBatch(simulation.scheduleId, batchId);
      } catch (error) {
        console.error("Failed to delete batch from database:", error);
        simulation.addEvent(
          "batch_delete_error",
          `Failed to delete batch from database: ${error.message}`,
          { batchId, error: error.message }
        );
      }
    }

    simulation.addEvent(
      "batch_deleted",
      `Batch deleted: ${batch.displayName || batch.itemGuid}`,
      {
        batchId: batch.batchId,
        itemGuid: batch.itemGuid,
        displayName: batch.displayName,
        rackPosition: batch.rackPosition,
        oven: batch.oven,
        startTime: batch.startTime,
      }
    );
    return simulation;
  }

  const batch = simulation.batches[batchIndex];

  // Remove batch from simulation state
  simulation.batches.splice(batchIndex, 1);

  // Delete batch from database schedule
  if (simulation.scheduleId) {
    try {
      await deleteScheduleBatch(simulation.scheduleId, batchId);
    } catch (error) {
      // Log error but don't fail the simulation update
      console.error("Failed to delete batch from database:", error);
      simulation.addEvent(
        "batch_delete_error",
        `Failed to delete batch from database: ${error.message}`,
        { batchId, error: error.message }
      );
    }
  }

  // Log deletion event
  simulation.addEvent(
    "batch_deleted",
    `Batch deleted: ${batch.displayName || batch.itemGuid}`,
    {
      batchId: batch.batchId,
      itemGuid: batch.itemGuid,
      displayName: batch.displayName,
      rackPosition: batch.rackPosition,
      oven: batch.oven,
      startTime: batch.startTime,
    }
  );

  return simulation;
}

/**
 * Create a catering order
 * @param {string} simulationId - Simulation ID
 * @param {Object} orderData - Order data
 * @param {Array} orderData.items - Array of {itemGuid, quantity}
 * @param {string} orderData.requiredAvailableTime - Time when items must be ready (HH:MM)
 * @param {boolean} orderData.autoApprove - Whether to auto-approve this order
 * @returns {Promise<Object>} Created order with batches
 */
export async function createCateringOrder(simulationId, orderData) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    throw new Error("Simulation not found");
  }

  const { items, requiredAvailableTime, autoApprove = false } = orderData;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error("Items array is required and must not be empty");
  }

  if (!requiredAvailableTime) {
    throw new Error("requiredAvailableTime is required");
  }

  const currentTime = simulation.currentTime;

  // Validate and parse requiredAvailableTime
  if (typeof requiredAvailableTime !== "string") {
    throw new Error(
      `Invalid requiredAvailableTime type: expected string, got ${typeof requiredAvailableTime}. Value: ${JSON.stringify(
        requiredAvailableTime
      )}`
    );
  }

  let requiredAvailableMinutes;
  try {
    requiredAvailableMinutes = parseTimeToMinutes(requiredAvailableTime);
  } catch (error) {
    throw new Error(
      `Invalid requiredAvailableTime format: "${requiredAvailableTime}". ${error.message}`
    );
  }

  if (
    requiredAvailableMinutes === null ||
    requiredAvailableMinutes === undefined
  ) {
    throw new Error("Invalid requiredAvailableTime format");
  }

  // Round pickup time to nearest 20-minute increment
  const roundedPickupTime = roundToTwentyMinuteIncrement(
    requiredAvailableMinutes,
    "round"
  );

  // Validate 2-hour minimum notice
  const noticeMinutes = roundedPickupTime - currentTime;
  if (noticeMinutes < 120) {
    throw new Error(
      `Catering orders require at least 2 hours notice. Pickup time must be at least ${formatMinutesToTime(
        currentTime + 120
      )}`
    );
  }

  // Validate within business hours
  if (
    roundedPickupTime < BUSINESS_HOURS.START_MINUTES ||
    roundedPickupTime > BUSINESS_HOURS.END_MINUTES
  ) {
    throw new Error("Pickup time must be within business hours");
  }

  // Get bake specs for all items
  const bakeSpecs = await getBakeSpecs();
  const bakeSpecMap = new Map();
  bakeSpecs.forEach((spec) => {
    bakeSpecMap.set(spec.itemGuid, spec);
  });

  // Validate all items have bake specs
  for (const item of items) {
    if (!bakeSpecMap.has(item.itemGuid)) {
      throw new Error(`No bake spec found for item: ${item.itemGuid}`);
    }
    if (!item.quantity || item.quantity <= 0) {
      throw new Error(`Invalid quantity for item: ${item.itemGuid}`);
    }
  }

  // Calculate batches needed per item
  const itemBatchRequirements = [];
  for (const item of items) {
    const bakeSpec = bakeSpecMap.get(item.itemGuid);
    const batchesNeeded = Math.ceil(item.quantity / bakeSpec.capacityPerRack);
    const requiredStartTime =
      roundedPickupTime -
      bakeSpec.bakeTimeMinutes -
      (bakeSpec.coolTimeMinutes || 0);
    const roundedStartTime = roundToTwentyMinuteIncrement(
      Math.max(BUSINESS_HOURS.START_MINUTES, requiredStartTime),
      "round"
    );

    itemBatchRequirements.push({
      itemGuid: item.itemGuid,
      displayName: bakeSpec.displayName,
      quantity: item.quantity,
      batchesNeeded,
      bakeSpec,
      requiredStartTime: roundedStartTime,
      requiredAvailableTime: roundedPickupTime,
    });
  }

  // Build rack availability map
  const allBatches = [
    ...(simulation.batches || []),
    ...(simulation.completedBatches || []),
  ];
  const rackEndTimes = initializeRackEndTimes();
  calculateRackEndTimes(allBatches, rackEndTimes);

  // Allocate racks for catering batches with staggering support
  const cateringBatches = [];
  const movedBatches = [];
  const allocatedRacks = new Map(); // Track racks allocated at specific times: rack -> Set of time slots
  let updatedAllBatches = null; // Will be set after moves to reflect updated batch positions

  for (const itemReq of itemBatchRequirements) {
    const {
      itemGuid,
      batchesNeeded,
      bakeSpec,
      requiredStartTime,
      requiredAvailableTime,
    } = itemReq;
    const bakeTime = bakeSpec.bakeTimeMinutes;
    const coolTime = bakeSpec.coolTimeMinutes || 0;
    const requiredOven =
      bakeSpec.oven !== null && bakeSpec.oven !== undefined
        ? bakeSpec.oven
        : null;

    // Try to allocate all batches for this item
    let batchesAllocated = 0;
    let currentStartTime = requiredStartTime;
    const maxStartTimeOffset = 120; // Can start up to 2 hours earlier
    let startTimeOffset = 0;

    while (
      batchesAllocated < batchesNeeded &&
      startTimeOffset <= maxStartTimeOffset
    ) {
      const tryStartTime = requiredStartTime - startTimeOffset;
      const roundedTryStartTime = roundToTwentyMinuteIncrement(
        tryStartTime,
        "round"
      );

      // Try to find racks at this time
      const availableRacks = [];
      const batchEndTime = roundedTryStartTime + bakeTime;

      for (let rack = 1; rack <= OVEN_CONFIG.TOTAL_RACKS; rack++) {
        // Check if this rack is already allocated at this specific time slot
        const allocatedTimes = allocatedRacks.get(rack);
        if (allocatedTimes && allocatedTimes.has(roundedTryStartTime)) {
          continue; // Already allocated at this time
        }

        const rackOven = getOvenFromRack(rack);

        // Check oven requirement
        if (requiredOven !== null && requiredOven !== rackOven) {
          continue;
        }

        // Check for conflicts with existing batches on this rack
        // Use updatedAllBatches if available (after moves), otherwise use allBatches
        const batchesToCheck = updatedAllBatches || allBatches;
        const hasConflict = batchesToCheck.some((b) => {
          if (!b.rackPosition || b.rackPosition !== rack) return false;
          if (!b.startTime || !b.endTime) return false;
          // Skip batches we've already allocated in this catering order
          // Note: cb.startTime is stored as a number (minutes), not a string
          if (
            cateringBatches.some(
              (cb) =>
                cb.rackPosition === rack && cb.startTime === roundedTryStartTime
            )
          ) {
            return false;
          }

          const bStart = parseTimeToMinutes(b.startTime);
          const bEnd = parseTimeToMinutes(b.endTime);

          // Check if batches overlap
          return batchesOverlap(
            roundedTryStartTime,
            batchEndTime,
            bStart,
            bEnd
          );
        });

        if (!hasConflict && batchEndTime <= BUSINESS_HOURS.END_MINUTES) {
          availableRacks.push(rack);
        }
      }

      // Allocate as many batches as we can at this time
      const batchesToAllocate = Math.min(
        batchesNeeded - batchesAllocated,
        availableRacks.length
      );

      for (let i = 0; i < batchesToAllocate; i++) {
        const rack = availableRacks[i];

        // Track this rack at this specific time slot
        if (!allocatedRacks.has(rack)) {
          allocatedRacks.set(rack, new Set());
        }
        allocatedRacks.get(rack).add(roundedTryStartTime);

        const batchQuantity =
          batchesAllocated === batchesNeeded - 1
            ? itemReq.quantity - batchesAllocated * bakeSpec.capacityPerRack
            : bakeSpec.capacityPerRack;

        const batchEndTime = roundedTryStartTime + bakeTime;
        const batchAvailableTime = batchEndTime + coolTime;

        // Verify batch will be available by required time
        if (batchAvailableTime > requiredAvailableTime) {
          throw new Error(
            `Cannot fulfill catering order: batch for ${itemReq.displayName} would not be ready in time`
          );
        }

        cateringBatches.push({
          itemGuid,
          displayName: itemReq.displayName,
          quantity: batchQuantity,
          bakeTime,
          coolTime,
          oven: requiredOven,
          freshWindowMinutes: bakeSpec.freshWindowMinutes,
          restockThreshold: bakeSpec.restockThreshold || 20,
          startTime: roundedTryStartTime,
          endTime: batchEndTime,
          availableTime: batchAvailableTime,
          rackPosition: rack,
        });

        batchesAllocated++;
      }

      // If we still need more batches, try staggering (next 20-minute slot)
      if (batchesAllocated < batchesNeeded) {
        startTimeOffset += 20;
      }
    }

    // If we couldn't allocate all batches, try to move existing batches
    if (batchesAllocated < batchesNeeded) {
      const batchesStillNeeded = batchesNeeded - batchesAllocated;
      const racksToFree = batchesStillNeeded;

      // Find batches that conflict with our required time slots
      const conflictingBatches = simulation.batches.filter((batch) => {
        if (batch.status !== "scheduled") return false;
        if (!batch.rackPosition || !batch.startTime || !batch.endTime)
          return false;

        const batchStart = parseTimeToMinutes(batch.startTime);
        const batchEnd = parseTimeToMinutes(batch.endTime);
        const rackOven = getOvenFromRack(batch.rackPosition);

        // Check if batch conflicts with our time window and oven requirement
        const conflictsWithTime =
          (batchStart >= requiredStartTime - maxStartTimeOffset &&
            batchStart < requiredStartTime + bakeTime) ||
          (batchEnd > requiredStartTime - maxStartTimeOffset &&
            batchEnd <= requiredStartTime + bakeTime);

        const conflictsWithOven =
          requiredOven === null || requiredOven === rackOven;

        return conflictsWithTime && conflictsWithOven;
      });

      // Sort by start time (move later batches first)
      conflictingBatches.sort((a, b) => {
        const timeA = parseTimeToMinutes(a.startTime);
        const timeB = parseTimeToMinutes(b.startTime);
        return timeB - timeA; // Later batches first
      });

      // Try to move batches to free up racks
      let racksFreed = 0;
      for (const conflictingBatch of conflictingBatches.slice(0, racksToFree)) {
        // Find a new available slot for this batch
        // Search outward from original time to find closest available slot
        let newRack = null;
        let newStartTime = null;

        const originalStartTime = parseTimeToMinutes(
          conflictingBatch.startTime
        );
        const batchOven =
          conflictingBatch.oven !== null && conflictingBatch.oven !== undefined
            ? conflictingBatch.oven
            : null;

        // Search outward: +20, -20, +40, -40, +60, -60, etc.
        // This ensures we find the closest available slot
        let offset = 20;
        const maxOffset = Math.max(
          BUSINESS_HOURS.END_MINUTES - originalStartTime,
          originalStartTime - BUSINESS_HOURS.START_MINUTES
        );

        while (offset <= maxOffset && newRack === null) {
          // Try later time first
          const laterTime = originalStartTime + offset;
          if (
            laterTime <=
            BUSINESS_HOURS.END_MINUTES - conflictingBatch.bakeTime
          ) {
            const roundedLaterTime = roundToTwentyMinuteIncrement(
              laterTime,
              "round"
            );
            const laterEndTime = roundedLaterTime + conflictingBatch.bakeTime;

            for (let rack = 1; rack <= OVEN_CONFIG.TOTAL_RACKS; rack++) {
              // Check if this rack is already allocated at this specific time slot
              const allocatedTimes = allocatedRacks.get(rack);
              if (allocatedTimes && allocatedTimes.has(roundedLaterTime)) {
                continue;
              }

              const rackOven = getOvenFromRack(rack);

              if (batchOven !== null && batchOven !== rackOven) {
                continue;
              }

              // Check for conflicts with other batches on this rack
              const hasConflict = simulation.batches.some((b) => {
                if (b.batchId === conflictingBatch.batchId) return false;
                if (b.rackPosition !== rack) return false;
                if (!b.startTime || !b.endTime) return false;

                const bStart = parseTimeToMinutes(b.startTime);
                const bEnd = parseTimeToMinutes(b.endTime);

                return batchesOverlap(
                  roundedLaterTime,
                  laterEndTime,
                  bStart,
                  bEnd
                );
              });

              if (!hasConflict) {
                newRack = rack;
                newStartTime = roundedLaterTime;
                break;
              }
            }
          }

          // If not found, try earlier time
          if (newRack === null) {
            const earlierTime = originalStartTime - offset;
            if (earlierTime >= BUSINESS_HOURS.START_MINUTES) {
              const roundedEarlierTime = roundToTwentyMinuteIncrement(
                earlierTime,
                "round"
              );
              const earlierEndTime =
                roundedEarlierTime + conflictingBatch.bakeTime;

              for (let rack = 1; rack <= OVEN_CONFIG.TOTAL_RACKS; rack++) {
                // Check if this rack is already allocated at this specific time slot
                const allocatedTimes = allocatedRacks.get(rack);
                if (allocatedTimes && allocatedTimes.has(roundedEarlierTime)) {
                  continue;
                }

                const rackOven = getOvenFromRack(rack);

                if (batchOven !== null && batchOven !== rackOven) {
                  continue;
                }

                // Check for conflicts with other batches on this rack
                const hasConflict = simulation.batches.some((b) => {
                  if (b.batchId === conflictingBatch.batchId) return false;
                  if (b.rackPosition !== rack) return false;
                  if (!b.startTime || !b.endTime) return false;

                  const bStart = parseTimeToMinutes(b.startTime);
                  const bEnd = parseTimeToMinutes(b.endTime);

                  return batchesOverlap(
                    roundedEarlierTime,
                    earlierEndTime,
                    bStart,
                    bEnd
                  );
                });

                if (!hasConflict) {
                  newRack = rack;
                  newStartTime = roundedEarlierTime;
                  break;
                }
              }
            }
          }

          // Increase offset for next iteration
          offset += 20;
        }

        if (newRack !== null && newStartTime !== null) {
          // Move the batch
          const oldStartTime = conflictingBatch.startTime;
          const oldRack = conflictingBatch.rackPosition;

          conflictingBatch.startTime = formatMinutesToTime(newStartTime);
          conflictingBatch.endTime = formatMinutesToTime(
            newStartTime + conflictingBatch.bakeTime
          );
          conflictingBatch.availableTime = formatMinutesToTime(
            newStartTime +
              conflictingBatch.bakeTime +
              (conflictingBatch.coolTime || 0)
          );
          conflictingBatch.rackPosition = newRack;
          conflictingBatch.oven = getOvenFromRack(newRack);

          // Update rack end time
          rackEndTimes.set(newRack, newStartTime + conflictingBatch.bakeTime);

          movedBatches.push({
            batchId: conflictingBatch.batchId,
            displayName: conflictingBatch.displayName,
            oldStartTime,
            newStartTime: conflictingBatch.startTime,
            oldRack,
            newRack,
          });

          racksFreed++;
          // Note: We don't add newRack to allocatedRacks because allocatedRacks
          // tracks racks allocated to NEW catering batches, not moved batches.
          // Moved batches can share racks with other moved batches at different times.
        } else {
          // Can't move this batch, reject order
          throw new Error(
            `Cannot fulfill catering order: unable to free up enough racks. Would need to move batch ${conflictingBatch.displayName} but no alternative slot available.`
          );
        }
      }

      // Now try to allocate remaining batches
      if (racksFreed > 0) {
        // Rebuild rackEndTimes map after moves to reflect new batch positions
        rackEndTimes.clear();
        for (let rack = 1; rack <= OVEN_CONFIG.TOTAL_RACKS; rack++) {
          rackEndTimes.set(rack, 0);
        }

        // Recalculate rack end times including moved batches
        updatedAllBatches = [
          ...(simulation.batches || []),
          ...(simulation.completedBatches || []),
        ];
        calculateRackEndTimes(updatedAllBatches, rackEndTimes);

        // Try to allocate remaining batches
        let additionalBatchesAllocated = 0;
        startTimeOffset = 0;

        while (
          additionalBatchesAllocated < batchesStillNeeded &&
          startTimeOffset <= maxStartTimeOffset
        ) {
          const tryStartTime = requiredStartTime - startTimeOffset;
          const roundedTryStartTime = roundToTwentyMinuteIncrement(
            tryStartTime,
            "round"
          );

          const availableRacks = [];
          const batchEndTime = roundedTryStartTime + bakeTime;

          for (let rack = 1; rack <= OVEN_CONFIG.TOTAL_RACKS; rack++) {
            // Check if this rack is already allocated at this specific time slot
            const allocatedTimes = allocatedRacks.get(rack);
            if (allocatedTimes && allocatedTimes.has(roundedTryStartTime)) {
              continue;
            }

            const rackOven = getOvenFromRack(rack);

            if (requiredOven !== null && requiredOven !== rackOven) {
              continue;
            }

            // Check for conflicts with existing batches on this rack
            // After moves, use updated batch list, otherwise use original
            const batchesToCheck = updatedAllBatches || allBatches;
            const hasConflict = batchesToCheck.some((b) => {
              if (!b.rackPosition || b.rackPosition !== rack) return false;
              if (!b.startTime || !b.endTime) return false;
              // Skip batches we've already allocated in this catering order
              // Note: cb.startTime is stored as a number (minutes), not a string
              if (
                cateringBatches.some(
                  (cb) =>
                    cb.rackPosition === rack &&
                    cb.startTime === roundedTryStartTime
                )
              ) {
                return false;
              }

              const bStart = parseTimeToMinutes(b.startTime);
              const bEnd = parseTimeToMinutes(b.endTime);

              // Check if batches overlap
              return batchesOverlap(
                roundedTryStartTime,
                batchEndTime,
                bStart,
                bEnd
              );
            });

            if (!hasConflict && batchEndTime <= BUSINESS_HOURS.END_MINUTES) {
              availableRacks.push(rack);
            }
          }

          const batchesToAllocate = Math.min(
            batchesStillNeeded - additionalBatchesAllocated,
            availableRacks.length
          );

          for (let i = 0; i < batchesToAllocate; i++) {
            const rack = availableRacks[i];

            // Track this rack at this specific time slot
            if (!allocatedRacks.has(rack)) {
              allocatedRacks.set(rack, new Set());
            }
            allocatedRacks.get(rack).add(roundedTryStartTime);

            const batchQuantity =
              batchesAllocated + additionalBatchesAllocated ===
              batchesNeeded - 1
                ? itemReq.quantity -
                  (batchesAllocated + additionalBatchesAllocated) *
                    bakeSpec.capacityPerRack
                : bakeSpec.capacityPerRack;

            const batchEndTime = roundedTryStartTime + bakeTime;
            const batchAvailableTime = batchEndTime + coolTime;

            if (batchAvailableTime > requiredAvailableTime) {
              throw new Error(
                `Cannot fulfill catering order: batch for ${itemReq.displayName} would not be ready in time`
              );
            }

            cateringBatches.push({
              itemGuid,
              displayName: itemReq.displayName,
              quantity: batchQuantity,
              bakeTime,
              coolTime,
              oven: requiredOven,
              freshWindowMinutes: bakeSpec.freshWindowMinutes,
              restockThreshold: bakeSpec.restockThreshold || 20,
              startTime: roundedTryStartTime,
              endTime: batchEndTime,
              availableTime: batchAvailableTime,
              rackPosition: rack,
            });

            additionalBatchesAllocated++;
          }

          if (additionalBatchesAllocated < batchesStillNeeded) {
            startTimeOffset += 20;
          }
        }

        if (additionalBatchesAllocated < batchesStillNeeded) {
          throw new Error(
            `Cannot fulfill catering order: unable to allocate enough racks for ${itemReq.displayName}`
          );
        }
      }
    }
  }

  // Create batch objects and add to simulation
  const orderId = uuidv4();
  const createdBatches = [];

  for (const batchData of cateringBatches) {
    const batchId = uuidv4();
    const selectedOven = getOvenFromRack(batchData.rackPosition);

    const newBatch = {
      batchId,
      itemGuid: batchData.itemGuid,
      displayName: batchData.displayName,
      quantity: batchData.quantity,
      bakeTime: batchData.bakeTime,
      coolTime: batchData.coolTime || 0,
      oven: selectedOven,
      freshWindowMinutes: batchData.freshWindowMinutes,
      restockThreshold: batchData.restockThreshold,
      rackPosition: batchData.rackPosition,
      startTime: formatMinutesToTime(batchData.startTime),
      endTime: formatMinutesToTime(batchData.endTime),
      availableTime: formatMinutesToTime(batchData.availableTime),
      status: "scheduled",
      startedAt: null,
      pulledAt: null,
      availableAt: null,
      isCatering: true,
      cateringOrderId: orderId,
    };

    simulation.batches.push(newBatch);
    createdBatches.push(newBatch);

    // Update rack end time
    rackEndTimes.set(batchData.rackPosition, batchData.endTime);
  }

  // Sort batches by start time
  sortBatchesByStartTime(simulation.batches);

  // Determine order status
  const shouldAutoApprove = autoApprove || simulation.autoApproveCatering;
  const orderStatus = shouldAutoApprove ? "approved" : "pending";

  // Create catering order record
  const cateringOrder = {
    orderId,
    items: items.map((item) => ({
      itemGuid: item.itemGuid,
      quantity: item.quantity,
      displayName: bakeSpecMap.get(item.itemGuid).displayName,
    })),
    requiredAvailableTime: formatMinutesToTime(roundedPickupTime),
    orderPlacedAt: formatMinutesToTime(currentTime),
    status: orderStatus,
    batches: createdBatches.map((b) => ({
      batchId: b.batchId,
      itemGuid: b.itemGuid,
      displayName: b.displayName,
      quantity: b.quantity,
      rackPosition: b.rackPosition,
      startTime: b.startTime,
      endTime: b.endTime,
      availableTime: b.availableTime,
    })),
    movedBatches: movedBatches,
  };

  simulation.cateringOrders.set(orderId, cateringOrder);

  // Log event
  if (orderStatus === "approved") {
    simulation.addEvent(
      "catering_order_approved",
      `Catering order approved: ${
        items.length
      } item(s) for pickup at ${formatMinutesToTime(roundedPickupTime)}`,
      {
        orderId,
        items: items.map((i) => ({
          itemGuid: i.itemGuid,
          quantity: i.quantity,
        })),
        pickupTime: formatMinutesToTime(roundedPickupTime),
        batchesCreated: createdBatches.length,
        batchesMoved: movedBatches.length,
      }
    );
  } else {
    simulation.addEvent(
      "catering_order_pending",
      `Catering order pending approval: ${
        items.length
      } item(s) for pickup at ${formatMinutesToTime(roundedPickupTime)}`,
      {
        orderId,
        items: items.map((i) => ({
          itemGuid: i.itemGuid,
          quantity: i.quantity,
        })),
        pickupTime: formatMinutesToTime(roundedPickupTime),
        batchesCreated: createdBatches.length,
        batchesMoved: movedBatches.length,
      }
    );
  }

  // Update database schedule if needed
  if (simulation.scheduleId && orderStatus === "approved") {
    for (const batch of createdBatches) {
      try {
        await updateScheduleBatch(simulation.scheduleId, batch.batchId, batch);
      } catch (error) {
        console.error("Failed to save catering batch to database:", error);
      }
    }
  }

  return {
    success: true,
    orderId,
    status: orderStatus,
    batches: createdBatches.map((b) => ({
      batchId: b.batchId,
      itemGuid: b.itemGuid,
      displayName: b.displayName,
      quantity: b.quantity,
      rackPosition: b.rackPosition,
      startTime: b.startTime,
      endTime: b.endTime,
      availableTime: b.availableTime,
    })),
    movedBatches,
    warnings:
      movedBatches.length > 0
        ? [
            `${movedBatches.length} existing batch(es) were moved to accommodate this order`,
          ]
        : [],
  };
}

/**
 * Approve a pending catering order
 * @param {string} simulationId - Simulation ID
 * @param {string} orderId - Catering order ID
 * @returns {Promise<Object>} Updated order
 */
export async function approveCateringOrder(simulationId, orderId) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    throw new Error("Simulation not found");
  }

  const order = simulation.cateringOrders.get(orderId);
  if (!order) {
    throw new Error("Catering order not found");
  }

  if (order.status === "approved") {
    throw new Error("Order is already approved");
  }

  if (order.status === "rejected") {
    throw new Error("Order has already been rejected");
  }

  order.status = "approved";

  // Update database schedule
  if (simulation.scheduleId) {
    for (const batchInfo of order.batches) {
      const batch = simulation.batches.find(
        (b) => b.batchId === batchInfo.batchId
      );
      if (batch) {
        try {
          await updateScheduleBatch(
            simulation.scheduleId,
            batch.batchId,
            batch
          );
        } catch (error) {
          console.error("Failed to save catering batch to database:", error);
        }
      }
    }
  }

  simulation.addEvent(
    "catering_order_approved",
    `Catering order approved: ${order.items.length} item(s) for pickup at ${order.requiredAvailableTime}`,
    {
      orderId,
      items: order.items,
      pickupTime: order.requiredAvailableTime,
    }
  );

  return {
    success: true,
    order: {
      orderId: order.orderId,
      items: order.items,
      requiredAvailableTime: order.requiredAvailableTime,
      orderPlacedAt: order.orderPlacedAt,
      status: order.status,
      batches: order.batches,
      movedBatches: order.movedBatches,
    },
  };
}

/**
 * Reject a pending catering order
 * @param {string} simulationId - Simulation ID
 * @param {string} orderId - Catering order ID
 * @returns {Promise<Object>} Rejection result
 */
export async function rejectCateringOrder(simulationId, orderId) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    throw new Error("Simulation not found");
  }

  const order = simulation.cateringOrders.get(orderId);
  if (!order) {
    throw new Error("Catering order not found");
  }

  if (order.status === "rejected") {
    throw new Error("Order has already been rejected");
  }

  if (order.status === "approved") {
    throw new Error("Cannot reject an approved order");
  }

  // Delete created batches
  for (const batchInfo of order.batches) {
    const batchIndex = simulation.batches.findIndex(
      (b) => b.batchId === batchInfo.batchId
    );
    if (batchIndex !== -1) {
      simulation.batches.splice(batchIndex, 1);
    }

    // Delete from database if exists
    if (simulation.scheduleId) {
      try {
        await deleteScheduleBatch(simulation.scheduleId, batchInfo.batchId);
      } catch (error) {
        console.error("Failed to delete catering batch from database:", error);
      }
    }
  }

  // Restore moved batches to original positions
  for (const movedBatch of order.movedBatches) {
    const batch = simulation.batches.find(
      (b) => b.batchId === movedBatch.batchId
    );
    if (batch) {
      batch.startTime = movedBatch.oldStartTime;
      batch.rackPosition = movedBatch.oldRack;
      const oldStartMinutes = parseTimeToMinutes(movedBatch.oldStartTime);
      batch.endTime = formatMinutesToTime(oldStartMinutes + batch.bakeTime);
      batch.availableTime = formatMinutesToTime(
        oldStartMinutes + batch.bakeTime + (batch.coolTime || 0)
      );
      batch.oven = getOvenFromRack(movedBatch.oldRack);

      // Update database
      if (simulation.scheduleId) {
        try {
          await updateScheduleBatch(
            simulation.scheduleId,
            batch.batchId,
            batch
          );
        } catch (error) {
          console.error("Failed to restore moved batch in database:", error);
        }
      }
    }
  }

  order.status = "rejected";

  simulation.addEvent(
    "catering_order_rejected",
    `Catering order rejected: ${order.items.length} item(s) for pickup at ${order.requiredAvailableTime}`,
    {
      orderId,
      items: order.items,
      pickupTime: order.requiredAvailableTime,
    }
  );

  return {
    success: true,
    orderId,
  };
}

/**
 * Get all catering orders for a simulation
 * @param {string} simulationId - Simulation ID
 * @returns {Promise<Array>} Array of catering orders
 */
export function getCateringOrders(simulationId) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    throw new Error("Simulation not found");
  }

  return Array.from(simulation.cateringOrders.values());
}

/**
 * Set auto-approve setting for catering orders
 * @param {string} simulationId - Simulation ID
 * @param {boolean} enabled - Whether to auto-approve
 * @returns {Promise<Object>} Updated setting
 */
export function setAutoApproveCatering(simulationId, enabled) {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) {
    throw new Error("Simulation not found");
  }

  simulation.autoApproveCatering = enabled;

  simulation.addEvent(
    "catering_auto_approve_changed",
    `Catering order auto-approval ${enabled ? "enabled" : "disabled"}`,
    {
      enabled,
    }
  );

  return {
    success: true,
    autoApproveCatering: enabled,
  };
}

/**
 * Clean up stopped/completed simulations older than 1 hour
 */
export function cleanupOldSimulations() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, simulation] of activeSimulations.entries()) {
    if (
      (simulation.status === "stopped" || simulation.status === "completed") &&
      simulation.startTime < oneHourAgo
    ) {
      activeSimulations.delete(id);
    }
  }
}

// Cleanup old simulations every 10 minutes
setInterval(cleanupOldSimulations, 10 * 60 * 1000);

/**
 * Update all running simulations and broadcast via WebSocket
 * This should be called periodically (e.g., every second)
 */
export function updateAllSimulations(io) {
  if (!io) return;

  for (const [id, simulation] of activeSimulations.entries()) {
    if (simulation.status === "running") {
      const updated = updateSimulation(id);
      if (updated) {
        // Broadcast update to all clients in the simulation room
        // Broadcast update to all clients in the simulation room
        const updateData = {
          id: updated.id,
          status: updated.status,
          currentTime: formatMinutesToTime(updated.currentTime),
          stats: updated.stats,
          inventory: Object.fromEntries(updated.inventory),
          inventoryUnits: Object.fromEntries(
            Array.from(updated.inventoryUnits.entries()).map(([key, units]) => [
              key,
              units,
            ])
          ), // Send actual remaining units for FIFO display
          batches: updated.batches.map((b) => ({
            batchId: b.batchId,
            displayName: b.displayName,
            itemGuid: b.itemGuid,
            quantity: b.quantity,
            rackPosition: b.rackPosition,
            oven: b.oven,
            status: b.status,
            startTime: b.startTime,
            endTime: b.endTime,
            availableTime: b.availableTime,
            isCatering: b.isCatering || false,
            cateringOrderId: b.cateringOrderId || null,
          })),
          completedBatches: (updated.completedBatches || []).map((b) => ({
            batchId: b.batchId,
            displayName: b.displayName,
            itemGuid: b.itemGuid,
            quantity: b.quantity,
            rackPosition: b.rackPosition,
            oven: b.oven,
            status: "completed",
            startTime: b.startTime,
            endTime: b.endTime,
            availableTime: b.availableTime,
            availableAt: b.availableAt, // Include availableAt (minutes) for freshness tracking
          })),
          forecast: updated.forecast || [],
          timeIntervalForecast: updated.timeIntervalForecast || [],
          parConfig: updated.parConfig || {},
          presetOrders: updated.presetOrders.map((order) => ({
            orderId: order.orderId,
            itemGuid: order.itemGuid,
            quantity: order.quantity,
            orderTimeMinutes: order.orderTimeMinutes,
            displayName: order.displayName,
          })),
          recentEvents: updated.events.slice(-5),
          missedOrders: Array.from(updated.missedOrders.values()),
          processedOrdersByItem: Array.from(
            updated.processedOrdersByItem.values()
          ),
          mode: updated.mode,
          cateringOrders: Array.from(updated.cateringOrders.values()),
          autoApproveCatering: updated.autoApproveCatering,
        };
        io.to(`simulation:${id}`).emit("simulation_update", updateData);
        if (updated.mode === "manual") {
          io.to(`simulation:${id}`).emit("inventory_update", {
            inventory: updateData.inventory,
            totalInventory: updateData.stats.totalInventory,
          });
        }
      }
    }
  }
}
