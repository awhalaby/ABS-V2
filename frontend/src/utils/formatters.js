import { format, parseISO } from "date-fns";
import { DATE_FORMAT, TIME_FORMAT } from "../config/constants.js";

/**
 * Formatting utility functions
 */

/**
 * Format time (minutes or time string) to display string
 * @param {number|string} time - Minutes since midnight (number) or time string (HH:mm)
 * @returns {string} Formatted time string (HH:mm)
 */
export function formatTime(time) {
  // Handle time string format (HH:mm)
  if (typeof time === "string") {
    // Validate time string format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (timeRegex.test(time)) {
      return time;
    }
    return "--:--";
  }

  // Handle number format (minutes since midnight)
  if (typeof time !== "number" || time < 0 || time >= 1440) {
    return "--:--";
  }

  const hours = Math.floor(time / 60);
  const mins = time % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Format minutes since midnight to time string (alias for formatTime)
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Formatted time string (HH:mm)
 */
export function formatMinutesToTime(minutes) {
  return formatTime(minutes);
}

/**
 * Format date ISO string to display format
 * @param {string} isoString - ISO date string
 * @param {string} formatStr - Format string (default: yyyy-MM-dd)
 * @returns {string} Formatted date string
 */
export function formatDate(isoString, formatStr = DATE_FORMAT) {
  if (!isoString) return "--";

  try {
    const date =
      typeof isoString === "string" ? parseISO(isoString) : isoString;
    return format(date, formatStr);
  } catch (error) {
    console.error("Date formatting error:", error);
    return "--";
  }
}

/**
 * Format number with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(num) {
  if (typeof num !== "number") return "0";
  return num.toLocaleString("en-US");
}

/**
 * Format percentage
 * @param {number} decimal - Decimal value (e.g., 0.15 for 15%)
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage string
 */
export function formatPercent(decimal, decimals = 1) {
  if (typeof decimal !== "number") return "0%";
  return `${(decimal * 100).toFixed(decimals)}%`;
}

/**
 * Format duration in minutes to human-readable string
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration (e.g., "2h 30m" or "45m")
 */
export function formatDuration(minutes) {
  if (typeof minutes !== "number" || minutes < 0) return "0m";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${mins}m`;
  }
}

/**
 * Format currency
 * @param {number} amount - Amount in dollars
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
  if (typeof amount !== "number") return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}
