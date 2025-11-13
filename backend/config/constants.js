/**
 * System-wide constants for the Bakehouse System
 */

// Timezone
export const BUSINESS_TIMEZONE = "America/New_York";

// Business hours (24-hour format)
export const BUSINESS_HOURS = {
  START: "06:00",
  END: "17:00",
  START_MINUTES: 360, // 06:00 in minutes
  END_MINUTES: 1020, // 17:00 in minutes
};

// Oven configuration
export const OVEN_CONFIG = {
  OVEN_COUNT: 2,
  RACKS_PER_OVEN: 6,
  TOTAL_RACKS: 12,
  RESERVED_RACKS: [], // Can be configured: e.g., ['oven1-rack1', 'oven2-rack6']
};

// Forecast defaults
export const FORECAST_DEFAULTS = {
  LOOKBACK_WEEKS: 4,
  INTERVALS: {
    DAILY: "day",
    WEEKLY: "week",
    MONTHLY: "month",
  },
  INTRADAY_INTERVALS: [5, 10, 20], // minutes
  CACHE_TTL_HOURS: 24,
  DEFAULT_GROWTH_RATE: 1.0,
  MIN_GROWTH_RATE: 0.5,
  MAX_GROWTH_RATE: 2.0,
};

// ABS defaults
export const ABS_DEFAULTS = {
  RESTOCK_THRESHOLD: 12,
  TARGET_END_INVENTORY: 5,
  SIMULATION_SPEEDS: [30, 60, 90, 120], // speed multipliers
  DEFAULT_SIMULATION_SPEED: 60,
  // Schedule generation defaults
  SCHEDULE_GENERATION: {
    RESTOCK_THRESHOLD: 12,
    TARGET_END_INVENTORY: 5,
    FORECAST_GROWTH_RATE: 1.0,
    FORECAST_LOOKBACK_WEEKS: 4,
    TIME_INTERVAL_MINUTES: 10,
  },
};

// Database collection names
export const COLLECTIONS = {
  MENU_ITEMS: "menu_items",
  BAKE_SPECS: "bake_specs",
  FORECASTS: "forecasts",
  ABS_SCHEDULES: "abs_schedules",
};

// Default SKUs (will be seeded)
// These match the actual itemGuids from order data
export const DEFAULT_SKUS = [
  {
    itemGuid: "wg_chcr_lq-item",
    displayName: "Chocolate Croissant",
    capacityPerRack: 24,
    bakeTimeMinutes: 20,
    coolTimeMinutes: 10,
    freshWindowMinutes: 240,
    restockThreshold: 12,
    active: true,
  },
  {
    itemGuid: "wg_hccr_cg-item",
    displayName: "Ham and Cheese Croissant",
    capacityPerRack: 24,
    bakeTimeMinutes: 20,
    coolTimeMinutes: 10,
    freshWindowMinutes: 240,
    restockThreshold: 12,
    active: true,
  },
  {
    itemGuid: "wg_croi_br-item",
    displayName: "Croissant",
    capacityPerRack: 24,
    bakeTimeMinutes: 20,
    coolTimeMinutes: 10,
    freshWindowMinutes: 240,
    restockThreshold: 12,
    active: true,
  },
  {
    itemGuid: "wg_appb_ga-item",
    displayName: "Apple Pie Bite",
    capacityPerRack: 20,
    bakeTimeMinutes: 18,
    coolTimeMinutes: 10,
    freshWindowMinutes: 240,
    restockThreshold: 10,
    active: true,
  },
  {
    itemGuid: "wg_tscp_pa-item",
    displayName: "Cranberry Pecan Roll",
    capacityPerRack: 18,
    bakeTimeMinutes: 22,
    coolTimeMinutes: 12,
    freshWindowMinutes: 240,
    restockThreshold: 10,
    active: true,
  },
];

// API response status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

// Validation constraints
export const VALIDATION = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB (increased for large order files)
  MAX_ORDERS_PER_BATCH: 100000, // Increased for large batches
  DATE_FORMAT: "YYYY-MM-DD",
  TIME_FORMAT: "HH:mm",
};
