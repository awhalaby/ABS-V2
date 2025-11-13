import { useState } from "react";
import VelocityTable from "./VelocityTable.jsx";
import { formatNumber, formatDate } from "../../utils/formatters.js";

/**
 * Forecast table component with color coding and inline editing
 */

export default function ForecastTable({ data = [], onEdit, className = "" }) {
  const [editingCell, setEditingCell] = useState(null);

  const handleCellEdit = (rowIndex, field, value) => {
    if (onEdit) {
      onEdit(rowIndex, field, value);
    }
    setEditingCell(null);
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">No forecast data</div>
    );
  }

  // Determine columns based on data structure
  const columns = [
    { key: "period", label: "Period" },
    { key: "displayName", label: "SKU" },
    { key: "forecast", label: "Forecast" },
  ];

  // Add historical average if available
  if (data[0]?.baseAverage !== undefined) {
    columns.splice(2, 0, { key: "baseAverage", label: "Historical Avg" });
  }

  // Add growth indicator if available
  if (data[0]?.pattern !== undefined) {
    columns.push({ key: "pattern", label: "Pattern" });
  }

  return (
    <div className={className}>
      <VelocityTable
        data={data.map((row, idx) => ({
          ...row,
          period: row.period || row.date,
          growth:
            row.baseAverage > 0
              ? ((row.forecast - row.baseAverage) / row.baseAverage) * 100
              : 0,
        }))}
        columns={columns}
        sortable={true}
        filterable={true}
        onRowClick={(row) => {
          // Could show details modal
        }}
      />
    </div>
  );
}
