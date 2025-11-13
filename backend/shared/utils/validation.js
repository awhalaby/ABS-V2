import { parseISO, isValid, isAfter, isBefore } from "date-fns";
import { parseTimeToMinutes } from "./timeUtils.js";
import { FORECAST_DEFAULTS, VALIDATION } from "../../config/constants.js";

/**
 * Validation utility functions
 */

/**
 * Validate date range
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return { valid: false, error: "Start date and end date are required" };
  }

  const start = typeof startDate === "string" ? parseISO(startDate) : startDate;
  const end = typeof endDate === "string" ? parseISO(endDate) : endDate;

  if (!isValid(start)) {
    return { valid: false, error: "Invalid start date" };
  }

  if (!isValid(end)) {
    return { valid: false, error: "Invalid end date" };
  }

  if (isAfter(start, end)) {
    return {
      valid: false,
      error: "Start date must be before or equal to end date",
    };
  }

  return { valid: true };
}

/**
 * Validate time range
 * @param {string} startTime - Start time in "HH:mm" format
 * @param {string} endTime - End time in "HH:mm" format
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateTimeRange(startTime, endTime) {
  if (!startTime || !endTime) {
    return { valid: false, error: "Start time and end time are required" };
  }

  try {
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);

    if (endMinutes <= startMinutes) {
      return { valid: false, error: "End time must be after start time" };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Validate forecast interval
 * @param {string} interval - Interval to validate
 * @param {Array<string>} allowed - Allowed intervals
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateInterval(interval, allowed = ["day", "week", "month"]) {
  if (!interval) {
    return { valid: false, error: "Interval is required" };
  }

  if (!allowed.includes(interval)) {
    return {
      valid: false,
      error: `Invalid interval. Allowed: ${allowed.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validate intraday interval (minutes)
 * @param {number} interval - Interval in minutes
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateIntradayInterval(interval) {
  if (typeof interval !== "number" || interval <= 0) {
    return { valid: false, error: "Interval must be a positive number" };
  }

  if (!FORECAST_DEFAULTS.INTRADAY_INTERVALS.includes(interval)) {
    return {
      valid: false,
      error: `Invalid interval. Allowed: ${FORECAST_DEFAULTS.INTRADAY_INTERVALS.join(
        ", "
      )} minutes`,
    };
  }

  return { valid: true };
}

/**
 * Validate growth rate
 * @param {number} growthRate - Growth rate multiplier
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateGrowthRate(growthRate) {
  if (typeof growthRate !== "number") {
    return { valid: false, error: "Growth rate must be a number" };
  }

  const { MIN_GROWTH_RATE, MAX_GROWTH_RATE } = FORECAST_DEFAULTS;

  if (growthRate < MIN_GROWTH_RATE || growthRate > MAX_GROWTH_RATE) {
    return {
      valid: false,
      error: `Growth rate must be between ${MIN_GROWTH_RATE} and ${MAX_GROWTH_RATE}`,
    };
  }

  return { valid: true };
}

/**
 * Validate order schema
 * @param {Object} order - Order object
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
export function validateOrder(order) {
  const errors = [];

  if (!order.orderId) {
    errors.push("orderId is required");
  }

  if (!order.paidDate) {
    errors.push("paidDate is required");
  } else {
    const date =
      typeof order.paidDate === "string"
        ? parseISO(order.paidDate)
        : order.paidDate;
    if (!isValid(date)) {
      errors.push("paidDate must be a valid ISO 8601 date");
    }
  }

  if (!order.displayName && !order.itemGuid) {
    errors.push("Either displayName or itemGuid is required");
  }

  if (typeof order.quantity !== "number" || order.quantity <= 0) {
    errors.push("quantity must be a positive number");
  }

  if (
    order.price !== undefined &&
    (typeof order.price !== "number" || order.price < 0)
  ) {
    errors.push("price must be a non-negative number");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate batch of orders
 * @param {Array<Object>} orders - Array of order objects
 * @returns {Object} { valid: boolean, errors: Array<Object> }
 */
export function validateOrders(orders) {
  if (!Array.isArray(orders)) {
    return {
      valid: false,
      errors: [{ index: -1, error: "Orders must be an array" }],
    };
  }

  if (orders.length === 0) {
    return {
      valid: false,
      errors: [{ index: -1, error: "Orders array cannot be empty" }],
    };
  }

  if (orders.length > VALIDATION.MAX_ORDERS_PER_BATCH) {
    return {
      valid: false,
      errors: [
        {
          index: -1,
          error: `Too many orders. Maximum: ${VALIDATION.MAX_ORDERS_PER_BATCH}`,
        },
      ],
    };
  }

  const errors = [];

  orders.forEach((order, index) => {
    const validation = validateOrder(order);
    if (!validation.valid) {
      validation.errors.forEach((error) => {
        errors.push({ index, orderId: order.orderId, error });
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate date string format
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid ISO 8601 date
 */
export function isValidDateString(dateString) {
  if (typeof dateString !== "string") {
    return false;
  }

  const date = parseISO(dateString);
  return isValid(date);
}

/**
 * Validate time string format
 * @param {string} timeString - Time string to validate
 * @returns {boolean} True if valid "HH:mm" format
 */
export function isValidTimeString(timeString) {
  if (typeof timeString !== "string") {
    return false;
  }

  try {
    parseTimeToMinutes(timeString);
    return true;
  } catch {
    return false;
  }
}
