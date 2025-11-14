import { useState, useEffect } from "react";
import { formatDate } from "../../utils/formatters.js";

/**
 * Date range picker component
 */

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
  className = "",
}) {
  const [localStartDate, setLocalStartDate] = useState(startDate || "");
  const [localEndDate, setLocalEndDate] = useState(endDate || "");

  // Sync with props when they change
  useEffect(() => {
    if (startDate) setLocalStartDate(startDate);
  }, [startDate]);

  useEffect(() => {
    if (endDate) setLocalEndDate(endDate);
  }, [endDate]);

  const handleStartDateChange = (e) => {
    const newStartDate = e.target.value;
    setLocalStartDate(newStartDate);
    onChange?.({ startDate: newStartDate, endDate: localEndDate });
  };

  const handleEndDateChange = (e) => {
    const newEndDate = e.target.value;
    setLocalEndDate(newEndDate);
    onChange?.({ startDate: localStartDate, endDate: newEndDate });
  };

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="flex-1">
        <label
          htmlFor="start-date"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Start Date
        </label>
        <input
          id="start-date"
          type="date"
          value={localStartDate}
          onChange={handleStartDateChange}
          className="touch-input w-full border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div className="flex-1">
        <label
          htmlFor="end-date"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          End Date
        </label>
        <input
          id="end-date"
          type="date"
          value={localEndDate}
          onChange={handleEndDateChange}
          min={localStartDate}
          className="touch-input w-full border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  );
}
