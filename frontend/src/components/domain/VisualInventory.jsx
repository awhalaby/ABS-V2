import { useMemo } from "react";
import { formatNumber } from "../../utils/formatters.js";
import { parseTimeToMinutes } from "../../utils/timeUtils.js";

/**
 * Visual Inventory Component
 * Shows physical inventory as boxes that change color from red (fresh) to blue (old)
 * Uses FIFO ordering - oldest items shown first
 */

const DEFAULT_FRESH_WINDOW_MINUTES = 240; // 4 hours default

/**
 * Calculate freshness percentage (0 = fresh/red, 1 = old/blue)
 * @param {number} availableAtMinutes - When the batch became available (minutes since midnight)
 * @param {number} currentTimeMinutes - Current simulation time (minutes since midnight)
 * @param {number} freshWindowMinutes - Freshness window duration in minutes
 * @returns {number} Freshness value from 0 (fresh) to 1 (old)
 */
function calculateFreshness(
  availableAtMinutes,
  currentTimeMinutes,
  freshWindowMinutes
) {
  // Age is how many minutes have passed since the batch became available
  const age = Math.max(0, currentTimeMinutes - availableAtMinutes);
  // Freshness is the ratio of age to freshness window (0 = just available, 1 = past window)
  const freshness = Math.min(1, age / freshWindowMinutes);
  return freshness;
}

/**
 * Interpolate color from red (fresh) to blue (old)
 */
function getFreshnessColor(freshness) {
  // Red (fresh) -> Purple -> Blue (old)
  const red = Math.round(255 * (1 - freshness * 0.5)); // 255 -> 127
  const green = Math.round(255 * (1 - freshness)); // 255 -> 0
  const blue = Math.round(127 + 128 * freshness); // 127 -> 255

  return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * Get freshness label
 */
function getFreshnessLabel(freshness) {
  if (freshness < 0.25) return "Fresh";
  if (freshness < 0.5) return "Good";
  if (freshness < 0.75) return "Aging";
  return "Old";
}

export default function VisualInventory({
  inventory = new Map(),
  inventoryUnits = null, // Optional: actual remaining units from backend (FIFO)
  completedBatches = [],
  currentTime = "06:00",
  bakeSpecs = [],
  className = "",
}) {
  // Create a map of itemGuid -> freshWindowMinutes
  const freshWindowMap = useMemo(() => {
    const map = new Map();
    bakeSpecs.forEach((spec) => {
      map.set(
        spec.itemGuid,
        spec.freshWindowMinutes || DEFAULT_FRESH_WINDOW_MINUTES
      );
    });
    return map;
  }, [bakeSpecs]);

  // Reconstruct individual inventory units from batches OR use provided inventoryUnits
  const inventoryUnitsList = useMemo(() => {
    const units = [];
    const currentTimeMinutes = parseTimeToMinutes(currentTime);

    // If backend provides actual remaining units, use those (most accurate for FIFO)
    if (inventoryUnits && typeof inventoryUnits === "object") {
      // Convert inventoryUnits object/Map to array format
      const inventoryUnitsMap =
        inventoryUnits instanceof Map
          ? inventoryUnits
          : new Map(Object.entries(inventoryUnits || {}));

      inventoryUnitsMap.forEach((unitArray, itemGuid) => {
        // Find displayName from completedBatches
        const batch = completedBatches.find((b) => b.itemGuid === itemGuid);
        const displayName = batch?.displayName || itemGuid;
        const freshWindow =
          freshWindowMap.get(itemGuid) || DEFAULT_FRESH_WINDOW_MINUTES;

        unitArray.forEach((unit) => {
          const freshness = calculateFreshness(
            unit.availableAt,
            currentTimeMinutes,
            freshWindow
          );

          units.push({
            itemGuid,
            displayName,
            availableAtMinutes: unit.availableAt,
            freshness,
            batchId: unit.batchId,
          });
        });
      });

      // Units from backend are already sorted oldest first (FIFO)
      return units;
    }

    // Fallback: Reconstruct from completedBatches (for backwards compatibility)
    // Group completed batches by itemGuid
    const batchesByItem = new Map();
    completedBatches.forEach((batch) => {
      if (!batchesByItem.has(batch.itemGuid)) {
        batchesByItem.set(batch.itemGuid, []);
      }
      batchesByItem.get(batch.itemGuid).push(batch);
    });

    // Sort batches by availableAt time (FIFO - oldest first)
    batchesByItem.forEach((batches, itemGuid) => {
      batches.sort((a, b) => {
        // availableAt is in minutes (number), availableTime is a string like "06:00"
        const timeA =
          typeof a.availableAt === "number"
            ? a.availableAt
            : parseTimeToMinutes(a.availableTime || "06:00");
        const timeB =
          typeof b.availableAt === "number"
            ? b.availableAt
            : parseTimeToMinutes(b.availableTime || "06:00");
        return timeA - timeB;
      });
    });

    // Create units for each batch
    batchesByItem.forEach((batches, itemGuid) => {
      const currentInventory = inventory.get(itemGuid) || 0;
      let unitsCreated = 0;

      // Create units from batches (oldest first)
      for (const batch of batches) {
        // availableAt is in minutes (number) - this is when the batch actually became available
        // availableTime is a string like "06:00" - this is the scheduled time
        // Prefer availableAt (actual time) over availableTime (scheduled time)
        let availableAtMinutes;
        if (typeof batch.availableAt === "number" && batch.availableAt > 0) {
          // Use actual available time (in minutes)
          availableAtMinutes = batch.availableAt;
        } else if (batch.availableTime) {
          // Fallback to scheduled time if availableAt not set yet
          availableAtMinutes = parseTimeToMinutes(batch.availableTime);
        } else {
          // Skip batches without timing info
          continue;
        }

        const freshWindow =
          freshWindowMap.get(itemGuid) || DEFAULT_FRESH_WINDOW_MINUTES;

        // Create individual units for this batch
        for (
          let i = 0;
          i < batch.quantity && unitsCreated < currentInventory;
          i++
        ) {
          // Calculate freshness: 0 = fresh (just became available), 1 = old (past freshness window)
          const freshness = calculateFreshness(
            availableAtMinutes,
            currentTimeMinutes,
            freshWindow
          );

          units.push({
            itemGuid,
            displayName: batch.displayName || itemGuid,
            availableAtMinutes,
            freshness,
            batchId: batch.batchId,
          });

          unitsCreated++;
        }
      }
    });

    // Sort all units by availableAtMinutes (oldest first - FIFO)
    // This ensures the oldest items are displayed first (left to right)
    // and will be consumed first when orders come in
    units.sort((a, b) => a.availableAtMinutes - b.availableAtMinutes);

    return units;
  }, [
    inventory,
    inventoryUnits,
    completedBatches,
    currentTime,
    freshWindowMap,
  ]);

  // Get all items that should be displayed (from bakeSpecs or completedBatches)
  const allItems = useMemo(() => {
    const itemsMap = new Map();

    // Add items from bakeSpecs
    bakeSpecs.forEach((spec) => {
      if (!itemsMap.has(spec.itemGuid)) {
        itemsMap.set(spec.itemGuid, {
          itemGuid: spec.itemGuid,
          displayName: spec.displayName || spec.itemGuid,
        });
      }
    });

    // Add items from completedBatches
    completedBatches.forEach((batch) => {
      if (!itemsMap.has(batch.itemGuid)) {
        itemsMap.set(batch.itemGuid, {
          itemGuid: batch.itemGuid,
          displayName: batch.displayName || batch.itemGuid,
        });
      }
    });

    return Array.from(itemsMap.values());
  }, [bakeSpecs, completedBatches]);

  // Group units by SKU
  // Units are already sorted by availableAtMinutes (oldest first) for FIFO
  const inventoryBySKU = useMemo(() => {
    const grouped = new Map();

    // Initialize all items (even with 0 inventory)
    allItems.forEach((item) => {
      grouped.set(item.itemGuid, {
        itemGuid: item.itemGuid,
        displayName: item.displayName,
        units: [],
        totalQuantity: 0,
      });
    });

    // Add units that have inventory
    inventoryUnitsList.forEach((unit) => {
      if (!grouped.has(unit.itemGuid)) {
        grouped.set(unit.itemGuid, {
          itemGuid: unit.itemGuid,
          displayName: unit.displayName,
          units: [],
          totalQuantity: 0,
        });
      }

      const group = grouped.get(unit.itemGuid);
      group.units.push(unit);
      group.totalQuantity++;
    });

    // Return groups in the order they appear (already FIFO sorted)
    return Array.from(grouped.values());
  }, [inventoryUnitsList, allItems]);

  if (inventoryBySKU.length === 0) {
    return (
      <div
        className={`bg-white shadow rounded-lg p-6 flex flex-col ${className}`}
        style={{ minHeight: "1200px", maxHeight: "1200px" }}
      >
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Visual Inventory
        </h3>
        <div className="text-center py-8 text-gray-500 flex-1 flex items-center justify-center">
          No inventory available yet
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white shadow rounded-lg p-6 flex flex-col ${className}`}
      style={{ minHeight: "1200px", maxHeight: "1200px" }}
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">Visual Inventory</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded border-2 border-gray-300"
              style={{ backgroundColor: getFreshnessColor(0) }}
            ></div>
            <span className="text-gray-600">Fresh</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded border-2 border-gray-300"
              style={{ backgroundColor: getFreshnessColor(0.5) }}
            ></div>
            <span className="text-gray-600">Aging</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded border-2 border-gray-300"
              style={{ backgroundColor: getFreshnessColor(1) }}
            ></div>
            <span className="text-gray-600">Old</span>
          </div>
        </div>
      </div>

      <div className="space-y-6 flex-1 overflow-y-auto">
        {inventoryBySKU.map((skuGroup) => {
          const freshWindow =
            freshWindowMap.get(skuGroup.itemGuid) ||
            DEFAULT_FRESH_WINDOW_MINUTES;
          const avgFreshness =
            skuGroup.units.length > 0
              ? skuGroup.units.reduce((sum, u) => sum + u.freshness, 0) /
                skuGroup.units.length
              : 0;

          return (
            <div
              key={skuGroup.itemGuid}
              className="border border-gray-200 rounded-lg p-4"
            >
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900">
                    {skuGroup.displayName}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {formatNumber(skuGroup.totalQuantity)} units • Fresh window:{" "}
                    {freshWindow} min
                  </p>
                </div>
                <div className="text-right">
                  {skuGroup.totalQuantity > 0 ? (
                    <>
                      <div
                        className={`text-sm font-medium ${
                          avgFreshness < 0.5
                            ? "text-green-600"
                            : avgFreshness < 0.75
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {getFreshnessLabel(avgFreshness)}
                      </div>
                      <div className="text-xs text-gray-500">
                        Avg age: {Math.round(avgFreshness * 100)}%
                      </div>
                    </>
                  ) : (
                    <div className="text-sm font-medium text-gray-400">
                      Empty
                    </div>
                  )}
                </div>
              </div>

              {/* Visual boxes grid */}
              <div className="flex flex-wrap gap-1.5">
                {skuGroup.units.length > 0 ? (
                  skuGroup.units.map((unit, index) => {
                    const color = getFreshnessColor(unit.freshness);
                    const isOld = unit.freshness >= 0.75;

                    return (
                      <div
                        key={`${unit.batchId}-${index}`}
                        className="relative group"
                        title={`${unit.displayName} - ${getFreshnessLabel(
                          unit.freshness
                        )} (${Math.round(unit.freshness * 100)}% aged)`}
                      >
                        <div
                          className="w-8 h-8 rounded border-2 transition-all hover:scale-110 hover:z-10 cursor-pointer"
                          style={{
                            backgroundColor: color,
                            borderColor: isOld ? "#dc2626" : "#9ca3af",
                            boxShadow: isOld
                              ? "0 0 4px rgba(220, 38, 38, 0.5)"
                              : "none",
                          }}
                        />
                        {/* Show freshness indicator on hover */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                          <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                            {getFreshnessLabel(unit.freshness)}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="w-full py-8 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
                    No inventory available
                  </div>
                )}
              </div>

              {/* Freshness distribution */}
              {skuGroup.totalQuantity > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>Distribution:</span>
                    <span className="text-green-600">
                      Fresh:{" "}
                      {skuGroup.units.filter((u) => u.freshness < 0.25).length}
                    </span>
                    <span className="text-yellow-600">
                      Good:{" "}
                      {
                        skuGroup.units.filter(
                          (u) => u.freshness >= 0.25 && u.freshness < 0.5
                        ).length
                      }
                    </span>
                    <span className="text-orange-600">
                      Aging:{" "}
                      {
                        skuGroup.units.filter(
                          (u) => u.freshness >= 0.5 && u.freshness < 0.75
                        ).length
                      }
                    </span>
                    <span className="text-red-600">
                      Old:{" "}
                      {skuGroup.units.filter((u) => u.freshness >= 0.75).length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 mb-2">
          <strong>FIFO (First In, First Out):</strong> Boxes are arranged
          left-to-right, oldest first. When orders are processed, items are
          consumed from left to right (oldest items sold first).
        </p>
        <p className="text-xs text-gray-500">
          Colors transition from red (fresh) → purple → blue (old) over the
          freshness window. New batches start red and gradually age to blue.
        </p>
      </div>
    </div>
  );
}
