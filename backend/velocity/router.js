import express from "express";
import {
  getWeeklyVelocityController,
  getDailyVelocityController,
  getIntradayVelocityController,
} from "./controller.js";

const router = express.Router();

/**
 * Velocity API Routes
 */

// GET /api/velocity/weekly - Get weekly velocity
router.get("/weekly", getWeeklyVelocityController);

// GET /api/velocity/daily - Get daily velocity
router.get("/daily", getDailyVelocityController);

// GET /api/velocity/intraday - Get intraday velocity
router.get("/intraday", getIntradayVelocityController);

export default router;
