import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { simulationAPI, bakespecsAPI } from "../utils/api.js";
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
import VisualInventory from "../components/domain/VisualInventory.jsx";
import SuggestedBatches from "../components/domain/SuggestedBatches.jsx";
import CateringOrderForm from "../components/domain/CateringOrderForm.jsx";
import CateringOrdersList from "../components/domain/CateringOrdersList.jsx";

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
  const [forecastScales, setForecastScales] = useState({
    morning: 100, // 06:00-11:00
    afternoon: 100, // 11:00-14:00
    evening: 100, // 14:00-17:00
  });
  const [availableItems, setAvailableItems] = useState([]);
  const [purchasing, setPurchasing] = useState(false);
  const [bakeSpecs, setBakeSpecs] = useState([]);
  const [suggestedBatchesEnabled, setSuggestedBatchesEnabled] = useState(false);
  const [autoAddSuggestedBatches, setAutoAddSuggestedBatches] = useState(false);
  const [autoApproveCatering, setAutoApproveCatering] = useState(false);
  const [cateringOrders, setCateringOrders] = useState([]);
  const [websocketConnected, setWebsocketConnected] = useState(false);
  const isMovingBatchRef = useRef(false);
  const socketRef = useRef(null);

  // Update available items function - memoized to prevent infinite loops
  const updateAvailableItems = useCallback(async () => {
    if (!simulationId) return;
    try {
      const response = await simulationAPI.getAvailableItems(simulationId);
      setAvailableItems(response.data.items || []);
    } catch (err) {
      console.error("Failed to fetch available items:", err);
    }
  }, [simulationId]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (simulationId) {
      console.log(
        "[SimulationPage] Attempting WebSocket connection to:",
        WEBSOCKET_URL
      );
      socketRef.current = io(WEBSOCKET_URL, {
        timeout: 5000,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
      });

      socketRef.current.on("connect", () => {
        console.log("[SimulationPage] WebSocket connected successfully");
        setWebsocketConnected(true);
        socketRef.current.emit("joinSimulation", simulationId);
      });

      socketRef.current.on("connect_error", (error) => {
        console.error("[SimulationPage] WebSocket connection error:", error);
        setWebsocketConnected(false);
      });

      socketRef.current.on("disconnect", (reason) => {
        console.log("[SimulationPage] WebSocket disconnected:", reason);
        setWebsocketConnected(false);
      });

      socketRef.current.on("simulation_update", (data) => {
        // Don't overwrite local state if we're in the middle of moving a batch
        if (!isMovingBatchRef.current) {
          // Use functional update to merge smoothly
          setSimulation((prev) => {
            if (!prev) return data;
            // Merge updates smoothly to prevent jumps
            return {
              ...prev,
              ...data,
              // Ensure time updates smoothly
              currentTime: data.currentTime || prev.currentTime,
            };
          });
          // Update available items from inventory
          if (data.inventory) {
            updateAvailableItems();
          }
          // Update catering orders
          if (data.cateringOrders) {
            setCateringOrders(data.cateringOrders);
          }
          if (data.autoApproveCatering !== undefined) {
            setAutoApproveCatering(data.autoApproveCatering);
          }
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

      return () => {
        if (socketRef.current) {
          socketRef.current.emit("leaveSimulation", simulationId);
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        setWebsocketConnected(false);
      };
    }
  }, [simulationId, updateAvailableItems]);

  // Load bake specs for freshness windows
  useEffect(() => {
    const loadBakeSpecs = async () => {
      try {
        const response = await bakespecsAPI.getAll();
        setBakeSpecs(response.data || []);
      } catch (err) {
        console.error("Failed to load bake specs:", err);
      }
    };
    loadBakeSpecs();
  }, []);

  // Poll for simulation status if WebSocket is not connected
  useEffect(() => {
    if (simulationId && !websocketConnected) {
      console.log(
        "[SimulationPage] WebSocket not connected, using polling fallback"
      );

      const interval = setInterval(async () => {
        try {
          const response = await simulationAPI.getStatus(simulationId);
          const newData = response.data;

          // Use functional update to merge smoothly and prevent jumps
          setSimulation((prev) => {
            if (!prev) return newData;
            // Merge updates smoothly, preserving previous state where appropriate
            return {
              ...prev,
              ...newData,
              // Preserve smooth time transitions
              currentTime: newData.currentTime || prev.currentTime,
            };
          });

          // Only update available items if simulation is running
          if (newData?.status === "running" && newData.mode === "manual") {
            updateAvailableItems();
          }
        } catch (err) {
          console.error(
            "[SimulationPage] Failed to fetch simulation status:",
            err
          );
        }
      }, 500); // Poll every 500ms for smoother updates

      return () => {
        console.log("[SimulationPage] Clearing polling interval");
        clearInterval(interval);
      };
    }
  }, [simulationId, websocketConnected, updateAvailableItems]);

  // Load available items when simulation starts (manual mode only)
  useEffect(() => {
    if (simulationId && simulation?.mode === "manual") {
      updateAvailableItems();
      // Poll for available items every 2 seconds
      const interval = setInterval(updateAvailableItems, 2000);
      return () => clearInterval(interval);
    }
  }, [simulationId, simulation?.mode, updateAvailableItems]);

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
        forecastScales: {
          morning: forecastScales.morning / 100,
          afternoon: forecastScales.afternoon / 100,
          evening: forecastScales.evening / 100,
        },
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

  const handleBatchDelete = async (batchId) => {
    if (!simulationId) return;
    try {
      const response = await simulationAPI.deleteBatch(simulationId, batchId);
      if (response.success && response.data) {
        // Update simulation state with updated batches
        setSimulation({
          ...simulation,
          batches: response.data.batches || simulation.batches,
          completedBatches:
            response.data.completedBatches || simulation.completedBatches,
          recentEvents: response.data.recentEvents || simulation.recentEvents,
        });
      }
    } catch (err) {
      throw new Error(err.message || "Failed to delete batch");
    }
  };

  const handleBatchMove = async (batchId, newStartTime, newRack) => {
    if (!simulationId) return;
    isMovingBatchRef.current = true;
    try {
      const response = await simulationAPI.moveBatch(
        simulationId,
        batchId,
        newStartTime,
        newRack
      );
      if (response.success && response.data) {
        // Update simulation state with updated batches
        setSimulation({
          ...simulation,
          batches: response.data.batches || simulation.batches,
          completedBatches:
            response.data.completedBatches || simulation.completedBatches,
          recentEvents: response.data.recentEvents || simulation.recentEvents,
        });
        // Small delay to ensure WebSocket doesn't overwrite immediately
        setTimeout(() => {
          isMovingBatchRef.current = false;
        }, 1000);
      } else {
        isMovingBatchRef.current = false;
      }
    } catch (err) {
      isMovingBatchRef.current = false;
      alert(`Failed to move batch: ${err.message || "Unknown error"}`);
    }
  };

  const handleAddSuggestedBatch = useCallback(
    async (batch) => {
      if (!simulationId) {
        throw new Error("No simulation ID");
      }
      try {
        // Add batch to schedule using the new add endpoint
        const response = await simulationAPI.addBatch(simulationId, {
          itemGuid: batch.itemGuid,
          displayName: batch.displayName,
          quantity: batch.quantity,
          bakeTime: batch.bakeTime,
          coolTime: batch.coolTime,
          oven: batch.oven,
          freshWindowMinutes: batch.freshWindowMinutes,
          restockThreshold: batch.restockThreshold,
          startTime: batch.startTime,
        });
        if (response.success && response.data) {
          setSimulation((prevSimulation) => {
            if (!prevSimulation) return prevSimulation;
            return {
              ...prevSimulation,
              batches: response.data.batches || prevSimulation.batches,
              completedBatches:
                response.data.completedBatches ||
                prevSimulation.completedBatches,
              recentEvents:
                response.data.recentEvents || prevSimulation.recentEvents,
            };
          });
        }
        return response;
      } catch (err) {
        console.error("Failed to add suggested batch:", err);
        // Only show alert if not auto-adding (to avoid spam)
        if (!autoAddSuggestedBatches) {
          alert(
            `Failed to add batch to schedule: ${err.message || "Unknown error"}`
          );
        }
        throw err; // Re-throw so caller can handle it
      }
    },
    [simulationId, autoAddSuggestedBatches]
  );

  // Memoize existing batches to prevent infinite re-renders
  // Only recreate the array when batches actually change (by comparing IDs)
  const memoizedExistingBatches = useMemo(() => {
    if (!simulation) return [];
    return [
      ...(simulation.batches || []),
      ...(simulation.completedBatches || []),
    ];
  }, [
    // Use JSON.stringify of batch IDs for stable comparison
    JSON.stringify((simulation?.batches || []).map((b) => b.batchId)),
    JSON.stringify((simulation?.completedBatches || []).map((b) => b.batchId)),
  ]);

  // Handle catering order submission
  const handleCateringOrderSubmit = useCallback(async () => {
    // Refresh simulation to get updated catering orders
    if (simulationId) {
      try {
        const response = await simulationAPI.getStatus(simulationId);
        if (response.data) {
          setSimulation(response.data);
          if (response.data.cateringOrders) {
            setCateringOrders(response.data.cateringOrders);
          }
          if (response.data.autoApproveCatering !== undefined) {
            setAutoApproveCatering(response.data.autoApproveCatering);
          }
        }
      } catch (err) {
        console.error("Failed to refresh simulation:", err);
      }
    }
  }, [simulationId]);

  // Handle catering order update (approve/reject)
  const handleCateringOrderUpdate = useCallback(async () => {
    await handleCateringOrderSubmit();
  }, [handleCateringOrderSubmit]);

  // Handle auto-approve toggle
  const handleAutoApproveToggle = useCallback(
    async (enabled) => {
      if (!simulationId) return;
      try {
        await simulationAPI.setAutoApproveCatering(simulationId, enabled);
        setAutoApproveCatering(enabled);
      } catch (err) {
        console.error("Failed to update auto-approve setting:", err);
        alert(
          err.response?.data?.error?.message ||
            "Failed to update auto-approve setting"
        );
      }
    },
    [simulationId]
  );

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
              <label className="block text-base font-medium text-gray-700 mb-3">
                Schedule Date
              </label>
              {mode === "preset" ? (
                <select
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  disabled={loadingDates || availableDates.length === 0}
                  className="touch-input w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  {loadingDates ? (
                    <option>Loading dates...</option>
                  ) : availableDates.length === 0 ? (
                    <option>No dates available</option>
                  ) : (
                    availableDates.map((dateInfo) => (
                      <option key={dateInfo.date} value={dateInfo.date}>
                        {dateInfo.date} ({formatNumber(dateInfo.itemCount)}{" "}
                        items)
                      </option>
                    ))
                  )}
                </select>
              ) : (
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="touch-input w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700 mb-3">
                Speed Multiplier ({speedMultiplier}x)
              </label>
              <input
                type="range"
                min="1"
                max="2400"
                step="30"
                value={speedMultiplier}
                onChange={(e) =>
                  setSpeedMultiplier(parseInt(e.target.value, 10))
                }
                className="w-full touch-slider h-12"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1x</span>

                <span>2400x</span>
              </div>
            </div>
            <div>
              <label className="block text-base font-medium text-gray-700 mb-4">
                Forecast Scale by Period
              </label>
              <div className="grid grid-cols-3 gap-6">
                {/* Morning Slider */}
                <div className="flex flex-col items-center">
                  <label className="text-sm font-semibold text-gray-700 mb-2">
                    Morning
                  </label>
                  <label className="text-xs text-gray-500 mb-3">
                    06:00-11:00
                  </label>
                  <div className="relative flex flex-col items-center h-64 w-full">
                    {/* Track background line */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-1 h-full bg-gray-300 rounded-full"></div>
                    {/* Slider container */}
                    <div className="relative w-full h-full">
                      <input
                        type="range"
                        min="50"
                        max="200"
                        step="5"
                        value={forecastScales.morning}
                        onChange={(e) =>
                          setForecastScales({
                            ...forecastScales,
                            morning: parseInt(e.target.value, 10),
                          })
                        }
                        className="absolute top-0 left-1/2 transform -translate-x-1/2 w-64 h-full touch-slider vertical-slider-rotated"
                        style={{
                          transform: "translateX(-50%) rotate(-90deg)",
                          transformOrigin: "center",
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 text-2xl font-bold text-gray-900 mt-2">
                      {forecastScales.morning}%
                    </div>
                  </div>
                </div>

                {/* Afternoon Slider */}
                <div className="flex flex-col items-center">
                  <label className="text-sm font-semibold text-gray-700 mb-2">
                    Afternoon
                  </label>
                  <label className="text-xs text-gray-500 mb-3">
                    11:00-14:00
                  </label>
                  <div className="relative flex flex-col items-center h-64 w-full">
                    {/* Track background line */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-1 h-full bg-gray-300 rounded-full"></div>
                    {/* Slider container */}
                    <div className="relative w-full h-full">
                      <input
                        type="range"
                        min="50"
                        max="200"
                        step="5"
                        value={forecastScales.afternoon}
                        onChange={(e) =>
                          setForecastScales({
                            ...forecastScales,
                            afternoon: parseInt(e.target.value, 10),
                          })
                        }
                        className="absolute top-0 left-1/2 transform -translate-x-1/2 w-64 h-full touch-slider vertical-slider-rotated"
                        style={{
                          transform: "translateX(-50%) rotate(-90deg)",
                          transformOrigin: "center",
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 text-2xl font-bold text-gray-900 mt-2">
                      {forecastScales.afternoon}%
                    </div>
                  </div>
                </div>

                {/* Evening Slider */}
                <div className="flex flex-col items-center">
                  <label className="text-sm font-semibold text-gray-700 mb-2">
                    Evening
                  </label>
                  <label className="text-xs text-gray-500 mb-3">
                    14:00-17:00
                  </label>
                  <div className="relative flex flex-col items-center h-64 w-full">
                    {/* Track background line */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-1 h-full bg-gray-300 rounded-full"></div>
                    {/* Slider container */}
                    <div className="relative w-full h-full">
                      <input
                        type="range"
                        min="50"
                        max="200"
                        step="5"
                        value={forecastScales.evening}
                        onChange={(e) =>
                          setForecastScales({
                            ...forecastScales,
                            evening: parseInt(e.target.value, 10),
                          })
                        }
                        className="absolute top-0 left-1/2 transform -translate-x-1/2 w-64 h-full touch-slider vertical-slider-rotated"
                        style={{
                          transform: "translateX(-50%) rotate(-90deg)",
                          transformOrigin: "center",
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 text-2xl font-bold text-gray-900 mt-2">
                      {forecastScales.evening}%
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-gray-500 text-center">
                Adjust forecast demand by time period to test different
                scenarios. This will regenerate the schedule with scaled
                batches.
              </p>
            </div>
            <button
              onClick={handleStart}
              disabled={
                loading || (mode === "preset" && availableDates.length === 0)
              }
              className="touch-button w-full bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:opacity-50 shadow-md active:shadow-sm"
            >
              {loading ? "Starting..." : "Start Simulation"}
            </button>
          </div>
        ) : (
          <div className="flex gap-3 w-full">
            {simulation?.status === "running" && (
              <button
                onClick={handlePause}
                className="touch-button flex-1 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 shadow-md active:shadow-sm"
              >
                Pause
              </button>
            )}
            {simulation?.status === "paused" && (
              <button
                onClick={handleResume}
                className="touch-button flex-1 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-md active:shadow-sm"
              >
                Resume
              </button>
            )}
            <button
              onClick={handleStop}
              className="touch-button flex-1 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-md active:shadow-sm"
            >
              Stop
            </button>
            <button
              onClick={handleReset}
              className="touch-button flex-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700 shadow-md active:shadow-sm"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Simulation Status */}
      {simulation && (
        <div className="space-y-6">
          {/* Top Row: Status and Statistics Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current Status */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Simulation Status
              </h3>
              <div className="grid grid-cols-2 gap-4">
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
              {/* Connection status indicator */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      websocketConnected ? "bg-green-500" : "bg-yellow-500"
                    }`}
                  ></div>
                  <p className="text-xs text-gray-600">
                    {websocketConnected
                      ? "Real-time updates active"
                      : "Using polling fallback (check network connection)"}
                  </p>
                </div>
              </div>
            </div>

            {/* Statistics */}
            {simulation.stats && (
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Statistics
                  </h3>
                  <div className="flex flex-col gap-2 items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={suggestedBatchesEnabled}
                        onChange={(e) =>
                          setSuggestedBatchesEnabled(e.target.checked)
                        }
                        className="touch-input w-5 h-5"
                      />
                      <span className="text-sm text-gray-600">
                        Show Suggested Batches
                      </span>
                    </label>
                    {suggestedBatchesEnabled && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoAddSuggestedBatches}
                          onChange={(e) =>
                            setAutoAddSuggestedBatches(e.target.checked)
                          }
                          className="touch-input w-5 h-5"
                        />
                        <span className="text-sm text-gray-600">
                          Auto-Add to Schedule
                        </span>
                      </label>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                    <div>
                      <p className="text-sm text-gray-500">Items Processed</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatNumber(simulation.stats.itemsProcessed || 0)} /{" "}
                        {formatNumber(simulation.stats.itemsTotal || 0)}
                      </p>
                    </div>
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
          </div>

          {/* Batches Timeline (Full Width) */}
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
                onBatchDelete={handleBatchDelete}
                onBatchMove={handleBatchMove}
                canEdit={true}
                options={{
                  hourInterval: 1,
                  minutesPerPixel: 0.3,
                  rackHeight: 140,
                }}
              />
            </div>
          )}

          {/* Second Row: Planned and Actual Orders Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Planned Items from Scheduled Batches */}
            {((simulation.batches && simulation.batches.length > 0) ||
              (simulation.completedBatches &&
                simulation.completedBatches.length > 0)) && (
              <ExpectedOrders
                batches={simulation.batches || []}
                completedBatches={simulation.completedBatches || []}
              />
            )}

            {/* Actual Orders */}
            <ActualOrders
              processedOrdersByItem={simulation.processedOrdersByItem || []}
            />
          </div>

          {/* Third Row: Visual Inventory and Stockouts Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Visual Inventory */}
            {simulation.inventory &&
              (Object.keys(simulation.inventory).length > 0 ||
                (simulation.completedBatches &&
                  simulation.completedBatches.length > 0)) && (
                <VisualInventory
                  inventory={
                    simulation.inventory instanceof Map
                      ? simulation.inventory
                      : new Map(Object.entries(simulation.inventory || {}))
                  }
                  inventoryUnits={simulation.inventoryUnits}
                  completedBatches={simulation.completedBatches || []}
                  currentTime={simulation.currentTime || "06:00"}
                  bakeSpecs={bakeSpecs}
                />
              )}

            {/* Stockouts & Missed Orders */}
            <Stockout
              missedOrders={simulation.missedOrders || []}
              events={simulation.recentEvents || []}
            />
          </div>

          {/* Suggested Batches Row */}
          {suggestedBatchesEnabled && (
            <SuggestedBatches
              simulationId={simulationId}
              onAddBatch={handleAddSuggestedBatch}
              enabled={suggestedBatchesEnabled}
              autoAdd={autoAddSuggestedBatches}
              existingBatches={memoizedExistingBatches}
              currentSimulationTime={simulation?.currentTime || null}
            />
          )}

          {/* Catering Orders Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Catering Order Form */}
            <CateringOrderForm
              simulationId={simulationId}
              bakeSpecs={bakeSpecs}
              currentSimulationTime={simulation?.currentTime || null}
              autoApprove={autoApproveCatering}
              onSubmit={handleCateringOrderSubmit}
              onError={(err) => {
                console.error("Catering order error:", err);
              }}
            />

            {/* Catering Orders List */}
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Auto-Approve
                  </h3>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={autoApproveCatering}
                      onChange={(e) =>
                        handleAutoApproveToggle(e.target.checked)
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      Auto-approve catering orders
                    </span>
                  </label>
                </div>
              </div>
              <CateringOrdersList
                simulationId={simulationId}
                cateringOrders={cateringOrders}
                onOrderUpdate={handleCateringOrderUpdate}
              />
            </div>
          </div>

          {/* Fifth Row: POS/Order Status and Recent Events Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* POS - Point of Sale (Manual Mode Only) */}
            {simulation.mode === "manual" && (
              <div
                className="bg-white shadow rounded-lg p-6 flex flex-col"
                style={{ minHeight: "500px", maxHeight: "500px" }}
              >
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Point of Sale
                </h3>
                {availableItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 flex-1 flex items-center justify-center">
                    No items available for purchase yet. Wait for batches to
                    become available.
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>
                )}
              </div>
            )}

            {/* Order Processing Status (Preset Mode Only) */}
            {simulation.mode === "preset" && (
              <div
                className="bg-white shadow rounded-lg p-6 flex flex-col"
                style={{ minHeight: "500px", maxHeight: "500px" }}
              >
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Order Processing Status
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Items</span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatNumber(simulation.stats.itemsTotal || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      Items Processed
                    </span>
                    <span className="text-lg font-bold text-green-600">
                      {formatNumber(simulation.stats.itemsProcessed || 0)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                    <div
                      className="bg-green-600 h-2.5 rounded-full transition-all"
                      style={{
                        width: `${
                          simulation.stats.itemsTotal > 0
                            ? (simulation.stats.itemsProcessed /
                                simulation.stats.itemsTotal) *
                              100
                            : 0
                        }%`,
                      }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Items are automatically processed when inventory becomes
                    available. Missed items are logged in Recent Events.
                  </p>
                </div>
              </div>
            )}

            {/* Recent Events */}
            {simulation.recentEvents && simulation.recentEvents.length > 0 && (
              <div
                className="bg-white shadow rounded-lg p-6 flex flex-col"
                style={{ minHeight: "500px", maxHeight: "500px" }}
              >
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Recent Events
                </h3>
                <div className="flex-1 overflow-y-auto space-y-2">
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
          </div>

          {/* Batches Table (Active + Completed) */}
          {((simulation.batches && simulation.batches.length > 0) ||
            (simulation.completedBatches &&
              simulation.completedBatches.length > 0)) && (
            <div
              className="bg-white shadow rounded-lg p-6 flex flex-col"
              style={{ minHeight: "500px", maxHeight: "500px" }}
            >
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                All Batches (Table View)
              </h3>
              <div className="flex-1 overflow-auto">
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
