import { getCollection } from "../config/database.js";
import { COLLECTIONS } from "../config/constants.js";

/**
 * Inventory repository - Database operations for store inventory
 */

/**
 * Get all inventory records
 * @returns {Promise<Array>} Array of inventory records
 */
export async function getAllInventory() {
  const collection = getCollection(COLLECTIONS.STORE_INVENTORY);
  return await collection.find({}).toArray();
}

/**
 * Get inventory by itemGuid
 * @param {string} itemGuid - Item GUID
 * @returns {Promise<Object|null>} Inventory record or null
 */
export async function getInventoryByItemGuid(itemGuid) {
  const collection = getCollection(COLLECTIONS.STORE_INVENTORY);
  return await collection.findOne({ itemGuid });
}

/**
 * Update inventory quantity for an item
 * @param {string} itemGuid - Item GUID
 * @param {number} quantity - New quantity
 * @param {string} displayName - Display name (optional, for initial creation)
 * @param {number} restockThreshold - Restock threshold for inventory (optional)
 * @returns {Promise<Object>} Updated inventory record
 */
export async function updateInventory(
  itemGuid,
  quantity,
  displayName = null,
  restockThreshold = null
) {
  const collection = getCollection(COLLECTIONS.STORE_INVENTORY);

  const update = {
    itemGuid,
    quantity,
    updatedAt: new Date(),
  };

  if (displayName) {
    update.displayName = displayName;
  }

  if (restockThreshold !== null && restockThreshold !== undefined) {
    update.restockThreshold = restockThreshold;
  }

  const result = await collection.findOneAndUpdate(
    { itemGuid },
    {
      $set: update,
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    {
      upsert: true,
      returnDocument: "after",
    }
  );

  return result.value;
}

/**
 * Bulk update inventory
 * @param {Array<Object>} inventoryUpdates - Array of {itemGuid, quantity, displayName, restockThreshold}
 * @returns {Promise<Object>} Update result
 */
export async function bulkUpdateInventory(inventoryUpdates) {
  const collection = getCollection(COLLECTIONS.STORE_INVENTORY);
  const bulkOps = [];

  for (const update of inventoryUpdates) {
    const setFields = {
      itemGuid: update.itemGuid,
      quantity: update.quantity,
      updatedAt: new Date(),
    };

    if (update.displayName) {
      setFields.displayName = update.displayName;
    }

    if (
      update.restockThreshold !== null &&
      update.restockThreshold !== undefined
    ) {
      setFields.restockThreshold = update.restockThreshold;
    }

    bulkOps.push({
      updateOne: {
        filter: { itemGuid: update.itemGuid },
        update: {
          $set: setFields,
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (bulkOps.length === 0) {
    return { modifiedCount: 0, upsertedCount: 0 };
  }

  const result = await collection.bulkWrite(bulkOps);
  return {
    modifiedCount: result.modifiedCount,
    upsertedCount: result.upsertedCount,
  };
}

/**
 * Delete inventory record
 * @param {string} itemGuid - Item GUID
 * @returns {Promise<Object>} Delete result
 */
export async function deleteInventory(itemGuid) {
  const collection = getCollection(COLLECTIONS.STORE_INVENTORY);
  const result = await collection.deleteOne({ itemGuid });
  return { deletedCount: result.deletedCount };
}
