import { formatTime, formatNumber } from "../../utils/formatters.js";

/**
 * BakeCard component - displays a single batch in the timeline view
 * @param {Object} batch - Batch object with properties: batchId, displayName, itemGuid, quantity, rackPosition, oven, startTime, endTime, availableTime, status, bakeTime, coolTime
 * @param {Function} onClick - Optional click handler
 * @param {Object} style - Optional inline styles for positioning
 * @param {string} className - Optional additional CSS classes
 */
export default function BakeCard({ batch, onClick, style, className = "" }) {
  if (!batch) return null;

  const {
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
    isCatering,
    cateringOrderId,
  } = batch;

  // Determine status color
  const getStatusColor = () => {
    switch (status) {
      case "baking":
        return "bg-blue-500 border-blue-600";
      case "pulling":
        return "bg-yellow-500 border-yellow-600";
      case "available":
        return "bg-green-500 border-green-600";
      case "completed":
        return "bg-green-500 border-green-600";
      case "scheduled":
        return "bg-gray-400 border-gray-500";
      case "cooling":
        return "bg-orange-400 border-orange-500";
      default:
        return "bg-gray-300 border-gray-400";
    }
  };

  const statusColor = getStatusColor();

  // Add special styling for catering batches
  const cateringStyle = isCatering
    ? "border-dashed border-4 ring-2 ring-purple-300"
    : "";

  const handlePointerDown = (e) => {
    // Stop propagation to prevent DndContext from interfering
    e.stopPropagation();
  };

  const handlePointerUp = (e) => {
    // Stop propagation and handle click
    e.stopPropagation();
    if (onClick) {
      onClick(e);
    }
  };

  const tooltipText = isCatering
    ? `CATERING ORDER: ${displayName || itemGuid} - ${startTime || "TBD"} to ${
        endTime || "TBD"
      }`
    : `${displayName || itemGuid} - ${startTime || "TBD"} to ${
        endTime || "TBD"
      }`;

  return (
    <div
      className={`bake-card touch-card absolute border-2 rounded-lg shadow-md hover:shadow-lg transition-all cursor-pointer ${statusColor} ${cateringStyle} ${className}`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onClick={(e) => {
        // Fallback for browsers that don't support pointer events
        e.stopPropagation();
        if (onClick) {
          onClick(e);
        }
      }}
      title={tooltipText}
    >
      <div className="text-white text-sm font-semibold truncate mb-1.5">
        {isCatering && "🍽️ "}
        {displayName || itemGuid}
      </div>
      <div className="text-white text-xs space-y-1">
        {quantity && (
          <div className="flex items-center justify-between">
            <span className="opacity-90">Qty:</span>
            <span className="font-bold">{formatNumber(quantity)}</span>
          </div>
        )}
        {startTime && (
          <div className="text-xs opacity-90">
            Start: {formatTime(startTime)}
          </div>
        )}
        {endTime && (
          <div className="text-xs opacity-90">Pull: {formatTime(endTime)}</div>
        )}
        {availableTime && (
          <div className="text-xs opacity-90">
            Ready: {formatTime(availableTime)}
          </div>
        )}
        {bakeTime && (
          <div className="text-xs opacity-75">Bake: {bakeTime}min</div>
        )}
        {rackPosition && (
          <div className="text-xs opacity-75">
            Rack {rackPosition} | Oven {oven || "?"}
          </div>
        )}
      </div>
    </div>
  );
}
