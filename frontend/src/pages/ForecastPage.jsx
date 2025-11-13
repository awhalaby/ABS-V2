import { useState } from "react";
import { forecastAPI } from "../utils/api.js";
import {
  formatNumber,
  formatDate,
  formatCurrency,
  formatPercent,
} from "../utils/formatters.js";
import ForecastControls from "../components/domain/ForecastControls.jsx";
import ForecastTable from "../components/domain/ForecastTable.jsx";
import VelocityChart from "../components/domain/VelocityChart.jsx";
import LoadingSpinner from "../components/common/LoadingSpinner.jsx";
import ErrorMessage from "../components/common/ErrorMessage.jsx";
import { parseISO, format as formatDateFns } from "date-fns";

export default function ForecastPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [historicalData, setHistoricalData] = useState(null);

  const handleGenerate = async (params) => {
    setLoading(true);
    setError(null);
    setForecastData(null);

    try {
      const response = await forecastAPI.generate(params);
      setForecastData(response);

      // Load historical data for comparison
      // This would ideally come from velocity API
      // For now, we'll use the dailyForecast data
    } catch (err) {
      setError(err.message || "Failed to generate forecast");
    } finally {
      setLoading(false);
    }
  };

  // Prepare chart data combining historical and forecast
  const getChartData = () => {
    if (!forecastData) return null;

    const { dailyForecast, summary } = forecastData;

    // Group by SKU for multi-series chart
    const skuMap = new Map();

    dailyForecast.forEach((record) => {
      const sku = record.displayName || record.sku;
      if (!skuMap.has(sku)) {
        skuMap.set(sku, []);
      }
      skuMap.get(sku).push({
        date: record.date,
        forecast: record.forecast,
        baseAverage: record.baseAverage,
      });
    });

    // Convert to array format for chart
    const allDates = [...new Set(dailyForecast.map((r) => r.date))].sort();

    return {
      dates: allDates,
      series: Array.from(skuMap.entries()).map(([sku, data]) => ({
        label: sku,
        data: allDates.map((date) => {
          const record = data.find((d) => d.date === date);
          return record ? record.forecast : 0;
        }),
      })),
    };
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Forecast Engine
        </h2>
        <p className="text-gray-600">
          Predict future demand using historical patterns and growth rates.
        </p>
      </div>

      {error && (
        <ErrorMessage
          error={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      {/* Controls */}
      <div className="mb-6">
        <ForecastControls onGenerate={handleGenerate} loading={loading} />
      </div>

      {/* Results */}
      {forecastData && (
        <div className="space-y-6">
          {/* Summary Cards */}
          {forecastData.summary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Total Forecast</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(forecastData.summary.totalForecast)}
                </p>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Unique SKUs</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(forecastData.summary.uniqueSKUs)}
                </p>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Periods</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(forecastData.summary.periods)}
                </p>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Avg per Period</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(
                    Math.round(forecastData.summary.averagePerPeriod)
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Chart */}
          {forecastData.dailyForecast &&
            forecastData.dailyForecast.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Forecast Trend
                </h3>
                <VelocityChart
                  type="line"
                  data={forecastData.dailyForecast.map((d) => ({
                    date: formatDateFns(parseISO(d.date), "MMM dd"),
                    forecast: d.forecast,
                    sku: d.displayName || d.sku,
                  }))}
                  xKey="date"
                  yKey="forecast"
                  labelKey="sku"
                  title="Forecast by SKU"
                  height={400}
                />
              </div>
            )}

          {/* Forecast Table */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Forecast Details
              </h3>
              {forecastData.cached && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  Cached
                </span>
              )}
            </div>
            <ForecastTable data={forecastData.data || []} />
          </div>

          {/* Historical vs Forecast Comparison */}
          {forecastData.dailyForecast && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Historical Average vs Forecast
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Historical Patterns
                  </h4>
                  <div className="space-y-2">
                    {forecastData.dailyForecast
                      .slice(0, 10)
                      .map((record, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between text-sm border-b pb-2"
                        >
                          <span>{record.displayName || record.sku}</span>
                          <span className="text-gray-600">
                            Avg: {formatNumber(Math.round(record.baseAverage))}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Forecast Preview
                  </h4>
                  <div className="space-y-2">
                    {forecastData.dailyForecast
                      .slice(0, 10)
                      .map((record, idx) => {
                        const growth =
                          record.baseAverage > 0
                            ? ((record.forecast - record.baseAverage) /
                                record.baseAverage) *
                              100
                            : 0;
                        return (
                          <div
                            key={idx}
                            className="flex justify-between text-sm border-b pb-2"
                          >
                            <span>{record.displayName || record.sku}</span>
                            <span
                              className={
                                growth > 0
                                  ? "text-green-600"
                                  : growth < 0
                                  ? "text-red-600"
                                  : "text-gray-600"
                              }
                            >
                              {formatNumber(record.forecast)} (
                              {growth > 0 ? "+" : ""}
                              {formatPercent(growth / 100)})
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!forecastData && !loading && (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <p className="text-gray-500">
            Configure parameters above and click "Generate Forecast" to see
            predictions.
          </p>
        </div>
      )}
    </div>
  );
}
