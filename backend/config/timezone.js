import { format, parseISO, getDay } from "date-fns";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import { BUSINESS_TIMEZONE } from "./constants.js";

/**
 * Timezone utilities for EST/EDT operations
 */

/**
 * Get current date/time in business timezone
 * @returns {Date} Date object in business timezone
 */
export function getBusinessTime() {
  return utcToZonedTime(new Date(), BUSINESS_TIMEZONE);
}

/**
 * Convert UTC date to business timezone
 * @param {Date} date - UTC date
 * @returns {Date} Date in business timezone
 */
export function toBusinessTime(date) {
  return utcToZonedTime(date, BUSINESS_TIMEZONE);
}

/**
 * Convert business timezone date to UTC
 * @param {Date} date - Date in business timezone
 * @returns {Date} UTC date
 */
export function fromBusinessTime(date) {
  return zonedTimeToUtc(date, BUSINESS_TIMEZONE);
}

/**
 * Format date in business timezone
 * @param {Date|string} date - Date to format
 * @param {string} formatStr - Format string (date-fns format)
 * @returns {string} Formatted date string
 */
export function formatBusinessDate(date, formatStr = "yyyy-MM-dd") {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const businessDate = toBusinessTime(dateObj);
  return format(businessDate, formatStr, { timeZone: BUSINESS_TIMEZONE });
}

/**
 * Get day of week in business timezone (0 = Sunday, 6 = Saturday)
 * @param {Date|string} date - Date to check
 * @returns {number} Day of week (0-6)
 */
export function getBusinessDayOfWeek(date) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const businessDate = toBusinessTime(dateObj);
  return getDay(businessDate);
}

/**
 * Get MongoDB timezone parameter for aggregations
 * @returns {string} MongoDB timezone string
 */
export function getMongoTimezone() {
  return BUSINESS_TIMEZONE;
}

/**
 * Normalize date to start of day in business timezone
 * @param {Date|string} date - Date to normalize
 * @returns {Date} Start of day in business timezone (as UTC)
 */
export function startOfBusinessDay(date) {
  let dateObj;
  if (typeof date === "string") {
    // If it's a date-only string (YYYY-MM-DD), parse it as midnight in business timezone
    // Otherwise, use parseISO which handles ISO strings with time
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Date-only string: interpret as start of day in business timezone
      // Parse date components
      const [year, month, day] = date.split("-").map(Number);
      // Create a date string representing midnight in business timezone
      // We need to interpret this date as being in the business timezone, not UTC
      // Use zonedTimeToUtc: it takes a date/time and interprets it as being in the given timezone
      // Create a date representing the time in business timezone, then convert to UTC
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}T00:00:00`;
      // Parse as if it's a naive datetime (no timezone), then interpret as business timezone
      // We'll create a Date object and use zonedTimeToUtc to interpret it as business timezone
      // Actually, we need to create the date in business timezone first
      // The correct approach: create date components, build a date in business timezone, convert to UTC
      const tempDate = new Date(year, month - 1, day, 0, 0, 0, 0);
      // tempDate is in server's local timezone, but we want it interpreted as business timezone
      // Get the UTC equivalent of this time if it were in business timezone
      // Use zonedTimeToUtc: it interprets the date as if it's in the given timezone
      dateObj = zonedTimeToUtc(tempDate, BUSINESS_TIMEZONE);
    } else {
      dateObj = parseISO(date);
    }
  } else {
    dateObj = date;
  }
  // For Date objects or ISO strings with time, use the existing logic
  const businessDate = toBusinessTime(dateObj);
  const startOfDay = new Date(businessDate);
  startOfDay.setHours(0, 0, 0, 0);
  return fromBusinessTime(startOfDay);
}

/**
 * Normalize date to end of day in business timezone
 * @param {Date|string} date - Date to normalize
 * @returns {Date} End of day in business timezone (as UTC)
 */
export function endOfBusinessDay(date) {
  let dateObj;
  if (typeof date === "string") {
    // If it's a date-only string (YYYY-MM-DD), parse it as end of day in business timezone
    // Otherwise, use parseISO which handles ISO strings with time
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Date-only string: interpret as end of day in business timezone
      // Strategy: Get start of next day in business timezone, convert to UTC, then subtract 1ms
      const [year, month, day] = date.split("-").map(Number);
      // Calculate next day (handling month/year rollover)
      const nextDayDate = new Date(year, month - 1, day + 1);
      const nextYear = nextDayDate.getFullYear();
      const nextMonth = nextDayDate.getMonth() + 1;
      const nextDay = nextDayDate.getDate();

      // Get start of next day using startOfBusinessDay (which handles timezone correctly)
      const nextDayStart = startOfBusinessDay(
        `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(
          nextDay
        ).padStart(2, "0")}`
      );
      // Subtract 1ms to get end of current day (inclusive)
      dateObj = new Date(nextDayStart.getTime() - 1);
    } else {
      dateObj = parseISO(date);
    }
  } else {
    dateObj = date;
  }
  // For Date objects or ISO strings with time, use the existing logic
  const businessDate = toBusinessTime(dateObj);
  const endOfDay = new Date(businessDate);
  endOfDay.setHours(23, 59, 59, 999);
  return fromBusinessTime(endOfDay);
}
