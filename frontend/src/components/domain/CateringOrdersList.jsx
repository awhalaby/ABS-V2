import { useState } from "react";
import { simulationAPI } from "../../utils/api.js";
import { formatNumber } from "../../utils/formatters.js";

/**
 * CateringOrdersList component - Displays and manages catering orders
 */
export default function CateringOrdersList({
  simulationId,
  cateringOrders = [],
  onOrderUpdate,
}) {
  const [processing, setProcessing] = useState(new Set());

  const handleApprove = async (orderId) => {
    if (processing.has(orderId)) return;

    setProcessing((prev) => new Set(prev).add(orderId));
    try {
      await simulationAPI.approveCateringOrder(simulationId, orderId);
      if (onOrderUpdate) {
        onOrderUpdate();
      }
    } catch (error) {
      console.error("Failed to approve order:", error);
      alert(error.response?.data?.error?.message || "Failed to approve order");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleReject = async (orderId) => {
    if (processing.has(orderId)) return;

    if (
      !confirm(
        "Are you sure you want to reject this order? Batches will be removed and moved batches will be restored."
      )
    ) {
      return;
    }

    setProcessing((prev) => new Set(prev).add(orderId));
    try {
      await simulationAPI.rejectCateringOrder(simulationId, orderId);
      if (onOrderUpdate) {
        onOrderUpdate();
      }
    } catch (error) {
      console.error("Failed to reject order:", error);
      alert(error.response?.data?.error?.message || "Failed to reject order");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (cateringOrders.length === 0) {
    return (
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Catering Orders
        </h3>
        <p className="text-sm text-gray-500">No catering orders yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Catering Orders
      </h3>
      <div className="space-y-4">
        {cateringOrders.map((order) => (
          <div
            key={order.orderId}
            className="border border-gray-200 rounded-lg p-4 space-y-3"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                    order.status
                  )}`}
                >
                  {order.status.toUpperCase()}
                </span>
                <span className="text-sm text-gray-600">
                  Pickup: {order.requiredAvailableTime}
                </span>
              </div>
              {order.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(order.orderId)}
                    disabled={processing.has(order.orderId)}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {processing.has(order.orderId)
                      ? "Processing..."
                      : "Approve"}
                  </button>
                  <button
                    onClick={() => handleReject(order.orderId)}
                    disabled={processing.has(order.orderId)}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>

            {/* Items */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Items:</p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                {order.items.map((item, index) => (
                  <li key={index}>
                    {formatNumber(item.quantity)}x {item.displayName}
                  </li>
                ))}
              </ul>
            </div>

            {/* Batches */}
            {order.batches && order.batches.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Batches ({order.batches.length}):
                </p>
                <div className="text-xs text-gray-600 space-y-1">
                  {order.batches.map((batch, index) => (
                    <div key={index} className="pl-4">
                      {batch.displayName} - Rack {batch.rackPosition} - Start:{" "}
                      {batch.startTime} - Available: {batch.availableTime}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Moved Batches Warning */}
            {order.movedBatches && order.movedBatches.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                <p className="text-xs font-medium text-yellow-800 mb-1">
                  ⚠ {order.movedBatches.length} batch(es) were moved to
                  accommodate this order:
                </p>
                <ul className="text-xs text-yellow-700 space-y-1">
                  {order.movedBatches.map((moved, index) => (
                    <li key={index} className="pl-2">
                      {moved.displayName}: Rack {moved.oldRack} → Rack{" "}
                      {moved.newRack}, {moved.oldStartTime} →{" "}
                      {moved.newStartTime}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Order Info */}
            <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
              Placed at: {order.orderPlacedAt} | Order ID:{" "}
              {order.orderId.substring(0, 8)}...
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
