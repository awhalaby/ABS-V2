/**
 * Frontend constants matching backend configuration
 */

// API Configuration
// Hardcoded for network access - change this IP if your network changes
export const API_BASE_URL = "http://10.1.10.112:3001";
export const WEBSOCKET_URL = "http://10.1.10.112:3001";

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
