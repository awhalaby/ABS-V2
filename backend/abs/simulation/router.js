import express from "express";
import {
  startSimulationController,
  getSimulationStatusController,
  getSimulationResultsController,
  pauseSimulationController,
  resumeSimulationController,
  stopSimulationController,
  getAvailableDatesController,
} from "./controller.js";
import {
  purchaseItemsController,
  getAvailableItemsController,
} from "./posController.js";

const router = express.Router();

/**
 * Simulation API Routes
 */

// GET /api/abs/simulation/available-dates - Get available dates for preset mode
router.get("/available-dates", getAvailableDatesController);

// POST /api/abs/simulation/start - Start a new simulation
router.post("/start", startSimulationController);

// GET /api/abs/simulation/:id/status - Get simulation status
router.get("/:id/status", getSimulationStatusController);

// GET /api/abs/simulation/:id/results - Get simulation results
router.get("/:id/results", getSimulationResultsController);

// POST /api/abs/simulation/:id/pause - Pause simulation
router.post("/:id/pause", pauseSimulationController);

// POST /api/abs/simulation/:id/resume - Resume simulation
router.post("/:id/resume", resumeSimulationController);

// POST /api/abs/simulation/:id/stop - Stop simulation
router.post("/:id/stop", stopSimulationController);

// POS Routes (only for manual mode)
// GET /api/abs/simulation/:id/pos/items - Get available items
router.get("/:id/pos/items", getAvailableItemsController);

// POST /api/abs/simulation/:id/pos/purchase - Purchase items
router.post("/:id/pos/purchase", purchaseItemsController);

export default router;
