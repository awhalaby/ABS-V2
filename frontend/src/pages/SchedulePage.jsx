import { useState, useEffect } from "react";
import { scheduleAPI } from "../utils/api.js";
import {
  formatNumber,
  formatDate,
  formatTime,
  formatDuration,
} from "../utils/formatters.js";
import ScheduleControls from "../components/domain/ScheduleControls.jsx";
import ScheduleTable from "../components/domain/ScheduleTable.jsx";
import LoadingSpinner from "../components/common/LoadingSpinner.jsx";
import ErrorMessage from "../components/common/ErrorMessage.jsx";
import { format as formatDateFns, addDays } from "date-fns";

export default function SchedulePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [selectedDate, setSelectedDate] = useState(
    formatDateFns(addDays(new Date(), 1), "yyyy-MM-dd")
  );

  // Load schedule for selected date on mount or date change
  useEffect(() => {
    loadSchedule(selectedDate);
  }, [selectedDate]);

  const loadSchedule = async (date) => {
    setLoading(true);
    setError(null);

    try {
      const response = await scheduleAPI.getByDate(date);
      setSchedule(response.data);
    } catch (err) {
      if (err.status === 404) {
        setSchedule(null);
      } else {
        setError(err.message || "Failed to load schedule");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (params) => {
    setLoading(true);
    setError(null);
    setSchedule(null);

    try {
      const response = await scheduleAPI.generate(params);
      setSchedule(response.data);
      setSelectedDate(params.date);
    } catch (err) {
      setError(err.message || "Failed to generate schedule");
    } finally {
      setLoading(false);
    }
  };

  const handleBatchMove = async (params) => {
    try {
      const response = await scheduleAPI.moveBatch(params);
      setSchedule(response.data);
    } catch (err) {
      setError(err.message || "Failed to move batch");
    }
  };

  const handleDelete = async () => {
    if (
      !schedule ||
      !window.confirm("Are you sure you want to delete this schedule?")
    ) {
      return;
    }

    try {
      await scheduleAPI.delete(schedule.date);
      setSchedule(null);
    } catch (err) {
      setError(err.message || "Failed to delete schedule");
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          ABS Schedule Generator
        </h2>
        <p className="text-gray-600">
          Generate optimal baking schedules based on forecasted demand.
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
        <ScheduleControls onGenerate={handleGenerate} loading={loading} />
      </div>

      {/* Date Selector */}
      <div className="mb-6 bg-white shadow rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          View Schedule for Date
        </label>
        <div className="flex gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={() => loadSchedule(selectedDate)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Load
          </button>
        </div>
      </div>

      {/* Schedule Display */}
      {loading && <LoadingSpinner />}

      {schedule && (
        <div className="space-y-6">
          {/* Summary Cards */}
          {schedule.summary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Total Batches</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(schedule.summary.totalBatches)}
                </p>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Scheduled</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatNumber(schedule.summary.scheduledBatches)}
                </p>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Unscheduled</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatNumber(schedule.summary.unscheduledBatches)}
                </p>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm text-gray-500">Total Quantity</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(schedule.summary.totalQuantity)}
                </p>
              </div>
            </div>
          )}

          {/* Schedule Table */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Schedule for {formatDate(schedule.date)}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => loadSchedule(schedule.date)}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  Refresh
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                >
                  Delete
                </button>
              </div>
            </div>
            <ScheduleTable
              batches={schedule.batches || []}
              onBatchMove={handleBatchMove}
            />
          </div>

          {/* Schedule Timeline Visualization */}
          {schedule.batches && schedule.batches.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Schedule Timeline
              </h3>
              <div className="space-y-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((rack) => {
                  const rackBatches = schedule.batches.filter(
                    (b) => b.rackPosition === rack
                  );
                  return (
                    <div key={rack} className="border-b pb-2">
                      <div className="text-sm font-medium text-gray-700 mb-1">
                        Rack {rack}
                      </div>
                      <div className="flex gap-1">
                        {rackBatches.map((batch) => (
                          <div
                            key={batch.batchId}
                            className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                            title={`${batch.displayName || batch.itemGuid} - ${
                              batch.startTime
                            } to ${batch.endTime}`}
                          >
                            {batch.displayName || batch.itemGuid} (
                            {batch.startTime})
                          </div>
                        ))}
                        {rackBatches.length === 0 && (
                          <span className="text-xs text-gray-400">
                            No batches
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!schedule && !loading && (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <p className="text-gray-500">
            No schedule found for {formatDate(selectedDate)}. Generate a new
            schedule using the controls above.
          </p>
        </div>
      )}
    </div>
  );
}
