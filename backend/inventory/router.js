import express from "express";
import {
  getInventoryController,
  getInventoryByItemGuidController,
  updateInventoryController,
  bulkUpdateInventoryController,
} from "./controller.js";

const router = express.Router();

/**
 * Inventory routes
 */

// Get all inventory with restock suggestions
router.get("/", getInventoryController);

// Get inventory by itemGuid
router.get("/:itemGuid", getInventoryByItemGuidController);

// Update inventory quantity
router.put("/:itemGuid", updateInventoryController);

// Bulk update inventory
router.post("/bulk", bulkUpdateInventoryController);

export default router;
