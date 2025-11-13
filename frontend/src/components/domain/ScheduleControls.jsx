import { useState, useEffect } from "react";
import { ABS_DEFAULTS } from "../../config/constants.js";
import { scheduleAPI } from "../../utils/api.js";
import { format as formatDateFns, addDays, parseISO, isBefore } from "date-fns";

/**
 * Schedule controls component - Parameter input form
 */

export default function ScheduleControls({
  onGenerate,
  loading = false,
  className = "",
}) {
  const [date, setDate] = useState(
    formatDateFns(addDays(new Date(), 1), "yyyy-MM-dd")
  );
  const [earliestDate, setEarliestDate] = useState(null);
  const [dateError, setDateError] = useState(null);

  // Fetch earliest order date on mount
  useEffect(() => {
    const fetchEarliestDate = async () => {
      try {
        const response = await scheduleAPI.getEarliestDate();
        setEarliestDate(response.data.earliestDate);
      } catch (err) {
        console.error("Failed to fetch earliest date:", err);
      }
    };
    fetchEarliestDate();
  }, []);

  // Validate date when it changes
  useEffect(() => {
    if (!earliestDate || !date) {
      setDateError(null);
      return;
    }

    const selectedDate = parseISO(date);
    const earliest = parseISO(earliestDate);

    if (isBefore(selectedDate, earliest)) {
      setDateError(`Date must be on or after ${earliestDate}`);
    } else {
      setDateError(null);
    }
  }, [date, earliestDate]);
  const [restockThreshold, setRestockThreshold] = useState(
    ABS_DEFAULTS.RESTOCK_THRESHOLD
  );
  const [targetEndInventory, setTargetEndInventory] = useState(
    ABS_DEFAULTS.TARGET_END_INVENTORY
  );
  const [forecastGrowthRate, setForecastGrowthRate] = useState(1.0);
  const [forecastLookbackWeeks, setForecastLookbackWeeks] = useState(4);

  const handleGenerate = () => {
    onGenerate({
      date,
      restockThreshold,
      targetEndInventory,
      forecastParams: {
        growthRate: forecastGrowthRate,
        lookbackWeeks: forecastLookbackWeeks,
      },
    });
  };

  return (
    <div className={`bg-white shadow rounded-lg p-6 ${className}`}>
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Schedule Parameters
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Schedule Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={earliestDate || formatDateFns(new Date(), "yyyy-MM-dd")}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
              dateError ? "border-red-300" : "border-gray-300"
            }`}
          />
          {dateError && (
            <p className="mt-1 text-xs text-red-600">{dateError}</p>
          )}
          {!dateError && earliestDate && (
            <p className="mt-1 text-xs text-gray-500">
              Date to generate schedule for (earliest data: {earliestDate})
            </p>
          )}
          {!dateError && !earliestDate && (
            <p className="mt-1 text-xs text-gray-500">
              Date to generate schedule for
            </p>
          )}
        </div>

        {/* Restock Threshold */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Restock Threshold
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={restockThreshold}
            onChange={(e) => setRestockThreshold(parseInt(e.target.value, 10))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Minimum inventory to maintain
          </p>
        </div>

        {/* Target End Inventory */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Target End Inventory
          </label>
          <input
            type="number"
            min="0"
            max="50"
            value={targetEndInventory}
            onChange={(e) =>
              setTargetEndInventory(parseInt(e.target.value, 10))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Target inventory at end of day
          </p>
        </div>

        {/* Forecast Growth Rate */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Forecast Growth Rate: {forecastGrowthRate.toFixed(2)}x
          </label>
          <input
            type="range"
            min="0.8"
            max="1.5"
            step="0.05"
            value={forecastGrowthRate}
            onChange={(e) => setForecastGrowthRate(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0.8x</span>
            <span>1.5x</span>
          </div>
        </div>

        {/* Forecast Lookback Weeks */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Forecast Lookback Weeks
          </label>
          <input
            type="number"
            min="1"
            max="12"
            value={forecastLookbackWeeks}
            onChange={(e) =>
              setForecastLookbackWeeks(parseInt(e.target.value, 10))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Weeks of historical data for forecast
          </p>
        </div>
      </div>

      {/* Generate Button */}
      <div className="mt-6">
        <button
          onClick={handleGenerate}
          disabled={loading || !!dateError}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? "Generating Schedule..." : "Generate Schedule"}
        </button>
        {dateError && (
          <p className="mt-2 text-sm text-red-600 text-center">
            Please select a valid date
          </p>
        )}
      </div>
    </div>
  );
}
