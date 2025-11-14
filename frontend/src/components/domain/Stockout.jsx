import { useMemo } from "react";
import { formatNumber } from "../../utils/formatters.js";

/**
 * Stockout component - Displays missed orders by item due to stockouts
 * @param {Array} missedOrders - Array of missed order summaries by item (from backend)
 * @param {Array} events - Optional: Array of simulation events (fallback if missedOrders not available)
 */
export default function Stockout({ missedOrders = [], events = [] }) {
  // Calculate summary from missedOrders if available, otherwise fall back to events
  const stockoutSummary = useMemo(() => {
    // If we have missedOrders from backend, use that (more accurate)
    if (missedOrders && missedOrders.length > 0) {
      let totalMissedOrders = 0;
      let totalMissedQuantity = 0;

      missedOrders.forEach((item) => {
        totalMissedOrders += item.count || 0;
        totalMissedQuantity += item.totalRequested || 0;
      });

      return {
        totalMissedOrders,
        totalMissedQuantity,
        items: missedOrders.sort(
          (a, b) => (b.totalRequested || 0) - (a.totalRequested || 0)
        ),
      };
    }

    // Fallback: aggregate from events
    const missedOrdersByItem = new Map();
    let totalMissedOrders = 0;
    let totalMissedQuantity = 0;

    events.forEach((event) => {
      if (event.type === "order_missed" && event.data) {
        const { itemGuid, requestedQuantity, availableInventory, orderId } =
          event.data;

        if (!itemGuid) return;

        if (!missedOrdersByItem.has(itemGuid)) {
          missedOrdersByItem.set(itemGuid, {
            itemGuid,
            displayName: event.data.displayName || itemGuid,
            count: 0,
            totalRequested: 0,
            totalAvailable: 0,
            orders: [],
          });
        }

        const itemData = missedOrdersByItem.get(itemGuid);
        itemData.count++;
        itemData.totalRequested += requestedQuantity || 0;
        itemData.totalAvailable += availableInventory || 0;
        itemData.orders.push({
          orderId,
          requestedQuantity: requestedQuantity || 0,
          availableInventory: availableInventory || 0,
          time: event.timeString || event.time || "",
        });

        totalMissedOrders++;
        totalMissedQuantity += requestedQuantity || 0;
      }
    });

    const items = Array.from(missedOrdersByItem.values()).sort(
      (a, b) => b.totalRequested - a.totalRequested
    );

    return {
      totalMissedOrders,
      totalMissedQuantity,
      items,
    };
  }, [missedOrders, events]);

  if (stockoutSummary.totalMissedOrders === 0) {
    return (
      <div
        className="bg-white shadow rounded-lg p-6 flex flex-col"
        style={{ minHeight: "500px", maxHeight: "500px" }}
      >
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Stockouts & Missed Orders
        </h3>
        <div className="text-center py-8 flex-1 flex flex-col items-center justify-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium">No Stockouts</p>
          <p className="text-sm text-gray-500 mt-1">
            All orders were successfully fulfilled
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white shadow rounded-lg p-6 flex flex-col"
      style={{ minHeight: "500px", maxHeight: "500px" }}
    >
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Stockouts & Missed Orders
      </h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700 font-medium mb-1">
            Total Missed Orders
          </p>
          <p className="text-2xl font-bold text-red-900">
            {formatNumber(stockoutSummary.totalMissedOrders)}
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm text-orange-700 font-medium mb-1">
            Total Missed Quantity
          </p>
          <p className="text-2xl font-bold text-orange-900">
            {formatNumber(stockoutSummary.totalMissedQuantity)}
          </p>
        </div>
      </div>

      {/* Items Breakdown */}
      <div className="flex-1 overflow-y-auto">
        <h4 className="text-md font-semibold text-gray-900 mb-3">
          Missed Orders by Item
        </h4>
        <div className="space-y-3">
          {stockoutSummary.items.map((item) => (
            <div
              key={item.itemGuid}
              className="border border-red-200 rounded-lg p-4 bg-red-50"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-900">
                    {item.displayName}
                  </p>
                  <p className="text-xs text-gray-500 font-mono mt-1">
                    {item.itemGuid}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Missed Orders</p>
                  <p className="text-xl font-bold text-red-600">
                    {formatNumber(item.count || item.orderCount || 0)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-red-200">
                <div>
                  <p className="text-xs text-gray-600">Requested</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatNumber(item.totalRequested || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Available</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {formatNumber(item.totalAvailable || 0)}
                  </p>
                </div>
              </div>

              {/* Show individual orders if there are only a few */}
              {item.orders &&
                item.orders.length <= 5 &&
                item.orders.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-red-200">
                    <p className="text-xs font-medium text-gray-700 mb-2">
                      Individual Orders:
                    </p>
                    <div className="space-y-1">
                      {item.orders.map((order, idx) => (
                        <div
                          key={idx}
                          className="text-xs text-gray-600 flex justify-between"
                        >
                          <span>
                            Order {order.orderId?.slice(-8) || idx + 1}
                            {order.time && ` @ ${order.time}`}
                          </span>
                          <span className="font-semibold">
                            Requested: {formatNumber(order.requestedQuantity)} /
                            Available: {formatNumber(order.availableInventory)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
