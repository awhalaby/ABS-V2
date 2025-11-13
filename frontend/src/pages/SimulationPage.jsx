import { useState, useEffect, useRef } from "react";
import { simulationAPI } from "../utils/api.js";
import { formatTime, formatNumber } from "../utils/formatters.js";
import { format as formatDateFns, addDays } from "date-fns";
import { io } from "socket.io-client";
import { WEBSOCKET_URL } from "../config/constants.js";
import LoadingSpinner from "../components/common/LoadingSpinner.jsx";
import ErrorMessage from "../components/common/ErrorMessage.jsx";
import TimelineView from "../components/domain/TimelineView.jsx";
import ExpectedOrders from "../components/domain/ExpectedOrders.jsx";
import Stockout from "../components/domain/Stockout.jsx";
import ActualOrders from "../components/domain/ActualOrders.jsx";

export default function SimulationPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("manual"); // "manual" or "preset"
  const [scheduleDate, setScheduleDate] = useState(
    formatDateFns(addDays(new Date(), 1), "yyyy-MM-dd")
  );
  const [availableDates, setAvailableDates] = useState([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [simulationId, setSimulationId] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [speedMultiplier, setSpeedMultiplier] = useState(60);
  const [availableItems, setAvailableItems] = useState([]);
  const [purchasing, setPurchasing] = useState(false);
  const socketRef = useRef(null);

  // Update available items function
  const updateAvailableItems = async () => {
    if (!simulationId) return;
    try {
      const response = await simulationAPI.getAvailableItems(simulationId);
      setAvailableItems(response.data.items || []);
    } catch (err) {
      console.error("Failed to fetch available items:", err);
    }
  };

  // Initialize WebSocket connection
  useEffect(() => {
    if (simulationId) {
      socketRef.current = io(WEBSOCKET_URL);

      socketRef.current.on("connect", () => {
        console.log("WebSocket connected");
        socketRef.current.emit("joinSimulation", simulationId);
      });

      socketRef.current.on("simulation_update", (data) => {
        setSimulation(data);
        // Update available items from inventory
        if (data.inventory) {
          updateAvailableItems();
        }
      });

      socketRef.current.on("inventory_update", (data) => {
        // Update inventory when purchases are made
        setSimulation((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            inventory: data.inventory,
            stats: {
              ...prev.stats,
              totalInventory: data.totalInventory,
            },
          };
        });
        updateAvailableItems();
      });

      socketRef.current.on("disconnect", () => {
        console.log("WebSocket disconnected");
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.emit("leaveSimulation", simulationId);
          socketRef.current.disconnect();
        }
      };
    }
  }, [simulationId]);

  // Poll for simulation status if not using WebSocket
  useEffect(() => {
    if (simulationId && !socketRef.current) {
      const interval = setInterval(async () => {
        try {
          const response = await simulationAPI.getStatus(simulationId);
          setSimulation(response.data);
          updateAvailableItems();
        } catch (err) {
          console.error("Failed to fetch simulation status:", err);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [simulationId]);

  // Load available items when simulation starts (manual mode only)
  useEffect(() => {
    if (simulationId && simulation?.mode === "manual") {
      updateAvailableItems();
      // Poll for available items every 2 seconds
      const interval = setInterval(updateAvailableItems, 2000);
      return () => clearInterval(interval);
    }
  }, [simulationId, simulation?.mode]);

  // Load available dates for preset mode
  useEffect(() => {
    if (mode === "preset") {
      setLoadingDates(true);
      simulationAPI
        .getAvailableDates()
        .then((response) => {
          setAvailableDates(response.data.dates || []);
          // Set first available date if none selected
          if (response.data.dates && response.data.dates.length > 0) {
            setScheduleDate(response.data.dates[0].date);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch available dates:", err);
          setError("Failed to load available dates");
        })
        .finally(() => {
          setLoadingDates(false);
        });
    }
  }, [mode]);

  const handleStart = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await simulationAPI.start({
        scheduleDate,
        speedMultiplier,
        mode,
      });
      setSimulationId(response.data.id);
      setSimulation(response.data);
    } catch (err) {
      setError(err.message || "Failed to start simulation");
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    if (!simulationId) return;
    try {
      await simulationAPI.pause(simulationId);
      // Status will update via WebSocket or polling
    } catch (err) {
      setError(err.message || "Failed to pause simulation");
    }
  };

  const handleResume = async () => {
    if (!simulationId) return;
    try {
      await simulationAPI.resume(simulationId);
      // Status will update via WebSocket or polling
    } catch (err) {
      setError(err.message || "Failed to resume simulation");
    }
  };

  const handleStop = async () => {
    if (!simulationId) return;
    try {
      await simulationAPI.stop(simulationId);
      // Status will update via WebSocket or polling
    } catch (err) {
      setError(err.message || "Failed to stop simulation");
    }
  };

  const handleReset = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setSimulationId(null);
    setSimulation(null);
    setAvailableItems([]);
    // Reset date based on mode
    if (mode === "preset" && availableDates.length > 0) {
      setScheduleDate(availableDates[0].date);
    } else if (mode === "manual") {
      setScheduleDate(formatDateFns(addDays(new Date(), 1), "yyyy-MM-dd"));
    }
  };

  const handlePurchase = async (itemGuid, quantity = 1) => {
    if (!simulationId || purchasing) return;

    setPurchasing(true);
    try {
      const response = await simulationAPI.purchaseItems(simulationId, [
        { itemGuid, quantity },
      ]);
      if (response.success) {
        // Update available items
        await updateAvailableItems();
        // Update simulation state if needed
        if (response.data.inventory && simulation) {
          setSimulation({
            ...simulation,
            inventory: response.data.inventory,
            stats: {
              ...simulation.stats,
              totalInventory: response.data.totalInventory,
            },
          });
        }
      } else if (response.errors) {
        alert(
          `Purchase failed: ${response.errors.map((e) => e.error).join(", ")}`
        );
      }
    } catch (err) {
      alert(`Purchase failed: ${err.message || "Unknown error"}`);
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Simulation System
        </h2>
        <p className="text-gray-600">
          Run real-time simulations of baking schedules to test strategies and
          visualize the baking process.
        </p>
      </div>

      {error && (
        <ErrorMessage
          error={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      {/* Simulation Controls */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Simulation Controls
        </h3>
        {!simulationId ? (
          <div className="space-y-4">
            {/* Mode Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Simulation Mode
              </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="manual"
                    checked={mode === "manual"}
                    onChange={(e) => setMode(e.target.value)}
                    className="mr-2"
                  />
                  <span>Manual Orders</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="preset"
                    checked={mode === "preset"}
                    onChange={(e) => setMode(e.target.value)}
                    className="mr-2"
                  />
                  <span>Preset Orders</span>
                </label>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {mode === "manual"
                  ? "Manually purchase items using the mock POS system"
                  : "Automatically process orders from historical data"}
              </p>
            </div>

            {/* Date Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Schedule Date
              </label>
              {mode === "preset" ? (
                <select
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  disabled={loadingDates || availableDates.length === 0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  {loadingDates ? (
                    <option>Loading dates...</option>
                  ) : availableDates.length === 0 ? (
                    <option>No dates available</option>
                  ) : (
                    availableDates.map((dateInfo) => (
                      <option key={dateInfo.date} value={dateInfo.date}>
                        {dateInfo.date} ({formatNumber(dateInfo.orderCount)}{" "}
                        orders)
                      </option>
                    ))
                  )}
                </select>
              ) : (
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Speed Multiplier ({speedMultiplier}x)
              </label>
              <input
                type="range"
                min="30"
                max="600"
                step="30"
                value={speedMultiplier}
                onChange={(e) =>
                  setSpeedMultiplier(parseInt(e.target.value, 10))
                }
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>30x</span>
                <span>120x</span>
                <span>300x</span>
                <span>600x</span>
              </div>
            </div>
            <button
              onClick={handleStart}
              disabled={
                loading || (mode === "preset" && availableDates.length === 0)
              }
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? "Starting..." : "Start Simulation"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2 w-full">
            {simulation?.status === "running" && (
              <button
                onClick={handlePause}
                className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
              >
                Pause
              </button>
            )}
            {simulation?.status === "paused" && (
              <button
                onClick={handleResume}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Resume
              </button>
            )}
            <button
              onClick={handleStop}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Stop
            </button>
            <button
              onClick={handleReset}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Simulation Status */}
      {simulation && (
        <div className="space-y-6">
          {/* Current Status */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Simulation Status
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <p className="text-2xl font-bold text-gray-900 capitalize">
                  {simulation.status}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Current Time</p>
                <p className="text-2xl font-bold text-gray-900">
                  {simulation.currentTime || "--:--"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Speed</p>
                <p className="text-2xl font-bold text-gray-900">
                  {simulation.speedMultiplier || speedMultiplier}x
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Inventory</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(simulation.stats?.totalInventory || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Statistics */}
          {simulation.stats && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Statistics
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Batches Started</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatNumber(simulation.stats.batchesStarted || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Batches Pulled</p>
                  <p className="text-xl font-bold text-yellow-600">
                    {formatNumber(simulation.stats.batchesPulled || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Batches Available</p>
                  <p className="text-xl font-bold text-green-600">
                    {formatNumber(simulation.stats.batchesAvailable || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Peak Inventory</p>
                  <p className="text-xl font-bold text-blue-600">
                    {formatNumber(simulation.stats.peakInventory || 0)}
                  </p>
                </div>
                {simulation.mode === "preset" && (
                  <>
                    <div>
                      <p className="text-sm text-gray-500">Orders Processed</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatNumber(simulation.stats.ordersProcessed || 0)} /{" "}
                        {formatNumber(simulation.stats.ordersTotal || 0)}
                      </p>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-sm text-gray-500">Active Batches</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatNumber(simulation.batches?.length || 0)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Expected Orders / Forecast */}
          {(simulation.forecast || simulation.timeIntervalForecast) && (
            <ExpectedOrders
              forecast={simulation.forecast || []}
              timeIntervalForecast={simulation.timeIntervalForecast || []}
            />
          )}

          {/* Actual Orders */}
          <ActualOrders
            processedOrdersByItem={simulation.processedOrdersByItem || []}
          />

          {/* Inventory */}
          {simulation.inventory &&
            Object.keys(simulation.inventory).length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Current Inventory
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(simulation.inventory).map(
                    ([itemGuid, quantity]) => (
                      <div key={itemGuid} className="border rounded-lg p-3">
                        <p className="text-sm text-gray-500 truncate">
                          {itemGuid}
                        </p>
                        <p className="text-xl font-bold text-gray-900">
                          {formatNumber(quantity)}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

          {/* Batches Timeline View (Active + Completed) */}
          {((simulation.batches && simulation.batches.length > 0) ||
            (simulation.completedBatches &&
              simulation.completedBatches.length > 0)) && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Batches Timeline
              </h3>
              <TimelineView
                batches={[
                  ...(simulation.batches || []),
                  ...(simulation.completedBatches || []),
                ]}
                currentTime={simulation.currentTime}
                onBatchClick={(batch) => {
                  console.log("Batch clicked:", batch);
                  // You can add batch details modal or other interactions here
                }}
                options={{
                  hourInterval: 1,
                  minutesPerPixel: 0.3,
                  rackHeight: 140,
                }}
              />
            </div>
          )}

          {/* Stockouts & Missed Orders */}
          <Stockout
            missedOrders={simulation.missedOrders || []}
            events={simulation.recentEvents || []}
          />

          {/* Recent Events */}
          {simulation.recentEvents && simulation.recentEvents.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Recent Events
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {simulation.recentEvents
                  .slice()
                  .reverse()
                  .map((event, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 text-sm border-b pb-2"
                    >
                      <span className="text-gray-500 font-mono">
                        {event.timeString}
                      </span>
                      <span className="flex-1 text-gray-900">
                        {event.message}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* POS - Point of Sale (Manual Mode Only) */}
          {simulation.mode === "manual" && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Point of Sale
              </h3>
              {availableItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No items available for purchase yet. Wait for batches to
                  become available.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableItems.map((item) => (
                    <div
                      key={item.itemGuid}
                      className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-medium text-gray-900">
                          {item.displayName || item.itemGuid}
                        </h4>
                        <span className="text-sm font-bold text-blue-600">
                          {formatNumber(item.quantity)} available
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePurchase(item.itemGuid, 1)}
                          disabled={purchasing || item.quantity < 1}
                          className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                        >
                          Buy 1
                        </button>
                        <button
                          onClick={() => handlePurchase(item.itemGuid, 3)}
                          disabled={purchasing || item.quantity < 3}
                          className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                        >
                          Buy 3
                        </button>
                        <button
                          onClick={() => handlePurchase(item.itemGuid, 6)}
                          disabled={purchasing || item.quantity < 6}
                          className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                        >
                          Buy 6
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Order Processing Status (Preset Mode Only) */}
          {simulation.mode === "preset" && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Order Processing Status
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Orders</span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatNumber(simulation.stats.ordersTotal || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">
                    Orders Processed
                  </span>
                  <span className="text-lg font-bold text-green-600">
                    {formatNumber(simulation.stats.ordersProcessed || 0)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                  <div
                    className="bg-green-600 h-2.5 rounded-full transition-all"
                    style={{
                      width: `${
                        simulation.stats.ordersTotal > 0
                          ? (simulation.stats.ordersProcessed /
                              simulation.stats.ordersTotal) *
                            100
                          : 0
                      }%`,
                    }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Orders are automatically processed when inventory becomes
                  available. Missed orders are logged in Recent Events.
                </p>
              </div>
            </div>
          )}

          {/* Batches Table (Active + Completed) */}
          {((simulation.batches && simulation.batches.length > 0) ||
            (simulation.completedBatches &&
              simulation.completedBatches.length > 0)) && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                All Batches (Table View)
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Item
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Oven
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Rack
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Start Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Pull Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Available Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                      // Helper function to parse time string to minutes for sorting
                      const parseTimeToMinutes = (timeStr) => {
                        if (!timeStr || typeof timeStr !== "string")
                          return Infinity;
                        const [hours, minutes] = timeStr.split(":").map(Number);
                        if (isNaN(hours) || isNaN(minutes)) return Infinity;
                        return hours * 60 + minutes;
                      };

                      // Merge and sort batches by start time to keep completed batches in original position
                      const allBatches = [
                        ...(simulation.batches || []),
                        ...(simulation.completedBatches || []),
                      ].sort((a, b) => {
                        const timeA = parseTimeToMinutes(a.startTime);
                        const timeB = parseTimeToMinutes(b.startTime);
                        if (timeA !== timeB) return timeA - timeB;
                        // If same start time, sort by rack position
                        return (a.rackPosition || 0) - (b.rackPosition || 0);
                      });

                      return allBatches.map((batch) => (
                        <tr key={batch.batchId}>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {batch.displayName || batch.batchId}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            Oven {batch.oven}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            Rack {batch.rackPosition}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                batch.status === "baking"
                                  ? "bg-blue-100 text-blue-800"
                                  : batch.status === "pulling"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : batch.status === "available"
                                  ? "bg-green-100 text-green-800"
                                  : batch.status === "completed"
                                  ? "bg-green-100 text-green-800"
                                  : batch.status === "cooling"
                                  ? "bg-orange-100 text-orange-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {batch.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {batch.startTime || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {batch.endTime || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {batch.availableTime || "-"}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <LoadingSpinner />}
    </div>
  );
}
