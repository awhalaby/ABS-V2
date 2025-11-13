import { useMemo } from "react";
import { formatNumber, formatMinutesToTime } from "../../utils/formatters.js";

/**
 * Helper function to convert time string (HH:mm) to minutes since midnight
 * @param {string} timeStr - Time string in HH:mm format
 * @returns {number} Minutes since midnight
 */
function timeStringToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const [hours, minutes] = timeStr.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * ActualOrders component - Displays actual orders/purchases by item that update in real-time
 * @param {Array} processedOrdersByItem - Array of processed order summaries by item (from backend)
 */
export default function ActualOrders({ processedOrdersByItem = [] }) {
  // Calculate summary from processed orders
  const ordersSummary = useMemo(() => {
    if (!processedOrdersByItem || processedOrdersByItem.length === 0) {
      return {
        totalQuantity: 0,
        items: [],
      };
    }

    let totalQuantity = 0;

    const items = processedOrdersByItem
      .map((item) => ({
        ...item,
        displayName: item.displayName || item.itemGuid,
      }))
      .sort((a, b) => (b.totalQuantity || 0) - (a.totalQuantity || 0));

    items.forEach((item) => {
      totalQuantity += item.totalQuantity || 0;
    });

    return {
      totalQuantity,
      items,
    };
  }, [processedOrdersByItem]);

  // Calculate time-interval summary from orders
  const timeIntervalSummary = useMemo(() => {
    if (!processedOrdersByItem || processedOrdersByItem.length === 0) {
      return null;
    }

    // Collect all orders with their time intervals
    const intervalsMap = new Map();

    processedOrdersByItem.forEach((item) => {
      if (!item.orders || item.orders.length === 0) return;

      item.orders.forEach((order) => {
        if (!order.time) return;

        // Convert time string to minutes, then round to 10-minute interval
        const minutes = timeStringToMinutes(order.time);
        if (minutes === null) return;

        const intervalStart = Math.floor(minutes / 10) * 10; // Round to 10-minute intervals

        if (!intervalsMap.has(intervalStart)) {
          intervalsMap.set(intervalStart, {
            timeInterval: intervalStart,
            quantity: 0,
          });
        }

        intervalsMap.get(intervalStart).quantity += order.quantity || 0;
      });
    });

    const intervals = Array.from(intervalsMap.values())
      .sort((a, b) => a.timeInterval - b.timeInterval)
      .map((item) => ({
        ...item,
        time: formatMinutesToTime(item.timeInterval),
      }));

    return intervals.length > 0 ? intervals : null;
  }, [processedOrdersByItem]);

  if (
    ordersSummary.totalQuantity === 0 &&
    (!timeIntervalSummary || timeIntervalSummary.length === 0)
  ) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Actual Orders
        </h3>
        <div className="text-center py-8 text-gray-500">
          No orders processed yet. Orders will appear here as they are
          fulfilled.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Actual Orders</h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-700 font-medium mb-1">
            Total Actual Quantity
          </p>
          <p className="text-2xl font-bold text-blue-900">
            {formatNumber(ordersSummary.totalQuantity)}
          </p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-700 font-medium mb-1">
            Number of Items
          </p>
          <p className="text-2xl font-bold text-green-900">
            {formatNumber(ordersSummary.items.length)}
          </p>
        </div>
        {timeIntervalSummary && timeIntervalSummary.length > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-purple-700 font-medium mb-1">
              Time Intervals
            </p>
            <p className="text-2xl font-bold text-purple-900">
              {formatNumber(timeIntervalSummary.length)}
            </p>
          </div>
        )}
      </div>

      {/* Items Breakdown */}
      {ordersSummary.items.length > 0 && (
        <div className="mb-6">
          <h4 className="text-md font-semibold text-gray-900 mb-3">
            Actual by Item
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ordersSummary.items.map((item) => (
              <div
                key={item.itemGuid || item.displayName}
                className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.displayName || item.itemGuid}
                </p>
                <p className="text-xl font-bold text-gray-700 mt-1">
                  {formatNumber(item.totalQuantity || 0)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time Interval Chart */}
      {timeIntervalSummary && timeIntervalSummary.length > 0 && (
        <div>
          <h4 className="text-md font-semibold text-gray-900 mb-3">
            Actual Orders Over Time
          </h4>
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {timeIntervalSummary.map((interval, idx) => {
                const maxQuantity = Math.max(
                  ...timeIntervalSummary.map((i) => i.quantity),
                  1
                );
                const percentage = (interval.quantity / maxQuantity) * 100;

                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-20 text-xs font-mono text-gray-600 flex-shrink-0">
                      {interval.time}
                    </div>
                    <div className="flex-1 bg-gray-200 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all flex items-center justify-end pr-2"
                        style={{ width: `${percentage}%` }}
                      >
                        {interval.quantity > 0 && (
                          <span className="text-xs font-semibold text-white">
                            {formatNumber(interval.quantity)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-16 text-right text-sm font-semibold text-gray-700 flex-shrink-0">
                      {formatNumber(interval.quantity)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
