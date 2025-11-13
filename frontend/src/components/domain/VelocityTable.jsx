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
  onRowClick,
  className = "",
}) {
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");
  const [filter, setFilter] = useState("");

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

  const handleSort = (column) => {
    if (!sortable) return;

    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

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

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">No data available</div>
    );
  }

  return (
    <div className={className}>
      {filterable && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
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
