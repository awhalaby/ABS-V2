import express from "express";
import {
  generateScheduleController,
  getScheduleController,
  listSchedulesController,
  deleteScheduleController,
  moveBatchController,
  getEarliestDateController,
} from "./controller.js";
import simulationRouter from "./simulation/router.js";

const router = express.Router();

/**
 * ABS Schedule API Routes
 */

// POST /api/abs/schedule/generate - Generate schedule for a date
router.post("/schedule/generate", generateScheduleController);

// GET /api/abs/schedule/:date - Get schedule by date
router.get("/schedule/:date", getScheduleController);

// GET /api/abs/schedule - List schedules with filters
router.get("/schedule", listSchedulesController);

// DELETE /api/abs/schedule/:date - Delete schedule by date
router.delete("/schedule/:date", deleteScheduleController);

// POST /api/abs/batch/move - Move batch to new time/rack
router.post("/batch/move", moveBatchController);

// GET /api/abs/earliest-date - Get earliest order date
router.get("/earliest-date", getEarliestDateController);

// Simulation routes
router.use("/simulation", simulationRouter);

export default router;
