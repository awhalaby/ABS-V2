import express from "express";
import {
  generateForecastController,
  getCachedForecastController,
  clearCacheController,
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

export default router;
