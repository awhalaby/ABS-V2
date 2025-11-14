import { useState } from "react";
import { FORECAST_DEFAULTS } from "../../config/constants.js";
import { addDays, format as formatDateFns, parseISO } from "date-fns";

/**
 * Forecast controls component - Parameter input form
 */

export default function ForecastControls({
  onGenerate,
  loading = false,
  className = "",
}) {
  const [lookbackWeeks, setLookbackWeeks] = useState(
    FORECAST_DEFAULTS.LOOKBACK_WEEKS
  );
  const [forecastDays, setForecastDays] = useState(7);
  const [increment, setIncrement] = useState("day");
  const [growthRate, setGrowthRate] = useState(
    FORECAST_DEFAULTS.DEFAULT_GROWTH_RATE
  );
  const [useCustomStartDate, setUseCustomStartDate] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(
    formatDateFns(addDays(new Date(), 1), "yyyy-MM-dd")
  );

  // Update end date preview when start date or forecast days change
  const getEndDatePreview = () => {
    const start = useCustomStartDate
      ? parseISO(customStartDate)
      : addDays(new Date(), 1);
    return formatDateFns(addDays(start, forecastDays - 1), "yyyy-MM-dd");
  };

  const handlePreset = (preset) => {
    const today = new Date();
    let days = 7;

    switch (preset) {
      case "nextWeek":
        days = 7;
        break;
      case "nextMonth":
        days = 30;
        break;
      case "nextQuarter":
        days = 90;
        break;
      default:
        days = 7;
    }

    setForecastDays(days);
    if (!useCustomStartDate) {
      setCustomStartDate(formatDateFns(addDays(today, 1), "yyyy-MM-dd"));
    }
  };

  const handleGenerate = () => {
    const today = new Date();
    const startDate = useCustomStartDate
      ? customStartDate
      : formatDateFns(addDays(today, 1), "yyyy-MM-dd");

    const startDateObj = parseISO(startDate);
    const endDate = formatDateFns(
      addDays(startDateObj, forecastDays - 1),
      "yyyy-MM-dd"
    );

    onGenerate({
      startDate,
      endDate,
      increment,
      growthRate,
      lookbackWeeks,
    });
  };

  return (
    <div className={`bg-white shadow rounded-lg p-6 ${className}`}>
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Forecast Parameters
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Historical Period */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Historical Period (Lookback Weeks)
          </label>
          <input
            type="number"
            min="1"
            max="12"
            value={lookbackWeeks}
            onChange={(e) => setLookbackWeeks(parseInt(e.target.value, 10))}
            className="touch-input w-full border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Number of weeks of historical data to analyze
          </p>
        </div>

        {/* Custom Start Date Toggle */}
        <div>
          <label className="flex items-center space-x-2 mb-2">
            <input
              type="checkbox"
              checked={useCustomStartDate}
              onChange={(e) => setUseCustomStartDate(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Use Custom Start Date
            </span>
          </label>
          {useCustomStartDate && (
            <>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="touch-input w-full border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Forecast will start from this date
              </p>
            </>
          )}
          {!useCustomStartDate && (
            <p className="mt-1 text-xs text-gray-500">
              Start date will be tomorrow (
              {formatDateFns(addDays(new Date(), 1), "yyyy-MM-dd")})
            </p>
          )}
        </div>

        {/* Forecast Period */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Forecast Period (Days)
          </label>
          <input
            type="number"
            min="1"
            max="365"
            value={forecastDays}
            onChange={(e) => setForecastDays(parseInt(e.target.value, 10))}
            className="touch-input w-full border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Number of days to forecast
            {useCustomStartDate && (
              <span className="block mt-1">
                End date: {getEndDatePreview()}
              </span>
            )}
          </p>
        </div>

        {/* Increment */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Aggregation Increment
          </label>
          <select
            value={increment}
            onChange={(e) => setIncrement(e.target.value)}
            className="touch-input w-full border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>

        {/* Growth Rate */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Growth Rate: {growthRate.toFixed(2)}x
          </label>
          <input
            type="range"
            min={FORECAST_DEFAULTS.MIN_GROWTH_RATE}
            max={FORECAST_DEFAULTS.MAX_GROWTH_RATE}
            step="0.05"
            value={growthRate}
            onChange={(e) => setGrowthRate(parseFloat(e.target.value))}
            className="w-full touch-slider h-12"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{FORECAST_DEFAULTS.MIN_GROWTH_RATE}x</span>
            <span>{FORECAST_DEFAULTS.MAX_GROWTH_RATE}x</span>
          </div>
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="mt-6 flex gap-3 flex-wrap">
        <button
          onClick={() => handlePreset("nextWeek")}
          className="touch-button px-6 py-3 text-base bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 shadow-sm active:shadow-none"
        >
          Next Week
        </button>
        <button
          onClick={() => handlePreset("nextMonth")}
          className="touch-button px-6 py-3 text-base bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 shadow-sm active:shadow-none"
        >
          Next Month
        </button>
        <button
          onClick={() => handlePreset("nextQuarter")}
          className="touch-button px-6 py-3 text-base bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 shadow-sm active:shadow-none"
        >
          Next Quarter
        </button>
      </div>

      {/* Generate Button */}
      <div className="mt-6">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="touch-button w-full bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-md active:shadow-sm"
        >
          {loading ? "Generating Forecast..." : "Generate Forecast"}
        </button>
      </div>
    </div>
  );
}
