import { useState, useMemo } from "react";
import { formatNumber, formatDate } from "../../utils/formatters.js";
import { parseISO, format as formatDateFns } from "date-fns";

/**
 * Forecast table component with SKU summary view and expandable daily details
 */

export default function ForecastTable({ data = [], onEdit, className = "" }) {
  const [expandedSKUs, setExpandedSKUs] = useState(new Set());
  const [sortColumn, setSortColumn] = useState("totalForecast");
  const [sortDirection, setSortDirection] = useState("desc");
  const [filter, setFilter] = useState("");

  // Group data by SKU and calculate summary statistics
  const skuSummaries = useMemo(() => {
    const grouped = {};

    data.forEach((record) => {
      const skuKey = record.sku || record.displayName || record.itemGuid;
      const skuName = record.displayName || record.sku || record.itemGuid;

      if (!grouped[skuKey]) {
        grouped[skuKey] = {
          sku: skuKey,
          displayName: skuName,
          itemGuid: record.itemGuid,
          records: [],
          totalForecast: 0,
          baseAverage: record.baseAverage || 0,
          minForecast: Infinity,
          maxForecast: -Infinity,
          dates: [],
        };
      }

      const forecast = record.forecast || 0;
      grouped[skuKey].totalForecast += forecast;
      grouped[skuKey].minForecast = Math.min(
        grouped[skuKey].minForecast,
        forecast
      );
      grouped[skuKey].maxForecast = Math.max(
        grouped[skuKey].maxForecast,
        forecast
      );
      grouped[skuKey].records.push({
        ...record,
        date: record.date || record.period,
      });
      if (record.date || record.period) {
        grouped[skuKey].dates.push(record.date || record.period);
      }
    });

    // Calculate averages and date ranges
    Object.values(grouped).forEach((summary) => {
      summary.avgForecast =
        summary.records.length > 0
          ? summary.totalForecast / summary.records.length
          : 0;
      summary.dateRange =
        summary.dates.length > 0
          ? `${summary.dates.sort()[0]} to ${summary.dates.sort().reverse()[0]}`
          : "-";
      summary.dayCount = summary.records.length;
    });

    return Object.values(grouped);
  }, [data]);

  // Filter summaries
  const filteredSummaries = useMemo(() => {
    if (!filter) return skuSummaries;
    return skuSummaries.filter(
      (summary) =>
        summary.displayName.toLowerCase().includes(filter.toLowerCase()) ||
        summary.sku.toLowerCase().includes(filter.toLowerCase())
    );
  }, [skuSummaries, filter]);

  // Sort summaries
  const sortedSummaries = useMemo(() => {
    return [...filteredSummaries].sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      if (aVal === bVal) return 0;
      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredSummaries, sortColumn, sortDirection]);

  const toggleExpand = (sku) => {
    const newExpanded = new Set(expandedSKUs);
    if (newExpanded.has(sku)) {
      newExpanded.delete(sku);
    } else {
      newExpanded.add(sku);
    }
    setExpandedSKUs(newExpanded);
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">No forecast data</div>
    );
  }

  return (
    <div className={className}>
      {/* Filter */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Filter by SKU..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Summary Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
              <th
                onClick={() => handleSort("displayName")}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  SKU
                  {sortColumn === "displayName" && (
                    <span className="text-blue-600">
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort("totalForecast")}
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center justify-end gap-2">
                  Total Forecast
                  {sortColumn === "totalForecast" && (
                    <span className="text-blue-600">
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort("avgForecast")}
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center justify-end gap-2">
                  Avg/Day
                  {sortColumn === "avgForecast" && (
                    <span className="text-blue-600">
                      {sortDirection === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </div>
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Min
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Max
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date Range
              </th>
              {data[0]?.baseAverage !== undefined && (
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Historical Avg
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedSummaries.map((summary) => {
              const isExpanded = expandedSKUs.has(summary.sku);
              const growth =
                summary.baseAverage > 0
                  ? ((summary.avgForecast - summary.baseAverage) /
                      summary.baseAverage) *
                    100
                  : 0;

              return (
                <>
                  <tr
                    key={summary.sku}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleExpand(summary.sku)}
                  >
                    <td className="px-4 py-3 text-sm text-gray-500">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(summary.sku);
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {summary.displayName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {formatNumber(Math.round(summary.totalForecast))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {formatNumber(Math.round(summary.avgForecast))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">
                      {formatNumber(Math.round(summary.minForecast))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">
                      {formatNumber(Math.round(summary.maxForecast))}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {summary.dateRange}
                    </td>
                    {data[0]?.baseAverage !== undefined && (
                      <td className="px-4 py-3 text-sm text-gray-500 text-right">
                        <div>
                          {formatNumber(Math.round(summary.baseAverage))}
                          {growth !== 0 && (
                            <span
                              className={`ml-2 text-xs ${
                                growth > 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              ({growth > 0 ? "+" : ""}
                              {formatNumber(growth)}%)
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  {/* Expanded daily breakdown */}
                  {isExpanded && (
                    <tr>
                      <td
                        colSpan={data[0]?.baseAverage !== undefined ? 8 : 7}
                        className="px-4 py-3 bg-gray-50"
                      >
                        <div className="max-h-96 overflow-y-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                                  Date
                                </th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                                  Forecast
                                </th>
                                {summary.records[0]?.dayOfWeek !==
                                  undefined && (
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                                    Day
                                  </th>
                                )}
                                {summary.records[0]?.pattern !== undefined && (
                                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                                    Pattern
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {summary.records
                                .sort((a, b) => {
                                  const dateA = parseISO(
                                    a.date || a.period || "1970-01-01"
                                  );
                                  const dateB = parseISO(
                                    b.date || b.period || "1970-01-01"
                                  );
                                  return dateA.getTime() - dateB.getTime();
                                })
                                .map((record, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-sm text-gray-700">
                                      {record.date || record.period
                                        ? formatDateFns(
                                            parseISO(
                                              record.date || record.period
                                            ),
                                            "MMM dd, yyyy"
                                          )
                                        : "-"}
                                    </td>
                                    <td className="px-3 py-2 text-sm text-gray-900 text-right">
                                      {formatNumber(record.forecast || 0)}
                                    </td>
                                    {record.dayOfWeek !== undefined && (
                                      <td className="px-3 py-2 text-sm text-gray-500">
                                        {record.dayOfWeek}
                                      </td>
                                    )}
                                    {record.pattern !== undefined && (
                                      <td className="px-3 py-2 text-sm text-gray-500 text-right">
                                        {formatNumber(record.pattern, 2)}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {filter && (
        <div className="mt-2 text-sm text-gray-500">
          Showing {filteredSummaries.length} of {skuSummaries.length} SKUs
        </div>
      )}
    </div>
  );
}
