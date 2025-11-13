import {
  getHistoricalData,
  getScheduledOrders,
  getCachedForecast,
  saveForecastCache,
  clearCache,
} from "./repository.js";
import { validateDateRange } from "../shared/utils/validation.js";
import { validateGrowthRate } from "../shared/utils/validation.js";
import { validateInterval } from "../shared/utils/validation.js";
import { getBusinessDayOfWeek } from "../config/timezone.js";
import { BUSINESS_HOURS } from "../config/constants.js";
import { parseISO, addDays, format, eachDayOfInterval } from "date-fns";

/**
 * Forecast service - Core forecast algorithm
 */

/**
 * Calculate day-of-week patterns from historical data
 * @param {Array} historicalData - Historical order data
 * @returns {Object} Day-of-week multipliers per SKU
 */
function calculateDayOfWeekPatterns(historicalData) {
  const patterns = {};

  // Group by SKU, day of week, and unique date
  const skuDayData = {};
  const skuUniqueDays = {};

  historicalData.forEach((order) => {
    const skuKey = order.itemGuid || order.displayName;
    if (!skuKey) return;

    // MongoDB $dayOfWeek returns 1-7 (Sunday=1, Monday=2, etc.)
    // Convert to 0-6 format (Sunday=0, Monday=1, etc.) for consistency
    let dayOfWeek = order.dayOfWeek ? order.dayOfWeek - 1 : 0;
    if (dayOfWeek === 7) dayOfWeek = 0;

    if (!skuDayData[skuKey]) {
      skuDayData[skuKey] = {};
      skuUniqueDays[skuKey] = { all: new Set(), byDay: {} };
    }

    if (!skuDayData[skuKey][dayOfWeek]) {
      skuDayData[skuKey][dayOfWeek] = { total: 0, uniqueDays: new Set() };
    }

    skuDayData[skuKey][dayOfWeek].total += order.quantity;
    skuDayData[skuKey][dayOfWeek].uniqueDays.add(order.date);
    skuUniqueDays[skuKey].all.add(order.date);

    if (!skuUniqueDays[skuKey].byDay[dayOfWeek]) {
      skuUniqueDays[skuKey].byDay[dayOfWeek] = new Set();
    }
    skuUniqueDays[skuKey].byDay[dayOfWeek].add(order.date);
  });

  // Calculate averages and multipliers
  Object.keys(skuDayData).forEach((skuKey) => {
    const dayData = skuDayData[skuKey];
    const uniqueDays = skuUniqueDays[skuKey];

    // Calculate total quantity and overall average
    let totalQuantity = 0;
    Object.values(dayData).forEach((dayInfo) => {
      totalQuantity += dayInfo.total;
    });

    const overallAverage =
      uniqueDays.all.size > 0 ? totalQuantity / uniqueDays.all.size : 1;

    // Calculate pattern for each day of week
    patterns[skuKey] = {};
    for (let day = 0; day < 7; day++) {
      if (dayData[day] && dayData[day].uniqueDays.size > 0) {
        // Average quantity per unique day of this day of week
        const dayAvg = dayData[day].total / dayData[day].uniqueDays.size;
        // Pattern multiplier: how much more/less than overall average this day is
        patterns[skuKey][day] =
          overallAverage > 0 ? dayAvg / overallAverage : 1;
      } else {
        // No data for this day, use neutral pattern
        patterns[skuKey][day] = 1;
      }
    }
  });

  return patterns;
}

/**
 * Calculate daily averages per SKU
 * @param {Array} historicalData - Historical order data
 * @returns {Object} Daily averages per SKU
 */
function calculateDailyAverages(historicalData) {
  const averages = {};
  const skuData = {};

  historicalData.forEach((order) => {
    const skuKey = order.itemGuid || order.displayName;
    if (!skuKey) return;

    if (!skuData[skuKey]) {
      skuData[skuKey] = { total: 0, days: new Set() };
    }

    skuData[skuKey].total += order.quantity;
    skuData[skuKey].days.add(order.date);
  });

  Object.keys(skuData).forEach((skuKey) => {
    const data = skuData[skuKey];
    averages[skuKey] = data.days.size > 0 ? data.total / data.days.size : 0;
  });

  return averages;
}

/**
 * Calculate time-interval patterns from historical data
 * @param {Array} historicalData - Historical order data with hour and minute
 * @param {number} intervalMinutes - Interval size in minutes (default: 10)
 * @returns {Object} Time-interval patterns per SKU per day-of-week
 */
function calculateTimeIntervalPatterns(historicalData, intervalMinutes = 10) {
  const patterns = {};

  // Group by SKU, day of week, and time interval
  const skuDayIntervalData = {};
  const skuDayUniqueDays = {};

  historicalData.forEach((order) => {
    const skuKey = order.itemGuid || order.displayName;
    if (!skuKey || order.hour === undefined || order.minute === undefined)
      return;

    // MongoDB $dayOfWeek returns 1-7 (Sunday=1, Monday=2, etc.)
    // Convert to 0-6 format (Sunday=0, Monday=1, etc.) for consistency
    let dayOfWeek = order.dayOfWeek ? order.dayOfWeek - 1 : 0;
    if (dayOfWeek === 7) dayOfWeek = 0;

    // Calculate time interval in minutes from midnight
    const timeMinutes = order.hour * 60 + order.minute;
    const intervalStart =
      Math.floor(timeMinutes / intervalMinutes) * intervalMinutes;

    if (!skuDayIntervalData[skuKey]) {
      skuDayIntervalData[skuKey] = {};
      skuDayUniqueDays[skuKey] = {};
    }

    if (!skuDayIntervalData[skuKey][dayOfWeek]) {
      skuDayIntervalData[skuKey][dayOfWeek] = {};
      skuDayUniqueDays[skuKey][dayOfWeek] = new Set();
    }

    if (!skuDayIntervalData[skuKey][dayOfWeek][intervalStart]) {
      skuDayIntervalData[skuKey][dayOfWeek][intervalStart] = {
        total: 0,
        uniqueDays: new Set(),
      };
    }

    skuDayIntervalData[skuKey][dayOfWeek][intervalStart].total +=
      order.quantity;
    skuDayIntervalData[skuKey][dayOfWeek][intervalStart].uniqueDays.add(
      order.date
    );

    if (!skuDayUniqueDays[skuKey][dayOfWeek]) {
      skuDayUniqueDays[skuKey][dayOfWeek] = new Set();
    }
    skuDayUniqueDays[skuKey][dayOfWeek].add(order.date);
  });

  // Calculate averages per interval
  Object.keys(skuDayIntervalData).forEach((skuKey) => {
    patterns[skuKey] = {};

    for (let day = 0; day < 7; day++) {
      patterns[skuKey][day] = {};

      const uniqueDaysCount = skuDayUniqueDays[skuKey]?.[day]?.size || 0;
      if (uniqueDaysCount === 0) continue;

      const intervalData = skuDayIntervalData[skuKey][day] || {};
      Object.keys(intervalData).forEach((intervalStartStr) => {
        const intervalStart = parseInt(intervalStartStr, 10);
        const data = intervalData[intervalStart];
        const avgQuantity =
          data.uniqueDays.size > 0 ? data.total / data.uniqueDays.size : 0;

        patterns[skuKey][day][intervalStart] = avgQuantity;
      });
    }
  });

  return patterns;
}

/**
 * Generate forecast for date range
 * @param {Object} params - Forecast parameters
 * @returns {Promise<Object>} Forecast data
 */
export async function generateForecast(params) {
  const {
    startDate,
    endDate,
    increment = "day",
    growthRate = 1.0,
    lookbackWeeks = 4,
    timeIntervalMinutes = 10,
  } = params;

  // Validate inputs
  const dateValidation = validateDateRange(startDate, endDate);
  if (!dateValidation.valid) {
    throw new Error(dateValidation.error);
  }

  const growthValidation = validateGrowthRate(growthRate);
  if (!growthValidation.valid) {
    throw new Error(growthValidation.error);
  }

  const intervalValidation = validateInterval(increment, [
    "day",
    "week",
    "month",
  ]);
  if (!intervalValidation.valid) {
    throw new Error(intervalValidation.error);
  }

  // Calculate lookback period
  const forecastStart = parseISO(startDate);
  const lookbackStart = addDays(forecastStart, -lookbackWeeks * 7);

  // Get historical data
  const historicalData = await getHistoricalData(
    lookbackStart.toISOString(),
    forecastStart.toISOString()
  );

  if (historicalData.length === 0) {
    throw new Error(
      "No historical data available for the specified lookback period"
    );
  }

  // Calculate patterns and averages
  const dayOfWeekPatterns = calculateDayOfWeekPatterns(historicalData);
  const dailyAverages = calculateDailyAverages(historicalData);
  const timeIntervalPatterns = calculateTimeIntervalPatterns(
    historicalData,
    timeIntervalMinutes
  );

  // Get scheduled orders (future known orders)
  const scheduledOrders = await getScheduledOrders(startDate, endDate);

  // Generate forecast for each day in range
  const forecastStartDate = parseISO(startDate);
  const forecastEndDate = parseISO(endDate);
  const forecastDays = eachDayOfInterval({
    start: forecastStartDate,
    end: forecastEndDate,
  });

  const dailyForecast = [];
  const timeIntervalForecast = [];

  forecastDays.forEach((date) => {
    const dayOfWeek = getBusinessDayOfWeek(date);
    const dateStr = format(date, "yyyy-MM-dd");

    Object.keys(dailyAverages).forEach((skuKey) => {
      const baseAverage = dailyAverages[skuKey];
      const pattern = dayOfWeekPatterns[skuKey]?.[dayOfWeek] || 1.0;
      // Apply pattern to base average: pattern is a multiplier (e.g., 1.2 = 20% above average)
      const baseForecast = baseAverage * pattern;
      const adjustedForecast = baseForecast * growthRate;

      // Add scheduled orders if any
      const scheduledQty = scheduledOrders
        .filter(
          (order) =>
            order.date === dateStr &&
            (order.itemGuid === skuKey || order.displayName === skuKey)
        )
        .reduce((sum, order) => sum + order.quantity, 0);

      const finalForecast = Math.round(adjustedForecast + scheduledQty);

      dailyForecast.push({
        date: dateStr,
        dayOfWeek: dayOfWeek,
        itemGuid: skuKey.includes("-item") ? skuKey : null,
        displayName: skuKey.includes("-item") ? null : skuKey,
        sku: skuKey,
        baseAverage: baseAverage,
        pattern: pattern,
        forecast: finalForecast,
        scheduled: scheduledQty,
        growthAdjusted: adjustedForecast,
      });

      // Generate time-interval forecast for this SKU and date
      const intervalPatterns = timeIntervalPatterns[skuKey]?.[dayOfWeek] || {};
      const startMinutes = BUSINESS_HOURS.START_MINUTES;
      const endMinutes = BUSINESS_HOURS.END_MINUTES;
      let cumulativeForecast = 0;

      // Generate forecast for each time interval
      for (
        let intervalStart = startMinutes;
        intervalStart < endMinutes;
        intervalStart += timeIntervalMinutes
      ) {
        const intervalEnd = Math.min(
          intervalStart + timeIntervalMinutes,
          endMinutes
        );

        // Get base interval average from patterns
        const baseIntervalAvg = intervalPatterns[intervalStart] || 0;
        // Apply day-of-week pattern and growth rate
        const intervalForecast = Math.round(
          baseIntervalAvg * pattern * growthRate
        );

        cumulativeForecast += intervalForecast;

        timeIntervalForecast.push({
          date: dateStr,
          dayOfWeek: dayOfWeek,
          itemGuid: skuKey.includes("-item") ? skuKey : null,
          displayName: skuKey.includes("-item") ? null : skuKey,
          sku: skuKey,
          timeInterval: intervalStart,
          timeIntervalEnd: intervalEnd,
          forecast: intervalForecast,
          cumulativeForecast: cumulativeForecast,
        });
      }
    });
  });

  // Aggregate by increment
  const aggregated = aggregateForecast(dailyForecast, increment);

  // Calculate summary
  const summary = calculateForecastSummary(aggregated, dailyForecast);

  return {
    forecast: aggregated,
    dailyForecast: dailyForecast,
    timeIntervalForecast: timeIntervalForecast,
    summary: summary,
    parameters: params,
  };
}

/**
 * Aggregate forecast by increment (day/week/month)
 * @param {Array} dailyForecast - Daily forecast data
 * @param {string} increment - Aggregation increment
 * @returns {Array} Aggregated forecast
 */
function aggregateForecast(dailyForecast, increment) {
  if (increment === "day") {
    return dailyForecast;
  }

  const aggregated = [];
  const grouped = {};

  dailyForecast.forEach((record) => {
    let periodKey;

    if (increment === "week") {
      const date = parseISO(record.date);
      const weekStart = addDays(date, -date.getDay());
      periodKey = format(weekStart, "yyyy-MM-dd");
    } else if (increment === "month") {
      const date = parseISO(record.date);
      periodKey = format(date, "yyyy-MM");
    } else {
      periodKey = record.date;
    }

    const key = `${periodKey}_${record.sku}`;
    if (!grouped[key]) {
      grouped[key] = {
        period: periodKey,
        sku: record.sku,
        itemGuid: record.itemGuid,
        displayName: record.displayName,
        forecast: 0,
        baseAverage: record.baseAverage,
        scheduled: 0,
      };
    }

    grouped[key].forecast += record.forecast;
    grouped[key].scheduled += record.scheduled;
  });

  return Object.values(grouped);
}

/**
 * Calculate forecast summary statistics
 * @param {Array} aggregated - Aggregated forecast data
 * @param {Array} dailyForecast - Daily forecast data
 * @returns {Object} Summary statistics
 */
function calculateForecastSummary(aggregated, dailyForecast) {
  const totalForecast = aggregated.reduce(
    (sum, record) => sum + record.forecast,
    0
  );
  const totalScheduled = aggregated.reduce(
    (sum, record) => sum + record.scheduled,
    0
  );

  const uniqueSKUs = new Set(aggregated.map((r) => r.sku)).size;
  const periods = new Set(aggregated.map((r) => r.period)).size;

  return {
    totalForecast,
    totalScheduled,
    uniqueSKUs,
    periods,
    averagePerPeriod: periods > 0 ? totalForecast / periods : 0,
  };
}

/**
 * Get cached forecast or generate new one
 * @param {Object} params - Forecast parameters
 * @returns {Promise<Object>} Forecast data
 */
export async function getForecast(params) {
  // Check cache first
  const cached = await getCachedForecast(params);
  if (cached) {
    return {
      ...cached.data,
      cached: true,
    };
  }

  // Generate new forecast
  const forecast = await generateForecast(params);

  // Save to cache
  await saveForecastCache(params, forecast);

  return {
    ...forecast,
    cached: false,
  };
}

/**
 * Clear forecast cache
 * @param {Object} params - Optional parameters
 * @returns {Promise<Object>} Clear result
 */
export async function clearForecastCache(params = null) {
  return await clearCache(params);
}
