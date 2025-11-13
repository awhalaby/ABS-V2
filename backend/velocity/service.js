import {
  getWeeklyVelocity,
  getDailyVelocity,
  getIntradayVelocity,
} from "./repository.js";
import { validateDateRange } from "../shared/utils/validation.js";
import { validateIntradayInterval } from "../shared/utils/validation.js";

/**
 * Velocity service - Business logic for velocity calculations
 */

/**
 * Get weekly velocity statistics
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<Object>} Weekly velocity data with summary statistics
 */
export async function getWeeklyVelocityData(startDate, endDate) {
  // Validate date range
  const validation = validateDateRange(startDate, endDate);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const weeklyData = await getWeeklyVelocity(startDate, endDate);

  // Calculate summary statistics
  const summary = {
    totalOrders: 0,
    totalItems: 0,
    totalRevenue: 0,
    uniqueSKUs: new Set(),
    weeks: new Set(),
  };

  weeklyData.forEach((record) => {
    summary.totalOrders += record.orderCount;
    summary.totalItems += record.totalQuantity;
    summary.totalRevenue += record.totalRevenue || 0;
    summary.uniqueSKUs.add(record.itemGuid || record.displayName);
    summary.weeks.add(`${record.year}-W${record.week}`);
  });

  return {
    data: weeklyData,
    summary: {
      totalOrders: summary.totalOrders,
      totalItems: summary.totalItems,
      totalRevenue: summary.totalRevenue,
      uniqueSKUs: summary.uniqueSKUs.size,
      weeksAnalyzed: summary.weeks.size,
      startDate:
        typeof startDate === "string" ? startDate : startDate.toISOString(),
      endDate: typeof endDate === "string" ? endDate : endDate.toISOString(),
    },
  };
}

/**
 * Get daily velocity statistics
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @param {string} sku - Optional SKU filter
 * @returns {Promise<Object>} Daily velocity data with summary statistics
 */
export async function getDailyVelocityData(startDate, endDate, sku = null) {
  // Validate date range
  const validation = validateDateRange(startDate, endDate);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const dailyData = await getDailyVelocity(startDate, endDate, sku);

  // Calculate summary statistics
  const summary = {
    totalOrders: 0,
    totalItems: 0,
    totalRevenue: 0,
    uniqueSKUs: new Set(),
    uniqueDates: new Set(),
    dayOfWeekPattern: {},
  };

  dailyData.forEach((record) => {
    summary.totalOrders += record.orderCount;
    summary.totalItems += record.totalQuantity;
    summary.totalRevenue += record.totalRevenue || 0;
    summary.uniqueSKUs.add(record.itemGuid || record.displayName);
    summary.uniqueDates.add(record.date);

    // Track day of week patterns
    const day = record.dayOfWeek;
    if (!summary.dayOfWeekPattern[day]) {
      summary.dayOfWeekPattern[day] = { totalQuantity: 0, count: 0 };
    }
    summary.dayOfWeekPattern[day].totalQuantity += record.totalQuantity;
    summary.dayOfWeekPattern[day].count += 1;
  });

  // Calculate averages per day of week
  const dayOfWeekAverages = {};
  Object.keys(summary.dayOfWeekPattern).forEach((day) => {
    const pattern = summary.dayOfWeekPattern[day];
    dayOfWeekAverages[day] = pattern.totalQuantity / pattern.count;
  });

  return {
    data: dailyData,
    summary: {
      totalOrders: summary.totalOrders,
      totalItems: summary.totalItems,
      totalRevenue: summary.totalRevenue,
      uniqueSKUs: summary.uniqueSKUs.size,
      daysAnalyzed: summary.uniqueDates.size,
      dayOfWeekAverages,
      startDate:
        typeof startDate === "string" ? startDate : startDate.toISOString(),
      endDate: typeof endDate === "string" ? endDate : endDate.toISOString(),
      ...(sku && { skuFilter: sku }),
    },
  };
}

/**
 * Get intraday velocity statistics
 * @param {string} itemGuid - Item GUID to analyze
 * @param {Date|string} date - Date to analyze
 * @param {number} intervalMinutes - Time bucket interval
 * @returns {Promise<Object>} Intraday velocity data with summary statistics
 */
export async function getIntradayVelocityData(
  itemGuid,
  date,
  intervalMinutes = 20
) {
  // Validate interval
  const intervalValidation = validateIntradayInterval(intervalMinutes);
  if (!intervalValidation.valid) {
    throw new Error(intervalValidation.error);
  }

  if (!itemGuid) {
    throw new Error("itemGuid is required");
  }

  const intradayData = await getIntradayVelocity(
    itemGuid,
    date,
    intervalMinutes
  );

  // Calculate summary statistics
  const summary = {
    totalQuantity: 0,
    totalOrders: 0,
    peakHour: null,
    peakQuantity: 0,
    averagePerBucket: 0,
    buckets: intradayData.length,
  };

  intradayData.forEach((record) => {
    summary.totalQuantity += record.totalQuantity;
    summary.totalOrders += record.orderCount;

    if (record.totalQuantity > summary.peakQuantity) {
      summary.peakQuantity = record.totalQuantity;
      summary.peakHour = record.timeSlot;
    }
  });

  summary.averagePerBucket =
    summary.buckets > 0 ? summary.totalQuantity / summary.buckets : 0;

  return {
    data: intradayData,
    summary: {
      ...summary,
      itemGuid,
      date: typeof date === "string" ? date : date.toISOString(),
      intervalMinutes,
    },
  };
}
