/**
 * Parse time string to minutes since midnight
 * @param {string} timeString - Time in "HH:mm" or "HH:mm:ss" format
 * @returns {number} Minutes since midnight (0-1440)
 */
export function parseTimeToMinutes(timeString) {
  if (!timeString || typeof timeString !== "string") {
    return 0;
  }

  const parts = timeString.split(":");
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  // Ignore seconds if present (parts[2])

  if (
    isNaN(hours) ||
    isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return 0;
  }

  return hours * 60 + minutes;
}
