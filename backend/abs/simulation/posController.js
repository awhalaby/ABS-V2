import { asyncHandler } from "../../shared/middleware/errorHandler.js";
import { purchaseItems, getAvailableItems } from "./pos.js";
import { io } from "../../server.js";

/**
 * Purchase items from simulation inventory
 * POST /api/abs/simulation/:id/pos/purchase
 */
export const purchaseItemsController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        message: "items array is required and must not be empty",
      },
    });
  }

  try {
    const result = purchaseItems(id, items, io);
    res.status(200).json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        message: error.message,
      },
    });
  }
});

/**
 * Get available items for purchase
 * GET /api/abs/simulation/:id/pos/items
 */
export const getAvailableItemsController = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const result = getAvailableItems(id);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: {
        message: error.message,
      },
    });
  }
});
