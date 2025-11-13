import { getSimulation, updateSimulation } from "./service.js";

/**
 * POS Service - Handle purchases and inventory management
 */

/**
 * Purchase items from simulation inventory
 * @param {string} simulationId - Simulation ID
 * @param {Array<Object>} items - Array of {itemGuid, quantity} objects
 * @param {Object} io - Socket.IO instance for broadcasting updates
 * @returns {Object} Purchase result with updated inventory
 */
export function purchaseItems(simulationId, items, io = null) {
  const simulation = getSimulation(simulationId);
  if (!simulation) {
    throw new Error("Simulation not found");
  }

  if (simulation.status !== "running" && simulation.status !== "paused") {
    throw new Error("Simulation must be running or paused to make purchases");
  }

  const purchaseResults = [];
  const errors = [];

  // Process each item purchase
  items.forEach(({ itemGuid, quantity }) => {
    if (!itemGuid || !quantity || quantity <= 0) {
      errors.push({
        itemGuid,
        error: "Invalid itemGuid or quantity",
      });
      return;
    }

    const currentInventory = simulation.inventory.get(itemGuid) || 0;

    if (currentInventory < quantity) {
      errors.push({
        itemGuid,
        requested: quantity,
        available: currentInventory,
        error: "Insufficient inventory",
      });
      return;
    }

    // Decrease inventory
    const newInventory = currentInventory - quantity;
    simulation.inventory.set(itemGuid, newInventory);

    // Update total inventory stat
    simulation.stats.totalInventory = Array.from(
      simulation.inventory.values()
    ).reduce((sum, qty) => sum + qty, 0);

    // Add purchase event
    simulation.addEvent("purchase", `Purchased ${quantity} of ${itemGuid}`, {
      itemGuid,
      quantity,
      remainingInventory: newInventory,
    });

    purchaseResults.push({
      itemGuid,
      quantity,
      remainingInventory: newInventory,
      success: true,
    });
  });

  // Broadcast inventory update via WebSocket if io is provided
  if (io && purchaseResults.length > 0) {
    io.to(`simulation:${simulationId}`).emit("inventory_update", {
      inventory: Object.fromEntries(simulation.inventory),
      totalInventory: simulation.stats.totalInventory,
      purchase: purchaseResults,
    });
  }

  return {
    success: errors.length === 0,
    purchases: purchaseResults,
    errors: errors.length > 0 ? errors : undefined,
    totalInventory: simulation.stats.totalInventory,
    inventory: Object.fromEntries(simulation.inventory),
  };
}

/**
 * Get available items for purchase
 * @param {string} simulationId - Simulation ID
 * @returns {Object} Available items with quantities
 */
export function getAvailableItems(simulationId) {
  const simulation = getSimulation(simulationId);
  if (!simulation) {
    throw new Error("Simulation not found");
  }

  // Update simulation to get latest state
  if (simulation.status === "running") {
    updateSimulation(simulationId);
  }

  // Get items with inventory > 0
  const availableItems = [];
  simulation.inventory.forEach((quantity, itemGuid) => {
    if (quantity > 0) {
      // Try to find batch info for display name
      const batch = [
        ...simulation.batches,
        ...simulation.completedBatches,
      ].find((b) => b.itemGuid === itemGuid);

      availableItems.push({
        itemGuid,
        displayName: batch?.displayName || itemGuid,
        quantity,
      });
    }
  });

  return {
    items: availableItems,
    totalInventory: simulation.stats.totalInventory,
  };
}
