# Backend Functions Documentation

## Table of Contents

- [Server & Main Entry](#server--main-entry)
- [ABS (Automated Bake Scheduler)](#abs-automated-bake-scheduler)
- [Simulation](#simulation)
- [Bake Specs](#bake-specs)
- [Configuration](#configuration)
- [Forecast](#forecast)
- [Inventory](#inventory)
- [Orders](#orders)
- [Velocity](#velocity)
- [Shared Utilities](#shared-utilities)

---

## Server & Main Entry

### server.js

#### `startServer()`

Initializes and starts the Express server with MongoDB connection and WebSocket support.

- Connects to MongoDB
- Starts HTTP server with Socket.IO
- Sets up health check endpoint
- Handles graceful shutdown

#### Health Check Endpoint Handler

`GET /health`

- Checks database connectivity
- Returns server status and timestamp

#### WebSocket Connection Handler

Manages Socket.IO connections for real-time simulation updates.

- `connection` - Client connects
- `joinSimulation` - Client joins simulation room
- `leaveSimulation` - Client leaves simulation room
- `disconnect` - Client disconnects

---

## ABS (Automated Bake Scheduler)

### abs/controller.js

#### `generateScheduleController(req, res)`

POST `/api/abs/schedule/generate`
Generates a baking schedule for a specific date.

- **Params**: `date`, `forecastParams`, `restockThreshold`, `targetEndInventory`

#### `getScheduleController(req, res)`

GET `/api/abs/schedule/:date`
Retrieves a schedule by date.

#### `listSchedulesController(req, res)`

GET `/api/abs/schedule`
Lists schedules with date range filters.

- **Query**: `startDate`, `endDate`

#### `deleteScheduleController(req, res)`

DELETE `/api/abs/schedule/:date`
Deletes a schedule for a specific date.

#### `getEarliestDateController(req, res)`

GET `/api/abs/earliest-date`
Returns the earliest order date in the database.

#### `moveBatchController(req, res)`

POST `/api/abs/batch/move`
Moves a batch to a new time/rack position.

- **Params**: `scheduleId`, `batchId`, `newStartTime`, `newRack`

---

### abs/service.js

#### `validateBakeSpecForScheduling(bakeSpec)`

Validates that a bake spec has all required fields for scheduling.

- **Returns**: `{ valid: boolean, error?: string }`

#### `calculateBatches(forecastItem, bakeSpec, restockThreshold)`

Calculates the number of batches needed based on forecast and bake spec.

- **Returns**: Array of batch objects

#### `roundToTwentyMinuteIncrement(minutes, mode)`

Rounds minutes to the next 20-minute increment (:00, :20, :40).

- **Params**: `minutes` - Minutes to round
- **Params**: `mode` - 'ceil' or 'round'
- **Returns**: Rounded minutes

#### `isValidTwentyMinuteIncrement(minutes)`

Checks if a time is at a valid 20-minute increment.

- **Returns**: Boolean

#### `scheduleBatchesWithPAR(batches, timeIntervalForecast, bakeSpecMap, date)`

Schedules batches using PAR-based algorithm with time-interval forecasts.

- **Returns**: Array of scheduled batches

#### `getDefaultScheduleParams()`

Returns default parameters for schedule generation.

- **Returns**: Object with default params

#### `scheduleBatches(batches, date)`

Schedules batches into oven racks (fallback algorithm).

- **Returns**: Array of scheduled batches

#### `generateSchedule(params)`

Main schedule generation function.

- **Params**: `date`, `forecastParams`, `restockThreshold`, `targetEndInventory`
- **Returns**: Promise<Schedule object>

#### `getSchedule(date)`

Retrieves a schedule by date.

#### `getSchedules(startDate, endDate)`

Retrieves schedules by date range.

#### `deleteSchedule(date)`

Deletes a schedule by date.

#### `moveBatch(params)`

Moves a batch to a new time/rack position.

---

### abs/repository.js

#### `getEarliestOrderDate()`

Gets the earliest order date from the database.

- **Returns**: Promise<string|null> - Date string (YYYY-MM-DD)

#### `getForecastData(startDate, endDate)`

Gets forecast data for a date range.

#### `getBakeSpecs()`

Gets all active bake specs.

#### `getBakeSpecByItemGuid(itemGuid)`

Gets a bake spec by item GUID.

#### `saveSchedule(schedule)`

Saves or updates a schedule in the database.

#### `getScheduleByDate(date)`

Retrieves a schedule by date.

#### `getSchedulesByDateRange(startDate, endDate)`

Retrieves schedules by date range.

#### `deleteScheduleByDate(date)`

Deletes a schedule by date.

#### `updateScheduleBatch(scheduleId, batchId, updates)`

Updates a batch within a schedule.

#### `deleteScheduleBatch(scheduleId, batchId)`

Deletes a batch from a schedule.

---

## Simulation

### abs/simulation/controller.js

#### `startSimulationController(req, res)`

POST `/api/abs/simulation/start`
Starts a new simulation.

- **Params**: `scheduleDate`, `speedMultiplier`, `mode`, `forecastScale`, `forecastScales`

#### `getSimulationStatusController(req, res)`

GET `/api/abs/simulation/:id/status`
Gets the current status of a simulation.

#### `getSimulationResultsController(req, res)`

GET `/api/abs/simulation/:id/results`
Gets the final results of a simulation.

#### `pauseSimulationController(req, res)`

POST `/api/abs/simulation/:id/pause`
Pauses a running simulation.

#### `resumeSimulationController(req, res)`

POST `/api/abs/simulation/:id/resume`
Resumes a paused simulation.

#### `stopSimulationController(req, res)`

POST `/api/abs/simulation/:id/stop`
Stops a simulation.

#### `getAvailableDatesController(req, res)`

GET `/api/abs/simulation/available-dates`
Gets available dates for preset mode.

#### `moveSimulationBatchController(req, res)`

POST `/api/abs/simulation/:id/batch/move`
Moves a batch in a simulation.

#### `deleteSimulationBatchController(req, res)`

DELETE `/api/abs/simulation/:id/batch/:batchId`
Deletes a batch from a simulation.

#### `getSuggestedBatchesController(req, res)`

GET `/api/abs/simulation/:id/suggested-batches`
Gets suggested batches for a simulation.

- **Query**: `mode` - 'predictive' or 'reactive'

#### `autoRemoveBatchesController(req, res)`

POST `/api/abs/simulation/:id/batch/auto-remove`
Auto-removes excess batches.

#### `addSimulationBatchController(req, res)`

POST `/api/abs/simulation/:id/batch/add`
Adds a new batch to a simulation.

#### `createCateringOrderController(req, res)`

POST `/api/abs/simulation/:id/catering-order`
Creates a catering order.

#### `approveCateringOrderController(req, res)`

POST `/api/abs/simulation/:id/catering-order/:orderId/approve`
Approves a pending catering order.

#### `rejectCateringOrderController(req, res)`

POST `/api/abs/simulation/:id/catering-order/:orderId/reject`
Rejects a pending catering order.

#### `getCateringOrdersController(req, res)`

GET `/api/abs/simulation/:id/catering-orders`
Gets all catering orders for a simulation.

#### `setAutoApproveCateringController(req, res)`

POST `/api/abs/simulation/:id/catering-order/auto-approve`
Sets auto-approve setting for catering orders.

#### `runHeadlessSimulationController(req, res)`

POST `/api/abs/simulation/headless/run`
Runs a headless simulation.

---

### abs/simulation/service.js

#### `SimulationState` (Class)

Manages the state of a running simulation.

**Methods:**

- `addEvent(type, message, data)` - Adds an event to the simulation log
- `getRealTimeElapsed()` - Gets elapsed real-world time
- `getSimulationTime()` - Gets current simulation time

#### `roundToTwentyMinuteIncrement(minutes, mode)`

Rounds minutes to nearest 20-minute increment.

#### `getOvenFromRack(rack)`

Calculates oven number from rack position.

#### `initializeRackEndTimes()`

Initializes rack end times map.

#### `calculateRackEndTimes(batches, rackEndTimes)`

Calculates when each rack becomes available.

#### `batchesOverlap(start1, end1, start2, end2)`

Checks if two time ranges overlap.

#### `sortBatchesByStartTime(batches)`

Sorts batches by start time.

#### `startSimulation(config)`

Starts a new simulation.

- **Returns**: Promise<SimulationState>

#### `updateSimulation(simulationId)`

Updates simulation state (called on interval).

#### `synchronizeSimulationClock(simulation, targetMinutes)`

Synchronizes simulation clock to a specific time.

#### `advanceSimulationTo(simulationId, targetMinutes)`

Advances simulation instantly to a specific minute (headless mode).

#### `pauseSimulation(simulationId)`

Pauses a running simulation.

#### `resumeSimulation(simulationId)`

Resumes a paused simulation.

#### `stopSimulation(simulationId)`

Stops a simulation.

#### `getSimulation(simulationId)`

Gets a simulation by ID.

#### `getAllSimulations()`

Gets all active simulations.

#### `calculateSuggestedBatches(simulationId, options)`

Calculates suggested batches based on actual vs expected orders.

- **Options**: `mode` - 'predictive' or 'reactive'

#### `autoRemoveExcessBatches(simulationId, options)`

Automatically removes excess scheduled batches.

#### `addSimulationBatch(simulationId, batchData)`

Adds a new batch to the simulation schedule.

#### `moveSimulationBatch(simulationId, batchId, newStartTime, newRack)`

Moves a batch to a new time/rack.

#### `deleteSimulationBatch(simulationId, batchId)`

Deletes a batch from simulation.

#### `createCateringOrder(simulationId, orderData)`

Creates a catering order.

- **Params**: `items`, `requiredAvailableTime`, `autoApprove`

#### `approveCateringOrder(simulationId, orderId)`

Approves a pending catering order.

#### `rejectCateringOrder(simulationId, orderId)`

Rejects a pending catering order.

#### `getCateringOrders(simulationId)`

Gets all catering orders for a simulation.

#### `setAutoApproveCatering(simulationId, enabled)`

Sets auto-approve setting for catering orders.

#### `cleanupOldSimulations()`

Cleans up stopped/completed simulations older than 1 hour.

#### `updateAllSimulations(io)`

Updates all running simulations and broadcasts via WebSocket.

---

### abs/simulation/headlessRunner.js

#### `ensureDatabaseConnection(uri)`

Ensures database connection is established.

#### `shutdownDatabaseConnection()`

Closes database connection.

#### `toInventoryEntries(inventoryLike)`

Converts inventory to array of entries.

#### `captureInventorySnapshot(simulation)`

Captures inventory snapshot at current time.

#### `mapOrderCollection(collection)`

Maps order collection to array.

#### `summarizeOrders(orderCollection)`

Summarizes orders by item.

#### `summarizeOrdersCondensed(orderCollection)`

Summarizes orders in condensed format.

#### `filterCriticalEvents(events)`

Filters to critical events only.

#### `condenseInventorySnapshots(snapshots, previousSnapshot)`

Condenses inventory snapshots to significant changes only.

#### `formatInventoryLine(snapshot)`

Formats inventory snapshot for logging.

#### `summarizeBatches(batches)`

Summarizes batches for logging.

#### `logReport(report)`

Logs simulation report to console.

#### `validateInterval(value)`

Validates interval value.

#### `applySuggestions(params)`

Applies suggested batches to simulation.

#### `runHeadlessSimulation(options)`

Runs a complete simulation without UI.

- **Returns**: Promise<Report object>

#### `parseCliArgs(argv)`

Parses command-line arguments.

#### `runFromCli()`

Runs headless simulation from CLI.

---

### abs/simulation/pos.js

#### `purchaseItems(simulationId, items, io)`

Purchases items from simulation inventory.

- **Params**: `simulationId`, `items` - Array of {itemGuid, quantity}
- **Returns**: Purchase result with updated inventory

#### `getAvailableItems(simulationId)`

Gets available items for purchase.

- **Returns**: Object with items array and total inventory

---

### abs/simulation/posController.js

#### `purchaseItemsController(req, res)`

POST `/api/abs/simulation/:id/pos/purchase`
Handles item purchase requests.

#### `getAvailableItemsController(req, res)`

GET `/api/abs/simulation/:id/pos/items`
Gets available items for purchase.

---

### abs/simulation/suggestions/predictive.js

#### `buildPredictiveContext(simulation)`

Builds context for predictive algorithm.

#### `calculateConsumptionRatios(actualQuantity, expectedQuantity)`

Calculates consumption ratios (actual vs expected).

#### `roundToTwentyMinuteIncrement(minutes, mode)`

Rounds minutes to nearest 20-minute increment.

#### `calculatePredictiveSuggestedBatches(simulation)`

Calculates suggested batches using predictive algorithm (forecast-driven).

- **Returns**: Promise<Array of suggested batches>

#### `calculatePredictiveRemovalCandidates(simulation, options)`

Calculates removal candidates (inverse of predictive suggestions).

- **Returns**: Promise<Array of removal candidates>

---

### abs/simulation/suggestions/reactive.js

#### `roundToTwentyMinuteIncrement(minutes, mode)`

Rounds minutes to nearest 20-minute increment.

#### `calculateReactiveSuggestedBatches(simulation)`

Calculates suggested batches using reactive algorithm (recent demand-driven).

- **Returns**: Promise<Array of suggested batches>

---

## Bake Specs

### bakespecs/controller.js

#### `getBakeSpecsController(req, res)`

GET `/api/bakespecs`
Gets all bake specs with optional filters.

- **Query**: `active`, `oven`

#### `getBakeSpecController(req, res)`

GET `/api/bakespecs/:itemGuid`
Gets a bake spec by item GUID.

#### `saveBakeSpecController(req, res)`

POST `/api/bakespecs` or PUT `/api/bakespecs/:itemGuid`
Creates or updates a bake spec.

#### `deleteBakeSpecController(req, res)`

DELETE `/api/bakespecs/:itemGuid`
Deletes a bake spec.

#### `bulkUpdateBakeSpecsController(req, res)`

POST `/api/bakespecs/bulk`
Bulk updates bake specs.

#### `getOvenConfigController(req, res)`

GET `/api/bakespecs/oven-config`
Gets oven configuration.

---

### bakespecs/service.js

#### `validateBakeSpec(bakeSpec)`

Validates a bake spec object.

- **Returns**: `{ valid: boolean, error?: string }`

#### `getBakeSpecs(filters)`

Gets all bake specs with optional filters.

#### `getBakeSpec(itemGuid)`

Gets a bake spec by item GUID.

#### `createOrUpdateBakeSpec(bakeSpec)`

Creates or updates a bake spec.

#### `removeBakeSpec(itemGuid)`

Deletes a bake spec.

#### `updateBakeSpecs(bakeSpecs)`

Bulk updates bake specs.

#### `getOvenConfig()`

Gets oven configuration.

---

### bakespecs/repository.js

#### `getAllBakeSpecs(filters)`

Gets all bake specs from database.

#### `getBakeSpecByItemGuid(itemGuid)`

Gets a bake spec by item GUID.

#### `saveBakeSpec(bakeSpec)`

Saves or updates a bake spec in database.

#### `deleteBakeSpec(itemGuid)`

Deletes a bake spec from database.

#### `bulkUpdateBakeSpecs(bakeSpecs)`

Bulk updates bake specs in database.

---

## Configuration

### config/database.js

#### `connectDatabase(uri)`

Connects to MongoDB.

- **Returns**: Promise<{client, db}>

#### `getDatabase()`

Gets database instance.

#### `getCollection(collectionName)`

Gets a MongoDB collection by name.

#### `createIndexes()`

Creates indexes for all collections.

#### `closeDatabase()`

Closes database connection.

#### `healthCheck()`

Checks database connection health.

- **Returns**: Promise<boolean>

---

### config/timezone.js

#### `getBusinessTime()`

Gets current date/time in business timezone.

- **Returns**: Date object in business timezone

#### `toBusinessTime(date)`

Converts UTC date to business timezone.

#### `fromBusinessTime(date)`

Converts business timezone date to UTC.

#### `formatBusinessDate(date, formatStr)`

Formats date in business timezone.

#### `getBusinessDayOfWeek(date)`

Gets day of week in business timezone (0-6).

#### `getMongoTimezone()`

Gets MongoDB timezone parameter for aggregations.

#### `startOfBusinessDay(date)`

Normalizes date to start of day in business timezone.

#### `endOfBusinessDay(date)`

Normalizes date to end of day in business timezone.

---

## Forecast

### forecast/controller.js

#### `generateForecastController(req, res)`

POST `/api/forecast/generate`
Generates a new forecast.

- **Params**: `startDate`, `endDate`, `increment`, `growthRate`, `lookbackWeeks`

#### `getCachedForecastController(req, res)`

GET `/api/forecast/cached`
Gets a cached forecast.

#### `clearCacheController(req, res)`

DELETE `/api/forecast/cache`
Clears forecast cache.

#### `compareForecastVsActualController(req, res)`

GET `/api/forecast/compare`
Compares forecast vs actual demand.

#### `getOverallForecastAccuracyController(req, res)`

GET `/api/forecast/overall-accuracy`
Gets overall forecast accuracy across all historical dates.

---

### forecast/service.js

#### `calculateAverages(historicalData)`

Calculates average daily quantity for each SKU.

#### `calculateDayOfWeekPatterns(historicalData, averages)`

Calculates day-of-week patterns.

#### `calculateTrends(historicalData)`

Detects trends using linear regression.

#### `calculateIntradayPatterns(historicalData, timeIntervalMinutes)`

Calculates intraday time-of-day patterns.

#### `distributeToTimeIntervals(dailyForecast, intradayPatterns, timeIntervalMinutes)`

Distributes daily forecast into time intervals.

#### `generateForecast(params)`

Main forecast generation function.

- **Params**: `startDate`, `endDate`, `increment`, `growthRate`, `lookbackWeeks`, `timeIntervalMinutes`
- **Returns**: Promise<Forecast object>

#### `getForecast(params)`

Gets cached forecast or generates new one.

#### `clearForecastCache(params)`

Clears forecast cache.

#### `compareForecastVsActual(date, forecastParams)`

Compares forecast vs actual demand for a specific date.

#### `getOverallForecastAccuracy(forecastParams)`

Calculates overall forecast accuracy across all available historical dates.

---

### forecast/repository.js

#### `getHistoricalData(startDate, endDate)`

Gets historical order data for forecast.

#### `getScheduledOrders(startDate, endDate)`

Gets scheduled orders (future known orders).

#### `getCachedForecast(params)`

Gets cached forecast from database.

#### `saveForecastCache(params, data)`

Saves forecast to cache.

#### `clearCache(params)`

Clears forecast cache.

---

## Inventory

### inventory/controller.js

#### `getInventoryController(req, res)`

GET `/api/inventory`
Gets inventory with restock suggestions.

- **Query**: `lookbackDays`, `leadTimeDays`

#### `getInventoryByItemGuidController(req, res)`

GET `/api/inventory/:itemGuid`
Gets inventory by item GUID.

#### `updateInventoryController(req, res)`

PUT `/api/inventory/:itemGuid`
Updates inventory quantity.

#### `bulkUpdateInventoryController(req, res)`

POST `/api/inventory/bulk`
Bulk updates inventory.

---

### inventory/service.js

#### `calculateAverageDailyConsumption(dailyVelocityData)`

Calculates average daily consumption from velocity data.

#### `calculateDaysUntilRestock(currentQuantity, restockThreshold, dailyConsumption)`

Calculates days until restock needed.

#### `calculateSuggestedOrderQuantity(currentQuantity, restockThreshold, parMax, dailyConsumption, leadTimeDays)`

Calculates suggested order quantity.

#### `getInventoryWithRestockSuggestions(lookbackDays, leadTimeDays)`

Gets inventory with restock suggestions.

#### `updateInventoryQuantity(itemGuid, quantity, displayName, restockThreshold)`

Updates inventory quantity.

#### `bulkUpdateInventoryQuantities(updates)`

Bulk updates inventory.

#### `getInventory(itemGuid)`

Gets inventory by item GUID.

---

### inventory/repository.js

#### `getAllInventory()`

Gets all inventory records from database.

#### `getInventoryByItemGuid(itemGuid)`

Gets inventory by item GUID.

#### `updateInventory(itemGuid, quantity, displayName, restockThreshold)`

Updates inventory quantity in database.

#### `bulkUpdateInventory(inventoryUpdates)`

Bulk updates inventory in database.

#### `deleteInventory(itemGuid)`

Deletes inventory record.

---

## Orders

### orders/controller.js

#### `loadOrdersController(req, res)`

POST `/api/orders/load`
Loads orders from uploaded JSON file.

#### `getOrderStatsController(req, res)`

GET `/api/orders/stats`
Gets order statistics for a date range.

- **Query**: `startDate`, `endDate`

#### `getDateRangesController(req, res)`

GET `/api/orders/date-ranges`
Gets available date ranges with order data.

#### `deleteOrderRangeController(req, res)`

DELETE `/api/orders/range`
Deletes orders in a date range.

#### `deleteAllOrdersController(req, res)`

DELETE `/api/orders/all`
Deletes all orders.

---

### orders/service.js

#### `autoInitializeBakeSpecs(orders)`

Auto-initializes bake specs for SKUs that don't have them yet.

#### `loadOrders(ordersArray)`

Loads orders from array (supports nested and flat formats).

#### `getOrderStats(startDate, endDate)`

Gets order statistics for date range.

#### `getAvailableDateRanges()`

Gets available date ranges with order data.

#### `deleteOrderRange(startDate, endDate)`

Deletes orders in date range.

#### `deleteAllOrderData()`

Deletes all orders.

---

### orders/repository.js

#### `bulkInsertOrders(orders)`

Bulk inserts orders with duplicate handling.

#### `getOrderStatistics(startDate, endDate)`

Gets order statistics from database.

#### `findDateRanges()`

Finds date ranges with order data.

#### `deleteByDateRange(startDate, endDate)`

Deletes orders by date range.

#### `deleteAllOrders()`

Deletes all orders.

#### `getOrdersByDateRange(startDate, endDate, limit)`

Gets orders for a date range (for preview/validation).

---

### orders/transformer.js

#### `isNestedFormat(order)`

Detects if order is in nested format.

#### `transformNestedOrder(nestedOrder)`

Transforms nested format order to flat format.

#### `transformFlatOrder(flatOrder)`

Transforms flat format order (validation/normalization).

#### `transformOrders(ordersArray)`

Transforms orders array to standard flat format (handles both nested and flat).

---

## Velocity

### velocity/controller.js

#### `getWeeklyVelocityController(req, res)`

GET `/api/velocity/weekly`
Gets weekly velocity data.

- **Query**: `startDate`, `endDate`

#### `getDailyVelocityController(req, res)`

GET `/api/velocity/daily`
Gets daily velocity data.

- **Query**: `startDate`, `endDate`, `sku`

#### `getIntradayVelocityController(req, res)`

GET `/api/velocity/intraday`
Gets intraday velocity data.

- **Query**: `itemGuid`, `date`, `interval`

---

### velocity/service.js

#### `getWeeklyVelocityData(startDate, endDate)`

Gets weekly velocity statistics.

#### `getDailyVelocityData(startDate, endDate, sku)`

Gets daily velocity statistics.

#### `getIntradayVelocityData(itemGuid, date, intervalMinutes)`

Gets intraday velocity statistics.

---

### velocity/repository.js

#### `getWeeklyVelocity(startDate, endDate)`

Gets weekly velocity from database (grouped by week and SKU).

#### `getDailyVelocity(startDate, endDate, sku)`

Gets daily velocity from database (grouped by date and SKU).

#### `getIntradayVelocity(itemGuid, date, intervalMinutes)`

Gets intraday velocity from database (grouped by time bucket).

---

## Shared Utilities

### shared/middleware/errorHandler.js

#### `errorHandler(err, req, res, next)`

Centralized error handling middleware for Express.

#### `notFoundHandler(req, res)`

404 Not Found handler.

#### `asyncHandler(fn)`

Async error wrapper - wraps async route handlers to catch errors.

---

### shared/middleware/requestLogger.js

#### `requestLogger(req, res, next)`

Request logging middleware.

- Logs request method, path, body, query params
- Logs response status and duration

---

### shared/utils/dateUtils.js

#### `formatDate(date)`

Formats date to standard format (YYYY-MM-DD).

#### `getDayOfWeek(date)`

Gets day of week name in business timezone.

#### `getDayOfWeekAbbr(date)`

Gets day of week abbreviation.

#### `calculateDaysBetween(startDate, endDate)`

Calculates days between two dates.

#### `getWeekNumber(date)`

Gets ISO week number for a date.

#### `getStartOfWeek(date)`

Gets start of week (Monday) for a date.

#### `getEndOfWeek(date)`

Gets end of week (Sunday) for a date.

#### `addDays(date, days)`

Adds days to a date.

#### `isToday(date)`

Checks if date is today in business timezone.

#### `isPast(date)`

Checks if date is in the past.

#### `isFuture(date)`

Checks if date is in the future.

---

### shared/utils/timeUtils.js

#### `parseTimeToMinutes(timeString)`

Parses time string to minutes since midnight.

- **Params**: `timeString` - Time in "HH:mm" format
- **Returns**: Minutes since midnight (0-1439)

#### `formatMinutesToTime(minutes)`

Formats minutes since midnight to time string.

- **Returns**: Time in "HH:mm" format

#### `getMinutesBetween(startTime, endTime)`

Calculates minutes between two times.

#### `addMinutesToTime(timeString, minutesToAdd)`

Adds minutes to a time string.

#### `isWithinBusinessHours(timeString, startTime, endTime)`

Checks if time is within business hours.

#### `getTimeBucket(timeString, intervalMinutes)`

Gets time bucket for a given time and interval.

#### `generateTimeBuckets(startTime, endTime, intervalMinutes)`

Generates time buckets between start and end time.

---

### shared/utils/validation.js

#### `validateDateRange(startDate, endDate)`

Validates date range.

- **Returns**: `{ valid: boolean, error?: string }`

#### `validateTimeRange(startTime, endTime)`

Validates time range.

#### `validateInterval(interval, allowed)`

Validates forecast interval.

#### `validateIntradayInterval(interval)`

Validates intraday interval (minutes).

#### `validateGrowthRate(growthRate)`

Validates growth rate multiplier.

#### `validateOrder(order)`

Validates order schema.

#### `validateOrders(orders)`

Validates batch of orders.

#### `isValidDateString(dateString)`

Validates date string format.

#### `isValidTimeString(timeString)`

Validates time string format.

---

## Constants

### config/constants.js

#### Exported Constants:

- `BUSINESS_TIMEZONE` - "America/New_York"
- `BUSINESS_HOURS` - Start/end times and minutes
- `OVEN_CONFIG` - Oven and rack configuration
- `FORECAST_DEFAULTS` - Default forecast parameters
- `ABS_DEFAULTS` - Default ABS parameters
- `COLLECTIONS` - MongoDB collection names
- `DEFAULT_SKUS` - Default SKU configurations
- `HTTP_STATUS` - HTTP status codes
- `VALIDATION` - Validation constraints

---

## Summary Statistics

- **Total Functions**: 200+
- **Total Controllers**: 50+
- **Total Service Functions**: 80+
- **Total Repository Functions**: 40+
- **Total Utility Functions**: 30+
- **Files Documented**: 44

---

_Generated on: 2025-11-21_
