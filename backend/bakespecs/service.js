import {
  getAllBakeSpecs,
  getBakeSpecByItemGuid,
  saveBakeSpec,
  deleteBakeSpec,
  bulkUpdateBakeSpecs,
} from "./repository.js";
import { OVEN_CONFIG } from "../config/constants.js";

/**
 * Bake Specs service - Business logic for bake spec operations
 */

/**
 * Validate bake spec
 * @param {Object} bakeSpec - Bake spec to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateBakeSpec(bakeSpec) {
  if (!bakeSpec.itemGuid) {
    return { valid: false, error: "itemGuid is required" };
  }

  if (!bakeSpec.displayName) {
    return { valid: false, error: "displayName is required" };
  }

  if (
    typeof bakeSpec.capacityPerRack !== "number" ||
    bakeSpec.capacityPerRack <= 0
  ) {
    return { valid: false, error: "capacityPerRack must be a positive number" };
  }

  if (
    typeof bakeSpec.bakeTimeMinutes !== "number" ||
    bakeSpec.bakeTimeMinutes <= 0
  ) {
    return { valid: false, error: "bakeTimeMinutes must be a positive number" };
  }

  if (bakeSpec.oven !== undefined) {
    if (![1, 2].includes(bakeSpec.oven)) {
      return { valid: false, error: "oven must be 1 or 2" };
    }
  }

  if (bakeSpec.coolTimeMinutes !== undefined) {
    if (
      typeof bakeSpec.coolTimeMinutes !== "number" ||
      bakeSpec.coolTimeMinutes < 0
    ) {
      return {
        valid: false,
        error: "coolTimeMinutes must be a non-negative number",
      };
    }
  }

  return { valid: true };
}

/**
 * Get all bake specs
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} Array of bake specs
 */
export async function getBakeSpecs(filters = {}) {
  return await getAllBakeSpecs(filters);
}

/**
 * Get bake spec by itemGuid
 * @param {string} itemGuid - Item GUID
 * @returns {Promise<Object|null>} Bake spec or null
 */
export async function getBakeSpec(itemGuid) {
  return await getBakeSpecByItemGuid(itemGuid);
}

/**
 * Create or update bake spec
 * @param {Object} bakeSpec - Bake spec object
 * @returns {Promise<Object>} Created/updated bake spec
 */
export async function createOrUpdateBakeSpec(bakeSpec) {
  const validation = validateBakeSpec(bakeSpec);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Set defaults
  const spec = {
    ...bakeSpec,
    active: bakeSpec.active !== undefined ? bakeSpec.active : true,
    coolTimeMinutes: bakeSpec.coolTimeMinutes || 10,
    freshWindowMinutes: bakeSpec.freshWindowMinutes || 240,
    restockThreshold: bakeSpec.restockThreshold || 12,
    parMin: bakeSpec.parMin !== undefined ? bakeSpec.parMin : null,
    parMax: bakeSpec.parMax !== undefined ? bakeSpec.parMax : null,
  };

  return await saveBakeSpec(spec);
}

/**
 * Delete bake spec
 * @param {string} itemGuid - Item GUID
 * @returns {Promise<Object>} Delete result
 */
export async function removeBakeSpec(itemGuid) {
  return await deleteBakeSpec(itemGuid);
}

/**
 * Bulk update bake specs
 * @param {Array<Object>} bakeSpecs - Array of bake spec objects
 * @returns {Promise<Object>} Update result
 */
export async function updateBakeSpecs(bakeSpecs) {
  // Validate all specs
  for (const spec of bakeSpecs) {
    const validation = validateBakeSpec(spec);
    if (!validation.valid) {
      throw new Error(
        `Invalid bake spec for ${spec.itemGuid || "unknown"}: ${
          validation.error
        }`
      );
    }
  }

  return await bulkUpdateBakeSpecs(bakeSpecs);
}

/**
 * Get oven configuration
 * @returns {Object} Oven configuration
 */
export function getOvenConfig() {
  return {
    ovenCount: OVEN_CONFIG.OVEN_COUNT,
    racksPerOven: OVEN_CONFIG.RACKS_PER_OVEN,
    totalRacks: OVEN_CONFIG.TOTAL_RACKS,
    racks: Array.from({ length: OVEN_CONFIG.TOTAL_RACKS }, (_, i) => ({
      rackNumber: i + 1,
      oven: Math.floor(i / OVEN_CONFIG.RACKS_PER_OVEN) + 1,
      rackInOven: (i % OVEN_CONFIG.RACKS_PER_OVEN) + 1,
    })),
  };
}
