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
 * @returns {Date} Start of day in business timezone
 */
export function startOfBusinessDay(date) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const businessDate = toBusinessTime(dateObj);
  const startOfDay = new Date(businessDate);
  startOfDay.setHours(0, 0, 0, 0);
  return fromBusinessTime(startOfDay);
}

/**
 * Normalize date to end of day in business timezone
 * @param {Date|string} date - Date to normalize
 * @returns {Date} End of day in business timezone
 */
export function endOfBusinessDay(date) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const businessDate = toBusinessTime(dateObj);
  const endOfDay = new Date(businessDate);
  endOfDay.setHours(23, 59, 59, 999);
  return fromBusinessTime(endOfDay);
}
