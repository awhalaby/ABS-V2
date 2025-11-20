import { useState, useEffect, useMemo } from "react";
import { velocityAPI } from "../utils/api.js";
import { formatNumber, formatCurrency } from "../utils/formatters.js";
import DateRangePicker from "../components/common/DateRangePicker.jsx";
import LoadingSpinner from "../components/common/LoadingSpinner.jsx";
import ErrorMessage from "../components/common/ErrorMessage.jsx";
import VelocityTable from "../components/domain/VelocityTable.jsx";
import VelocityChart from "../components/domain/VelocityChart.jsx";
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format as formatDateFns,
  parseISO,
  subDays,
} from "date-fns";

const MAX_CHART_SKUS = 10;

const SUMMARY_CARDS = [
  { key: "totalOrders", label: "Total Orders", formatter: formatNumber },
  { key: "totalItems", label: "Total Items", formatter: formatNumber },
  { key: "totalRevenue", label: "Total Revenue", formatter: formatCurrency },
  { key: "uniqueSKUs", label: "Unique SKUs", formatter: formatNumber },
];

const sanitizeForFilename = (value) =>
  value ? value.replace(/[^\w.-]+/g, "_") : "";

const getPreviousRange = (start, end) => {
  if (!start || !end) return null;

  try {
    const startDateObj = parseISO(start);
    const endDateObj = parseISO(end);
    if (isNaN(startDateObj) || isNaN(endDateObj)) {
      return null;
    }

    const daySpan = differenceInCalendarDays(endDateObj, startDateObj) + 1;
    if (daySpan <= 0) {
      return null;
    }

    const previousPeriodEnd = subDays(startDateObj, 1);
    const previousPeriodStart = subDays(previousPeriodEnd, daySpan - 1);

    return {
      start: formatDateFns(previousPeriodStart, "yyyy-MM-dd"),
      end: formatDateFns(previousPeriodEnd, "yyyy-MM-dd"),
    };
  } catch (error) {
    console.error("Error computing previous range:", error);
    return null;
  }
};

// Fill missing dates with zero values for complete chart display
const fillMissingDates = (data, start, end, maxSkus = MAX_CHART_SKUS) => {
  if (!data || data.length === 0 || !start || !end) return data;

  try {
    const startDateObj = parseISO(start);
    const endDateObj = parseISO(end);
    const allDates = eachDayOfInterval({
      start: startDateObj,
      end: endDateObj,
    });

    // Determine top SKUs by total quantity
    const skuTotals = new Map();
    data.forEach((record) => {
      const key = record.itemGuid || record.displayName || "";
      if (!skuTotals.has(key)) {
        skuTotals.set(key, {
          key,
          itemGuid: record.itemGuid || "",
          displayName: record.displayName || "",
          total: 0,
        });
      }
      const entry = skuTotals.get(key);
      entry.total += record.totalQuantity || 0;
    });

    const rankedSkus = Array.from(skuTotals.values()).sort(
      (a, b) => b.total - a.total
    );
    const limitedSkus = rankedSkus.slice(0, maxSkus);
    const shouldLimit = skuTotals.size > maxSkus;
    const allowedKeys = shouldLimit
      ? new Set(limitedSkus.map((sku) => sku.key))
      : null;

    const baseData = allowedKeys
      ? data.filter((record) =>
          allowedKeys.has(record.itemGuid || record.displayName || "")
        )
      : data;

    const uniqueSKUs = shouldLimit
      ? limitedSkus.map((sku) => ({
          itemGuid: sku.itemGuid,
          displayName: sku.displayName,
        }))
      : Array.from(
          new Map(
            baseData.map((d) => [
              d.itemGuid || d.displayName || "",
              {
                itemGuid: d.itemGuid || "",
                displayName: d.displayName || "",
              },
            ])
          ).values()
        );

    // Create a map of existing data by date and SKU
    const dataMap = new Map();
    baseData.forEach((record) => {
      const key = `${record.date}_${record.itemGuid || record.displayName}`;
      dataMap.set(key, record);
    });

    // Fill in missing dates with zero values
    const filledData = [];
    allDates.forEach((date) => {
      const dateStr = formatDateFns(date, "yyyy-MM-dd");
      uniqueSKUs.forEach((sku) => {
        const key = `${dateStr}_${sku.itemGuid || sku.displayName}`;
        const existing = dataMap.get(key);

        if (existing) {
          filledData.push(existing);
        } else {
          // Create zero-value record for missing date/SKU combination
          filledData.push({
            date: dateStr,
            itemGuid: sku.itemGuid || "",
            displayName: sku.displayName || "",
            totalQuantity: 0,
            orderCount: 0,
            totalRevenue: 0,
            dayOfWeek: formatDateFns(date, "EEEE"),
            dayOfWeekAbbr: formatDateFns(date, "EEE"),
          });
        }
      });
    });

    // Sort by date and SKU
    return filledData
      .filter((entry) => entry.displayName || entry.itemGuid)
      .sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        return (a.displayName || a.itemGuid || "").localeCompare(
          b.displayName || b.itemGuid || ""
        );
      });
  } catch (error) {
    console.error("Error filling missing dates:", error);
    return data;
  }
};

export default function VelocityPage() {
  const [activeTab, setActiveTab] = useState("weekly");
  const [loadingStates, setLoadingStates] = useState({
    weekly: false,
    daily: false,
    intraday: false,
  });
  const [error, setError] = useState(null);

  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const date = addDays(new Date(), -28); // Last 4 weeks
    return formatDateFns(date, "yyyy-MM-dd");
  });
  const [endDate, setEndDate] = useState(() => {
    return formatDateFns(new Date(), "yyyy-MM-dd");
  });

  // Weekly data
  const [weeklyData, setWeeklyData] = useState([]);
  const [weeklySummary, setWeeklySummary] = useState(null);
  const [weeklyComparison, setWeeklyComparison] = useState(null);

  // Daily data
  const [dailyData, setDailyData] = useState([]);
  const [dailySummary, setDailySummary] = useState(null);
  const [dailyComparison, setDailyComparison] = useState(null);
  const [skuFilter, setSkuFilter] = useState("");

  // Intraday data
  const [intradayData, setIntradayData] = useState([]);
  const [intradaySummary, setIntradaySummary] = useState(null);
  const [selectedItemGuid, setSelectedItemGuid] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => {
    return formatDateFns(new Date(), "yyyy-MM-dd");
  });
  const [intervalMinutes, setIntervalMinutes] = useState(20);
  const [availableSKUs, setAvailableSKUs] = useState([]);

  const setLoadingState = (key, value) => {
    setLoadingStates((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const isTabLoading =
    activeTab === "intraday"
      ? loadingStates.daily || loadingStates.intraday
      : loadingStates[activeTab];

  const totalDailySkus = useMemo(() => {
    const skuSet = new Set();
    dailyData.forEach((record) => {
      const key = record.itemGuid || record.displayName;
      if (key) {
        skuSet.add(key);
      }
    });
    return skuSet.size;
  }, [dailyData]);

  const dailyChartData = useMemo(
    () => fillMissingDates(dailyData, startDate, endDate, MAX_CHART_SKUS),
    [dailyData, startDate, endDate]
  );

  const currentSummary = activeTab === "weekly" ? weeklySummary : dailySummary;
  const previousSummary =
    activeTab === "weekly" ? weeklyComparison : dailyComparison;

  const comparisonFileSuffix = `${startDate}-to-${endDate}`;
  const weeklyExportName = `velocity-weekly-${comparisonFileSuffix}.csv`;
  const dailyFilterToken = sanitizeForFilename(skuFilter || "all");
  const dailyExportName = `velocity-daily-${comparisonFileSuffix}-${dailyFilterToken}.csv`;
  const intradayExportName = `velocity-intraday-${sanitizeForFilename(
    selectedItemGuid || "all"
  )}-${selectedDate}.csv`;

  // Load weekly data
  const loadWeeklyData = async () => {
    setLoadingState("weekly", true);
    setError(null);
    try {
      const previousRange = getPreviousRange(startDate, endDate);
      const [currentResponse, previousResponse] = await Promise.all([
        velocityAPI.getWeekly(startDate, endDate),
        previousRange
          ? velocityAPI.getWeekly(previousRange.start, previousRange.end)
          : Promise.resolve(null),
      ]);
      setWeeklyData(currentResponse.data || []);
      setWeeklySummary(currentResponse.summary || null);
      setWeeklyComparison(previousResponse?.summary || null);
    } catch (err) {
      setError(err.message || "Failed to load weekly velocity data");
      setWeeklyComparison(null);
    } finally {
      setLoadingState("weekly", false);
    }
  };

  // Load daily data
  const loadDailyData = async () => {
    setLoadingState("daily", true);
    setError(null);
    try {
      const previousRange = getPreviousRange(startDate, endDate);
      const currentPromise = velocityAPI.getDaily(
        startDate,
        endDate,
        skuFilter || undefined
      );
      const previousPromise = previousRange
        ? velocityAPI.getDaily(
            previousRange.start,
            previousRange.end,
            skuFilter || undefined
          )
        : Promise.resolve(null);

      const [currentResponse, previousResponse] = await Promise.all([
        currentPromise,
        previousPromise,
      ]);
      setDailyData(currentResponse.data || []);
      setDailySummary(currentResponse.summary || null);
      setDailyComparison(previousResponse?.summary || null);
    } catch (err) {
      setError(err.message || "Failed to load daily velocity data");
      setDailyComparison(null);
    } finally {
      setLoadingState("daily", false);
    }
  };

  // Load intraday data
  const loadIntradayData = async () => {
    if (!selectedItemGuid) {
      setError("Please select an item");
      return;
    }

    setLoadingState("intraday", true);
    setError(null);
    try {
      const response = await velocityAPI.getIntraday(
        selectedItemGuid,
        selectedDate,
        intervalMinutes
      );
      setIntradayData(response.data || []);
      setIntradaySummary(response.summary || null);
    } catch (err) {
      setError(err.message || "Failed to load intraday velocity data");
    } finally {
      setLoadingState("intraday", false);
    }
  };

  // Load weekly data when tab or date range changes
  useEffect(() => {
    if (activeTab === "weekly") {
      loadWeeklyData();
    }
  }, [activeTab, startDate, endDate]);

  // Load daily data when needed for the daily or intraday tabs
  useEffect(() => {
    if (activeTab === "daily" || activeTab === "intraday") {
      loadDailyData();
    }
  }, [activeTab, startDate, endDate, skuFilter]);

  // Extract unique SKUs from daily data for intraday selector
  useEffect(() => {
    if (dailyData.length > 0) {
      const skus = [
        ...new Map(
          dailyData
            .filter((d) => d.itemGuid)
            .map((d) => [d.itemGuid, { guid: d.itemGuid, name: d.displayName }])
        ).values(),
      ];
      setAvailableSKUs(skus);

      if (
        skus.length > 0 &&
        (!selectedItemGuid ||
          !skus.some((sku) => sku.guid === selectedItemGuid))
      ) {
        setSelectedItemGuid(skus[0].guid);
      }
    } else {
      setAvailableSKUs([]);
      setSelectedItemGuid("");
    }
  }, [dailyData, selectedItemGuid]);

  // Load intraday when selection changes
  useEffect(() => {
    if (activeTab === "intraday" && selectedItemGuid) {
      loadIntradayData();
    }
  }, [activeTab, selectedItemGuid, selectedDate, intervalMinutes]);

  const handleDateRangeChange = ({ startDate: newStart, endDate: newEnd }) => {
    setStartDate(newStart);
    setEndDate(newEnd);
  };

  const averagePerBucketDisplay = intradaySummary
    ? Number(intradaySummary.averagePerBucket.toFixed(1))
    : 0;

  const renderComparisonDetails = (current, previous, formatter) => {
    if (previous === null || previous === undefined) {
      return <p className="text-xs text-gray-400">No previous period data</p>;
    }

    const absolute = current - previous;
    const percent = previous === 0 ? null : (absolute / previous) * 100;
    const trendClass =
      absolute > 0
        ? "text-green-600"
        : absolute < 0
        ? "text-red-600"
        : "text-gray-500";
    const sign = absolute > 0 ? "+" : absolute < 0 ? "-" : "";
    const formattedDelta = formatter(Math.abs(absolute));
    const percentText =
      percent === null
        ? ""
        : ` (${percent > 0 ? "+" : percent < 0 ? "-" : ""}${Math.abs(
            percent
          ).toFixed(1)}%)`;

    return (
      <>
        <p className={`text-xs font-medium ${trendClass}`}>
          {sign}
          {formattedDelta}
          {percentText} vs prev
        </p>
        <p className="text-xs text-gray-400">
          Prev: {formatter(previous || 0)}
        </p>
      </>
    );
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Velocity Dashboard
        </h2>
        <p className="text-gray-600">
          Analyze sales patterns across weekly, daily, and intraday timeframes.
        </p>
      </div>

      {error && (
        <ErrorMessage
          error={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      {/* Date Range Selector */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={handleDateRangeChange}
        />
      </div>

      {/* Summary Cards */}
      {currentSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {SUMMARY_CARDS.map((card) => {
            const currentValue =
              typeof currentSummary[card.key] === "number"
                ? currentSummary[card.key]
                : 0;
            const previousValue =
              typeof previousSummary?.[card.key] === "number"
                ? previousSummary[card.key]
                : null;

            return (
              <div key={card.key} className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {card.formatter(currentValue)}
                </p>
                {renderComparisonDetails(
                  currentValue,
                  previousValue,
                  card.formatter
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {[
              { id: "weekly", label: "Weekly" },
              { id: "daily", label: "Daily" },
              { id: "intraday", label: "Intraday" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === tab.id
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {isTabLoading && (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          )}

          {/* Weekly Tab */}
          {activeTab === "weekly" && !isTabLoading && (
            <div className="space-y-6">
              <VelocityChart
                type="line"
                data={weeklyData.map((d) => ({
                  ...d,
                  weekLabel: `${d.year}-W${String(d.week).padStart(2, "0")}`,
                }))}
                xKey="weekLabel"
                yKey="totalQuantity"
                labelKey="displayName"
                title="Weekly Velocity Trends"
                height={400}
              />
              <VelocityTable
                data={weeklyData}
                columns={[
                  { key: "displayName", label: "SKU" },
                  { key: "year", label: "Year" },
                  { key: "week", label: "Week" },
                  { key: "totalQuantity", label: "Total Qty" },
                  { key: "orderCount", label: "Orders" },
                  { key: "avgPerDay", label: "Avg/Day" },
                ]}
                sortable={true}
                enableExport={true}
                exportFileName={weeklyExportName}
              />
            </div>
          )}

          {/* Daily Tab */}
          {activeTab === "daily" && !isTabLoading && (
            <div className="space-y-6">
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Filter by SKU..."
                  value={skuFilter}
                  onChange={(e) => setSkuFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {totalDailySkus > MAX_CHART_SKUS && (
                <p className="text-xs text-gray-500">
                  Showing top {MAX_CHART_SKUS} SKUs by total quantity for chart
                  clarity.
                </p>
              )}
              <VelocityChart
                type="bar"
                data={dailyChartData}
                xKey="date"
                yKey="totalQuantity"
                labelKey="displayName"
                title="Daily Velocity"
                height={400}
              />
              <VelocityTable
                data={dailyData}
                columns={[
                  { key: "displayName", label: "SKU" },
                  { key: "date", label: "Date" },
                  { key: "dayOfWeek", label: "Day of Week" },
                  { key: "totalQuantity", label: "Quantity" },
                  { key: "orderCount", label: "Orders" },
                ]}
                sortable={true}
                filterable={true}
                enableExport={true}
                exportFileName={dailyExportName}
              />
            </div>
          )}

          {/* Intraday Tab */}
          {activeTab === "intraday" && !isTabLoading && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Item
                  </label>
                  <select
                    value={selectedItemGuid}
                    onChange={(e) => setSelectedItemGuid(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select an item...</option>
                    {availableSKUs.map((sku) => (
                      <option key={sku.guid} value={sku.guid}>
                        {sku.name || sku.guid}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Interval
                  </label>
                  <select
                    value={intervalMinutes}
                    onChange={(e) =>
                      setIntervalMinutes(parseInt(e.target.value, 10))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={20}>20 minutes</option>
                  </select>
                </div>
              </div>

              {intradaySummary && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="font-medium text-blue-900">Summary</p>
                  <div className="mt-2 text-sm text-blue-800 space-y-1">
                    <p>
                      Total Quantity:{" "}
                      {formatNumber(intradaySummary.totalQuantity)}
                    </p>
                    <p>Peak Hour: {intradaySummary.peakHour}</p>
                    <p>
                      Peak Quantity:{" "}
                      {formatNumber(intradaySummary.peakQuantity)}
                    </p>
                    <p>
                      Average per Bucket:{" "}
                      {formatNumber(averagePerBucketDisplay)}
                    </p>
                  </div>
                </div>
              )}

              <VelocityChart
                type="bar"
                data={intradayData}
                xKey="timeSlot"
                yKey="totalQuantity"
                title="Intraday Velocity"
                height={400}
              />
              <VelocityTable
                data={intradayData}
                columns={[
                  { key: "timeSlot", label: "Time Slot" },
                  { key: "totalQuantity", label: "Quantity" },
                  { key: "orderCount", label: "Orders" },
                ]}
                sortable={true}
                enableExport={true}
                exportFileName={intradayExportName}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
