/**
 * Time utility functions for time string manipulation
 * All times are in "HH:mm" format (24-hour)
 */

/**
 * Parse time string to minutes since midnight
 * @param {string} timeString - Time in "HH:mm" format
 * @returns {number} Minutes since midnight (0-1439)
 */
export function parseTimeToMinutes(timeString) {
  if (!timeString || typeof timeString !== "string") {
    throw new Error("Invalid time string");
  }

  const [hours, minutes] = timeString.split(":").map(Number);

  if (
    isNaN(hours) ||
    isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Invalid time format: ${timeString}. Expected HH:mm`);
  }

  return hours * 60 + minutes;
}

/**
 * Format minutes since midnight to time string
 * @param {number} minutes - Minutes since midnight (can be fractional)
 * @returns {string} Time in "HH:mm" format (or "HH:mm:ss" if fractional)
 */
export function formatMinutesToTime(minutes) {
  if (typeof minutes !== "number" || minutes < 0 || minutes >= 1440) {
    throw new Error(`Invalid minutes: ${minutes}. Must be 0-1439`);
  }

  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  // Show seconds if there are fractional minutes for smoother display
  if (secs > 0 || minutes % 1 !== 0) {
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(
      2,
      "0"
    )}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Calculate minutes between two times
 * @param {string} startTime - Start time in "HH:mm" format
 * @param {string} endTime - End time in "HH:mm" format
 * @returns {number} Minutes between times
 */
export function getMinutesBetween(startTime, endTime) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (endMinutes < startMinutes) {
    throw new Error("End time must be after start time");
  }

  return endMinutes - startMinutes;
}

/**
 * Add minutes to a time string
 * @param {string} timeString - Time in "HH:mm" format
 * @param {number} minutesToAdd - Minutes to add
 * @returns {string} New time in "HH:mm" format
 */
export function addMinutesToTime(timeString, minutesToAdd) {
  const currentMinutes = parseTimeToMinutes(timeString);
  const newMinutes = (currentMinutes + minutesToAdd) % 1440;

  // Handle negative wrap-around
  const finalMinutes = newMinutes < 0 ? 1440 + newMinutes : newMinutes;

  return formatMinutesToTime(finalMinutes);
}

/**
 * Check if time is within business hours
 * @param {string} timeString - Time in "HH:mm" format
 * @param {string} startTime - Business start time (default: "06:00")
 * @param {string} endTime - Business end time (default: "17:00")
 * @returns {boolean} True if within business hours
 */
export function isWithinBusinessHours(
  timeString,
  startTime = "06:00",
  endTime = "17:00"
) {
  const timeMinutes = parseTimeToMinutes(timeString);
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
}

/**
 * Get time bucket for a given time and interval
 * @param {string} timeString - Time in "HH:mm" format
 * @param {number} intervalMinutes - Bucket size in minutes
 * @returns {string} Time bucket start time in "HH:mm" format
 */
export function getTimeBucket(timeString, intervalMinutes) {
  const timeMinutes = parseTimeToMinutes(timeString);
  const bucketStartMinutes =
    Math.floor(timeMinutes / intervalMinutes) * intervalMinutes;
  return formatMinutesToTime(bucketStartMinutes);
}

/**
 * Generate time buckets between start and end time
 * @param {string} startTime - Start time in "HH:mm" format
 * @param {string} endTime - End time in "HH:mm" format
 * @param {number} intervalMinutes - Bucket size in minutes
 * @returns {Array<string>} Array of bucket start times
 */
export function generateTimeBuckets(startTime, endTime, intervalMinutes) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const buckets = [];

  for (
    let minutes = startMinutes;
    minutes < endMinutes;
    minutes += intervalMinutes
  ) {
    buckets.push(formatMinutesToTime(minutes));
  }

  return buckets;
}
