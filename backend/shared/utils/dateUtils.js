import {
  format,
  getDay,
  differenceInDays,
  getISOWeek,
  parseISO,
  isValid,
} from "date-fns";
import {
  formatBusinessDate,
  getBusinessDayOfWeek,
} from "../../config/timezone.js";

/**
 * Date utility functions
 */

/**
 * Format date to standard format (YYYY-MM-DD)
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  if (!date) {
    throw new Error("Date is required");
  }

  const dateObj = typeof date === "string" ? parseISO(date) : date;

  if (!isValid(dateObj)) {
    throw new Error(`Invalid date: ${date}`);
  }

  return formatBusinessDate(dateObj, "yyyy-MM-dd");
}

/**
 * Get day of week name in business timezone
 * @param {Date|string} date - Date to check
 * @returns {string} Day name (Monday, Tuesday, etc.)
 */
export function getDayOfWeek(date) {
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayIndex = getBusinessDayOfWeek(date);
  return dayNames[dayIndex];
}

/**
 * Get day of week abbreviation
 * @param {Date|string} date - Date to check
 * @returns {string} Day abbreviation (Mon, Tue, etc.)
 */
export function getDayOfWeekAbbr(date) {
  const dayAbbrs = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayIndex = getBusinessDayOfWeek(date);
  return dayAbbrs[dayIndex];
}

/**
 * Calculate days between two dates
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {number} Number of days
 */
export function calculateDaysBetween(startDate, endDate) {
  const start = typeof startDate === "string" ? parseISO(startDate) : startDate;
  const end = typeof endDate === "string" ? parseISO(endDate) : endDate;

  if (!isValid(start) || !isValid(end)) {
    throw new Error("Invalid date(s)");
  }

  return Math.abs(differenceInDays(end, start));
}

/**
 * Get ISO week number for a date
 * @param {Date|string} date - Date to check
 * @returns {number} ISO week number (1-53)
 */
export function getWeekNumber(date) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;

  if (!isValid(dateObj)) {
    throw new Error("Invalid date");
  }

  return getISOWeek(dateObj);
}

/**
 * Get start of week (Monday) for a date
 * @param {Date|string} date - Date to check
 * @returns {Date} Start of week date
 */
export function getStartOfWeek(date) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const dayOfWeek = getBusinessDayOfWeek(dateObj);
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, so 6 days back

  const startOfWeek = new Date(dateObj);
  startOfWeek.setDate(startOfWeek.getDate() - daysToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  return startOfWeek;
}

/**
 * Get end of week (Sunday) for a date
 * @param {Date|string} date - Date to check
 * @returns {Date} End of week date
 */
export function getEndOfWeek(date) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const dayOfWeek = getBusinessDayOfWeek(dateObj);
  const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

  const endOfWeek = new Date(dateObj);
  endOfWeek.setDate(endOfWeek.getDate() + daysToSunday);
  endOfWeek.setHours(23, 59, 59, 999);

  return endOfWeek;
}

/**
 * Add days to a date
 * @param {Date|string} date - Base date
 * @param {number} days - Number of days to add (can be negative)
 * @returns {Date} New date
 */
export function addDays(date, days) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const newDate = new Date(dateObj);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}

/**
 * Check if date is today in business timezone
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is today
 */
export function isToday(date) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const today = new Date();
  return formatDate(dateObj) === formatDate(today);
}

/**
 * Check if date is in the past
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is in the past
 */
export function isPast(date) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dateObj < today;
}

/**
 * Check if date is in the future
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is in the future
 */
export function isFuture(date) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return dateObj > today;
}
