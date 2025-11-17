import { useState, useEffect, useRef } from "react";
import { formatNumber } from "../../utils/formatters.js";
import { simulationAPI } from "../../utils/api.js";

/**
 * SuggestedBatches component - Displays suggested batches based on actual vs expected orders
 */
export default function SuggestedBatches({
  simulationId,
  onAddBatch,
  enabled = false,
  autoAdd = false,
  existingBatches = [],
  currentSimulationTime = null, // Current simulation time in "HH:MM" format
}) {
  const [suggestedBatches, setSuggestedBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefreshTime, setLastRefreshTime] = useState(null); // Track last refresh time
  const [intervalRefreshTrigger, setIntervalRefreshTrigger] = useState(0); // Force effect re-run on interval
  const lastSimulationTimeRef = useRef(null); // Track last simulation time we checked (in minutes)
  const currentSimulationTimeRef = useRef(currentSimulationTime); // Store current simulation time
  const addedBatchesRef = useRef(new Set()); // Track batches that have been added
  const onAddBatchRef = useRef(onAddBatch); // Store latest onAddBatch function
  const isFetchingRef = useRef(false); // Track if a fetch is in progress
  const existingBatchesRef = useRef(existingBatches || []); // Track existing batches in schedule
  const fetchFunctionRef = useRef(null); // Store fetch function for interval
  const simulationIdRef = useRef(simulationId); // Store simulationId for interval
  const autoAddRef = useRef(autoAdd); // Store autoAdd for interval callback

  // Helper function to create a unique key for a batch
  const getBatchKey = (batch) => `${batch.itemGuid}-${batch.startTime}`;

  // Helper function to check if a batch already exists in the schedule
  const batchExistsInSchedule = (suggestedBatch) => {
    return existingBatchesRef.current.some((existingBatch) => {
      // Match by itemGuid and startTime (within a small tolerance for rounding)
      if (existingBatch.itemGuid !== suggestedBatch.itemGuid) {
        return false;
      }
      // Compare start times - they should match exactly or be very close
      return existingBatch.startTime === suggestedBatch.startTime;
    });
  };

  // Update refs when props change
  useEffect(() => {
    existingBatchesRef.current = existingBatches || [];
    simulationIdRef.current = simulationId;
  }, [existingBatches, simulationId]);

  // Keep ref updated with latest function
  useEffect(() => {
    onAddBatchRef.current = onAddBatch;
  }, [onAddBatch]);

  // Fetch suggested batches when enabled
  useEffect(() => {
    // Update autoAdd ref first, before creating the function
    autoAddRef.current = autoAdd;

    if (!enabled || !simulationId) {
      setSuggestedBatches([]);
      addedBatchesRef.current.clear();
      setLoading(false);
      isFetchingRef.current = false;
      fetchFunctionRef.current = null;
      return;
    }

    const fetchSuggestedBatches = async (forceRefresh = false) => {
      // Use ref for simulationId to ensure we always have the latest
      const currentSimulationId = simulationIdRef.current;
      if (!currentSimulationId) {
        console.log("[SuggestedBatches] No simulation ID, skipping fetch");
        return;
      }
      // Prevent multiple simultaneous fetches unless forced (for interval refresh)
      if (!forceRefresh && isFetchingRef.current) {
        console.log("[SuggestedBatches] Fetch already in progress, skipping");
        return;
      }

      isFetchingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        console.log(
          "[SuggestedBatches] Fetching batches for simulation:",
          currentSimulationId
        );
        const response = await simulationAPI.getSuggestedBatches(
          currentSimulationId
        );
        // Axios interceptor already extracts response.data, so response is the data object
        // Backend returns: { success: true, data: { suggestedBatches: [...] } }
        // After interceptor: response = { success: true, data: { suggestedBatches: [...] } }
        console.log("[SuggestedBatches] Full response:", response);

        // Handle different possible response structures
        let newBatches = [];
        if (Array.isArray(response)) {
          // Response is directly an array
          newBatches = response;
        } else if (response?.data?.suggestedBatches) {
          // Response is { success: true, data: { suggestedBatches: [...] } }
          newBatches = response.data.suggestedBatches;
        } else if (response?.suggestedBatches) {
          // Response is { suggestedBatches: [...] }
          newBatches = response.suggestedBatches;
        } else if (response?.data && Array.isArray(response.data)) {
          // Response is { data: [...] }
          newBatches = response.data;
        }

        console.log("[SuggestedBatches] Extracted batches:", newBatches.length);
        console.log(
          "[SuggestedBatches] Existing batches in schedule:",
          existingBatchesRef.current.length
        );
        if (existingBatchesRef.current.length > 0) {
          console.log("[SuggestedBatches] Sample existing batch:", {
            itemGuid: existingBatchesRef.current[0]?.itemGuid,
            startTime: existingBatchesRef.current[0]?.startTime,
          });
        }
        if (newBatches.length > 0) {
          console.log("[SuggestedBatches] Sample suggested batch:", {
            itemGuid: newBatches[0]?.itemGuid,
            startTime: newBatches[0]?.startTime,
          });
        }

        // Filter out batches that have already been added OR already exist in the schedule
        const filteredBatches = newBatches.filter((batch) => {
          const batchKey = getBatchKey(batch);
          // Don't show if we've already added it manually
          if (addedBatchesRef.current.has(batchKey)) {
            console.log(
              "[SuggestedBatches] Filtering out (manually added):",
              batchKey
            );
            return false;
          }
          // Don't show if it already exists in the schedule
          const exists = batchExistsInSchedule(batch);
          if (exists) {
            console.log(
              "[SuggestedBatches] Filtering out (exists in schedule):",
              batchKey,
              {
                suggested: {
                  itemGuid: batch.itemGuid,
                  startTime: batch.startTime,
                },
              }
            );
            // Also mark it as added so we don't show it again
            addedBatchesRef.current.add(batchKey);
            return false;
          }
          return true;
        });

        console.log(
          "[SuggestedBatches] After filtering:",
          filteredBatches.length,
          "batches remain"
        );
        setSuggestedBatches(filteredBatches);
        setLastRefreshTime(new Date()); // Update last refresh time

        // Auto-add new batches if enabled
        console.log("[SuggestedBatches] Auto-add check:", {
          autoAddRefCurrent: autoAddRef.current,
          hasOnAddBatch: !!onAddBatchRef.current,
          filteredBatchesCount: filteredBatches.length,
        });
        if (autoAddRef.current && onAddBatchRef.current) {
          console.log(
            "[SuggestedBatches] Auto-adding batches:",
            filteredBatches.length
          );
          filteredBatches.forEach((batch) => {
            const batchKey = getBatchKey(batch);
            // Mark as added immediately
            addedBatchesRef.current.add(batchKey);
            // Remove from state for instant UI feedback
            setSuggestedBatches((prev) =>
              prev.filter((b) => getBatchKey(b) !== batchKey)
            );
            // Add batch asynchronously
            onAddBatchRef.current(batch).catch((err) => {
              console.error("Failed to auto-add batch:", err);
              // Remove from set on error so we can retry
              addedBatchesRef.current.delete(batchKey);
              // Restore the batch in the list
              setSuggestedBatches((prev) => {
                const exists = prev.some((b) => getBatchKey(b) === batchKey);
                if (!exists) {
                  return [...prev, batch];
                }
                return prev;
              });
            });
          });
        }
      } catch (err) {
        console.error("Failed to fetch suggested batches:", err);
        console.error("Error details:", {
          message: err.message,
          status: err.status,
          response: err.response,
        });
        setError(err.message || "Failed to load suggested batches");
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    };

    // Store fetch function in ref so interval can always call the latest version
    fetchFunctionRef.current = fetchSuggestedBatches;

    // Initial fetch
    fetchSuggestedBatches();

    return () => {
      isFetchingRef.current = false;
      fetchFunctionRef.current = null;
    };
  }, [enabled, simulationId, autoAdd, intervalRefreshTrigger]); // intervalRefreshTrigger forces re-fetch on interval

  // Helper function to convert "HH:MM" time string to minutes since midnight
  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== "string") return null;
    const [hours, minutes] = timeStr.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
  };

  // Update simulation time ref when it changes
  useEffect(() => {
    currentSimulationTimeRef.current = currentSimulationTime;
  }, [currentSimulationTime]);

  // Check simulation time periodically and trigger refresh when enough simulation time has passed
  useEffect(() => {
    if (!enabled || !simulationId) {
      return;
    }

    console.log(
      "[SuggestedBatches] Setting up simulation-time-based refresh checker (every 10 sim minutes)"
    );

    // Check frequently (every 250ms) to catch simulation time changes even at high speeds
    // At 2400x speed, 10 sim minutes = 0.25 real seconds, so 250ms ensures we don't miss it
    const checkInterval = setInterval(() => {
      const currentSimTime = currentSimulationTimeRef.current;
      if (!currentSimTime) return;

      const currentSimMinutes = parseTimeToMinutes(currentSimTime);
      if (!currentSimMinutes) return;

      const lastCheckMinutes = lastSimulationTimeRef.current;
      const SIMULATION_CHECK_INTERVAL_MINUTES = 10; // Check every 10 simulation minutes

      // Initialize on first check
      if (lastCheckMinutes === null) {
        lastSimulationTimeRef.current = currentSimMinutes;
        console.log(
          `[SuggestedBatches] Initialized simulation time check at ${currentSimTime}`
        );
        return;
      }

      // Calculate how much simulation time has passed
      const simulationTimePassed = currentSimMinutes - lastCheckMinutes;

      // If enough simulation time has passed (10 minutes), trigger refresh
      if (simulationTimePassed >= SIMULATION_CHECK_INTERVAL_MINUTES) {
        console.log(
          `[SuggestedBatches] ${simulationTimePassed} simulation minutes passed, triggering refresh at ${currentSimTime}`
        );
        lastSimulationTimeRef.current = currentSimMinutes;

        // If autoAdd is enabled, toggle the refresh trigger to force effect re-run
        if (autoAddRef.current) {
          console.log(
            "[SuggestedBatches] Incrementing intervalRefreshTrigger to force re-fetch"
          );
          setIntervalRefreshTrigger((prev) => prev + 1);
        } else {
          // If autoAdd is off, just call the fetch function directly
          if (fetchFunctionRef.current) {
            fetchFunctionRef.current(true); // Force refresh
          } else {
            console.warn("[SuggestedBatches] Fetch function not available");
          }
        }
      }
    }, 250); // Check every 250ms to work at any speed (even 2400x where 10 sim min = 0.25 real sec)

    return () => {
      console.log("[SuggestedBatches] Clearing simulation time checker");
      clearInterval(checkInterval);
      lastSimulationTimeRef.current = null; // Reset when disabled
    };
  }, [enabled, simulationId]); // Only depend on enabled and simulationId

  if (!enabled) {
    return null;
  }

  if (loading) {
    return (
      <div
        className="bg-white shadow rounded-lg p-6 flex flex-col"
        style={{ minHeight: "500px", maxHeight: "500px" }}
      >
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Suggested Batches
        </h3>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Loading suggestions...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="bg-white shadow rounded-lg p-6 flex flex-col"
        style={{ minHeight: "500px", maxHeight: "500px" }}
      >
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Suggested Batches
        </h3>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (suggestedBatches.length === 0) {
    return (
      <div
        className="bg-white shadow rounded-lg p-6 flex flex-col"
        style={{ minHeight: "500px", maxHeight: "500px" }}
      >
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Suggested Batches
        </h3>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="mb-2">No batch suggestions at this time.</p>
            <p className="text-sm">
              Suggestions appear when actual orders exceed expected orders.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Filter out batches that have been added or exist in schedule (double-check)
  const visibleBatches = suggestedBatches.filter((batch) => {
    const batchKey = getBatchKey(batch);
    // Don't show if we've manually added it
    if (addedBatchesRef.current.has(batchKey)) {
      return false;
    }
    // Don't show if it exists in the schedule
    if (batchExistsInSchedule(batch)) {
      addedBatchesRef.current.add(batchKey);
      return false;
    }
    return true;
  });

  const handleAddBatch = async (batch) => {
    if (!onAddBatchRef.current) return;

    const batchKey = getBatchKey(batch);

    // Mark as added immediately for instant UI feedback
    addedBatchesRef.current.add(batchKey);
    // Force re-render by updating state
    setSuggestedBatches((prev) =>
      prev.filter((b) => getBatchKey(b) !== batchKey)
    );

    try {
      await onAddBatchRef.current(batch);
    } catch (err) {
      console.error("Failed to add batch:", err);
      // Remove from set on error so we can retry
      addedBatchesRef.current.delete(batchKey);
      // Restore the batch in the list
      setSuggestedBatches((prev) => {
        // Check if batch is already in the list
        const exists = prev.some((b) => getBatchKey(b) === batchKey);
        if (!exists) {
          return [...prev, batch];
        }
        return prev;
      });
    }
  };

  if (visibleBatches.length === 0 && suggestedBatches.length > 0) {
    return (
      <div
        className="bg-white shadow rounded-lg p-6 flex flex-col"
        style={{ minHeight: "500px", maxHeight: "500px" }}
      >
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Suggested Batches
        </h3>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="mb-2">All suggested batches have been added.</p>
            <p className="text-sm">New suggestions will appear as needed.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white shadow rounded-lg p-6 flex flex-col"
      style={{ minHeight: "500px", maxHeight: "500px" }}
    >
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">
            Suggested Batches ({visibleBatches.length})
          </h3>
          {lastRefreshTime && (
            <p className="text-xs text-gray-500 mt-1">
              Last refreshed: {lastRefreshTime.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {visibleBatches.map((batch) => (
          <div
            key={batch.batchId}
            className="border border-yellow-200 rounded-lg p-4 bg-yellow-50"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900">
                  {batch.displayName}
                </h4>
                <p className="text-xs text-gray-500 font-mono mt-1">
                  {batch.itemGuid}
                </p>
              </div>
              <button
                onClick={() => handleAddBatch(batch)}
                className="touch-button px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 active:bg-green-800"
              >
                Add to Schedule
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-yellow-200">
              <div>
                <p className="text-xs text-gray-600">Quantity</p>
                <p className="text-sm font-semibold text-gray-900">
                  {formatNumber(batch.quantity)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Start Time</p>
                <p className="text-sm font-semibold text-gray-900">
                  {batch.startTime}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Available Time</p>
                <p className="text-sm font-semibold text-gray-900">
                  {batch.availableTime}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Consumption Ratio</p>
                <p className="text-sm font-semibold text-orange-600">
                  {batch.reason?.consumptionRatio?.toFixed(2)}x
                </p>
              </div>
            </div>

            {/* Reason details */}
            {batch.reason && (
              <div className="mt-3 pt-3 border-t border-yellow-200">
                <p className="text-xs font-medium text-gray-700 mb-1">
                  Why this batch is suggested:
                </p>
                <div className="text-xs text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Actual orders:</span>
                    <span className="font-semibold">
                      {formatNumber(batch.reason.actualQuantity)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Expected orders:</span>
                    <span className="font-semibold">
                      {formatNumber(batch.reason.expectedQuantity)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current inventory:</span>
                    <span className="font-semibold">
                      {formatNumber(batch.reason.currentInventory)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Projected remaining demand:</span>
                    <span className="font-semibold text-orange-600">
                      {formatNumber(
                        Math.round(batch.reason.projectedRemainingDemand)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Shortfall:</span>
                    <span className="font-semibold text-red-600">
                      {formatNumber(batch.reason.shortfall)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
