import {
  loadOrders,
  getOrderStats,
  getAvailableDateRanges,
  deleteOrderRange,
} from "./service.js";
import { asyncHandler } from "../shared/middleware/errorHandler.js";

/**
 * Orders controller - Request handlers for order routes
 */

/**
 * Load orders from uploaded file
 * POST /api/orders/load
 */
export const loadOrdersController = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: {
        message: "No file uploaded",
      },
    });
  }

  // Parse JSON file
  let ordersArray;
  try {
    const fileContent = req.file.buffer.toString("utf-8");
    ordersArray = JSON.parse(fileContent);

    if (!Array.isArray(ordersArray)) {
      throw new Error("File must contain a JSON array");
    }

    // Log sample for debugging (first order only)
    if (ordersArray.length > 0) {
      console.log(
        "Sample order structure:",
        JSON.stringify(ordersArray[0], null, 2)
      );
    }
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Invalid JSON file",
        details: error.message,
      },
    });
  }

  // Load orders
  const result = await loadOrders(ordersArray);

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * Get order statistics
 * GET /api/orders/stats
 */
export const getOrderStatsController = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: {
        message: "startDate and endDate query parameters are required",
      },
    });
  }

  const stats = await getOrderStats(startDate, endDate);

  res.status(200).json({
    success: true,
    data: stats,
  });
});

/**
 * Get available date ranges
 * GET /api/orders/date-ranges
 */
export const getDateRangesController = asyncHandler(async (req, res) => {
  const ranges = await getAvailableDateRanges();

  res.status(200).json({
    success: true,
    data: ranges,
  });
});

/**
 * Delete orders in date range
 * DELETE /api/orders/range
 */
export const deleteOrderRangeController = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: {
        message: "startDate and endDate query parameters are required",
      },
    });
  }

  const result = await deleteOrderRange(startDate, endDate);

  res.status(200).json({
    success: true,
    data: result,
    message: `Deleted ${result.deletedCount} orders`,
  });
});
