import express from "express";
import {
  getBakeSpecsController,
  getBakeSpecController,
  saveBakeSpecController,
  deleteBakeSpecController,
  bulkUpdateBakeSpecsController,
  getOvenConfigController,
} from "./controller.js";

const router = express.Router();

/**
 * Bake Specs API Routes
 */

// GET /api/bakespecs - Get all bake specs
router.get("/", getBakeSpecsController);

// GET /api/bakespecs/oven-config - Get oven configuration
router.get("/oven-config", getOvenConfigController);

// GET /api/bakespecs/:itemGuid - Get bake spec by itemGuid
router.get("/:itemGuid", getBakeSpecController);

// POST /api/bakespecs - Create or update bake spec
router.post("/", saveBakeSpecController);

// PUT /api/bakespecs/:itemGuid - Update bake spec
router.put("/:itemGuid", saveBakeSpecController);

// DELETE /api/bakespecs/:itemGuid - Delete bake spec
router.delete("/:itemGuid", deleteBakeSpecController);

// POST /api/bakespecs/bulk - Bulk update bake specs
router.post("/bulk", bulkUpdateBakeSpecsController);

export default router;
