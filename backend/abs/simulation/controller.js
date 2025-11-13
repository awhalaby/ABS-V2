import { asyncHandler } from "../../shared/middleware/errorHandler.js";
import { formatMinutesToTime } from "../../shared/utils/timeUtils.js";
import {
  startSimulation,
  pauseSimulation,
  resumeSimulation,
  stopSimulation,
  getSimulation,
  updateSimulation,
  deleteSimulationBatch,
  moveSimulationBatch,
} from "./service.js";

/**
 * Start a new simulation
 * POST /api/abs/simulation/start
 */
export const startSimulationController = asyncHandler(async (req, res) => {
  const { scheduleDate, speedMultiplier, mode } = req.body;

  if (!scheduleDate) {
    return res.status(400).json({
      success: false,
      error: {
        message: "scheduleDate is required",
      },
    });
  }

  if (mode && mode !== "manual" && mode !== "preset") {
    return res.status(400).json({
      success: false,
      error: {
        message: "mode must be 'manual' or 'preset'",
      },
    });
  }

  const simulation = await startSimulation({
    scheduleDate,
    speedMultiplier: speedMultiplier || 60,
    mode: mode || "manual",
  });

  res.status(200).json({
    success: true,
    data: {
      id: simulation.id,
      scheduleDate: simulation.scheduleDate,
      speedMultiplier: simulation.speedMultiplier,
      mode: simulation.mode,
      status: simulation.status,
      currentTime: formatMinutesToTime(simulation.currentTime),
      stats: simulation.stats,
      inventory: Object.fromEntries(simulation.inventory),
      batches: simulation.batches.map((b) => ({
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
      completedBatches: (simulation.completedBatches || []).map((b) => ({
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
      })),
      forecast: simulation.forecast || [],
      presetOrders: simulation.presetOrders.map((order) => ({
        orderId: order.orderId,
        itemGuid: order.itemGuid,
        quantity: order.quantity,
        orderTimeMinutes: order.orderTimeMinutes,
        displayName: order.displayName,
      })),
      missedOrders: Array.from(simulation.missedOrders.values()),
      processedOrdersByItem: Array.from(
        simulation.processedOrdersByItem.values()
      ),
    },
  });
});

/**
 * Get simulation status
 * GET /api/abs/simulation/:id/status
 */
export const getSimulationStatusController = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const simulation = getSimulation(id);
  if (!simulation) {
    return res.status(404).json({
      success: false,
      error: {
        message: "Simulation not found",
      },
    });
  }

  // Update simulation if running
  if (simulation.status === "running") {
    updateSimulation(id);
  }

  res.status(200).json({
    success: true,
    data: {
      id: simulation.id,
      scheduleDate: simulation.scheduleDate,
      speedMultiplier: simulation.speedMultiplier,
      mode: simulation.mode,
      status: simulation.status,
      currentTime: formatMinutesToTime(simulation.currentTime),
      stats: simulation.stats,
      inventory: Object.fromEntries(simulation.inventory),
      batches: simulation.batches.map((b) => ({
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
      completedBatches: (simulation.completedBatches || []).map((b) => ({
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
      })),
      forecast: simulation.forecast || [],
      recentEvents: simulation.events.slice(-10), // Last 10 events
      missedOrders: Array.from(simulation.missedOrders.values()),
      processedOrdersByItem: Array.from(
        simulation.processedOrdersByItem.values()
      ),
    },
  });
});

/**
 * Get simulation results
 * GET /api/abs/simulation/:id/results
 */
export const getSimulationResultsController = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const simulation = getSimulation(id);
  if (!simulation) {
    return res.status(404).json({
      success: false,
      error: {
        message: "Simulation not found",
      },
    });
  }

  res.status(200).json({
    success: true,
    data: {
      id: simulation.id,
      scheduleDate: simulation.scheduleDate,
      status: simulation.status,
      stats: simulation.stats,
      inventory: Object.fromEntries(simulation.inventory),
      completedBatches: simulation.completedBatches,
      events: simulation.events,
    },
  });
});

/**
 * Pause simulation
 * POST /api/abs/simulation/:id/pause
 */
export const pauseSimulationController = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const simulation = pauseSimulation(id);
  if (!simulation) {
    return res.status(404).json({
      success: false,
      error: {
        message: "Simulation not found",
      },
    });
  }

  res.status(200).json({
    success: true,
    data: {
      id: simulation.id,
      status: simulation.status,
      currentTime: formatMinutesToTime(simulation.currentTime),
    },
  });
});

/**
 * Resume simulation
 * POST /api/abs/simulation/:id/resume
 */
export const resumeSimulationController = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const simulation = resumeSimulation(id);
  if (!simulation) {
    return res.status(404).json({
      success: false,
      error: {
        message: "Simulation not found",
      },
    });
  }

  res.status(200).json({
    success: true,
    data: {
      id: simulation.id,
      status: simulation.status,
    },
  });
});

/**
 * Stop simulation
 * POST /api/abs/simulation/:id/stop
 */
export const stopSimulationController = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const simulation = stopSimulation(id);
  if (!simulation) {
    return res.status(404).json({
      success: false,
      error: {
        message: "Simulation not found",
      },
    });
  }

  res.status(200).json({
    success: true,
    data: {
      id: simulation.id,
      status: simulation.status,
      currentTime: formatMinutesToTime(simulation.currentTime),
    },
  });
});

/**
 * Get available dates for preset mode
 * GET /api/abs/simulation/available-dates
 */
export const getAvailableDatesController = asyncHandler(async (req, res) => {
  // Query all dates with order counts directly (no need for ranges)
  const { getCollection } = await import("../../config/database.js");
  const { COLLECTIONS } = await import("../../config/constants.js");
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  // Aggregate order counts per date
  const pipeline = [
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$paidDate",
            timezone: "America/New_York",
          },
        },
        orderCount: { $addToSet: "$orderId" },
        itemCount: { $sum: "$quantity" },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id",
        orderCount: { $size: "$orderCount" },
        itemCount: 1,
      },
    },
    {
      $sort: { date: -1 },
    },
  ];

  const dates = await collection.aggregate(pipeline).toArray();

  res.status(200).json({
    success: true,
    data: {
      dates,
    },
  });
});

/**
 * Move a batch in simulation
 * POST /api/abs/simulation/:id/batch/move
 */
export const moveSimulationBatchController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { batchId, newStartTime, newRack } = req.body;

  if (!batchId || !newStartTime || !newRack) {
    return res.status(400).json({
      success: false,
      error: {
        message: "batchId, newStartTime, and newRack are required",
      },
    });
  }

  const simulation = await moveSimulationBatch(
    id,
    batchId,
    newStartTime,
    newRack
  );
  if (!simulation) {
    return res.status(404).json({
      success: false,
      error: {
        message: "Simulation not found",
      },
    });
  }

  res.status(200).json({
    success: true,
    data: {
      id: simulation.id,
      status: simulation.status,
      batches: simulation.batches.map((b) => ({
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
      completedBatches: (simulation.completedBatches || []).map((b) => ({
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
      })),
      recentEvents: simulation.events.slice(-10),
    },
  });
});

/**
 * Delete a batch from simulation
 * DELETE /api/abs/simulation/:id/batch/:batchId
 */
export const deleteSimulationBatchController = asyncHandler(
  async (req, res) => {
    const { id, batchId } = req.params;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        error: {
          message: "batchId is required",
        },
      });
    }

    const simulation = deleteSimulationBatch(id, batchId);
    if (!simulation) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Simulation not found",
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: simulation.id,
        status: simulation.status,
        batches: simulation.batches.map((b) => ({
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
        completedBatches: (simulation.completedBatches || []).map((b) => ({
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
        })),
        recentEvents: simulation.events.slice(-10),
      },
    });
  }
);
