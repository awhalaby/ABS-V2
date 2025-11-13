import { useMemo } from "react";
import {
  formatTime,
  formatNumber,
  formatMinutesToTime,
} from "../../utils/formatters.js";

/**
 * ExpectedOrders component - Displays forecast/expected orders for the day
 * @param {Array} forecast - Daily forecast data
 * @param {Array} timeIntervalForecast - Time-interval forecast data
 */
export default function ExpectedOrders({
  forecast = [],
  timeIntervalForecast = [],
}) {
  // Calculate totals from daily forecast
  const forecastSummary = useMemo(() => {
    if (!forecast || forecast.length === 0) {
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
  }, [forecast]);

  // Calculate time-interval summary if available
  const timeIntervalSummary = useMemo(() => {
    if (!timeIntervalForecast || timeIntervalForecast.length === 0) {
      return null;
    }

    // Group by time interval
    const intervalsMap = new Map();

    timeIntervalForecast.forEach((item) => {
      const interval = item.timeInterval;
      if (interval === undefined || interval === null) return;

      if (!intervalsMap.has(interval)) {
        intervalsMap.set(interval, {
          timeInterval: interval,
          quantity: 0,
        });
      }

      intervalsMap.get(interval).quantity += item.forecast || 0;
    });

    const intervals = Array.from(intervalsMap.values())
      .sort((a, b) => a.timeInterval - b.timeInterval)
      .map((item) => ({
        ...item,
        time: formatMinutesToTime(item.timeInterval),
      }));

    return intervals;
  }, [timeIntervalForecast]);

  if (
    forecastSummary.totalQuantity === 0 &&
    (!timeIntervalSummary || timeIntervalSummary.length === 0)
  ) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Expected Orders
        </h3>
        <div className="text-center py-8 text-gray-500">
          No forecast data available for this date.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Expected Orders
      </h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-700 font-medium mb-1">
            Total Expected Quantity
          </p>
          <p className="text-2xl font-bold text-blue-900">
            {formatNumber(forecastSummary.totalQuantity)}
          </p>
        </div>
      </div>

      {/* Items Breakdown */}
      {forecastSummary.items.length > 0 && (
        <div className="mb-6">
          <h4 className="text-md font-semibold text-gray-900 mb-3">
            Expected by Item
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {forecastSummary.items.map((item) => (
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

      {/* Time Interval Chart */}
      {timeIntervalSummary && timeIntervalSummary.length > 0 && (
        <div>
          <h4 className="text-md font-semibold text-gray-900 mb-3">
            Expected Orders Over Time
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
