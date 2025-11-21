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
import { validateIntradayInterval } from "../shared/utils/validation.js";
import { getBusinessDayOfWeek, startOfBusinessDay } from "../config/timezone.js";
import { BUSINESS_HOURS } from "../config/constants.js";
import { parseISO, addDays, format, eachDayOfInterval } from "date-fns";
import { linearRegression } from "simple-statistics";
import { formatMinutesToTime } from "../shared/utils/timeUtils.js";

/**
 * Simple Forecast Service - Beginner-friendly approach
 *
 * This forecast uses a simple 3-step approach:
 * 1. Calculate historical averages
 * 2. Detect day-of-week patterns (Monday vs Friday, etc.)
 * 3. Detect trends (is demand growing or shrinking?)
 */

/**
 * Step 1: Calculate average daily quantity for each SKU
 */
function calculateAverages(historicalData) {
  const averages = {};

  // Group orders by SKU
  const skuTotals = {};
  const skuDays = {};

  historicalData.forEach((order) => {
    const sku = order.itemGuid || order.displayName;
    if (!sku) return;

    if (!skuTotals[sku]) {
      skuTotals[sku] = 0;
      skuDays[sku] = new Set();
    }

    skuTotals[sku] += order.quantity || 0;
    skuDays[sku].add(order.date); // Track unique days
  });

  // Calculate average per day
  Object.keys(skuTotals).forEach((sku) => {
    const uniqueDays = skuDays[sku].size;
    averages[sku] = uniqueDays > 0 ? skuTotals[sku] / uniqueDays : 0;
  });

  return averages;
}

/**
 * Step 2: Calculate day-of-week patterns
 * Example: If Mondays average 120 units and overall average is 100, Monday pattern = 1.2
 */
function calculateDayOfWeekPatterns(historicalData, averages) {
  const patterns = {};

  // Group by SKU and day of week
  const skuDayData = {};

  historicalData.forEach((order) => {
    const sku = order.itemGuid || order.displayName;
    if (!sku) return;

    // Convert MongoDB dayOfWeek (1-7) to JavaScript format (0-6)
    let dayOfWeek = order.dayOfWeek ? order.dayOfWeek - 1 : 0;
    if (dayOfWeek === 7) dayOfWeek = 0;

    if (!skuDayData[sku]) {
      skuDayData[sku] = {};
    }
    if (!skuDayData[sku][dayOfWeek]) {
      skuDayData[sku][dayOfWeek] = { total: 0, days: new Set() };
    }

    skuDayData[sku][dayOfWeek].total += order.quantity || 0;
    skuDayData[sku][dayOfWeek].days.add(order.date);
  });

  // Calculate pattern multiplier for each day
  Object.keys(skuDayData).forEach((sku) => {
    patterns[sku] = {};
    const overallAvg = averages[sku] || 1;

    for (let day = 0; day < 7; day++) {
      const dayData = skuDayData[sku][day];
      if (dayData && dayData.days.size > 0) {
        const dayAvg = dayData.total / dayData.days.size;
        patterns[sku][day] = overallAvg > 0 ? dayAvg / overallAvg : 1;
      } else {
        patterns[sku][day] = 1; // No data = neutral pattern
      }
    }
  });

  return patterns;
}

/**
 * Step 3: Detect trends using linear regression
 * Uses simple-statistics library for easy linear regression
 */
function calculateTrends(historicalData) {
  const trends = {};

  // Group by SKU and date to get daily totals
  const skuDailyTotals = {};

  historicalData.forEach((order) => {
    const sku = order.itemGuid || order.displayName;
    if (!sku || !order.date) return;

    if (!skuDailyTotals[sku]) {
      skuDailyTotals[sku] = {};
    }
    if (!skuDailyTotals[sku][order.date]) {
      skuDailyTotals[sku][order.date] = 0;
    }

    skuDailyTotals[sku][order.date] += order.quantity || 0;
  });

  // Calculate trend for each SKU
  Object.keys(skuDailyTotals).forEach((sku) => {
    const dates = Object.keys(skuDailyTotals[sku]).sort();

    // Need at least 7 days to detect a trend
    if (dates.length < 7) {
      trends[sku] = 1.0; // No trend
      return;
    }

    // Convert dates to numbers (days since first date)
    const firstDate = parseISO(dates[0]);
    const dataPoints = dates.map((dateStr) => {
      const date = parseISO(dateStr);
      const daysSinceStart = Math.floor(
        (date.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000)
      );
      return [daysSinceStart, skuDailyTotals[sku][dateStr]];
    });

    // Use simple-statistics linear regression
    const regression = linearRegression(dataPoints);
    const avgY =
      dataPoints.reduce((sum, p) => sum + p[1], 0) / dataPoints.length;

    // Calculate weekly trend multiplier
    // slope is change per day, so multiply by 7 for weekly change
    if (avgY > 0.1) {
      const weeklyChange = regression.m * 7; // m is the slope
      trends[sku] = 1.0 + weeklyChange / avgY; // Convert to multiplier
    } else {
      trends[sku] = 1.0;
    }
  });

  return trends;
}

/**
 * Calculate intraday time-of-day patterns from historical data
 * Similar to day-of-week patterns, but for time intervals within a day
 * @param {Array} historicalData - Historical order data with hour and minute fields
 * @param {number} timeIntervalMinutes - Time bucket interval (e.g., 20 minutes)
 * @returns {Object} Patterns object: { sku: { dayOfWeek: { timeInterval: multiplier } } }
 */
function calculateIntradayPatterns(historicalData, timeIntervalMinutes) {
  const patterns = {};

  // Group by SKU, day of week, and time interval
  const skuDayTimeData = {};

  historicalData.forEach((order) => {
    const sku = order.itemGuid || order.displayName;
    if (!sku || order.hour === undefined || order.minute === undefined) return;

    // Convert MongoDB dayOfWeek (1-7) to JavaScript format (0-6)
    let dayOfWeek = order.dayOfWeek ? order.dayOfWeek - 1 : 0;
    if (dayOfWeek === 7) dayOfWeek = 0;

    // Calculate time bucket (minutes from start of day, rounded to interval)
    const minutesFromStart = order.hour * 60 + order.minute;
    const timeBucket =
      Math.floor(minutesFromStart / timeIntervalMinutes) * timeIntervalMinutes;

    // Only consider business hours
    if (
      timeBucket < BUSINESS_HOURS.START_MINUTES ||
      timeBucket >= BUSINESS_HOURS.END_MINUTES
    ) {
      return;
    }

    if (!skuDayTimeData[sku]) {
      skuDayTimeData[sku] = {};
    }
    if (!skuDayTimeData[sku][dayOfWeek]) {
      skuDayTimeData[sku][dayOfWeek] = {};
    }
    if (!skuDayTimeData[sku][dayOfWeek][timeBucket]) {
      skuDayTimeData[sku][dayOfWeek][timeBucket] = {
        total: 0,
        days: new Set(),
      };
    }

    skuDayTimeData[sku][dayOfWeek][timeBucket].total += order.quantity || 0;
    skuDayTimeData[sku][dayOfWeek][timeBucket].days.add(order.date);
  });

  // Calculate average daily quantity per SKU per day of week (for normalization)
  const skuDayAverages = {};
  Object.keys(skuDayTimeData).forEach((sku) => {
    skuDayAverages[sku] = {};
    for (let day = 0; day < 7; day++) {
      if (skuDayTimeData[sku][day]) {
        let totalForDay = 0;
        let uniqueDays = new Set();
        Object.keys(skuDayTimeData[sku][day]).forEach((timeBucket) => {
          const data = skuDayTimeData[sku][day][timeBucket];
          totalForDay += data.total;
          data.days.forEach((d) => uniqueDays.add(d));
        });
        skuDayAverages[sku][day] =
          uniqueDays.size > 0 ? totalForDay / uniqueDays.size : 0;
      } else {
        skuDayAverages[sku][day] = 0;
      }
    }
  });

  // Calculate pattern multipliers (proportion of daily total for each time interval)
  Object.keys(skuDayTimeData).forEach((sku) => {
    patterns[sku] = {};
    for (let day = 0; day < 7; day++) {
      patterns[sku][day] = {};
      const dayAverage = skuDayAverages[sku][day] || 0;

      if (dayAverage > 0 && skuDayTimeData[sku][day]) {
        // Calculate proportion for each time bucket
        Object.keys(skuDayTimeData[sku][day]).forEach((timeBucket) => {
          const data = skuDayTimeData[sku][day][timeBucket];
          const timeBucketAvg =
            data.days.size > 0 ? data.total / data.days.size : 0;
          // Proportion of daily average for this time bucket
          patterns[sku][day][parseInt(timeBucket)] = timeBucketAvg / dayAverage;
        });
      }
    }
  });

  return patterns;
}

/**
 * Distribute daily forecast into time intervals based on intraday patterns
 * @param {Array} dailyForecast - Array of daily forecast records
 * @param {Object} intradayPatterns - Patterns from calculateIntradayPatterns
 * @param {number} timeIntervalMinutes - Time bucket interval
 * @returns {Array} Array of time-interval forecast records
 */
function distributeToTimeIntervals(
  dailyForecast,
  intradayPatterns,
  timeIntervalMinutes
) {
  const timeIntervalForecast = [];

  // Generate all time buckets for business hours
  const timeBuckets = [];
  for (
    let minutes = BUSINESS_HOURS.START_MINUTES;
    minutes < BUSINESS_HOURS.END_MINUTES;
    minutes += timeIntervalMinutes
  ) {
    timeBuckets.push(minutes);
  }

  dailyForecast.forEach((dailyRecord) => {
    const sku = dailyRecord.sku;
    const dayOfWeek = dailyRecord.dayOfWeek;
    const dailyForecastQty = dailyRecord.forecast;

    // Get patterns for this SKU and day of week
    const dayPatterns = intradayPatterns[sku]?.[dayOfWeek] || {};

    // If no patterns exist, use uniform distribution
    const hasPatterns = Object.keys(dayPatterns).length > 0;
    let totalPatternWeight = 0;
    if (hasPatterns) {
      // Sum up pattern weights for all time buckets
      timeBuckets.forEach((bucket) => {
        totalPatternWeight += dayPatterns[bucket] || 0;
      });
    }

    // Distribute forecast across time intervals
    timeBuckets.forEach((timeBucket) => {
      let intervalForecast = 0;

      if (hasPatterns && totalPatternWeight > 0) {
        // Use historical pattern proportion
        const patternWeight = dayPatterns[timeBucket] || 0;
        intervalForecast =
          (dailyForecastQty * patternWeight) / totalPatternWeight;
      } else {
        // Uniform distribution fallback
        intervalForecast = dailyForecastQty / timeBuckets.length;
      }

      // Round to nearest integer (but ensure we don't lose total forecast)
      const roundedForecast = Math.round(intervalForecast);

      // Create records for all time buckets (even with 0 forecast) to maintain
      // consistent time series structure for PAR scheduling algorithm
      if (dailyForecastQty > 0) {
        timeIntervalForecast.push({
          itemGuid: dailyRecord.itemGuid,
          displayName: dailyRecord.displayName,
          sku: dailyRecord.sku,
          date: dailyRecord.date,
          timeInterval: timeBucket, // minutes from start of day
          forecast: roundedForecast,
        });
      }
    });

    // Adjust for rounding errors: ensure total matches daily forecast
    const totalDistributed = timeIntervalForecast
      .filter((r) => r.date === dailyRecord.date && r.sku === sku)
      .reduce((sum, r) => sum + r.forecast, 0);

    if (totalDistributed !== dailyForecastQty && totalDistributed > 0) {
      const diff = dailyForecastQty - totalDistributed;
      // Add/subtract difference to the largest bucket for this SKU/date
      const recordsForSkuDate = timeIntervalForecast.filter(
        (r) => r.date === dailyRecord.date && r.sku === sku
      );
      if (recordsForSkuDate.length > 0) {
        // Find the bucket with highest forecast and adjust it
        let maxRecord = recordsForSkuDate[0];
        recordsForSkuDate.forEach((r) => {
          if (r.forecast > maxRecord.forecast) {
            maxRecord = r;
          }
        });
        maxRecord.forecast += diff;
        // Ensure non-negative
        if (maxRecord.forecast < 0) {
          maxRecord.forecast = 0;
        }
      }
    }
  });

  return timeIntervalForecast;
}

/**
 * Main forecast generation function
 */
export async function generateForecast(params) {
  const {
    startDate,
    endDate,
    increment = "day",
    growthRate = 1.0,
    lookbackWeeks = 4,
    timeIntervalMinutes = null,
  } = params;

  // Validate inputs
  if (!validateDateRange(startDate, endDate).valid) {
    throw new Error("Invalid date range");
  }
  if (!validateGrowthRate(growthRate).valid) {
    throw new Error("Invalid growth rate");
  }
  if (!validateInterval(increment, ["day", "week", "month"]).valid) {
    throw new Error("Invalid increment");
  }
  if (
    timeIntervalMinutes !== null &&
    timeIntervalMinutes !== undefined &&
    !validateIntradayInterval(timeIntervalMinutes).valid
  ) {
    throw new Error("Invalid time interval minutes");
  }

  // Get historical data
  // Parse dates as business timezone dates (not UTC) to ensure correct day-of-week
  // Use startOfBusinessDay to interpret date strings as midnight in business timezone
  const { startOfBusinessDay } = await import("../config/timezone.js");
  const forecastStartBusiness = startOfBusinessDay(startDate);
  const forecastEndBusiness = startOfBusinessDay(endDate);
  const lookbackStartBusiness = startOfBusinessDay(
    format(addDays(forecastStartBusiness, -lookbackWeeks * 7), "yyyy-MM-dd")
  );
  
  const historicalData = await getHistoricalData(
    lookbackStartBusiness.toISOString(),
    forecastStartBusiness.toISOString()
  );

  if (historicalData.length === 0) {
    throw new Error("No historical data available");
  }

  // Calculate patterns (Step 1, 2, 3)
  const averages = calculateAverages(historicalData);
  const patterns = calculateDayOfWeekPatterns(historicalData, averages);
  const trends = calculateTrends(historicalData);

  // Calculate intraday patterns if time-interval forecast is requested
  let intradayPatterns = null;
  if (timeIntervalMinutes !== null && timeIntervalMinutes !== undefined) {
    intradayPatterns = calculateIntradayPatterns(
      historicalData,
      timeIntervalMinutes
    );
  }

  // Get scheduled orders
  const scheduledOrders = await getScheduledOrders(startDate, endDate);

  // Generate forecast for each day
  // Use business timezone dates to ensure correct day-of-week calculation
  const forecastDays = eachDayOfInterval({
    start: forecastStartBusiness,
    end: forecastEndBusiness,
  });

  const dailyForecast = [];

  forecastDays.forEach((date) => {
    const dayOfWeek = getBusinessDayOfWeek(date);
    const dateStr = format(date, "yyyy-MM-dd");

    // Calculate weeks from start for trend projection
    const weeksFromStart =
      (date.getTime() - forecastStart.getTime()) / (7 * 24 * 60 * 60 * 1000);

    Object.keys(averages).forEach((sku) => {
      // Step 1: Start with average
      const baseAverage = averages[sku];

      // Step 2: Apply day-of-week pattern
      const dayPattern = patterns[sku]?.[dayOfWeek] || 1.0;
      const baseForecast = baseAverage * dayPattern;

      // Step 3: Apply trend (linear growth/decline)
      const trendMultiplier = trends[sku] || 1.0;
      // Apply linear trend instead of exponential
      // trendMultiplier is weekly multiplier (e.g., 1.05 = 5% weekly growth)
      // For linear: baseForecast * (1 + (trendMultiplier - 1) * weeksFromStart)
      const trendAdjusted =
        baseForecast * (1 + (trendMultiplier - 1.0) * weeksFromStart);

      // Apply manual growth rate
      const adjustedForecast = trendAdjusted * growthRate;

      // Add scheduled orders
      const scheduledQty = scheduledOrders
        .filter(
          (o) =>
            o.date === dateStr && (o.itemGuid === sku || o.displayName === sku)
        )
        .reduce((sum, o) => sum + o.quantity, 0);

      const finalForecast = Math.round(adjustedForecast + scheduledQty);

      dailyForecast.push({
        date: dateStr,
        dayOfWeek: dayOfWeek,
        itemGuid: sku.includes("-item") ? sku : null,
        displayName: sku.includes("-item") ? null : sku,
        sku: sku,
        baseAverage: baseAverage,
        pattern: dayPattern,
        trendMultiplier: trendMultiplier,
        trendAdjusted: trendAdjusted,
        forecast: finalForecast,
        scheduled: scheduledQty,
        growthAdjusted: adjustedForecast,
      });
    });
  });

  // Aggregate by increment if needed
  let forecast = dailyForecast;
  if (increment !== "day") {
    const grouped = {};
    // Track the actual forecast date range to ensure period keys stay within bounds
    const forecastStartStr = format(forecastStart, "yyyy-MM-dd");
    const forecastEndStr = format(forecastEnd, "yyyy-MM-dd");

    dailyForecast.forEach((record) => {
      let periodKey;
      if (increment === "week") {
        const date = parseISO(record.date);
        let weekStart = addDays(date, -date.getDay());
        // Clamp week start to forecast range to avoid periods outside the forecast
        const weekStartStr = format(weekStart, "yyyy-MM-dd");
        if (weekStartStr < forecastStartStr) {
          weekStart = forecastStart; // Use forecast start as the period start
        }
        periodKey = format(weekStart, "yyyy-MM-dd");
      } else if (increment === "month") {
        periodKey = format(parseISO(record.date), "yyyy-MM");
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
    forecast = Object.values(grouped);
  }

  // Calculate summary
  const summary = {
    totalForecast: forecast.reduce((sum, r) => sum + r.forecast, 0),
    totalScheduled: forecast.reduce((sum, r) => sum + r.scheduled, 0),
    uniqueSKUs: new Set(forecast.map((r) => r.sku)).size,
    periods: new Set(forecast.map((r) => r.period || r.date)).size,
  };
  summary.averagePerPeriod =
    summary.periods > 0 ? summary.totalForecast / summary.periods : 0;

  // Generate time-interval forecast if requested
  let timeIntervalForecast = [];
  if (
    timeIntervalMinutes !== null &&
    timeIntervalMinutes !== undefined &&
    intradayPatterns !== null
  ) {
    timeIntervalForecast = distributeToTimeIntervals(
      dailyForecast,
      intradayPatterns,
      timeIntervalMinutes
    );
  }

  return {
    forecast: forecast,
    dailyForecast: dailyForecast,
    timeIntervalForecast: timeIntervalForecast,
    summary: summary,
    parameters: params,
  };
}

/**
 * Get cached forecast or generate new one
 */
export async function getForecast(params) {
  const cached = await getCachedForecast(params);
  if (cached) {
    return { ...cached.data, cached: true };
  }

  const forecast = await generateForecast(params);
  await saveForecastCache(params, forecast);
  return { ...forecast, cached: false };
}

/**
 * Clear forecast cache
 */
export async function clearForecastCache(params = null) {
  return await clearCache(params);
}

/**
 * Compare forecast vs actual demand for a specific date
 * @param {string} date - Date to compare (YYYY-MM-DD)
 * @param {Object} forecastParams - Forecast parameters (growthRate, lookbackWeeks, timeIntervalMinutes)
 * @returns {Promise<Object>} Comparison data with forecast, actual, and statistics
 */
export async function compareForecastVsActual(date, forecastParams = {}) {
  const {
    growthRate = 1.0,
    lookbackWeeks = 4,
    timeIntervalMinutes = 20,
  } = forecastParams;

  // Generate forecast for the date
  const forecastData = await getForecast({
    startDate: date,
    endDate: date,
    increment: "day",
    growthRate,
    lookbackWeeks,
    timeIntervalMinutes,
  });

  if (
    !forecastData.timeIntervalForecast ||
    forecastData.timeIntervalForecast.length === 0
  ) {
    throw new Error(
      "No time-interval forecast available for the specified date"
    );
  }

  // Get actual demand from velocity repository
  const { getIntradayVelocity } = await import("../velocity/repository.js");
  const { getHistoricalData } = await import("./repository.js");

  // Get all items that have forecast
  const forecastItems = new Set();
  forecastData.timeIntervalForecast.forEach((f) => {
    if (f.itemGuid) forecastItems.add(f.itemGuid);
  });

  // Get actual demand for each item
  const actualDataMap = new Map(); // itemGuid -> array of {timeInterval, quantity}

  for (const itemGuid of forecastItems) {
    try {
      const actualData = await getIntradayVelocity(
        itemGuid,
        date,
        timeIntervalMinutes
      );

      // Convert to map by timeInterval
      actualData.forEach((record) => {
        if (!actualDataMap.has(itemGuid)) {
          actualDataMap.set(itemGuid, []);
        }
        actualDataMap.get(itemGuid).push({
          timeInterval: record.timeBucket,
          quantity: record.totalQuantity,
          timeSlot: record.timeSlot,
        });
      });
    } catch (err) {
      // Item might not have actual data, skip it
      console.warn(`No actual data for item ${itemGuid}:`, err.message);
    }
  }

  // Combine forecast and actual data by item and time interval
  const comparisonData = [];
  const itemStats = new Map(); // itemGuid -> {forecastTotal, actualTotal, errors: []}

  // Group forecast by itemGuid
  const forecastByItem = new Map();
  forecastData.timeIntervalForecast.forEach((f) => {
    if (!forecastByItem.has(f.itemGuid)) {
      forecastByItem.set(f.itemGuid, []);
    }
    forecastByItem.get(f.itemGuid).push(f);
  });

  // Process each item
  forecastByItem.forEach((forecasts, itemGuid) => {
    const actuals = actualDataMap.get(itemGuid) || [];
    const actualMap = new Map();
    actuals.forEach((a) => {
      actualMap.set(a.timeInterval, a.quantity);
    });

    // Initialize stats for this item
    let forecastTotal = 0;
    let actualTotal = 0;
    const errors = [];

    // Process each time interval
    forecasts.forEach((forecast) => {
      const timeInterval = forecast.timeInterval;
      const forecastQty = forecast.forecast || 0;
      const actualQty = actualMap.get(timeInterval) || 0;

      forecastTotal += forecastQty;
      actualTotal += actualQty;

      const error = forecastQty - actualQty;
      const absoluteError = Math.abs(error);
      const percentError =
        actualQty > 0 ? (error / actualQty) * 100 : forecastQty > 0 ? 100 : 0;

      errors.push({
        timeInterval,
        error,
        absoluteError,
        percentError,
      });

      comparisonData.push({
        itemGuid: forecast.itemGuid,
        displayName: forecast.displayName,
        date: forecast.date,
        timeInterval,
        timeSlot: formatMinutesToTime(timeInterval),
        forecast: forecastQty,
        actual: actualQty,
        error,
        absoluteError,
        percentError,
      });
    });

    // Calculate statistics for this item
    const meanAbsoluteError =
      errors.length > 0
        ? errors.reduce((sum, e) => sum + e.absoluteError, 0) / errors.length
        : 0;
    const rootMeanSquaredError = Math.sqrt(
      errors.length > 0
        ? errors.reduce((sum, e) => sum + e.error * e.error, 0) / errors.length
        : 0
    );
    const meanAbsolutePercentError =
      errors.length > 0
        ? errors.reduce((sum, e) => sum + Math.abs(e.percentError), 0) /
          errors.length
        : 0;

    itemStats.set(itemGuid, {
      itemGuid,
      displayName: forecasts[0]?.displayName,
      forecastTotal,
      actualTotal,
      meanAbsoluteError,
      rootMeanSquaredError,
      meanAbsolutePercentError,
      totalError: forecastTotal - actualTotal,
      accuracy:
        actualTotal > 0
          ? (1 - Math.abs(forecastTotal - actualTotal) / actualTotal) * 100
          : forecastTotal === 0
          ? 100
          : 0,
    });
  });

  // Calculate overall statistics
  const allErrors = comparisonData.map((d) => d.error);
  const allAbsoluteErrors = comparisonData.map((d) => d.absoluteError);
  const overallForecastTotal = Array.from(itemStats.values()).reduce(
    (sum, s) => sum + s.forecastTotal,
    0
  );
  const overallActualTotal = Array.from(itemStats.values()).reduce(
    (sum, s) => sum + s.actualTotal,
    0
  );

  const overallStats = {
    totalForecast: overallForecastTotal,
    totalActual: overallActualTotal,
    totalError: overallForecastTotal - overallActualTotal,
    meanAbsoluteError:
      allAbsoluteErrors.length > 0
        ? allAbsoluteErrors.reduce((sum, e) => sum + e, 0) /
          allAbsoluteErrors.length
        : 0,
    rootMeanSquaredError: Math.sqrt(
      allErrors.length > 0
        ? allErrors.reduce((sum, e) => sum + e * e, 0) / allErrors.length
        : 0
    ),
    meanAbsolutePercentError:
      overallActualTotal > 0
        ? (Math.abs(overallForecastTotal - overallActualTotal) /
            overallActualTotal) *
          100
        : overallForecastTotal === 0
        ? 0
        : 100,
    accuracy:
      overallActualTotal > 0
        ? (1 -
            Math.abs(overallForecastTotal - overallActualTotal) /
              overallActualTotal) *
          100
        : overallForecastTotal === 0
        ? 100
        : 0,
    itemCount: itemStats.size,
    intervalCount: comparisonData.length,
  };

  return {
    date,
    comparisonData,
    itemStats: Array.from(itemStats.values()),
    overallStats,
    forecastParams: {
      growthRate,
      lookbackWeeks,
      timeIntervalMinutes,
    },
  };
}

/**
 * Calculate overall forecast accuracy across all available historical dates
 * @param {Object} forecastParams - Forecast parameters (growthRate, lookbackWeeks, timeIntervalMinutes)
 * @returns {Promise<Object>} Overall accuracy statistics across all dates
 */
export async function getOverallForecastAccuracy(forecastParams = {}) {
  const {
    growthRate = 1.0,
    lookbackWeeks = 4,
    timeIntervalMinutes = 20,
  } = forecastParams;

  // Get all available dates from order data
  const { findDateRanges } = await import("../orders/repository.js");
  const dateRanges = await findDateRanges();

  if (!dateRanges || dateRanges.length === 0) {
    throw new Error("No historical order data available");
  }

  // Extract unique dates
  const availableDates = dateRanges.map((range) => range.startDate).sort();

  // Process each date and collect statistics
  const dateStats = [];
  let totalForecastAcrossAllDates = 0;
  let totalActualAcrossAllDates = 0;
  const percentErrors = []; // Array of percent errors for each date

  // Group statistics by day of week (0 = Sunday, 6 = Saturday)
  const dayOfWeekStats = new Map();
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  for (const date of availableDates) {
    try {
      const comparison = await compareForecastVsActual(date, {
        growthRate,
        lookbackWeeks,
        timeIntervalMinutes,
      });

      const { overallStats } = comparison;

      // Get day of week for this date
      const dayOfWeek = getBusinessDayOfWeek(date);
      const dayName = dayNames[dayOfWeek];

      // Calculate percent error for this date
      // Percent error = (forecast - actual) / actual * 100
      // Positive = over-forecasted, Negative = under-forecasted
      let percentError = 0;
      if (overallStats.totalActual > 0) {
        percentError =
          ((overallStats.totalForecast - overallStats.totalActual) /
            overallStats.totalActual) *
          100;
      } else if (overallStats.totalForecast > 0) {
        // If actual is 0 but forecast > 0, that's 100% error
        percentError = 100;
      }

      percentErrors.push(percentError);
      totalForecastAcrossAllDates += overallStats.totalForecast;
      totalActualAcrossAllDates += overallStats.totalActual;

      dateStats.push({
        date,
        dayOfWeek,
        dayName,
        forecastTotal: overallStats.totalForecast,
        actualTotal: overallStats.totalActual,
        percentError,
        accuracy: overallStats.accuracy,
      });

      // Accumulate statistics by day of week
      if (!dayOfWeekStats.has(dayOfWeek)) {
        dayOfWeekStats.set(dayOfWeek, {
          dayOfWeek,
          dayName,
          dates: [],
          forecastTotal: 0,
          actualTotal: 0,
          percentErrors: [],
        });
      }

      const dayStats = dayOfWeekStats.get(dayOfWeek);
      dayStats.dates.push(date);
      dayStats.forecastTotal += overallStats.totalForecast;
      dayStats.actualTotal += overallStats.totalActual;
      dayStats.percentErrors.push(percentError);
    } catch (err) {
      // Skip dates that can't be forecasted (e.g., not enough historical data)
      console.warn(`Skipping date ${date}: ${err.message}`);
    }
  }

  // Calculate overall statistics
  const averagePercentError =
    percentErrors.length > 0
      ? percentErrors.reduce((sum, pe) => sum + pe, 0) / percentErrors.length
      : 0;

  // Overall percent error across all dates combined
  const overallPercentError =
    totalActualAcrossAllDates > 0
      ? ((totalForecastAcrossAllDates - totalActualAcrossAllDates) /
          totalActualAcrossAllDates) *
        100
      : totalForecastAcrossAllDates > 0
      ? 100
      : 0;

  // Calculate standard deviation of percent errors
  const variance =
    percentErrors.length > 0
      ? percentErrors.reduce(
          (sum, pe) => sum + Math.pow(pe - averagePercentError, 2),
          0
        ) / percentErrors.length
      : 0;
  const standardDeviation = Math.sqrt(variance);

  // Calculate min/max percent errors
  const minPercentError =
    percentErrors.length > 0 ? Math.min(...percentErrors) : 0;
  const maxPercentError =
    percentErrors.length > 0 ? Math.max(...percentErrors) : 0;

  // Calculate statistics for each day of week
  const dayOfWeekBreakdown = Array.from(dayOfWeekStats.values())
    .map((dayStats) => {
      const dayPercentErrors = dayStats.percentErrors;
      const dayAveragePercentError =
        dayPercentErrors.length > 0
          ? dayPercentErrors.reduce((sum, pe) => sum + pe, 0) /
            dayPercentErrors.length
          : 0;

      const dayOverallPercentError =
        dayStats.actualTotal > 0
          ? ((dayStats.forecastTotal - dayStats.actualTotal) /
              dayStats.actualTotal) *
            100
          : dayStats.forecastTotal > 0
          ? 100
          : 0;

      // Calculate standard deviation for this day
      const dayVariance =
        dayPercentErrors.length > 0
          ? dayPercentErrors.reduce(
              (sum, pe) => sum + Math.pow(pe - dayAveragePercentError, 2),
              0
            ) / dayPercentErrors.length
          : 0;
      const dayStandardDeviation = Math.sqrt(dayVariance);

      return {
        dayOfWeek: dayStats.dayOfWeek,
        dayName: dayStats.dayName,
        dateCount: dayStats.dates.length,
        forecastTotal: dayStats.forecastTotal,
        actualTotal: dayStats.actualTotal,
        averagePercentError: dayAveragePercentError,
        overallPercentError: dayOverallPercentError,
        standardDeviation: dayStandardDeviation,
        minPercentError:
          dayPercentErrors.length > 0 ? Math.min(...dayPercentErrors) : 0,
        maxPercentError:
          dayPercentErrors.length > 0 ? Math.max(...dayPercentErrors) : 0,
      };
    })
    .sort((a, b) => {
      // Sort by day of week (Sunday = 0, Monday = 1, etc.)
      // But typically we want Monday first, so adjust: Monday=1, Sunday=0 becomes Monday=0, Sunday=6
      const aOrder = a.dayOfWeek === 0 ? 6 : a.dayOfWeek - 1;
      const bOrder = b.dayOfWeek === 0 ? 6 : b.dayOfWeek - 1;
      return aOrder - bOrder;
    });

  return {
    totalDatesAnalyzed: dateStats.length,
    totalForecastAcrossAllDates,
    totalActualAcrossAllDates,
    averagePercentError, // Average of individual date percent errors
    overallPercentError, // Percent error of combined totals
    standardDeviation,
    minPercentError,
    maxPercentError,
    dateStats, // Individual date statistics
    dayOfWeekBreakdown, // Statistics broken down by day of week
    forecastParams: {
      growthRate,
      lookbackWeeks,
      timeIntervalMinutes,
    },
  };
}
