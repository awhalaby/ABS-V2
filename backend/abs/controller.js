import {
  generateSchedule,
  getSchedule,
  getSchedules,
  deleteSchedule,
  moveBatch,
} from "./service.js";
import { getEarliestOrderDate } from "./repository.js";
import { asyncHandler } from "../shared/middleware/errorHandler.js";

/**
 * ABS Schedule controller - Request handlers for schedule routes
 */

/**
 * Generate schedule for a date
 * POST /api/abs/schedule/generate
 */
export const generateScheduleController = asyncHandler(async (req, res) => {
  const { date, forecastParams, restockThreshold, targetEndInventory } =
    req.body;

  if (!date) {
    return res.status(400).json({
      success: false,
      error: {
        message: "date is required",
      },
    });
  }

  const schedule = await generateSchedule({
    date,
    forecastParams: forecastParams || {},
    restockThreshold,
    targetEndInventory,
  });

  res.status(200).json({
    success: true,
    data: schedule,
  });
});

/**
 * Get schedule by date
 * GET /api/abs/schedule/:date
 */
export const getScheduleController = asyncHandler(async (req, res) => {
  const { date } = req.params;

  if (!date) {
    return res.status(400).json({
      success: false,
      error: {
        message: "date parameter is required",
      },
    });
  }

  const schedule = await getSchedule(date);

  if (!schedule) {
    return res.status(404).json({
      success: false,
      error: {
        message: "Schedule not found for the specified date",
      },
    });
  }

  res.status(200).json({
    success: true,
    data: schedule,
  });
});

/**
 * List schedules with filters
 * GET /api/abs/schedule
 */
export const listSchedulesController = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: {
        message: "startDate and endDate query parameters are required",
      },
    });
  }

  const schedules = await getSchedules(startDate, endDate);

  res.status(200).json({
    success: true,
    data: schedules,
    count: schedules.length,
  });
});

/**
 * Delete schedule by date
 * DELETE /api/abs/schedule/:date
 */
export const deleteScheduleController = asyncHandler(async (req, res) => {
  const { date } = req.params;

  if (!date) {
    return res.status(400).json({
      success: false,
      error: {
        message: "date parameter is required",
      },
    });
  }

  const result = await deleteSchedule(date);

  res.status(200).json({
    success: true,
    message: `Schedule deleted for date: ${date}`,
    deletedCount: result.deletedCount,
  });
});

/**
 * Get earliest order date
 * GET /api/abs/earliest-date
 */
export const getEarliestDateController = asyncHandler(async (req, res) => {
  const earliestDate = await getEarliestOrderDate();

  res.status(200).json({
    success: true,
    data: {
      earliestDate: earliestDate,
    },
  });
});

/**
 * Move batch to new time/rack
 * POST /api/abs/batch/move
 */
export const moveBatchController = asyncHandler(async (req, res) => {
  const { scheduleId, batchId, newStartTime, newRack } = req.body;

  if (!scheduleId || !batchId) {
    return res.status(400).json({
      success: false,
      error: {
        message: "scheduleId and batchId are required",
      },
    });
  }

  const schedule = await moveBatch({
    scheduleId,
    batchId,
    newStartTime,
    newRack,
  });

  res.status(200).json({
    success: true,
    data: schedule,
  });
});
