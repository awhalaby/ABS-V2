import {
  getBakeSpecs,
  getBakeSpec,
  createOrUpdateBakeSpec,
  removeBakeSpec,
  updateBakeSpecs,
  getOvenConfig,
} from "./service.js";
import { asyncHandler } from "../shared/middleware/errorHandler.js";

/**
 * Bake Specs controller - Request handlers for bake spec routes
 */

/**
 * Get all bake specs
 * GET /api/bakespecs
 */
export const getBakeSpecsController = asyncHandler(async (req, res) => {
  const { active, oven } = req.query;

  const filters = {};
  if (active !== undefined) {
    filters.active = active === "true";
  }
  if (oven !== undefined) {
    filters.oven = parseInt(oven, 10);
  }

  const specs = await getBakeSpecs(filters);

  res.status(200).json({
    success: true,
    data: specs,
    count: specs.length,
  });
});

/**
 * Get bake spec by itemGuid
 * GET /api/bakespecs/:itemGuid
 */
export const getBakeSpecController = asyncHandler(async (req, res) => {
  const { itemGuid } = req.params;

  const spec = await getBakeSpec(itemGuid);

  if (!spec) {
    return res.status(404).json({
      success: false,
      error: {
        message: "Bake spec not found",
      },
    });
  }

  res.status(200).json({
    success: true,
    data: spec,
  });
});

/**
 * Create or update bake spec
 * POST /api/bakespecs
 * PUT /api/bakespecs/:itemGuid
 */
export const saveBakeSpecController = asyncHandler(async (req, res) => {
  const bakeSpec = req.body;

  const spec = await createOrUpdateBakeSpec(bakeSpec);

  res.status(200).json({
    success: true,
    data: spec,
  });
});

/**
 * Delete bake spec
 * DELETE /api/bakespecs/:itemGuid
 */
export const deleteBakeSpecController = asyncHandler(async (req, res) => {
  const { itemGuid } = req.params;

  const result = await removeBakeSpec(itemGuid);

  res.status(200).json({
    success: true,
    message: `Bake spec deleted: ${itemGuid}`,
    deletedCount: result.deletedCount,
  });
});

/**
 * Bulk update bake specs
 * POST /api/bakespecs/bulk
 */
export const bulkUpdateBakeSpecsController = asyncHandler(async (req, res) => {
  const { bakeSpecs } = req.body;

  if (!Array.isArray(bakeSpecs)) {
    return res.status(400).json({
      success: false,
      error: {
        message: "bakeSpecs must be an array",
      },
    });
  }

  const result = await updateBakeSpecs(bakeSpecs);

  res.status(200).json({
    success: true,
    message: `Updated ${result.modifiedCount} specs, created ${result.upsertedCount} new specs`,
    ...result,
  });
});

/**
 * Get oven configuration
 * GET /api/bakespecs/oven-config
 */
export const getOvenConfigController = asyncHandler(async (req, res) => {
  const config = getOvenConfig();

  res.status(200).json({
    success: true,
    data: config,
  });
});
