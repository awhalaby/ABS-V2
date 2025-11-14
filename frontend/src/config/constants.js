/**
 * Frontend constants matching backend configuration
 */

// API Configuration
// Try multiple methods to determine the backend URL:
// 1. Environment variable (set at build time)
// 2. localStorage (user-configured)
// 3. Auto-detect from current hostname
// 4. Fallback to hardcoded IP

function getBackendURL() {
  // Check localStorage first (allows runtime configuration)
  const storedURL = localStorage.getItem("backend_url");
  if (storedURL) {
    return storedURL;
  }

  // Check environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Auto-detect: if accessing from a different host, use that hostname
  const currentHost = window.location.hostname;
  if (currentHost !== "localhost" && currentHost !== "127.0.0.1") {
    // Use the same hostname but port 3001 for backend
    return `http://${currentHost}:3001`;
  }

  // Fallback to hardcoded IP (for development)
  return "http://10.1.10.112:3001";
}

export const API_BASE_URL = getBackendURL();
export const WEBSOCKET_URL = getBackendURL();

// Export function to update backend URL at runtime
export function setBackendURL(url) {
  localStorage.setItem("backend_url", url);
  // Reload page to apply new URL
  window.location.reload();
}

// Export function to get current backend URL
export function getCurrentBackendURL() {
  return API_BASE_URL;
}

// Business Configuration
export const BUSINESS_TIMEZONE = "America/New_York";
export const BUSINESS_HOURS = {
  START: "06:00",
  END: "17:00",
};

// Oven Configuration
export const OVEN_CONFIG = {
  OVEN_COUNT: 2,
  RACKS_PER_OVEN: 6,
  TOTAL_RACKS: 12,
};

// Forecast Defaults
export const FORECAST_DEFAULTS = {
  LOOKBACK_WEEKS: 4,
  INTERVALS: {
    DAILY: "day",
    WEEKLY: "week",
    MONTHLY: "month",
  },
  INTRADAY_INTERVALS: [5, 10, 20], // minutes
  DEFAULT_GROWTH_RATE: 1.0,
  MIN_GROWTH_RATE: 0.8,
  MAX_GROWTH_RATE: 1.5,
};

// ABS Defaults
export const ABS_DEFAULTS = {
  RESTOCK_THRESHOLD: 12,
  TARGET_END_INVENTORY: 5,
  SIMULATION_SPEEDS: [30, 60, 90, 120],
  DEFAULT_SIMULATION_SPEED: 60,
};

// Date/Time Formats
export const DATE_FORMAT = "yyyy-MM-dd";
export const TIME_FORMAT = "HH:mm";
export const DATETIME_FORMAT = "yyyy-MM-dd HH:mm";
