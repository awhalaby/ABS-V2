import { useState, useMemo, useEffect } from "react";
import { forecastAPI } from "../utils/api.js";
import {
  formatNumber,
  formatDate,
  formatPercent,
} from "../utils/formatters.js";
import VelocityChart from "../components/domain/VelocityChart.jsx";
import LoadingSpinner from "../components/common/LoadingSpinner.jsx";
import ErrorMessage from "../components/common/ErrorMessage.jsx";
import { parseISO, format as formatDateFns, subDays } from "date-fns";

export default function ForecastAccuracyPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [overallAccuracy, setOverallAccuracy] = useState(null);
  const [loadingOverall, setLoadingOverall] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    formatDateFns(subDays(new Date(), 1), "yyyy-MM-dd")
  );
  const [selectedItem, setSelectedItem] = useState(null);

  const handleLoadComparison = async () => {
    setLoading(true);
    setError(null);
    setComparisonData(null);

    try {
      const response = await forecastAPI.compareForecastVsActual({
        date: selectedDate,
        timeIntervalMinutes: 20,
      });
      setComparisonData(response.data);
    } catch (err) {
      setError(err.message || "Failed to load forecast comparison");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadOverallAccuracy = async () => {
    setLoadingOverall(true);
    setError(null);
    setOverallAccuracy(null);

    try {
      const response = await forecastAPI.getOverallAccuracy({
        timeIntervalMinutes: 20,
      });
      setOverallAccuracy(response.data);
    } catch (err) {
      setError(err.message || "Failed to load overall accuracy");
    } finally {
      setLoadingOverall(false);
    }
  };

  // Load overall accuracy on mount
  useEffect(() => {
    handleLoadOverallAccuracy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prepare chart data for overall comparison
  const overallChartData = useMemo(() => {
    if (!comparisonData || !comparisonData.comparisonData) return null;

    // Aggregate by time interval across all items
    const timeMap = new Map();

    comparisonData.comparisonData.forEach((record) => {
      const timeSlot = record.timeSlot;
      if (!timeMap.has(timeSlot)) {
        timeMap.set(timeSlot, { forecast: 0, actual: 0 });
      }
      const data = timeMap.get(timeSlot);
      data.forecast += record.forecast || 0;
      data.actual += record.actual || 0;
    });

    // Convert to array and sort by time
    const sortedData = Array.from(timeMap.entries())
      .map(([timeSlot, data]) => ({
        timeSlot,
        forecast: data.forecast,
        actual: data.actual,
        error: data.forecast - data.actual,
      }))
      .sort((a, b) => {
        const [hoursA, minsA] = a.timeSlot.split(":").map(Number);
        const [hoursB, minsB] = b.timeSlot.split(":").map(Number);
        return hoursA * 60 + minsA - (hoursB * 60 + minsB);
      });

    return sortedData;
  }, [comparisonData]);

  // Prepare chart data for selected item
  const itemChartData = useMemo(() => {
    if (!comparisonData || !selectedItem) return null;

    const itemData = comparisonData.comparisonData.filter(
      (record) => record.itemGuid === selectedItem
    );

    return itemData.sort((a, b) => {
      const [hoursA, minsA] = a.timeSlot.split(":").map(Number);
      const [hoursB, minsB] = b.timeSlot.split(":").map(Number);
      return hoursA * 60 + minsA - (hoursB * 60 + minsB);
    });
  }, [comparisonData, selectedItem]);

  // Get unique items for dropdown
  const uniqueItems = useMemo(() => {
    if (!comparisonData) return [];
    const items = new Map();
    comparisonData.comparisonData.forEach((record) => {
      if (!items.has(record.itemGuid)) {
        items.set(record.itemGuid, {
          itemGuid: record.itemGuid,
          displayName: record.displayName,
        });
      }
    });
    return Array.from(items.values());
  }, [comparisonData]);

  // Prepare chart data for forecast vs actual by date
  const dailyTotalsChartData = useMemo(() => {
    if (!overallAccuracy || !overallAccuracy.dateStats) return null;

    // Sort dates chronologically
    const sortedDateStats = [...overallAccuracy.dateStats].sort((a, b) => {
      const dateA = parseISO(a.date);
      const dateB = parseISO(b.date);
      return dateA.getTime() - dateB.getTime();
    });

    return sortedDateStats.flatMap((stat) => [
      {
        date: formatDateFns(parseISO(stat.date), "MMM dd"),
        _originalDate: stat.date,
        quantity: stat.forecastTotal,
        series: "Forecast",
      },
      {
        date: formatDateFns(parseISO(stat.date), "MMM dd"),
        _originalDate: stat.date,
        quantity: stat.actualTotal,
        series: "Actual",
      },
    ]);
  }, [overallAccuracy]);

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Forecast Accuracy Analysis
        </h2>
        <p className="text-gray-600">
          Compare forecasted demand vs actual demand for historical dates to
          evaluate forecast accuracy.
        </p>
      </div>

      {error && (
        <ErrorMessage
          error={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      {/* Overall Accuracy Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Overall Forecast Accuracy
            </h3>
            <p className="text-sm text-gray-500">
              Average percent error across all historical dates
            </p>
          </div>
          <button
            onClick={handleLoadOverallAccuracy}
            disabled={loadingOverall}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:bg-gray-300 disabled:opacity-50 text-sm"
          >
            {loadingOverall ? "Loading..." : "Refresh"}
          </button>
        </div>

        {loadingOverall && <LoadingSpinner />}

        {overallAccuracy && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Average % Error</p>
              <p
                className={`text-3xl font-bold ${
                  overallAccuracy.averagePercentError > 0
                    ? "text-red-600"
                    : overallAccuracy.averagePercentError < 0
                    ? "text-green-600"
                    : "text-gray-900"
                }`}
              >
                {overallAccuracy.averagePercentError > 0 ? "+" : ""}
                {formatPercent(overallAccuracy.averagePercentError / 100)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {overallAccuracy.averagePercentError > 0
                  ? "Over-forecasting"
                  : overallAccuracy.averagePercentError < 0
                  ? "Under-forecasting"
                  : "Perfect"}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Overall % Error</p>
              <p
                className={`text-2xl font-bold ${
                  overallAccuracy.overallPercentError > 0
                    ? "text-red-600"
                    : overallAccuracy.overallPercentError < 0
                    ? "text-green-600"
                    : "text-gray-900"
                }`}
              >
                {overallAccuracy.overallPercentError > 0 ? "+" : ""}
                {formatPercent(overallAccuracy.overallPercentError / 100)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Combined totals</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Dates Analyzed</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatNumber(overallAccuracy.totalDatesAnalyzed)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Forecast:{" "}
                {formatNumber(overallAccuracy.totalForecastAcrossAllDates)} |
                Actual:{" "}
                {formatNumber(overallAccuracy.totalActualAcrossAllDates)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Std Deviation</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatPercent(overallAccuracy.standardDeviation / 100)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Range: {formatPercent(overallAccuracy.minPercentError / 100)} to{" "}
                {formatPercent(overallAccuracy.maxPercentError / 100)}
              </p>
            </div>
          </div>
        )}

        {!overallAccuracy && !loadingOverall && (
          <div className="text-center py-4 text-gray-500 text-sm">
            Click "Refresh" to load overall accuracy statistics
          </div>
        )}
      </div>

      {/* Daily Totals Chart */}
      {dailyTotalsChartData && dailyTotalsChartData.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Forecast vs Actual Totals by Date
          </h3>
          <VelocityChart
            type="line"
            data={dailyTotalsChartData}
            xKey="date"
            yKey="quantity"
            labelKey="series"
            title="Daily Forecast vs Actual Totals"
            height={400}
          />
          <div className="mt-4 flex gap-6 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-blue-500"></div>
              <span>Forecast</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-green-500"></div>
              <span>Actual</span>
            </div>
          </div>
        </div>
      )}

      {/* Day of Week Breakdown */}
      {overallAccuracy && overallAccuracy.dayOfWeekBreakdown && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Accuracy by Day of Week
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Day
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Dates
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Forecast Total
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actual Total
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Avg % Error
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Overall % Error
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Std Dev
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {overallAccuracy.dayOfWeekBreakdown.map((dayStat) => (
                  <tr key={dayStat.dayOfWeek} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {dayStat.dayName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatNumber(dayStat.dateCount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatNumber(dayStat.forecastTotal)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatNumber(dayStat.actualTotal)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={
                          dayStat.averagePercentError > 0
                            ? "text-red-600"
                            : dayStat.averagePercentError < 0
                            ? "text-green-600"
                            : "text-gray-500"
                        }
                      >
                        {dayStat.averagePercentError > 0 ? "+" : ""}
                        {formatPercent(dayStat.averagePercentError / 100)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={
                          dayStat.overallPercentError > 0
                            ? "text-red-600"
                            : dayStat.overallPercentError < 0
                            ? "text-green-600"
                            : "text-gray-500"
                        }
                      >
                        {dayStat.overallPercentError > 0 ? "+" : ""}
                        {formatPercent(dayStat.overallPercentError / 100)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatPercent(dayStat.standardDeviation / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Date Selection */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Date (must be in historical data)
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleLoadComparison}
            disabled={loading || !selectedDate}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:opacity-50 shadow-md"
          >
            {loading ? "Loading..." : "Load Comparison"}
          </button>
        </div>
      </div>

      {loading && <LoadingSpinner />}

      {comparisonData && (
        <div className="space-y-6">
          {/* Overall Statistics */}
          {comparisonData.overallStats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Total Forecast</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(comparisonData.overallStats.totalForecast)}
                </p>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Total Actual</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(comparisonData.overallStats.totalActual)}
                </p>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Accuracy</p>
                <p
                  className={`text-2xl font-bold ${
                    comparisonData.overallStats.accuracy >= 80
                      ? "text-green-600"
                      : comparisonData.overallStats.accuracy >= 60
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {formatPercent(comparisonData.overallStats.accuracy / 100)}
                </p>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Mean Absolute Error</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(
                    comparisonData.overallStats.meanAbsoluteError.toFixed(2)
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Overall Comparison Chart */}
          {overallChartData && overallChartData.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Overall Forecast vs Actual Demand ({formatDate(selectedDate)})
              </h3>
              <VelocityChart
                type="line"
                data={overallChartData.flatMap((d) => [
                  {
                    timeSlot: d.timeSlot,
                    quantity: d.forecast,
                    series: "Forecast",
                  },
                  {
                    timeSlot: d.timeSlot,
                    quantity: d.actual,
                    series: "Actual",
                  },
                ])}
                xKey="timeSlot"
                yKey="quantity"
                labelKey="series"
                title="Forecast vs Actual (All Items)"
                height={400}
              />
              <div className="mt-4 flex gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-blue-500"></div>
                  <span>Forecast</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-green-500"></div>
                  <span>Actual</span>
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-500">
                <p>
                  <strong>RMSE:</strong>{" "}
                  {formatNumber(
                    comparisonData.overallStats.rootMeanSquaredError.toFixed(2)
                  )}
                </p>
                <p>
                  <strong>MAPE:</strong>{" "}
                  {formatPercent(
                    comparisonData.overallStats.meanAbsolutePercentError / 100
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Item Selection */}
          {uniqueItems.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                View Individual Item Analysis
              </label>
              <select
                value={selectedItem || ""}
                onChange={(e) => setSelectedItem(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Items (Overall)</option>
                {uniqueItems.map((item) => (
                  <option key={item.itemGuid} value={item.itemGuid}>
                    {item.displayName || item.itemGuid}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Item-Specific Chart */}
          {selectedItem && itemChartData && itemChartData.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {itemChartData[0]?.displayName || selectedItem} - Forecast vs
                Actual
              </h3>
              <VelocityChart
                type="line"
                data={itemChartData.flatMap((d) => [
                  {
                    timeSlot: d.timeSlot,
                    quantity: d.forecast,
                    series: "Forecast",
                  },
                  {
                    timeSlot: d.timeSlot,
                    quantity: d.actual,
                    series: "Actual",
                  },
                ])}
                xKey="timeSlot"
                yKey="quantity"
                labelKey="series"
                title={`${
                  itemChartData[0]?.displayName || selectedItem
                } - Forecast vs Actual`}
                height={400}
              />
              <div className="mt-4 flex gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-blue-500"></div>
                  <span>Forecast</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-green-500"></div>
                  <span>Actual</span>
                </div>
              </div>
              {comparisonData.itemStats && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {(() => {
                    const itemStat = comparisonData.itemStats.find(
                      (s) => s.itemGuid === selectedItem
                    );
                    if (!itemStat) return null;
                    return (
                      <>
                        <div>
                          <p className="text-gray-500">Forecast Total</p>
                          <p className="font-bold">
                            {formatNumber(itemStat.forecastTotal)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Actual Total</p>
                          <p className="font-bold">
                            {formatNumber(itemStat.actualTotal)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Accuracy</p>
                          <p
                            className={`font-bold ${
                              itemStat.accuracy >= 80
                                ? "text-green-600"
                                : itemStat.accuracy >= 60
                                ? "text-yellow-600"
                                : "text-red-600"
                            }`}
                          >
                            {formatPercent(itemStat.accuracy / 100)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">MAE</p>
                          <p className="font-bold">
                            {formatNumber(
                              itemStat.meanAbsoluteError.toFixed(2)
                            )}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Item Statistics Table */}
          {comparisonData.itemStats && comparisonData.itemStats.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Item-Level Statistics
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Item
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Forecast
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actual
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Error
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Accuracy
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        MAE
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        RMSE
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {comparisonData.itemStats
                      .sort((a, b) => b.actualTotal - a.actualTotal)
                      .map((stat) => (
                        <tr
                          key={stat.itemGuid}
                          className={`hover:bg-gray-50 cursor-pointer ${
                            selectedItem === stat.itemGuid ? "bg-blue-50" : ""
                          }`}
                          onClick={() =>
                            setSelectedItem(
                              selectedItem === stat.itemGuid
                                ? null
                                : stat.itemGuid
                            )
                          }
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {stat.displayName || stat.itemGuid}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatNumber(stat.forecastTotal)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatNumber(stat.actualTotal)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={
                                stat.totalError > 0
                                  ? "text-red-600"
                                  : stat.totalError < 0
                                  ? "text-green-600"
                                  : "text-gray-500"
                              }
                            >
                              {stat.totalError > 0 ? "+" : ""}
                              {formatNumber(stat.totalError)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={
                                stat.accuracy >= 80
                                  ? "text-green-600"
                                  : stat.accuracy >= 60
                                  ? "text-yellow-600"
                                  : "text-red-600"
                              }
                            >
                              {formatPercent(stat.accuracy / 100)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatNumber(stat.meanAbsoluteError.toFixed(2))}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatNumber(stat.rootMeanSquaredError.toFixed(2))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!comparisonData && !loading && (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <p className="text-gray-500">
            Select a date and click "Load Comparison" to see forecast accuracy
            analysis.
          </p>
        </div>
      )}
    </div>
  );
}
