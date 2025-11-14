import { useState, Fragment } from "react";
import { formatTime, formatNumber } from "../../utils/formatters.js";

/**
 * Schedule table component displaying batches in a timeline view
 */

export default function ScheduleTable({
  batches = [],
  onBatchMove,
  className = "",
}) {
  const [selectedBatch, setSelectedBatch] = useState(null);

  if (batches.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">No batches scheduled</div>
    );
  }

  // Helper function to parse time string to minutes for sorting
  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== "string") return Infinity;
    const [hours, minutes] = timeStr.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) return Infinity;
    return hours * 60 + minutes;
  };

  // Separate scheduled and unscheduled batches
  const scheduledBatches = batches.filter((b) => b.rackPosition !== null);
  const unscheduledBatches = batches.filter((b) => b.rackPosition === null);

  // Group scheduled batches by oven
  const batchesByOven = {};
  scheduledBatches.forEach((batch) => {
    const oven = batch.oven || 1; // Default to oven 1 if not specified
    if (!batchesByOven[oven]) {
      batchesByOven[oven] = [];
    }
    batchesByOven[oven].push(batch);
  });

  // Sort batches within each oven by start time
  Object.keys(batchesByOven).forEach((oven) => {
    batchesByOven[oven].sort((a, b) => {
      const timeA = parseTimeToMinutes(a.startTime);
      const timeB = parseTimeToMinutes(b.startTime);
      if (timeA !== timeB) return timeA - timeB;
      // If same start time, sort by rack position
      return (a.rackPosition || 0) - (b.rackPosition || 0);
    });
  });

  // Get sorted oven numbers
  const ovens = Object.keys(batchesByOven)
    .map((o) => parseInt(o))
    .filter((o) => !isNaN(o))
    .sort((a, b) => a - b);

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rack
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Item
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quantity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Start Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pull Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Available Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {ovens.map((oven) => (
              <Fragment key={`oven-${oven}`}>
                {/* Oven header */}
                <tr className="bg-blue-50">
                  <td
                    colSpan="8"
                    className="px-4 py-2 text-sm font-bold text-blue-900"
                  >
                    Oven {oven}
                  </td>
                </tr>
                {/* Batches for this oven */}
                {batchesByOven[oven].map((batch, idx) => (
                  <tr
                    key={batch.batchId}
                    className={`touch-table-row ${
                      idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      Rack {batch.rackPosition}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {batch.displayName || batch.itemGuid}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatNumber(batch.quantity)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {batch.startTime ? formatTime(batch.startTime) : "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {batch.endTime ? formatTime(batch.endTime) : "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {batch.bakeTime} min
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {batch.availableTime
                        ? formatTime(batch.availableTime)
                        : "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {onBatchMove && (
                        <button
                          onClick={() => setSelectedBatch(batch)}
                          className="touch-button min-w-[80px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md px-3 py-2"
                        >
                          Move
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {/* Unscheduled batches */}
            {unscheduledBatches.length > 0 && (
              <>
                <tr className="bg-red-50">
                  <td
                    colSpan="8"
                    className="px-4 py-2 text-sm font-medium text-red-800"
                  >
                    Unscheduled Batches ({unscheduledBatches.length})
                  </td>
                </tr>
                {unscheduledBatches.map((batch) => (
                  <tr key={batch.batchId} className="bg-red-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      -
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {batch.displayName || batch.itemGuid}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatNumber(batch.quantity)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      -
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      -
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {batch.bakeTime} min
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      -
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      -
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Batch Move Modal */}
      {selectedBatch && onBatchMove && (
        <BatchMoveModal
          batch={selectedBatch}
          onClose={() => setSelectedBatch(null)}
          onMove={onBatchMove}
        />
      )}
    </div>
  );
}

/**
 * Batch move modal component
 */
function BatchMoveModal({ batch, onClose, onMove }) {
  const [newStartTime, setNewStartTime] = useState(batch.startTime || "06:00");
  const [newRack, setNewRack] = useState(batch.rackPosition || 1);

  const handleMove = () => {
    onMove({
      scheduleId: batch.scheduleId || batch.date,
      batchId: batch.batchId,
      newStartTime,
      newRack,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative mx-auto p-6 border w-full max-w-md shadow-lg rounded-lg bg-white">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Move Batch: {batch.displayName || batch.itemGuid}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Start Time
            </label>
            <input
              type="time"
              value={newStartTime}
              onChange={(e) => setNewStartTime(e.target.value)}
              className="touch-input w-full border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Rack (1-12)
            </label>
            <input
              type="number"
              min="1"
              max="12"
              value={newRack}
              onChange={(e) => setNewRack(parseInt(e.target.value, 10))}
              className="touch-input w-full border border-gray-300 rounded-lg"
            />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleMove}
            className="touch-button flex-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md active:shadow-sm"
          >
            Move
          </button>
          <button
            onClick={onClose}
            className="touch-button flex-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 shadow-md active:shadow-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
