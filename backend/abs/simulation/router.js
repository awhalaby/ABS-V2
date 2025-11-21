import express from "express";
import {
  startSimulationController,
  getSimulationStatusController,
  getSimulationResultsController,
  pauseSimulationController,
  resumeSimulationController,
  stopSimulationController,
  getAvailableDatesController,
  deleteSimulationBatchController,
  moveSimulationBatchController,
  addSimulationBatchController,
  autoRemoveBatchesController,
  getSuggestedBatchesController,
  createCateringOrderController,
  approveCateringOrderController,
  rejectCateringOrderController,
  getCateringOrdersController,
  setAutoApproveCateringController,
  runHeadlessSimulationController,
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

// POST /api/abs/simulation/headless/run - Run headless simulation
router.post("/headless/run", runHeadlessSimulationController);

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

// DELETE /api/abs/simulation/:id/batch/:batchId - Delete a batch
router.delete("/:id/batch/:batchId", deleteSimulationBatchController);

// POST /api/abs/simulation/:id/batch/move - Move a batch
router.post("/:id/batch/move", moveSimulationBatchController);

// POST /api/abs/simulation/:id/batch/add - Add a new batch
router.post("/:id/batch/add", addSimulationBatchController);

// POST /api/abs/simulation/:id/batch/auto-remove - Auto-remove excess batches
router.post("/:id/batch/auto-remove", autoRemoveBatchesController);

// GET /api/abs/simulation/:id/suggested-batches - Get suggested batches
router.get("/:id/suggested-batches", getSuggestedBatchesController);

// Catering order routes
// POST /api/abs/simulation/:id/catering-order - Create a catering order
router.post("/:id/catering-order", createCateringOrderController);

// POST /api/abs/simulation/:id/catering-order/:orderId/approve - Approve a pending catering order
router.post(
  "/:id/catering-order/:orderId/approve",
  approveCateringOrderController
);

// POST /api/abs/simulation/:id/catering-order/:orderId/reject - Reject a pending catering order
router.post(
  "/:id/catering-order/:orderId/reject",
  rejectCateringOrderController
);

// GET /api/abs/simulation/:id/catering-orders - Get all catering orders
router.get("/:id/catering-orders", getCateringOrdersController);

// POST /api/abs/simulation/:id/catering-order/auto-approve - Set auto-approve setting
router.post(
  "/:id/catering-order/auto-approve",
  setAutoApproveCateringController
);

export default router;
