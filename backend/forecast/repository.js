import { getCollection } from "../config/database.js";
import { COLLECTIONS, FORECAST_DEFAULTS } from "../config/constants.js";
import { getMongoTimezone } from "../config/timezone.js";
import { startOfBusinessDay, endOfBusinessDay } from "../config/timezone.js";
import { parseISO } from "date-fns";

/**
 * Forecast repository - Database queries for forecast operations
 */

/**
 * Get historical order data for forecast
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<Array>} Array of order records
 */
export async function getHistoricalData(startDate, endDate) {
  const collection = getCollection(COLLECTIONS.MENU_ITEMS);

  const start = startOfBusinessDay(startDate);
  const end = endOfBusinessDay(endDate);
  const timezone = getMongoTimezone();

  const pipeline = [
    {
      $match: {
        paidDate: {
          $gte: start,
          $lte: end,
        },
      },
    },
    {
      $project: {
        orderId: 1,
        paidDate: 1,
        itemGuid: 1,
        displayName: 1,
        quantity: 1,
        price: 1,
        date: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$paidDate",
            timezone,
          },
        },
        dayOfWeek: {
          $dayOfWeek: { date: "$paidDate", timezone },
        },
        hour: {
          $hour: { date: "$paidDate", timezone },
        },
        minute: {
          $minute: { date: "$paidDate", timezone },
        },
      },
    },
    {
      $sort: { paidDate: 1 },
    },
  ];

  return await collection.aggregate(pipeline).toArray();
}

/**
 * Get scheduled orders (future known orders) - placeholder for future implementation
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<Array>} Array of scheduled orders
 */
export async function getScheduledOrders(startDate, endDate) {
  // Placeholder - can be extended to query from a scheduled_orders collection
  return [];
}

/**
 * Get cached forecast
 * @param {Object} params - Forecast parameters
 * @returns {Promise<Object|null>} Cached forecast or null
 */
export async function getCachedForecast(params) {
  const collection = getCollection(COLLECTIONS.FORECASTS);

  // Create cache key from parameters
  const cacheKey = JSON.stringify({
    forecastType: params.forecastType,
    startDate: params.startDate,
    endDate: params.endDate,
    increment: params.increment,
    growthRate: params.growthRate,
    lookbackWeeks: params.lookbackWeeks,
  });

  const cached = await collection.findOne({
    forecastType: params.forecastType,
    date: params.startDate,
    parameters: params,
    expiresAt: { $gt: new Date() },
  });

  return cached;
}

/**
 * Save forecast to cache
 * @param {Object} params - Forecast parameters
 * @param {Object} data - Forecast data
 * @returns {Promise<void>}
 */
export async function saveForecastCache(params, data) {
  const collection = getCollection(COLLECTIONS.FORECASTS);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + FORECAST_DEFAULTS.CACHE_TTL_HOURS);

  await collection.updateOne(
    {
      forecastType: params.forecastType,
      date: params.startDate,
      "parameters.increment": params.increment,
      "parameters.growthRate": params.growthRate,
      "parameters.lookbackWeeks": params.lookbackWeeks,
    },
    {
      $set: {
        forecastType: params.forecastType,
        date: params.startDate,
        parameters: params,
        data: data,
        createdAt: new Date(),
        expiresAt: expiresAt,
      },
    },
    { upsert: true }
  );
}

/**
 * Clear forecast cache
 * @param {Object} params - Optional parameters to filter cache clearing
 * @returns {Promise<Object>} Delete result
 */
export async function clearCache(params = null) {
  const collection = getCollection(COLLECTIONS.FORECASTS);

  const filter = params
    ? {
        forecastType: params.forecastType,
        date: params.startDate,
      }
    : {};

  const result = await collection.deleteMany(filter);

  return {
    deletedCount: result.deletedCount,
  };
}
