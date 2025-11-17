import {
  getAllInventory,
  getInventoryByItemGuid,
  updateInventory,
  bulkUpdateInventory,
} from "./repository.js";
import { getBakeSpecs } from "../abs/repository.js";
import { getDailyVelocity } from "../velocity/repository.js";
import { subDays, format } from "date-fns";

/**
 * Inventory service - Business logic for store inventory and restock suggestions
 */

/**
 * Calculate average daily consumption from velocity data
 * @param {Array} dailyVelocityData - Daily velocity records
 * @returns {number} Average daily consumption
 */
function calculateAverageDailyConsumption(dailyVelocityData) {
  if (!dailyVelocityData || dailyVelocityData.length === 0) {
    return 0;
  }

  const totalQuantity = dailyVelocityData.reduce(
    (sum, record) => sum + (record.totalQuantity || 0),
    0
  );
  const days = dailyVelocityData.length;

  return days > 0 ? totalQuantity / days : 0;
}

/**
 * Calculate days until restock needed
 * @param {number} currentQuantity - Current inventory quantity
 * @param {number} restockThreshold - Restock threshold from bake spec
 * @param {number} dailyConsumption - Average daily consumption
 * @returns {number|null} Days until restock needed, or null if no consumption
 */
function calculateDaysUntilRestock(
  currentQuantity,
  restockThreshold,
  dailyConsumption
) {
  if (dailyConsumption <= 0) {
    return null; // No consumption data, can't calculate
  }

  // Calculate when inventory will hit restock threshold
  const quantityUntilThreshold = currentQuantity - restockThreshold;

  if (quantityUntilThreshold <= 0) {
    return 0; // Already at or below threshold
  }

  const days = Math.floor(quantityUntilThreshold / dailyConsumption);
  return Math.max(0, days);
}

/**
 * Calculate suggested order quantity
 * @param {number} currentQuantity - Current inventory quantity
 * @param {number} restockThreshold - Restock threshold
 * @param {number} parMax - Maximum PAR level (optional)
 * @param {number} dailyConsumption - Average daily consumption
 * @param {number} leadTimeDays - Lead time in days for delivery (default: 7)
 * @returns {number} Suggested order quantity
 */
function calculateSuggestedOrderQuantity(
  currentQuantity,
  restockThreshold,
  parMax,
  dailyConsumption,
  leadTimeDays = 7
) {
  // Calculate how much we'll consume during lead time
  const consumptionDuringLeadTime = dailyConsumption * leadTimeDays;

  // Calculate target inventory level
  const targetInventory = parMax || restockThreshold * 3; // Default to 3x restock threshold if no parMax

  // Calculate what we need to order
  const projectedInventoryAfterLeadTime =
    currentQuantity - consumptionDuringLeadTime;
  const orderQuantity = Math.max(
    0,
    targetInventory - projectedInventoryAfterLeadTime
  );

  return Math.ceil(orderQuantity);
}

/**
 * Get inventory with restock suggestions
 * @param {number} lookbackDays - Number of days to look back for velocity (default: 30)
 * @param {number} leadTimeDays - Lead time in days for delivery (default: 7)
 * @returns {Promise<Array>} Array of inventory items with restock suggestions
 */
export async function getInventoryWithRestockSuggestions(
  lookbackDays = 30,
  leadTimeDays = 7
) {
  // Get all inventory records
  const inventoryRecords = await getAllInventory();

  // Get all bake specs
  const bakeSpecs = await getBakeSpecs();
  const bakeSpecMap = new Map();
  bakeSpecs.forEach((spec) => {
    bakeSpecMap.set(spec.itemGuid, spec);
  });

  // Get date range for velocity calculation
  const endDate = new Date();
  const startDate = subDays(endDate, lookbackDays);
  const startDateStr = format(startDate, "yyyy-MM-dd");
  const endDateStr = format(endDate, "yyyy-MM-dd");

  // Get daily velocity for all items
  const dailyVelocity = await getDailyVelocity(startDateStr, endDateStr);

  // Group velocity by itemGuid
  const velocityByItem = new Map();
  dailyVelocity.forEach((record) => {
    if (!velocityByItem.has(record.itemGuid)) {
      velocityByItem.set(record.itemGuid, []);
    }
    velocityByItem.get(record.itemGuid).push(record);
  });

  // Build result array with restock suggestions
  const result = [];

  // Process items that have inventory records
  for (const inventory of inventoryRecords) {
    const bakeSpec = bakeSpecMap.get(inventory.itemGuid);
    const velocityData = velocityByItem.get(inventory.itemGuid) || [];

    const dailyConsumption = calculateAverageDailyConsumption(velocityData);
    // Use inventory-specific restock threshold if set, otherwise fallback to bake spec
    const restockThreshold =
      inventory.restockThreshold !== null &&
      inventory.restockThreshold !== undefined
        ? inventory.restockThreshold
        : bakeSpec?.restockThreshold || 12;
    const parMax = bakeSpec?.parMax || null;

    const daysUntilRestock = calculateDaysUntilRestock(
      inventory.quantity,
      restockThreshold,
      dailyConsumption
    );

    const suggestedOrderQuantity = calculateSuggestedOrderQuantity(
      inventory.quantity,
      restockThreshold,
      parMax,
      dailyConsumption,
      leadTimeDays
    );

    result.push({
      itemGuid: inventory.itemGuid,
      displayName:
        inventory.displayName || bakeSpec?.displayName || inventory.itemGuid,
      currentQuantity: inventory.quantity,
      restockThreshold,
      parMax,
      dailyConsumption: Math.round(dailyConsumption * 100) / 100,
      daysUntilRestock,
      suggestedOrderQuantity,
      status:
        inventory.quantity <= restockThreshold
          ? "low"
          : daysUntilRestock !== null && daysUntilRestock <= leadTimeDays
          ? "reorder_soon"
          : "ok",
      lastUpdated: inventory.updatedAt || inventory.createdAt,
    });
  }

  // Add items from bake specs that don't have inventory records yet
  for (const bakeSpec of bakeSpecs) {
    if (!inventoryRecords.find((inv) => inv.itemGuid === bakeSpec.itemGuid)) {
      const velocityData = velocityByItem.get(bakeSpec.itemGuid) || [];
      const dailyConsumption = calculateAverageDailyConsumption(velocityData);

      result.push({
        itemGuid: bakeSpec.itemGuid,
        displayName: bakeSpec.displayName,
        currentQuantity: 0,
        restockThreshold: bakeSpec.restockThreshold || 12,
        parMax: bakeSpec.parMax || null,
        dailyConsumption: Math.round(dailyConsumption * 100) / 100,
        daysUntilRestock: null,
        suggestedOrderQuantity: calculateSuggestedOrderQuantity(
          0,
          bakeSpec.restockThreshold || 12,
          bakeSpec.parMax,
          dailyConsumption,
          leadTimeDays
        ),
        status: "no_inventory",
        lastUpdated: null,
      });
    }
  }

  // Sort by status (low first), then by daysUntilRestock
  result.sort((a, b) => {
    const statusOrder = { low: 0, reorder_soon: 1, ok: 2, no_inventory: 3 };
    const statusDiff =
      (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    if (statusDiff !== 0) return statusDiff;

    if (a.daysUntilRestock === null && b.daysUntilRestock === null) return 0;
    if (a.daysUntilRestock === null) return 1;
    if (b.daysUntilRestock === null) return -1;

    return a.daysUntilRestock - b.daysUntilRestock;
  });

  return result;
}

/**
 * Update inventory quantity
 * @param {string} itemGuid - Item GUID
 * @param {number} quantity - New quantity
 * @param {string} displayName - Display name (optional)
 * @param {number} restockThreshold - Restock threshold for inventory (optional)
 * @returns {Promise<Object>} Updated inventory record
 */
export async function updateInventoryQuantity(
  itemGuid,
  quantity,
  displayName = null,
  restockThreshold = null
) {
  if (typeof quantity !== "number" || quantity < 0) {
    throw new Error("Quantity must be a non-negative number");
  }

  if (
    restockThreshold !== null &&
    (typeof restockThreshold !== "number" || restockThreshold < 0)
  ) {
    throw new Error("Restock threshold must be a non-negative number");
  }

  return await updateInventory(
    itemGuid,
    quantity,
    displayName,
    restockThreshold
  );
}

/**
 * Bulk update inventory
 * @param {Array<Object>} updates - Array of {itemGuid, quantity, displayName, restockThreshold}
 * @returns {Promise<Object>} Update result
 */
export async function bulkUpdateInventoryQuantities(updates) {
  for (const update of updates) {
    if (typeof update.quantity !== "number" || update.quantity < 0) {
      throw new Error(
        `Invalid quantity for ${update.itemGuid}: ${update.quantity}`
      );
    }
    if (
      update.restockThreshold !== null &&
      update.restockThreshold !== undefined
    ) {
      if (
        typeof update.restockThreshold !== "number" ||
        update.restockThreshold < 0
      ) {
        throw new Error(
          `Invalid restock threshold for ${update.itemGuid}: ${update.restockThreshold}`
        );
      }
    }
  }

  return await bulkUpdateInventory(updates);
}

/**
 * Get inventory by itemGuid
 * @param {string} itemGuid - Item GUID
 * @returns {Promise<Object|null>} Inventory record or null
 */
export async function getInventory(itemGuid) {
  return await getInventoryByItemGuid(itemGuid);
}
