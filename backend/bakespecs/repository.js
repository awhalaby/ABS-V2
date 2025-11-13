import { getCollection } from "../config/database.js";
import { COLLECTIONS } from "../config/constants.js";

/**
 * Bake Specs repository - Database queries for bake spec operations
 */

/**
 * Get all bake specs
 * @param {Object} filters - Optional filters (active, oven)
 * @returns {Promise<Array>} Array of bake specs
 */
export async function getAllBakeSpecs(filters = {}) {
  const collection = getCollection(COLLECTIONS.BAKE_SPECS);

  const query = {};
  if (filters.active !== undefined) {
    query.active = filters.active;
  }
  if (filters.oven !== undefined) {
    query.oven = filters.oven;
  }

  return await collection.find(query).sort({ displayName: 1 }).toArray();
}

/**
 * Get bake spec by itemGuid
 * @param {string} itemGuid - Item GUID
 * @returns {Promise<Object|null>} Bake spec or null
 */
export async function getBakeSpecByItemGuid(itemGuid) {
  const collection = getCollection(COLLECTIONS.BAKE_SPECS);
  return await collection.findOne({ itemGuid });
}

/**
 * Create or update bake spec
 * @param {Object} bakeSpec - Bake spec object
 * @returns {Promise<Object>} Created/updated bake spec
 */
export async function saveBakeSpec(bakeSpec) {
  const collection = getCollection(COLLECTIONS.BAKE_SPECS);

  if (!bakeSpec.itemGuid) {
    throw new Error("itemGuid is required");
  }

  // Remove _id and other MongoDB internal fields that shouldn't be updated
  const { _id, createdAt, ...updateData } = bakeSpec;

  const result = await collection.updateOne(
    { itemGuid: bakeSpec.itemGuid },
    {
      $set: {
        ...updateData,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  // Return the updated document
  return await getBakeSpecByItemGuid(bakeSpec.itemGuid);
}

/**
 * Delete bake spec by itemGuid
 * @param {string} itemGuid - Item GUID
 * @returns {Promise<Object>} Delete result
 */
export async function deleteBakeSpec(itemGuid) {
  const collection = getCollection(COLLECTIONS.BAKE_SPECS);
  const result = await collection.deleteOne({ itemGuid });
  return { deletedCount: result.deletedCount };
}

/**
 * Bulk update bake specs
 * @param {Array<Object>} bakeSpecs - Array of bake spec objects
 * @returns {Promise<Object>} Update result
 */
export async function bulkUpdateBakeSpecs(bakeSpecs) {
  const collection = getCollection(COLLECTIONS.BAKE_SPECS);
  const operations = [];

  for (const spec of bakeSpecs) {
    if (!spec.itemGuid) {
      continue;
    }

    // Remove _id and other MongoDB internal fields that shouldn't be updated
    const { _id, createdAt, ...updateData } = spec;

    operations.push({
      updateOne: {
        filter: { itemGuid: spec.itemGuid },
        update: {
          $set: {
            ...updateData,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (operations.length === 0) {
    return { modifiedCount: 0, upsertedCount: 0 };
  }

  const result = await collection.bulkWrite(operations);
  return {
    modifiedCount: result.modifiedCount,
    upsertedCount: result.upsertedCount,
  };
}
