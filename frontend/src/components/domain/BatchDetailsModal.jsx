import {
  formatTime,
  formatNumber,
  formatDuration,
} from "../../utils/formatters.js";

/**
 * BatchDetailsModal component - Expanded view of batch details
 * @param {Object} batch - Batch object to display
 * @param {boolean} isOpen - Whether the modal is open
 * @param {Function} onClose - Function to call when closing the modal
 */
export default function BatchDetailsModal({ batch, isOpen, onClose }) {
  if (!isOpen || !batch) return null;

  const {
    batchId,
    displayName,
    itemGuid,
    quantity,
    rackPosition,
    oven,
    startTime,
    endTime,
    availableTime,
    status,
    bakeTime,
    coolTime,
    freshWindowMinutes,
    restockThreshold,
    startedAt,
    pulledAt,
    availableAt,
  } = batch;

  // Determine status color and label
  const getStatusInfo = () => {
    switch (status) {
      case "baking":
        return {
          color: "bg-blue-500 border-blue-600",
          label: "Baking",
          textColor: "text-blue-800",
          bgColor: "bg-blue-50",
        };
      case "pulling":
        return {
          color: "bg-yellow-500 border-yellow-600",
          label: "Pulling",
          textColor: "text-yellow-800",
          bgColor: "bg-yellow-50",
        };
      case "available":
        return {
          color: "bg-green-500 border-green-600",
          label: "Available",
          textColor: "text-green-800",
          bgColor: "bg-green-50",
        };
      case "completed":
        return {
          color: "bg-green-500 border-green-600",
          label: "Completed",
          textColor: "text-green-800",
          bgColor: "bg-green-50",
        };
      case "scheduled":
        return {
          color: "bg-gray-400 border-gray-500",
          label: "Scheduled",
          textColor: "text-gray-800",
          bgColor: "bg-gray-50",
        };
      case "cooling":
        return {
          color: "bg-orange-400 border-orange-500",
          label: "Cooling",
          textColor: "text-orange-800",
          bgColor: "bg-orange-50",
        };
      default:
        return {
          color: "bg-gray-300 border-gray-400",
          label: "Unknown",
          textColor: "text-gray-800",
          bgColor: "bg-gray-50",
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Modal */}
        <div
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Batch Details</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Item Info */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {displayName || itemGuid}
              </h3>
              <div className="text-sm text-gray-500 font-mono">
                Batch ID: {batchId}
              </div>
              {itemGuid && (
                <div className="text-sm text-gray-500 font-mono mt-1">
                  Item GUID: {itemGuid}
                </div>
              )}
            </div>

            {/* Status Badge */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Status
              </label>
              <div
                className={`inline-flex items-center px-3 py-1 rounded-full border-2 ${statusInfo.color} ${statusInfo.textColor}`}
              >
                <span className="text-sm font-semibold">
                  {statusInfo.label}
                </span>
              </div>
            </div>

            {/* Location */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Oven
                </label>
                <div className="text-lg font-semibold text-gray-900">
                  {oven ? `Oven ${oven}` : "Not assigned"}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Rack Position
                </label>
                <div className="text-lg font-semibold text-gray-900">
                  {rackPosition ? `Rack ${rackPosition}` : "Not scheduled"}
                </div>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Quantity
              </label>
              <div className="text-2xl font-bold text-gray-900">
                {quantity ? formatNumber(quantity) : "N/A"}
              </div>
            </div>

            {/* Timing Information */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-md font-semibold text-gray-900 mb-4">
                Timing Information
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Start Time
                  </label>
                  <div className="text-lg font-semibold text-gray-900">
                    {startTime ? formatTime(startTime) : "Not scheduled"}
                  </div>
                  {startedAt && (
                    <div className="text-xs text-gray-500 mt-1">
                      Started at: {formatTime(startedAt)}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Pull Time
                  </label>
                  <div className="text-lg font-semibold text-gray-900">
                    {endTime ? formatTime(endTime) : "Not scheduled"}
                  </div>
                  {pulledAt && (
                    <div className="text-xs text-gray-500 mt-1">
                      Pulled at: {formatTime(pulledAt)}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Available Time
                  </label>
                  <div className="text-lg font-semibold text-gray-900">
                    {availableTime
                      ? formatTime(availableTime)
                      : "Not scheduled"}
                  </div>
                  {availableAt && (
                    <div className="text-xs text-gray-500 mt-1">
                      Became available at: {formatTime(availableAt)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Duration Information */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-md font-semibold text-gray-900 mb-4">
                Duration Information
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bakeTime && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Bake Time
                    </label>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatDuration(bakeTime)}
                    </div>
                  </div>
                )}
                {coolTime && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Cool Time
                    </label>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatDuration(coolTime)}
                    </div>
                  </div>
                )}
                {freshWindowMinutes && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Fresh Window
                    </label>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatDuration(freshWindowMinutes)}
                    </div>
                  </div>
                )}
                {restockThreshold !== undefined && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Restock Threshold
                    </label>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatNumber(restockThreshold)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
