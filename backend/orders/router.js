import express from "express";
import multer from "multer";
import {
  loadOrdersController,
  getOrderStatsController,
  getDateRangesController,
  deleteOrderRangeController,
  deleteAllOrdersController,
} from "./controller.js";

const router = express.Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit (increased for large order files)
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/json" ||
      file.originalname.endsWith(".json")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only JSON files are allowed"), false);
    }
  },
});

/**
 * Orders API Routes
 */

// POST /api/orders/load - Upload JSON file
router.post("/load", upload.single("file"), loadOrdersController);

// GET /api/orders/stats - Get statistics for date range
router.get("/stats", getOrderStatsController);

// GET /api/orders/date-ranges - Get available date ranges
router.get("/date-ranges", getDateRangesController);

// DELETE /api/orders/range - Delete orders in date range
router.delete("/range", deleteOrderRangeController);

// DELETE /api/orders/all - Delete all orders
router.delete("/all", deleteAllOrdersController);

export default router;
