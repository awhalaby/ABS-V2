import { useState } from "react";
import { format as formatDateFns, addDays } from "date-fns";
import { simulationAPI } from "../utils/api.js";
import LoadingSpinner from "../components/common/LoadingSpinner.jsx";
import ErrorMessage from "../components/common/ErrorMessage.jsx";
import { formatTime } from "../utils/formatters.js";

export default function HeadlessSimulationPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);

  // Form state
  const [scheduleDate, setScheduleDate] = useState(
    formatDateFns(addDays(new Date(), 1), "yyyy-MM-dd")
  );
  const [mode, setMode] = useState("preset");
  const [suggestionMode, setSuggestionMode] = useState("predictive");
  const [suggestionIntervalMinutes, setSuggestionIntervalMinutes] =
    useState(30);
  const [autoAddSuggestions, setAutoAddSuggestions] = useState(true);
  const [maxSuggestionsPerInterval, setMaxSuggestionsPerInterval] = useState(3);
  const [minConfidencePercent, setMinConfidencePercent] = useState(0);
  const [autoRemoveOverstock, setAutoRemoveOverstock] = useState(false);
  const [maxAutoRemovalsPerInterval, setMaxAutoRemovalsPerInterval] =
    useState(2);
  const [condensed, setCondensed] = useState(true);

  const handleRunSimulation = async () => {
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const result = await simulationAPI.runHeadless({
        scheduleDate,
        mode,
        suggestionMode,
        suggestionIntervalMinutes,
        autoAddSuggestions,
        maxSuggestionsPerInterval,
        minConfidencePercent,
        condensed,
        autoRemoveOverstock,
        maxAutoRemovalsPerInterval,
      });
      // API returns { success: true, data: report }
      // axios interceptor returns response.data, so result is { success: true, data: report }
      setReport(result.data || result);
    } catch (err) {
      setError(err.message || "Failed to run simulation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Headless Simulation Runner
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Run instant simulations to test algorithms and analyze results without
          real-time visualization.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Configuration
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Schedule Date
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mode
                </label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="preset">Preset (use historical orders)</option>
                  <option value="manual">Manual (interactive)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Suggestion Algorithm
                </label>
                <select
                  value={suggestionMode}
                  onChange={(e) => setSuggestionMode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="predictive">Predictive</option>
                  <option value="reactive">Reactive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Suggestion Interval (minutes)
                </label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  step="10"
                  value={suggestionIntervalMinutes}
                  onChange={(e) =>
                    setSuggestionIntervalMinutes(Number(e.target.value))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="autoAdd"
                  checked={autoAddSuggestions}
                  onChange={(e) => setAutoAddSuggestions(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="autoAdd"
                  className="ml-2 block text-sm text-gray-700"
                >
                  Auto-add suggestions
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="autoRemove"
                  checked={autoRemoveOverstock}
                  onChange={(e) => setAutoRemoveOverstock(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="autoRemove"
                  className="ml-2 block text-sm text-gray-700"
                >
                  Auto-remove surplus schedule batches
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="condensed"
                  checked={condensed}
                  onChange={(e) => setCondensed(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="condensed"
                  className="ml-2 block text-sm text-gray-700"
                >
                  Condensed report (smaller file, keeps critical moments)
                </label>
              </div>

              {autoAddSuggestions && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Suggestions Per Interval
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={maxSuggestionsPerInterval}
                      onChange={(e) =>
                        setMaxSuggestionsPerInterval(Number(e.target.value))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min Confidence (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={minConfidencePercent}
                      onChange={(e) =>
                        setMinConfidencePercent(Number(e.target.value))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </>
              )}

              {autoRemoveOverstock && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Auto Removals Per Interval
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={maxAutoRemovalsPerInterval}
                    onChange={(e) =>
                      setMaxAutoRemovalsPerInterval(Number(e.target.value))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              <button
                onClick={handleRunSimulation}
                disabled={loading}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {loading ? "Running..." : "Run Simulation"}
              </button>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2">
          {error && <ErrorMessage message={error} />}

          {loading && (
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
                <span className="ml-3 text-gray-600">
                  Running simulation...
                </span>
              </div>
            </div>
          )}

          {report && (
            <>
              <div className="mb-4 flex justify-end">
                <button
                  onClick={() => {
                    const dataStr = JSON.stringify(report, null, 2);
                    const dataBlob = new Blob([dataStr], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(dataBlob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `simulation-report-${
                      report.scheduleDate || "unknown"
                    }-${Date.now()}.json`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  }}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg
                    className="mr-2 h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Download JSON Report
                </button>
              </div>
              <SimulationReport report={report} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SimulationReport({ report }) {
  if (!report) {
    return <div className="text-gray-500">No report data available</div>;
  }

  return (
    <div className="bg-white shadow rounded-lg p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Simulation Report
          {report.metadata?.condensed && (
            <span className="ml-2 text-sm font-normal text-blue-600 bg-blue-50 px-2 py-1 rounded">
              Condensed
            </span>
          )}
        </h2>
        <p className="text-sm text-gray-600">
          Date: {report.scheduleDate || "N/A"}
          {report.metadata && (
            <span className="ml-4 text-xs text-gray-500">
              ({report.metadata.totalInventorySnapshots} snapshots →{" "}
              {report.inventorySnapshots?.length || 0} critical,{" "}
              {report.metadata.totalEvents} events →{" "}
              {report.criticalEvents?.length || report.events?.length || 0}{" "}
              critical)
            </span>
          )}
        </p>
      </div>

      {/* Initial Schedule */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Initial Schedule
        </h3>
        {!report.initialBatches || report.initialBatches.length === 0 ? (
          <p className="text-gray-500 text-sm">(none)</p>
        ) : (
          <div className="bg-gray-50 rounded-md p-4">
            <div className="space-y-2">
              {report.initialBatches.map((batch, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium">
                    {batch.displayName || batch.itemGuid}
                  </span>
                  <span className="text-gray-600">
                    {batch.startTime} | Rack {batch.rackPosition} | x
                    {batch.quantity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Auto-Added Batches */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Auto-Added Batches
        </h3>
        {!report.addedBatches || report.addedBatches.length === 0 ? (
          <p className="text-gray-500 text-sm">(none)</p>
        ) : (
          <div className="bg-blue-50 rounded-md p-4">
            <div className="space-y-2">
              {report.addedBatches.map((batch, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {batch.displayName || batch.itemGuid}
                    </span>
                    <span className="ml-2 text-xs text-gray-600">
                      via {batch.algorithm}
                    </span>
                  </div>
                  <span className="text-gray-600">
                    {batch.requestedAt} → {batch.startTime} | Rack{" "}
                    {batch.rackPosition} | x{batch.quantity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Auto-Removed Batches */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Auto-Removed Batches
        </h3>
        {!report.removedBatches || report.removedBatches.length === 0 ? (
          <p className="text-gray-500 text-sm">(none)</p>
        ) : (
          <div className="bg-red-50 rounded-md p-4">
            <div className="space-y-2">
              {report.removedBatches.map((batch, idx) => (
                <div
                  key={`${batch.batchId || idx}-${idx}`}
                  className="flex items-start justify-between text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {batch.displayName || batch.itemGuid}
                    </span>
                    {batch.reason?.type && (
                      <span className="ml-2 text-xs uppercase tracking-wide text-red-600">
                        {batch.reason.type.replace(/_/g, " ")}
                      </span>
                    )}
                    {batch.reason?.surplus !== undefined && (
                      <span className="ml-2 text-xs text-gray-500">
                        Surplus: {Math.round(batch.reason.surplus)}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-600">
                    {batch.startTime} | Rack {batch.rackPosition || "?"} | x
                    {batch.quantity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Inventory Snapshots */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Inventory Snapshots
        </h3>
        {!report.inventorySnapshots ||
        report.inventorySnapshots.length === 0 ? (
          <p className="text-gray-500 text-sm">(none)</p>
        ) : (
          <div className="bg-gray-50 rounded-md p-4 max-h-64 overflow-y-auto">
            <div className="space-y-1 text-sm">
              {report.inventorySnapshots.map((snapshot, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-gray-600">{snapshot.time}</span>
                  <span className="font-medium">
                    Total: {snapshot.totalInventory || 0} units
                  </span>
                  {snapshot.perItem && snapshot.perItem.length > 0 && (
                    <span className="text-gray-500 text-xs ml-2">
                      (
                      {snapshot.perItem
                        .map((i) => `${i.itemGuid}=${i.quantity}`)
                        .join(", ")}
                      )
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Orders Processed */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Orders Processed
        </h3>
        {!report.orders ||
        !report.orders.processed ||
        report.orders.processed.length === 0 ? (
          <p className="text-gray-500 text-sm">(none)</p>
        ) : (
          <div className="bg-green-50 rounded-md p-4">
            <div className="space-y-2">
              {report.orders.processed.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium">
                    {item.displayName || item.itemGuid}
                  </span>
                  <span className="text-gray-600">
                    {item.totalQuantity} units (
                    {item.orderCount !== undefined
                      ? item.orderCount
                      : item.orders?.length || 0}{" "}
                    orders
                    {item.sampleOrders && item.sampleOrders.length > 0 && (
                      <span className="text-xs text-gray-500 ml-1">
                        (sampled)
                      </span>
                    )}
                    )
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Stockouts */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Stockouts (Missed Orders)
        </h3>
        {!report.orders ||
        !report.orders.missed ||
        report.orders.missed.length === 0 ? (
          <p className="text-green-600 text-sm font-medium">✓ No stockouts</p>
        ) : (
          <div className="bg-red-50 rounded-md p-4">
            <div className="space-y-2">
              {report.orders.missed.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium text-red-900">
                    {item.displayName || item.itemGuid}
                  </span>
                  <span className="text-red-700">
                    {item.totalQuantity || item.totalRequested} units missed (
                    {item.orderCount !== undefined
                      ? item.orderCount
                      : item.orders?.length || 0}{" "}
                    orders
                    {item.sampleOrders && item.sampleOrders.length > 0 && (
                      <span className="text-xs text-red-500 ml-1">
                        (sampled)
                      </span>
                    )}
                    )
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Critical Events (condensed reports) */}
      {report.criticalEvents && report.criticalEvents.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Critical Events
          </h3>
          <div className="bg-yellow-50 rounded-md p-4 max-h-64 overflow-y-auto">
            <div className="space-y-1 text-sm">
              {report.criticalEvents.map((event, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-gray-600">
                    {event.timeString || event.time}
                  </span>
                  <span className="font-medium">{event.message}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Statistics */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Statistics</h3>
        {!report.stats ? (
          <p className="text-gray-500 text-sm">(no stats available)</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-md p-4">
              <div className="text-sm text-gray-600">Processed</div>
              <div className="text-2xl font-bold text-gray-900">
                {report.stats.itemsProcessed || 0} /{" "}
                {report.stats.itemsTotal || 0}
              </div>
            </div>
            <div className="bg-gray-50 rounded-md p-4">
              <div className="text-sm text-gray-600">Missed</div>
              <div className="text-2xl font-bold text-red-600">
                {report.stats.itemsMissed || 0}
              </div>
            </div>
            <div className="bg-gray-50 rounded-md p-4">
              <div className="text-sm text-gray-600">Peak Inventory</div>
              <div className="text-2xl font-bold text-gray-900">
                {report.stats.peakInventory || 0}
              </div>
            </div>
            <div className="bg-gray-50 rounded-md p-4">
              <div className="text-sm text-gray-600">Batches</div>
              <div className="text-2xl font-bold text-gray-900">
                {report.stats.batchesStarted || 0} /{" "}
                {report.stats.batchesCompleted || 0}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Final Inventory */}
      {report.stats &&
        report.stats.finalInventoryPerItem &&
        report.stats.finalInventoryPerItem.length > 0 && (
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Final Inventory (End of Day)
            </h3>
            <div className="bg-amber-50 rounded-md p-4">
              <div className="mb-2 text-sm font-medium text-gray-700">
                Total: {report.stats.finalInventoryTotal || 0} units
              </div>
              <div className="space-y-1">
                {report.stats.finalInventoryPerItem.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-700">
                      {item.itemGuid || "unknown"}
                    </span>
                    <span className="font-medium text-amber-900">
                      {item.quantity || 0} units
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
    </div>
  );
}
