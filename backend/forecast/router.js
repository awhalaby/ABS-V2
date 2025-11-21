import express from "express";
import {
  generateForecastController,
  getCachedForecastController,
  clearCacheController,
  compareForecastVsActualController,
  getOverallForecastAccuracyController,
} from "./controller.js";

const router = express.Router();

/**
 * Forecast API Routes
 */

// POST /api/forecast/generate - Generate new forecast
router.post("/generate", generateForecastController);

// GET /api/forecast/cached - Get cached forecast
router.get("/cached", getCachedForecastController);

// DELETE /api/forecast/cache - Clear forecast cache
router.delete("/cache", clearCacheController);

// GET /api/forecast/compare - Compare forecast vs actual demand
router.get("/compare", compareForecastVsActualController);

// GET /api/forecast/overall-accuracy - Get overall forecast accuracy across all dates
router.get("/overall-accuracy", getOverallForecastAccuracyController);

export default router;
