import { useState, useEffect } from "react";
import { velocityAPI } from "../utils/api.js";
import {
  formatNumber,
  formatDate,
  formatCurrency,
} from "../utils/formatters.js";
import DateRangePicker from "../components/common/DateRangePicker.jsx";
import LoadingSpinner from "../components/common/LoadingSpinner.jsx";
import ErrorMessage from "../components/common/ErrorMessage.jsx";
import VelocityTable from "../components/domain/VelocityTable.jsx";
import VelocityChart from "../components/domain/VelocityChart.jsx";
import {
  addDays,
  format as formatDateFns,
  eachDayOfInterval,
  parseISO,
} from "date-fns";

export default function VelocityPage() {
  const [activeTab, setActiveTab] = useState("weekly");
  const [loading, setLoading] = useState(false);
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

  // Daily data
  const [dailyData, setDailyData] = useState([]);
  const [dailySummary, setDailySummary] = useState(null);
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

  // Load weekly data
  const loadWeeklyData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await velocityAPI.getWeekly(startDate, endDate);
      setWeeklyData(response.data || []);
      setWeeklySummary(response.summary || null);
    } catch (err) {
      setError(err.message || "Failed to load weekly velocity data");
    } finally {
      setLoading(false);
    }
  };

  // Load daily data
  const loadDailyData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await velocityAPI.getDaily(
        startDate,
        endDate,
        skuFilter || undefined
      );
      setDailyData(response.data || []);
      setDailySummary(response.summary || null);
    } catch (err) {
      setError(err.message || "Failed to load daily velocity data");
    } finally {
      setLoading(false);
    }
  };

  // Load intraday data
  const loadIntradayData = async () => {
    if (!selectedItemGuid) {
      setError("Please select an item");
      return;
    }

    setLoading(true);
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
      setLoading(false);
    }
  };

  // Load data when tab or filters change
  useEffect(() => {
    if (activeTab === "weekly") {
      loadWeeklyData();
    } else if (activeTab === "daily") {
      loadDailyData();
    }
  }, [activeTab, startDate, endDate, skuFilter]);

  // Extract unique SKUs from daily data for intraday selector
  useEffect(() => {
    if (dailyData.length > 0) {
      const skus = [
        ...new Set(
          dailyData
            .map((d) => ({ guid: d.itemGuid, name: d.displayName }))
            .filter((s) => s.guid)
        ),
      ];
      setAvailableSKUs(skus);
      if (skus.length > 0 && !selectedItemGuid) {
        setSelectedItemGuid(skus[0].guid);
      }
    }
  }, [dailyData]);

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

  // Fill missing dates with zero values for complete chart display
  const fillMissingDates = (data, start, end) => {
    if (!data || data.length === 0 || !start || !end) return data;

    try {
      const startDate = parseISO(start);
      const endDate = parseISO(end);
      const allDates = eachDayOfInterval({ start: startDate, end: endDate });

      // Get unique SKUs from data
      const skuMap = new Map();
      data.forEach((d) => {
        const key = d.itemGuid || d.displayName || "";
        if (key && !skuMap.has(key)) {
          skuMap.set(key, {
            itemGuid: d.itemGuid || "",
            displayName: d.displayName || "",
          });
        }
      });
      const uniqueSKUs = Array.from(skuMap.values());

      // Create a map of existing data by date and SKU
      const dataMap = new Map();
      data.forEach((record) => {
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
      return filledData.sort((a, b) => {
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
      {(weeklySummary || dailySummary) && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-sm text-gray-500">Total Orders</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(
                activeTab === "weekly"
                  ? weeklySummary?.totalOrders || 0
                  : dailySummary?.totalOrders || 0
              )}
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-sm text-gray-500">Total Items</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(
                activeTab === "weekly"
                  ? weeklySummary?.totalItems || 0
                  : dailySummary?.totalItems || 0
              )}
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-sm text-gray-500">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(
                activeTab === "weekly"
                  ? weeklySummary?.totalRevenue || 0
                  : dailySummary?.totalRevenue || 0
              )}
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-sm text-gray-500">Unique SKUs</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(
                activeTab === "weekly"
                  ? weeklySummary?.uniqueSKUs || 0
                  : dailySummary?.uniqueSKUs || 0
              )}
            </p>
          </div>
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
          {loading && (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          )}

          {/* Weekly Tab */}
          {activeTab === "weekly" && !loading && (
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
              />
            </div>
          )}

          {/* Daily Tab */}
          {activeTab === "daily" && !loading && (
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
              <VelocityChart
                type="bar"
                data={fillMissingDates(dailyData, startDate, endDate)}
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
              />
            </div>
          )}

          {/* Intraday Tab */}
          {activeTab === "intraday" && !loading && (
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
                      {formatNumber(
                        intradaySummary.averagePerBucket.toFixed(1)
                      )}
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
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
