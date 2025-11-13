import {
  bulkInsertOrders,
  getOrderStatistics,
  findDateRanges,
  deleteByDateRange,
} from "./repository.js";
import { validateOrders } from "../shared/utils/validation.js";
import { transformOrders } from "./transformer.js";
import { toBusinessTime, fromBusinessTime } from "../config/timezone.js";
import { parseISO } from "date-fns";

/**
 * Orders service - Business logic for order operations
 */

/**
 * Load orders from array
 * @param {Array<Object>} ordersArray - Array of order objects (supports nested and flat formats)
 * @returns {Promise<Object>} Result object with insertedCount, duplicateCount, etc.
 */
export async function loadOrders(ordersArray) {
  if (!Array.isArray(ordersArray) || ordersArray.length === 0) {
    throw new Error("Orders must be a non-empty array");
  }

  // Transform orders to standard flat format (handles both nested and flat formats)
  const flatOrders = transformOrders(ordersArray);

  if (flatOrders.length === 0) {
    // Provide more helpful error message
    const sampleOrder = ordersArray[0];
    const isNested = sampleOrder?.guid && sampleOrder?.checks;
    throw new Error(
      `No valid orders found after transformation. ` +
        `Received ${ordersArray.length} orders. ` +
        `Format detected: ${isNested ? "nested" : "flat"}. ` +
        `Please check that orders have valid checks/selections or required fields.`
    );
  }

  // Validate transformed orders
  const validation = validateOrders(flatOrders);
  if (!validation.valid) {
    // Limit error message to first 10 errors to avoid overwhelming response
    const errorCount = validation.errors.length;
    const firstErrors = validation.errors.slice(0, 10);
    const errorMessage =
      errorCount > 10
        ? `${firstErrors.map((e) => e.error).join(", ")} ... and ${
            errorCount - 10
          } more errors`
        : validation.errors.map((e) => e.error).join(", ");

    throw new Error(
      `Validation failed (${errorCount} errors): ${errorMessage}`
    );
  }

  // Normalize orders (allow multiple items per orderId)
  const normalizedOrders = flatOrders.map((order) => {
    // Normalize timestamp to EST
    const paidDate =
      typeof order.paidDate === "string"
        ? parseISO(order.paidDate)
        : order.paidDate;

    // Convert to EST and back to UTC for storage
    const estDate = toBusinessTime(paidDate);
    const utcDate = fromBusinessTime(estDate);

    return {
      orderId: String(order.orderId),
      paidDate: utcDate,
      displayName: order.displayName || "",
      itemGuid: order.itemGuid || "",
      quantity: Number(order.quantity),
      price: order.price ? Number(order.price) : 0,
    };
  });

  // Remove duplicates by orderId:itemGuid combination (keep first occurrence)
  // This allows orders with multiple SKUs to have multiple records
  const seenOrderItemKeys = new Set();
  const deduplicatedOrders = normalizedOrders.filter((order) => {
    const key = `${order.orderId}:${order.itemGuid}`;
    if (seenOrderItemKeys.has(key)) {
      return false;
    }
    seenOrderItemKeys.add(key);
    return true;
  });

  // Bulk insert
  const result = await bulkInsertOrders(deduplicatedOrders);

  return {
    totalReceived: ordersArray.length,
    totalTransformed: flatOrders.length,
    validated: deduplicatedOrders.length,
    inserted: result.insertedCount,
    duplicates: result.duplicateCount,
    duplicateOrderIds: result.duplicates,
  };
}

/**
 * Get order statistics for date range
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<Object>} Statistics object
 */
export async function getOrderStats(startDate, endDate) {
  const stats = await getOrderStatistics(startDate, endDate);

  return {
    ...stats,
    startDate:
      typeof startDate === "string" ? startDate : startDate.toISOString(),
    endDate: typeof endDate === "string" ? endDate : endDate.toISOString(),
  };
}

/**
 * Get available date ranges
 * @returns {Promise<Array>} Array of date range objects
 */
export async function getAvailableDateRanges() {
  const ranges = await findDateRanges();

  return ranges.map((range) => ({
    startDate: range.startDate,
    endDate: range.endDate,
    orderCount: range.orderCount,
    itemCount: range.itemCount,
    dateRange: `${range.startDate} to ${range.endDate}`,
  }));
}

/**
 * Delete orders in date range
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<Object>} Delete result
 */
export async function deleteOrderRange(startDate, endDate) {
  const result = await deleteByDateRange(startDate, endDate);

  return {
    deletedCount: result.deletedCount,
    startDate:
      typeof startDate === "string" ? startDate : startDate.toISOString(),
    endDate: typeof endDate === "string" ? endDate : endDate.toISOString(),
  };
}
