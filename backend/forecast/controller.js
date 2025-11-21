import {
  getForecast,
  clearForecastCache,
  compareForecastVsActual,
  getOverallForecastAccuracy,
} from "./service.js";
import { asyncHandler } from "../shared/middleware/errorHandler.js";

/**
 * Forecast controller - Request handlers for forecast routes
 */

/**
 * Generate forecast
 * POST /api/forecast/generate
 */
export const generateForecastController = asyncHandler(async (req, res) => {
  const { startDate, endDate, increment, growthRate, lookbackWeeks } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: {
        message: "startDate and endDate are required",
      },
    });
  }

  const params = {
    startDate,
    endDate,
    increment: increment || "day",
    growthRate: growthRate !== undefined ? Number(growthRate) : 1.0,
    lookbackWeeks: lookbackWeeks ? Number(lookbackWeeks) : 4,
    forecastType: "daily",
  };

  const forecast = await getForecast(params);

  res.status(200).json({
    success: true,
    data: forecast.forecast,
    dailyForecast: forecast.dailyForecast,
    summary: forecast.summary,
    cached: forecast.cached,
  });
});

/**
 * Get cached forecast
 * GET /api/forecast/cached
 */
export const getCachedForecastController = asyncHandler(async (req, res) => {
  const { startDate, endDate, increment, growthRate, lookbackWeeks } =
    req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: {
        message: "startDate and endDate query parameters are required",
      },
    });
  }

  const params = {
    startDate,
    endDate,
    increment: increment || "day",
    growthRate: growthRate ? Number(growthRate) : 1.0,
    lookbackWeeks: lookbackWeeks ? Number(lookbackWeeks) : 4,
    forecastType: "daily",
  };

  const forecast = await getForecast(params);

  res.status(200).json({
    success: true,
    data: forecast.forecast,
    dailyForecast: forecast.dailyForecast,
    summary: forecast.summary,
    cached: forecast.cached,
  });
});

/**
 * Clear forecast cache
 * DELETE /api/forecast/cache
 */
export const clearCacheController = asyncHandler(async (req, res) => {
  const { startDate, forecastType } = req.query;

  const params = startDate
    ? {
        startDate,
        forecastType: forecastType || "daily",
      }
    : null;

  const result = await clearForecastCache(params);

  res.status(200).json({
    success: true,
    message: `Cleared ${result.deletedCount} cached forecast(s)`,
    deletedCount: result.deletedCount,
  });
});

/**
 * Compare forecast vs actual demand
 * GET /api/forecast/compare
 */
export const compareForecastVsActualController = asyncHandler(
  async (req, res) => {
    const { date, growthRate, lookbackWeeks, timeIntervalMinutes } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: {
          message: "date query parameter is required",
        },
      });
    }

    const forecastParams = {
      growthRate: growthRate ? Number(growthRate) : 1.0,
      lookbackWeeks: lookbackWeeks ? Number(lookbackWeeks) : 4,
      timeIntervalMinutes: timeIntervalMinutes
        ? Number(timeIntervalMinutes)
        : 20,
    };

    const comparison = await compareForecastVsActual(date, forecastParams);

    res.status(200).json({
      success: true,
      data: comparison,
    });
  }
);

/**
 * Get overall forecast accuracy across all historical dates
 * GET /api/forecast/overall-accuracy
 */
export const getOverallForecastAccuracyController = asyncHandler(
  async (req, res) => {
    const { growthRate, lookbackWeeks, timeIntervalMinutes } = req.query;

    const forecastParams = {
      growthRate: growthRate ? Number(growthRate) : 1.0,
      lookbackWeeks: lookbackWeeks ? Number(lookbackWeeks) : 4,
      timeIntervalMinutes: timeIntervalMinutes
        ? Number(timeIntervalMinutes)
        : 20,
    };

    const accuracy = await getOverallForecastAccuracy(forecastParams);

    res.status(200).json({
      success: true,
      data: accuracy,
    });
  }
);
