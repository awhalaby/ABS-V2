import { asyncHandler } from "../shared/middleware/errorHandler.js";
import {
  getInventoryWithRestockSuggestions,
  updateInventoryQuantity,
  bulkUpdateInventoryQuantities,
  getInventory,
} from "./service.js";

/**
 * Get inventory with restock suggestions
 * GET /api/inventory
 */
export const getInventoryController = asyncHandler(async (req, res) => {
  const lookbackDays = parseInt(req.query.lookbackDays) || 30;
  const leadTimeDays = parseInt(req.query.leadTimeDays) || 7;

  const inventory = await getInventoryWithRestockSuggestions(
    lookbackDays,
    leadTimeDays
  );

  res.status(200).json({
    success: true,
    data: inventory,
  });
});

/**
 * Get inventory by itemGuid
 * GET /api/inventory/:itemGuid
 */
export const getInventoryByItemGuidController = asyncHandler(
  async (req, res) => {
    const { itemGuid } = req.params;

    const inventory = await getInventory(itemGuid);

    if (!inventory) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Inventory record not found",
        },
      });
    }

    res.status(200).json({
      success: true,
      data: inventory,
    });
  }
);

/**
 * Update inventory quantity
 * PUT /api/inventory/:itemGuid
 */
export const updateInventoryController = asyncHandler(async (req, res) => {
  const { itemGuid } = req.params;
  const { quantity, displayName, restockThreshold } = req.body;

  if (quantity === undefined) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Quantity is required",
      },
    });
  }

  const updated = await updateInventoryQuantity(
    itemGuid,
    quantity,
    displayName,
    restockThreshold
  );

  res.status(200).json({
    success: true,
    data: updated,
  });
});

/**
 * Bulk update inventory
 * POST /api/inventory/bulk
 */
export const bulkUpdateInventoryController = asyncHandler(async (req, res) => {
  const { updates } = req.body;

  if (!Array.isArray(updates)) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Updates must be an array",
      },
    });
  }

  const result = await bulkUpdateInventoryQuantities(updates);

  res.status(200).json({
    success: true,
    data: result,
  });
});
