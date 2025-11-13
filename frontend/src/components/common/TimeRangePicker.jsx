import { useState } from "react";

/**
 * Time range picker component
 */

export default function TimeRangePicker({
  startTime,
  endTime,
  onChange,
  className = "",
}) {
  const [localStartTime, setLocalStartTime] = useState(startTime || "06:00");
  const [localEndTime, setLocalEndTime] = useState(endTime || "17:00");

  const handleStartTimeChange = (e) => {
    const newStartTime = e.target.value;
    setLocalStartTime(newStartTime);
    onChange?.({ startTime: newStartTime, endTime: localEndTime });
  };

  const handleEndTimeChange = (e) => {
    const newEndTime = e.target.value;
    setLocalEndTime(newEndTime);
    onChange?.({ startTime: localStartTime, endTime: newEndTime });
  };

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="flex-1">
        <label
          htmlFor="start-time"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Start Time
        </label>
        <input
          id="start-time"
          type="time"
          value={localStartTime}
          onChange={handleStartTimeChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div className="flex-1">
        <label
          htmlFor="end-time"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          End Time
        </label>
        <input
          id="end-time"
          type="time"
          value={localEndTime}
          onChange={handleEndTimeChange}
          min={localStartTime}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  );
}
