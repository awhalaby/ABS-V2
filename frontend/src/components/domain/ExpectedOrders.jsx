import { useMemo } from "react";
import {
  formatTime,
  formatNumber,
  formatMinutesToTime,
} from "../../utils/formatters.js";

/**
 * ExpectedOrders/PlannedItems component - Displays forecast or planned items
 * @param {Array} forecast - Daily forecast data (for SchedulePage)
 * @param {Array} timeIntervalForecast - Time-interval forecast data (for SchedulePage)
 * @param {Array} batches - Active batches (for SimulationPage)
 * @param {Array} completedBatches - Completed batches (for SimulationPage)
 */
export default function ExpectedOrders({
  forecast = [],
  timeIntervalForecast = [],
  batches = [],
  completedBatches = [],
}) {
  // Determine if we're showing planned items (from batches) or expected items (from forecast)
  const isPlannedItems =
    (batches && batches.length > 0) ||
    (completedBatches && completedBatches.length > 0);

  // Calculate totals from scheduled batches (for SimulationPage)
  const plannedSummary = useMemo(() => {
    if (!isPlannedItems) {
      return {
        totalItems: 0,
        totalQuantity: 0,
        items: [],
      };
    }

    // Combine all batches (active and completed)
    const allBatches = [...(batches || []), ...(completedBatches || [])];

    if (allBatches.length === 0) {
      return {
        totalItems: 0,
        totalQuantity: 0,
        items: [],
      };
    }

    // Group by item
    const itemsMap = new Map();
    let totalQuantity = 0;

    allBatches.forEach((batch) => {
      const key = batch.itemGuid || batch.displayName;
      if (!key) return;

      if (!itemsMap.has(key)) {
        itemsMap.set(key, {
          itemGuid: batch.itemGuid,
          displayName: batch.displayName || batch.itemGuid,
          quantity: 0,
        });
      }

      const quantity = batch.quantity || 0;
      itemsMap.get(key).quantity += quantity;
      totalQuantity += quantity;
    });

    const items = Array.from(itemsMap.values()).sort(
      (a, b) => b.quantity - a.quantity
    );

    return {
      totalItems: items.length,
      totalQuantity,
      items,
    };
  }, [batches, completedBatches, isPlannedItems]);

  // Calculate totals from forecast (for SchedulePage)
  const forecastSummary = useMemo(() => {
    if (isPlannedItems || !forecast || forecast.length === 0) {
      return {
        totalItems: 0,
        totalQuantity: 0,
        items: [],
      };
    }

    // Group by item
    const itemsMap = new Map();
    let totalQuantity = 0;

    forecast.forEach((item) => {
      const key = item.itemGuid || item.displayName || item.sku;
      if (!key) return;

      if (!itemsMap.has(key)) {
        itemsMap.set(key, {
          itemGuid: item.itemGuid,
          displayName: item.displayName || item.sku,
          quantity: 0,
        });
      }

      const quantity = item.forecast || 0;
      itemsMap.get(key).quantity += quantity;
      totalQuantity += quantity;
    });

    const items = Array.from(itemsMap.values()).sort(
      (a, b) => b.quantity - a.quantity
    );

    return {
      totalItems: items.length,
      totalQuantity,
      items,
    };
  }, [forecast, isPlannedItems]);

  // Use the appropriate summary based on what data is available
  const summary = isPlannedItems ? plannedSummary : forecastSummary;
  const title = isPlannedItems ? "Planned Items" : "Expected Orders";
  const emptyMessage = isPlannedItems
    ? "No batches scheduled for this date."
    : "No forecast data available for this date.";
  const summaryLabel = isPlannedItems
    ? "Total Planned Quantity"
    : "Total Expected Quantity";
  const itemsLabel = isPlannedItems ? "Planned by Item" : "Expected by Item";

  if (summary.totalQuantity === 0) {
    return (
      <div
        className="bg-white shadow rounded-lg p-6 flex flex-col"
        style={{ minHeight: "500px", maxHeight: "500px" }}
      >
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
        <div className="text-center py-8 text-gray-500 flex-1 flex items-center justify-center">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white shadow rounded-lg p-6 flex flex-col"
      style={{ minHeight: "500px", maxHeight: "500px" }}
    >
      <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-700 font-medium mb-1">
            {summaryLabel}
          </p>
          <p className="text-2xl font-bold text-blue-900">
            {formatNumber(summary.totalQuantity)}
          </p>
        </div>
      </div>

      {/* Items Breakdown */}
      <div className="flex-1 overflow-y-auto">
        {summary.items.length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-900 mb-3">
              {itemsLabel}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.items.map((item) => (
                <div
                  key={item.itemGuid || item.displayName}
                  className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.displayName || item.itemGuid}
                  </p>
                  <p className="text-xl font-bold text-gray-700 mt-1">
                    {formatNumber(item.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
