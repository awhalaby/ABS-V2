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
  addSimulationBatch,
  calculateSuggestedBatches,
  createCateringOrder,
  approveCateringOrder,
  rejectCateringOrder,
  getCateringOrders,
  setAutoApproveCatering,
} from "./service.js";

/**
 * Start a new simulation
 * POST /api/abs/simulation/start
 */
export const startSimulationController = asyncHandler(async (req, res) => {
  const { scheduleDate, speedMultiplier, mode, forecastScale, forecastScales } =
    req.body;

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

  // Support both old forecastScale (single value) and new forecastScales (period-based)
  let finalForecastScales = null;
  if (forecastScales) {
    finalForecastScales = {
      morning: Number(forecastScales.morning) || 1.0,
      afternoon: Number(forecastScales.afternoon) || 1.0,
      evening: Number(forecastScales.evening) || 1.0,
    };
  } else if (forecastScale !== undefined) {
    // Legacy support: apply single scale to all periods
    const scale = Number(forecastScale);
    finalForecastScales = {
      morning: scale,
      afternoon: scale,
      evening: scale,
    };
  }

  const simulation = await startSimulation({
    scheduleDate,
    speedMultiplier: speedMultiplier || 60,
    mode: mode || "manual",
    forecastScales: finalForecastScales,
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
      inventoryUnits: Object.fromEntries(
        Array.from(simulation.inventoryUnits.entries()).map(([key, units]) => [
          key,
          units,
        ])
      ), // Send actual remaining units for FIFO display
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
        availableAt: b.availableAt, // Include availableAt (minutes) for freshness tracking
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
      inventoryUnits: Object.fromEntries(
        Array.from(simulation.inventoryUnits.entries()).map(([key, units]) => [
          key,
          units,
        ])
      ), // Send actual remaining units for FIFO display
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
        isCatering: b.isCatering || false,
        cateringOrderId: b.cateringOrderId || null,
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
        availableAt: b.availableAt, // Include availableAt (minutes) for freshness tracking
        isCatering: b.isCatering || false,
        cateringOrderId: b.cateringOrderId || null,
      })),
      forecast: simulation.forecast || [],
      recentEvents: simulation.events.slice(-10), // Last 10 events
      missedOrders: Array.from(simulation.missedOrders.values()),
      processedOrdersByItem: Array.from(
        simulation.processedOrdersByItem.values()
      ),
      cateringOrders: Array.from(simulation.cateringOrders.values()),
      autoApproveCatering: simulation.autoApproveCatering,
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
      inventoryUnits: Object.fromEntries(
        Array.from(simulation.inventoryUnits.entries()).map(([key, units]) => [
          key,
          units,
        ])
      ), // Send actual remaining units for FIFO display
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

  // Aggregate total quantities per date (sum of all item quantities)
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
        itemCount: { $sum: "$quantity" }, // Sum of all item quantities
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id",
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
        availableAt: b.availableAt, // Include availableAt (minutes) for freshness tracking
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

    const simulation = await deleteSimulationBatch(id, batchId);
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

/**
 * Get suggested batches for a simulation
 * GET /api/abs/simulation/:id/suggested-batches
 */
export const getSuggestedBatchesController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const rawMode = typeof req.query.mode === "string" ? req.query.mode : "";
  const mode =
    rawMode.trim().length > 0 ? rawMode.trim().toLowerCase() : "predictive";

  if (!id) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Simulation ID is required",
      },
    });
  }

  const suggestedBatches = await calculateSuggestedBatches(id, { mode });

  res.status(200).json({
    success: true,
    data: {
      mode,
      suggestedBatches,
    },
  });
});

/**
 * Add a batch to the simulation schedule
 * POST /api/abs/simulation/:id/batch/add
 */
export const addSimulationBatchController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const batchData = req.body;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Simulation ID is required",
      },
    });
  }

  if (!batchData || !batchData.startTime) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Batch data with startTime is required",
      },
    });
  }

  const simulation = await addSimulationBatch(id, batchData);
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
        availableAt: b.availableAt,
      })),
      recentEvents: simulation.events.slice(-10),
    },
  });
});

/**
 * Create a catering order
 * POST /api/abs/simulation/:id/catering-order
 */
export const createCateringOrderController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { items, requiredAvailableTime, autoApprove } = req.body;

  const result = await createCateringOrder(id, {
    items,
    requiredAvailableTime,
    autoApprove,
  });

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * Approve a pending catering order
 * POST /api/abs/simulation/:id/catering-order/:orderId/approve
 */
export const approveCateringOrderController = asyncHandler(async (req, res) => {
  const { id, orderId } = req.params;

  const result = await approveCateringOrder(id, orderId);

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * Reject a pending catering order
 * POST /api/abs/simulation/:id/catering-order/:orderId/reject
 */
export const rejectCateringOrderController = asyncHandler(async (req, res) => {
  const { id, orderId } = req.params;

  const result = await rejectCateringOrder(id, orderId);

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * Get all catering orders for a simulation
 * GET /api/abs/simulation/:id/catering-orders
 */
export const getCateringOrdersController = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const orders = getCateringOrders(id);

  res.status(200).json({
    success: true,
    data: orders,
  });
});

/**
 * Set auto-approve setting for catering orders
 * POST /api/abs/simulation/:id/catering-order/auto-approve
 */
export const setAutoApproveCateringController = asyncHandler(
  async (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body;

    const result = setAutoApproveCatering(id, enabled);

    res.status(200).json({
      success: true,
      data: result,
    });
  }
);
