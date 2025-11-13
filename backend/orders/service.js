import {
  bulkInsertOrders,
  getOrderStatistics,
  findDateRanges,
  deleteByDateRange,
  deleteAllOrders,
} from "./repository.js";
import { validateOrders } from "../shared/utils/validation.js";
import { transformOrders } from "./transformer.js";
import { toBusinessTime, fromBusinessTime } from "../config/timezone.js";
import { parseISO } from "date-fns";
import { getBakeSpec, createOrUpdateBakeSpec } from "../bakespecs/service.js";

/**
 * Orders service - Business logic for order operations
 */

/**
 * Auto-initialize bake specs for SKUs that don't have them yet
 * @param {Array<Object>} orders - Array of normalized order objects
 * @returns {Promise<Object>} Result with created and existing counts
 */
async function autoInitializeBakeSpecs(orders) {
  // Extract unique SKUs from orders
  const uniqueSKUs = new Map(); // Use Map to store itemGuid -> displayName

  orders.forEach((order) => {
    if (order.itemGuid) {
      uniqueSKUs.set(order.itemGuid, order.displayName || order.itemGuid);
    }
  });

  if (uniqueSKUs.size === 0) {
    return { created: 0, existing: 0, skipped: 0 };
  }

  console.log(
    `Found ${uniqueSKUs.size} unique SKUs in orders, checking for bake specs...`
  );

  let created = 0;
  let existing = 0;
  let skipped = 0;

  // Check each SKU and create default bake spec if missing
  for (const [itemGuid, displayName] of uniqueSKUs) {
    try {
      const existingSpec = await getBakeSpec(itemGuid);

      if (existingSpec) {
        existing++;
        console.log(`  ✓ Bake spec exists for ${displayName} (${itemGuid})`);
      } else {
        // Create default bake spec with conservative values
        const defaultBakeSpec = {
          itemGuid,
          displayName,
          capacityPerRack: 12, // Conservative default
          bakeTimeMinutes: 20, // Conservative default
          coolTimeMinutes: 20,
          freshWindowMinutes: 240, // 4 hours
          restockThreshold: 12,
          active: true,
          parMin: 12,
          parMax: 60,
          // Note: oven is not set, meaning it can use any oven
        };

        await createOrUpdateBakeSpec(defaultBakeSpec);
        created++;
        console.log(
          `  + Created default bake spec for ${displayName} (${itemGuid})`
        );
      }
    } catch (error) {
      console.error(
        `  ✗ Error processing bake spec for ${displayName} (${itemGuid}):`,
        error.message
      );
      skipped++;
    }
  }

  return { created, existing, skipped, total: uniqueSKUs.size };
}

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

  // Auto-initialize bake specs for any new SKUs found in orders
  console.log("\nAuto-initializing bake specs for SKUs...");
  const bakeSpecResult = await autoInitializeBakeSpecs(deduplicatedOrders);

  return {
    totalReceived: ordersArray.length,
    totalTransformed: flatOrders.length,
    validated: deduplicatedOrders.length,
    inserted: result.insertedCount,
    duplicates: result.duplicateCount,
    duplicateOrderIds: result.duplicates,
    bakeSpecs: {
      total: bakeSpecResult.total,
      created: bakeSpecResult.created,
      existing: bakeSpecResult.existing,
      skipped: bakeSpecResult.skipped,
    },
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
    dateRange:
      range.startDate === range.endDate
        ? range.startDate
        : `${range.startDate} to ${range.endDate}`,
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

/**
 * Delete all orders
 * @returns {Promise<Object>} Delete result
 */
export async function deleteAllOrderData() {
  const result = await deleteAllOrders();

  return {
    deletedCount: result.deletedCount,
  };
}
