import { getScheduleByDate } from "../repository.js";
import {
  parseTimeToMinutes,
  formatMinutesToTime,
  addMinutesToTime,
} from "../../shared/utils/timeUtils.js";
import { BUSINESS_HOURS, ABS_DEFAULTS } from "../../config/constants.js";
import { v4 as uuidv4 } from "uuid";
import { getOrdersByDateRange } from "../../orders/repository.js";
import { toBusinessTime } from "../../config/timezone.js";
import { generateSchedule } from "../service.js";

/**
 * Simulation Service - Runs schedule simulations in real-time
 */

// Active simulations storage (in production, use Redis or database)
const activeSimulations = new Map();

/**
 * Simulation state
 */
export class SimulationState {
  constructor(config) {
    this.id = uuidv4();
    this.scheduleDate = config.scheduleDate;
    this.speedMultiplier = config.speedMultiplier || 60; // 60x speed by default
    this.status = "running"; // running, paused, stopped, completed
    this.currentTime = BUSINESS_HOURS.START_MINUTES; // Current simulation time in minutes
    this.startTime = Date.now(); // Real-world start time
    this.pausedAt = null;
    this.pausedDuration = 0;

    // Inventory tracking: itemGuid -> quantity available
    this.inventory = new Map();

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
      ordersProcessed: 0,
      ordersTotal: 0,
    };

    // Events log
    this.events = [];

    // Mode: 'manual' or 'preset'
    this.mode = config.mode || "manual";

    // Preset orders (for preset mode)
    this.presetOrders = config.presetOrders || [];
    // Track processed orders by orderId+itemGuid to handle orders with multiple items
    this.processedOrders = new Set();
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
  const { scheduleDate, speedMultiplier = 60, mode = "manual" } = config;

  if (!scheduleDate) {
    throw new Error("scheduleDate is required");
  }

  // Load schedule, auto-generate if it doesn't exist
  let schedule = await getScheduleByDate(scheduleDate);
  if (!schedule) {
    // Auto-generate schedule with default parameters
    try {
      schedule = await generateSchedule({
        date: scheduleDate,
        forecastParams: {
          growthRate: 1.0,
          lookbackWeeks: 4,
        },
        restockThreshold: ABS_DEFAULTS.RESTOCK_THRESHOLD,
        targetEndInventory: ABS_DEFAULTS.TARGET_END_INVENTORY,
      });
    } catch (error) {
      throw new Error(
        `No schedule found for date: ${scheduleDate}, and failed to auto-generate: ${error.message}`
      );
    }
  }

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
    speedMultiplier,
    mode,
    presetOrders,
  });

  simulation.stats.ordersTotal = presetOrders.length;

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
  simulation.batches.sort((a, b) => {
    const timeA = parseTimeToMinutes(a.startTime);
    const timeB = parseTimeToMinutes(b.startTime);
    return timeA - timeB;
  });

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

      // Update inventory
      const currentInventory = simulation.inventory.get(batch.itemGuid) || 0;
      const newInventory = currentInventory + batch.quantity;
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
        // Check if item is available in inventory
        const availableInventory =
          simulation.inventory.get(order.itemGuid) || 0;
        const requestedQuantity = order.quantity;

        if (availableInventory >= requestedQuantity) {
          // Process order - decrease inventory
          const newInventory = availableInventory - requestedQuantity;
          simulation.inventory.set(order.itemGuid, newInventory);
          simulation.stats.ordersProcessed++;
          simulation.stats.totalInventory = Array.from(
            simulation.inventory.values()
          ).reduce((sum, qty) => sum + qty, 0);

          simulation.processedOrders.add(orderKey);

          simulation.addEvent(
            "order_processed",
            `Order processed: ${order.displayName} (${requestedQuantity} units)`,
            {
              orderId: order.orderId,
              itemGuid: order.itemGuid,
              quantity: requestedQuantity,
              remainingInventory: newInventory,
            }
          );
        } else {
          // Not enough inventory - log as missed order
          // Still mark as processed so we don't keep trying
          simulation.processedOrders.add(orderKey);
          simulation.addEvent(
            "order_missed",
            `Order missed (insufficient inventory): ${order.displayName} (requested: ${requestedQuantity}, available: ${availableInventory})`,
            {
              orderId: order.orderId,
              itemGuid: order.itemGuid,
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
          })),
          completedBatches: updated.completedBatches.map((b) => ({
            batchId: b.batchId,
            displayName: b.displayName,
            itemGuid: b.itemGuid,
            quantity: b.quantity,
            availableTime: b.availableTime,
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
          mode: updated.mode,
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
