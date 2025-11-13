import {
  getWeeklyVelocityData,
  getDailyVelocityData,
  getIntradayVelocityData,
} from "./service.js";
import { asyncHandler } from "../shared/middleware/errorHandler.js";

/**
 * Velocity controller - Request handlers for velocity routes
 */

/**
 * Get weekly velocity
 * GET /api/velocity/weekly
 */
export const getWeeklyVelocityController = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: {
        message: "startDate and endDate query parameters are required",
      },
    });
  }

  const result = await getWeeklyVelocityData(startDate, endDate);

  res.status(200).json({
    success: true,
    data: result.data,
    summary: result.summary,
  });
});

/**
 * Get daily velocity
 * GET /api/velocity/daily
 */
export const getDailyVelocityController = asyncHandler(async (req, res) => {
  const { startDate, endDate, sku } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: {
        message: "startDate and endDate query parameters are required",
      },
    });
  }

  const result = await getDailyVelocityData(startDate, endDate, sku || null);

  res.status(200).json({
    success: true,
    data: result.data,
    summary: result.summary,
  });
});

/**
 * Get intraday velocity
 * GET /api/velocity/intraday
 */
export const getIntradayVelocityController = asyncHandler(async (req, res) => {
  const { itemGuid, date, interval } = req.query;

  if (!itemGuid || !date) {
    return res.status(400).json({
      success: false,
      error: {
        message: "itemGuid and date query parameters are required",
      },
    });
  }

  const intervalMinutes = interval ? parseInt(interval, 10) : 20;

  const result = await getIntradayVelocityData(itemGuid, date, intervalMinutes);

  res.status(200).json({
    success: true,
    data: result.data,
    summary: result.summary,
  });
});
