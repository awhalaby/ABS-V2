import { useState } from "react";
import {
  formatNumber,
  formatDate,
  formatCurrency,
} from "../../utils/formatters.js";

/**
 * Reusable velocity table component with sorting and filtering
 */

export default function VelocityTable({
  data = [],
  columns = [],
  sortable = true,
  filterable = false,
  enableExport = false,
  exportFileName = "velocity-data.csv",
  onRowClick,
  className = "",
}) {
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");
  const [filter, setFilter] = useState("");

  const formatCellValue = (value, column) => {
    if (value === null || value === undefined) return "-";

    // Format based on column type
    if (column === "date") {
      return formatDate(value);
    }
    if (
      column === "quantity" ||
      column === "totalQuantity" ||
      column === "orderCount"
    ) {
      return formatNumber(value);
    }
    if (
      column === "revenue" ||
      column === "totalRevenue" ||
      column === "price"
    ) {
      return formatCurrency(value);
    }
    if (typeof value === "number") {
      return formatNumber(value);
    }

    return String(value);
  };

  // Sort data
  const sortedData = [...data].sort((a, b) => {
    if (!sortColumn) return 0;

    const aVal = a[sortColumn];
    const bVal = b[sortColumn];

    if (aVal === bVal) return 0;

    const comparison = aVal < bVal ? -1 : 1;
    return sortDirection === "asc" ? comparison : -comparison;
  });

  // Filter data
  const filteredData = filterable
    ? sortedData.filter((row) => {
        return Object.values(row).some((val) =>
          String(val).toLowerCase().includes(filter.toLowerCase())
        );
      })
    : sortedData;

  const canExport = enableExport && filteredData.length > 0;

  const handleExport = () => {
    if (!canExport || typeof window === "undefined") {
      return;
    }

    const headers = columns.map((column) => column.label || column.key);
    const rows = filteredData.map((row) =>
      columns.map((column) => formatCellValue(row[column.key], column.key))
    );

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const value =
              cell === null || cell === undefined ? "" : String(cell);
            const escaped = value.replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", exportFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleSort = (column) => {
    if (!sortable) return;

    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">No data available</div>
    );
  }

  return (
    <div className={className}>
      {(filterable || enableExport) && (
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {filterable && (
            <input
              type="text"
              placeholder="Filter..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 md:max-w-sm"
            />
          )}
          {enableExport && (
            <button
              type="button"
              onClick={handleExport}
              disabled={!canExport}
              className={`inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                canExport
                  ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                  : "border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              Export CSV
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => handleSort(column.key)}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase ${
                    sortable ? "cursor-pointer hover:bg-gray-100" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {column.label}
                    {sortable && sortColumn === column.key && (
                      <span className="text-blue-600">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredData.map((row, idx) => (
              <tr
                key={idx}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? "cursor-pointer hover:bg-gray-50" : ""}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="px-4 py-3 text-sm text-gray-900"
                  >
                    {formatCellValue(row[column.key], column.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filterable && filter && (
        <div className="mt-2 text-sm text-gray-500">
          Showing {filteredData.length} of {data.length} records
        </div>
      )}
    </div>
  );
}
