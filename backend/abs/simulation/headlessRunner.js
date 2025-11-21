#!/usr/bin/env node
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import {
  startSimulation,
  advanceSimulationTo,
  calculateSuggestedBatches,
  addSimulationBatch,
  getSimulation,
} from "./service.js";
import { BUSINESS_HOURS } from "../../config/constants.js";
import { formatMinutesToTime } from "../../shared/utils/timeUtils.js";
import { connectDatabase, closeDatabase } from "../../config/database.js";

dotenv.config();

const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_MAX_SUGGESTIONS = 3;
const DEFAULT_MAX_AUTO_REMOVALS = 2;
const DEFAULT_MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/bakehouse";
let databaseReady = false;

async function ensureDatabaseConnection(uri = DEFAULT_MONGODB_URI) {
  if (databaseReady) {
    return;
  }
  await connectDatabase(uri);
  databaseReady = true;
}

async function shutdownDatabaseConnection() {
  if (!databaseReady) {
    return;
  }
  await closeDatabase();
  databaseReady = false;
}

function toInventoryEntries(inventoryLike) {
  if (!inventoryLike) {
    return [];
  }
  if (inventoryLike instanceof Map) {
    return Array.from(inventoryLike.entries()).map(([itemGuid, quantity]) => ({
      itemGuid,
      quantity,
    }));
  }
  if (Array.isArray(inventoryLike)) {
    return inventoryLike.map((item) => ({
      itemGuid: item.itemGuid || item[0],
      quantity: item.quantity ?? item[1],
    }));
  }
  return Object.entries(inventoryLike || {}).map(([itemGuid, quantity]) => ({
    itemGuid,
    quantity,
  }));
}

function captureInventorySnapshot(simulation) {
  const perItem = toInventoryEntries(simulation.inventory || new Map());
  const total = perItem.reduce((sum, entry) => sum + (entry.quantity || 0), 0);
  return {
    atMinutes: simulation.currentTime,
    time: formatMinutesToTime(simulation.currentTime),
    totalInventory: total,
    perItem,
  };
}

function mapOrderCollection(collection) {
  if (!collection) {
    return [];
  }
  if (collection instanceof Map) {
    return Array.from(collection.values());
  }
  if (Array.isArray(collection)) {
    return collection;
  }
  return Object.values(collection);
}

function summarizeOrders(orderCollection) {
  return mapOrderCollection(orderCollection).map((item) => ({
    itemGuid: item.itemGuid,
    displayName: item.displayName,
    totalQuantity: item.totalQuantity || item.totalRequested || 0,
    orders: item.orders || [],
  }));
}

function summarizeOrdersCondensed(orderCollection) {
  return mapOrderCollection(orderCollection).map((item) => ({
    itemGuid: item.itemGuid,
    displayName: item.displayName,
    totalQuantity: item.totalQuantity || item.totalRequested || 0,
    orderCount: (item.orders || []).length,
    // Only keep first and last order as samples
    sampleOrders:
      (item.orders || []).length > 0
        ? [
            item.orders[0],
            item.orders.length > 1 ? item.orders[item.orders.length - 1] : null,
          ].filter(Boolean)
        : [],
  }));
}

function filterCriticalEvents(events) {
  const criticalTypes = new Set([
    "order_missed",
    "batch_added",
    "simulation_started",
    "simulation_completed",
  ]);
  return events.filter((event) => criticalTypes.has(event.type));
}

function condenseInventorySnapshots(snapshots, previousSnapshot = null) {
  if (!snapshots || snapshots.length === 0) {
    return [];
  }

  const critical = [];
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  // Always include first and last
  critical.push({ ...first, reason: "start" });
  if (snapshots.length > 1) {
    critical.push({ ...last, reason: "end" });
  }

  // Find significant changes
  for (let i = 1; i < snapshots.length - 1; i++) {
    const current = snapshots[i];
    const prev = snapshots[i - 1];

    // Check for significant inventory changes (>20% change or crossing threshold)
    const totalChange = Math.abs(current.totalInventory - prev.totalInventory);
    const percentChange =
      prev.totalInventory > 0
        ? (totalChange / prev.totalInventory) * 100
        : totalChange > 0
        ? 100
        : 0;

    // Check for items dropping below threshold (assuming restockThreshold ~20)
    const itemsBelowThreshold = current.perItem.filter(
      (item) => item.quantity < 20
    ).length;
    const prevItemsBelowThreshold = prev.perItem.filter(
      (item) => item.quantity < 20
    ).length;

    if (
      percentChange > 20 ||
      itemsBelowThreshold !== prevItemsBelowThreshold ||
      totalChange > 30
    ) {
      critical.push({
        ...current,
        reason: `change: ${percentChange.toFixed(1)}%`,
      });
    }
  }

  // Deduplicate by time
  const seen = new Set();
  return critical.filter((snapshot) => {
    const key = snapshot.time;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatInventoryLine(snapshot) {
  const summary =
    snapshot.perItem.length === 0
      ? "none"
      : snapshot.perItem
          .map((entry) => `${entry.itemGuid || "item"}=${entry.quantity ?? 0}`)
          .join(", ");
  return `[${snapshot.time}] total=${snapshot.totalInventory} (${summary})`;
}

function summarizeBatches(batches) {
  return batches.map((batch) => ({
    batchId: batch.batchId,
    itemGuid: batch.itemGuid,
    displayName: batch.displayName,
    quantity: batch.quantity,
    rackPosition: batch.rackPosition,
    oven: batch.oven,
    startTime: batch.startTime,
    endTime: batch.endTime,
  }));
}

function logReport(report) {
  console.log(
    `\n=== Headless Simulation Report (${report.scheduleDate}) ===\n`
  );

  console.log("Initial schedule:");
  if (report.initialBatches.length === 0) {
    console.log("  (none)");
  } else {
    report.initialBatches.forEach((batch) => {
      console.log(
        `  - ${batch.startTime} | Rack ${batch.rackPosition} | ${
          batch.displayName || batch.itemGuid
        } x${batch.quantity}`
      );
    });
  }

  console.log("\nAuto-added batches:");
  if (report.addedBatches.length === 0) {
    console.log("  (none)");
  } else {
    report.addedBatches.forEach((entry) => {
      console.log(
        `  - ${entry.requestedAt} via ${entry.algorithm} | ${
          entry.displayName || entry.itemGuid
        } x${entry.quantity} @ ${entry.startTime} (rack ${entry.rackPosition})`
      );
    });
  }

  console.log("\nInventory snapshots:");
  if (report.inventorySnapshots.length === 0) {
    console.log("  (none)");
  } else {
    report.inventorySnapshots.forEach((snapshot) => {
      console.log(`  - ${formatInventoryLine(snapshot)}`);
    });
  }

  console.log("\nOrders processed:");
  if (report.orders.processed.length === 0) {
    console.log("  (none)");
  } else {
    report.orders.processed.forEach((item) => {
      console.log(
        `  - ${item.displayName || item.itemGuid}: ${
          item.totalQuantity || 0
        } units, ${item.orders.length} orders`
      );
    });
  }

  console.log("\nStockouts (missed orders):");
  if (report.orders.missed.length === 0) {
    console.log("  (none)");
  } else {
    report.orders.missed.forEach((item) => {
      console.log(
        `  - ${item.displayName || item.itemGuid}: ${
          item.totalQuantity || item.totalRequested || 0
        } units missed (${item.orders.length} orders)`
      );
    });
  }

  console.log("\nSimulation stats:");
  console.log(
    `  Processed: ${report.stats.itemsProcessed} / ${report.stats.itemsTotal}`
  );
  console.log(`  Missed: ${report.stats.itemsMissed}`);
  console.log(`  Peak inventory: ${report.stats.peakInventory}`);
  console.log(
    `  Batches started/completed: ${report.stats.batchesStarted} / ${report.stats.batchesCompleted}`
  );

  console.log("\nFinal inventory (end of day):");
  if (
    !report.stats.finalInventoryPerItem ||
    report.stats.finalInventoryPerItem.length === 0
  ) {
    console.log("  (none)");
  } else {
    console.log(`  Total: ${report.stats.finalInventoryTotal || 0} units`);
    report.stats.finalInventoryPerItem.forEach((item) => {
      console.log(
        `  - ${item.itemGuid || "unknown"}: ${item.quantity || 0} units`
      );
    });
  }
  console.log("");
}

function validateInterval(value) {
  const fallback = DEFAULT_INTERVAL_MINUTES;
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

async function applySuggestions({
  simulation,
  suggestionMode,
  maxSuggestionsPerInterval,
  minConfidencePercent,
  log,
}) {
  const suggestions = await calculateSuggestedBatches(simulation.id, {
    mode: suggestionMode,
  });

  const accepted = [];
  if (suggestions.length === 0) {
    log.suggestionRuns.push({
      atMinutes: simulation.currentTime,
      atTime: formatMinutesToTime(simulation.currentTime),
      requested: 0,
      accepted,
    });
    return;
  }

  const limit = Math.max(
    1,
    Number.isFinite(maxSuggestionsPerInterval)
      ? maxSuggestionsPerInterval
      : DEFAULT_MAX_SUGGESTIONS
  );

  for (const suggestion of suggestions) {
    if (accepted.length >= limit) {
      break;
    }
    const confidence = suggestion.reason?.confidencePercent ?? 100;
    if (confidence < minConfidencePercent) {
      continue;
    }
    const priorIds = new Set(simulation.batches.map((b) => b.batchId));
    await addSimulationBatch(simulation.id, suggestion);
    const updated = getSimulation(simulation.id);
    const newBatch = updated.batches.find((b) => !priorIds.has(b.batchId));
    if (newBatch) {
      const entry = {
        batchId: newBatch.batchId,
        itemGuid: newBatch.itemGuid,
        displayName: newBatch.displayName,
        quantity: newBatch.quantity,
        startTime: newBatch.startTime,
        rackPosition: newBatch.rackPosition,
        algorithm: suggestion.algorithm || suggestionMode,
        requestedStartTime: suggestion.startTime,
        requestedAt: formatMinutesToTime(simulation.currentTime),
        reason: suggestion.reason || null,
      };
      accepted.push(entry);
      log.addedBatches.push(entry);
    }
  }

  log.suggestionRuns.push({
    atMinutes: simulation.currentTime,
    atTime: formatMinutesToTime(simulation.currentTime),
    requested: suggestions.length,
    accepted,
  });
}

export async function runHeadlessSimulation(options = {}) {
  const {
    scheduleDate = new Date().toISOString().slice(0, 10),
    mode = "preset",
    suggestionMode = "predictive",
    suggestionIntervalMinutes = DEFAULT_INTERVAL_MINUTES,
    autoAddSuggestions = true,
    autoRemoveOverstock = false,
    maxSuggestionsPerInterval = DEFAULT_MAX_SUGGESTIONS,
    maxAutoRemovalsPerInterval = DEFAULT_MAX_AUTO_REMOVALS,
    minConfidencePercent = 0,
    logToConsole = true,
    autoConnectDatabase = true,
    closeDatabaseConnection = false, // Default to false for safety (don't kill server connection)
    mongodbUri = DEFAULT_MONGODB_URI,
    condensed = true, // New option: return condensed report
  } = options;

  if (!scheduleDate) {
    throw new Error("scheduleDate is required");
  }

  if (autoConnectDatabase) {
    await ensureDatabaseConnection(mongodbUri);
  }

  const intervalMinutes = validateInterval(suggestionIntervalMinutes);

  const simulation = await startSimulation({
    scheduleDate,
    mode,
    speedMultiplier: 60,
    autoRemoveSurplusBatches: autoRemoveOverstock,
    autoRemoveIntervalMinutes: intervalMinutes,
    autoRemoveMaxRemovals: maxAutoRemovalsPerInterval,
  });

  const report = {
    scheduleDate,
    simulationId: simulation.id,
    initialBatches: summarizeBatches(simulation.batches || []),
    suggestionRuns: [],
    addedBatches: [],
    inventorySnapshots: [],
    orders: {
      processed: [],
      missed: [],
    },
    stats: simulation.stats,
    events: simulation.events,
  };

  report.inventorySnapshots.push(captureInventorySnapshot(simulation));

  const endMinutes = BUSINESS_HOURS.END_MINUTES;

  while (
    simulation.status === "running" &&
    simulation.currentTime < endMinutes
  ) {
    if (autoAddSuggestions) {
      await applySuggestions({
        simulation,
        suggestionMode,
        maxSuggestionsPerInterval,
        minConfidencePercent,
        log: report,
      });
    }

    const nextTime = Math.min(
      simulation.currentTime + intervalMinutes,
      endMinutes
    );
    if (nextTime === simulation.currentTime) {
      break;
    }
    advanceSimulationTo(simulation.id, nextTime);
    report.inventorySnapshots.push(captureInventorySnapshot(simulation));
  }

  if (simulation.status === "running") {
    advanceSimulationTo(simulation.id, BUSINESS_HOURS.END_MINUTES);
    report.inventorySnapshots.push(captureInventorySnapshot(simulation));
  }

  const finalState = getSimulation(simulation.id);
  report.orders.processed = summarizeOrders(
    finalState.processedOrdersByItem || new Map()
  );
  report.orders.missed = summarizeOrders(finalState.missedOrders || new Map());
  report.stats = finalState.stats;
  report.events = finalState.events;
  report.finalInventory = captureInventorySnapshot(finalState);
  report.autoRemovalRuns = finalState.autoRemovalRuns || [];
  report.removedBatches = report.autoRemovalRuns.flatMap(
    (run) => run.removed || []
  );

  // Add final inventory per SKU to stats
  report.stats.finalInventoryPerItem = report.finalInventory.perItem || [];
  report.stats.finalInventoryTotal = report.finalInventory.totalInventory || 0;

  // Create condensed version if requested
  if (condensed) {
    const condensedReport = {
      scheduleDate: report.scheduleDate,
      simulationId: report.simulationId,
      initialBatches: report.initialBatches,
      addedBatches: report.addedBatches,
      removedBatches: report.removedBatches,
      // Condensed inventory snapshots (only critical moments)
      inventorySnapshots: condenseInventorySnapshots(report.inventorySnapshots),
      // Condensed orders (summaries with samples)
      orders: {
        processed: summarizeOrdersCondensed(
          finalState.processedOrdersByItem || new Map()
        ),
        missed: summarizeOrdersCondensed(finalState.missedOrders || new Map()),
      },
      // Only critical events
      criticalEvents: filterCriticalEvents(report.events || []),
      // Full stats
      stats: report.stats,
      // Summary of suggestion runs
      suggestionRuns: report.suggestionRuns.map((run) => ({
        atTime: run.atTime,
        requested: run.requested,
        acceptedCount: run.accepted.length,
        accepted: run.accepted.map((a) => ({
          itemGuid: a.itemGuid,
          displayName: a.displayName,
          quantity: a.quantity,
          startTime: a.startTime,
          algorithm: a.algorithm,
        })),
      })),
      autoRemovalRuns: report.autoRemovalRuns.map((run) => ({
        atTime: run.atTime,
        evaluated: run.evaluated,
        removedCount: run.removed.length,
        removed: run.removed.map((entry) => ({
          itemGuid: entry.itemGuid,
          displayName: entry.displayName,
          quantity: entry.quantity,
          startTime: entry.startTime,
        })),
      })),
      // Metadata
      metadata: {
        totalInventorySnapshots: report.inventorySnapshots.length,
        totalEvents: report.events.length,
        condensed: true,
      },
    };

    if (logToConsole) {
      logReport(report); // Still log full report to console
    }

    if (closeDatabaseConnection) {
      await shutdownDatabaseConnection();
    }

    return condensedReport;
  }

  if (logToConsole) {
    logReport(report);
  }

  return report;
}

function parseCliArgs(argv) {
  return argv.reduce(
    (acc, arg) => {
      if (arg.startsWith("--date=")) {
        acc.scheduleDate = arg.split("=")[1];
      } else if (arg.startsWith("--interval=")) {
        acc.suggestionIntervalMinutes = Number(arg.split("=")[1]);
      } else if (arg.startsWith("--algo=")) {
        acc.suggestionMode = arg.split("=")[1];
      } else if (arg === "--json") {
        acc.logToConsole = false;
        acc.logJson = true;
      } else if (arg === "--no-auto-add") {
        acc.autoAddSuggestions = false;
      } else if (arg.startsWith("--max=")) {
        acc.maxSuggestionsPerInterval = Number(arg.split("=")[1]);
      } else if (arg === "--auto-remove") {
        acc.autoRemoveOverstock = true;
      } else if (arg === "--no-auto-remove") {
        acc.autoRemoveOverstock = false;
      } else if (arg.startsWith("--auto-remove-max=")) {
        acc.maxAutoRemovalsPerInterval = Number(arg.split("=")[1]);
      } else if (arg.startsWith("--min-confidence=")) {
        acc.minConfidencePercent = Number(arg.split("=")[1]);
      } else if (arg.startsWith("--mongo=")) {
        acc.mongodbUri = arg.split("=")[1];
      }
      return acc;
    },
    {
      logToConsole: true,
    }
  );
}

async function runFromCli() {
  const options = parseCliArgs(process.argv.slice(2));
  // When running from CLI, default to closing the connection unless explicitly disabled
  if (options.closeDatabaseConnection === undefined) {
    options.closeDatabaseConnection = true;
  }

  try {
    const report = await runHeadlessSimulation(options);
    if (options.logJson) {
      console.log(JSON.stringify(report, null, 2));
    }
  } catch (error) {
    console.error("Headless simulation failed:", error);
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && currentFile === process.argv[1]) {
  runFromCli();
}
