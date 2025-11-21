# ABS-V2 System Documentation

**Purpose**: Complete inventory of the current system as a reference for rebuilding

**Date**: 2025-11-21

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Modules](#core-modules)
3. [Data Flow](#data-flow)
4. [Key Algorithms](#key-algorithms)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [Pain Points & Issues](#pain-points--issues)
8. [Frontend Pages](#frontend-pages)

---

## System Overview

### What This System Does

**Automatic Bakery Scheduler (ABS)** - A system for:

1. **Forecasting** future demand based on historical orders
2. **Scheduling** baking batches to meet forecasted demand
3. **Simulating** schedule execution in real-time to validate schedules
4. **Tracking** inventory and preventing stockouts
5. **Analyzing** forecast accuracy and velocity patterns

### Technology Stack

**Backend**:

- Node.js + Express
- MongoDB (for data storage)
- date-fns (date manipulation)
- simple-statistics (linear regression for trends)

**Frontend**:

- React + Vite
- TailwindCSS
- Recharts (charting)
- Axios (API calls)

**Deployment**:

- Heroku (backend & frontend)
- Docker containers

### Business Context

- **Timezone**: America/New_York (EST/EDT)
- **Business Hours**: Configurable (typically 6:00 AM - 10:00 PM)
- **Time Granularity**: 20-minute intervals
- **Oven Configuration**: 2 ovens, 6 racks each (12 total racks)

---

## Core Modules

### 1. Orders Module (`backend/orders/`)

**Purpose**: Import and manage historical order data

**Key Features**:

- Bulk upload orders from JSON
- Store orders with timezone-aware timestamps
- Query orders by date range
- Transform Square/Toast POS data into internal format

**Data Structure**:

```javascript
{
  orderId: string,
  paidDate: Date (UTC),
  itemGuid: string,
  displayName: string,
  quantity: number,
  price: number
}
```

**Key Functions**:

- `uploadOrders()` - Bulk import with duplicate detection
- `getOrdersByDateRange()` - Query with business timezone handling
- `transformSquareData()` / `transformToastData()` - POS data conversion

**Database**: `menu_items` collection

---

### 2. Forecast Module (`backend/forecast/`)

**Purpose**: Predict future demand using pattern-based forecasting

**Algorithm Overview**:

1. **Calculate historical averages** per SKU
2. **Detect day-of-week patterns** (Monday vs Friday, etc.)
3. **Detect trends** using linear regression
4. **Apply patterns to future dates** with growth adjustments
5. **Distribute to time intervals** using intraday patterns

**Key Features**:

- Daily forecasts with day-of-week patterns
- Time-interval forecasts (20-minute buckets)
- Trend detection (weekly growth/decline)
- Forecast caching for performance
- Forecast accuracy analysis (compare forecast vs actual)

**Data Flow**:

```
Historical Orders → Pattern Analysis → Forecast Generation → Cached Forecast
                                             ↓
                                    Time Interval Distribution
```

**Key Functions**:

- `generateForecast(params)` - Main forecast generation
- `calculateAverages()` - Compute historical averages
- `calculateDayOfWeekPatterns()` - Learn day-of-week multipliers
- `calculateTrends()` - Linear regression for growth
- `calculateIntradayPatterns()` - Time-of-day distribution
- `compareForecastVsActual()` - Accuracy analysis for single date
- `getOverallForecastAccuracy()` - Accuracy across all dates

**Parameters**:

- `startDate`, `endDate` - Forecast period
- `lookbackWeeks` - Historical period (default: 4 weeks)
- `growthRate` - Manual growth adjustment (default: 1.0)
- `timeIntervalMinutes` - Granularity (default: 20)

**Output**:

```javascript
{
  forecast: Array,           // Aggregated by increment (day/week/month)
  dailyForecast: Array,      // Daily records with patterns
  timeIntervalForecast: Array, // 20-minute interval records
  summary: Object,           // Totals and statistics
  parameters: Object         // Request parameters
}
```

**Database**: `forecasts` collection (cache)

**Known Issues**:

- ⚠️ Lag analysis shows "forecast lags actuals by 1 day" (MAE 64 vs 113 aligned)
- ⚠️ Multiple date representations (parseISO vs startOfBusinessDay)
- ⚠️ Timezone handling scattered across functions
- ⚠️ Complex nested logic in single file (1032 lines)

---

### 3. BakeSpecs Module (`backend/bakespecs/`)

**Purpose**: Define how each product is baked

**Data Structure**:

```javascript
{
  itemGuid: string,
  displayName: string,
  capacityPerRack: number,     // Units per batch
  bakeTimeMinutes: number,     // Time in oven
  coolTimeMinutes: number,     // Time to cool before available
  oven: number | null,         // Specific oven (1 or 2) or null for "any"
  freshWindowMinutes: number,  // How long item stays fresh
  restockThreshold: number     // Safety stock level
}
```

**Key Features**:

- CRUD operations for bake specs
- Validation of required fields
- Used by scheduling algorithm

**Database**: `bake_specs` collection

---

### 4. ABS (Schedule) Module (`backend/abs/`)

**Purpose**: Generate baking schedules from forecasts

**Algorithm Overview**:

1. Get forecast for target date
2. For each SKU, calculate batches needed (forecast + restock threshold)
3. Sort batches by priority (bake time, quantity)
4. Assign batches to racks using **greedy algorithm**:
   - Find earliest available rack
   - Round start time to 20-minute increment (:00, :20, :40)
   - Respect oven assignments
   - Schedule within business hours
5. Calculate end time (start + bake time)
6. Calculate available time (end + cool time)

**Key Constraints**:

- Batches start at 20-minute increments
- Max 12 batches running concurrently (12 racks)
- Respect oven assignments (if specified)
- Must finish within business hours

**Key Functions**:

- `generateSchedule(params)` - Main schedule generation
- `calculateBatches()` - Determine how many batches needed per SKU
- `scheduleBatches()` - Assign batches to racks/times
- `getScheduleByDate()` - Retrieve saved schedule

**Output**:

```javascript
{
  _id: ObjectId,
  date: string,
  batches: Array<{
    batchId: string,
    itemGuid: string,
    displayName: string,
    quantity: number,
    rackPosition: number (1-12),
    oven: number (1-2),
    startTime: string (HH:MM),
    endTime: string (HH:MM),
    availableTime: string (HH:MM),
    bakeTime: number,
    coolTime: number,
    status: "scheduled"
  }>,
  summary: {
    totalBatches: number,
    scheduledBatches: number,
    unscheduledBatches: number,
    totalQuantity: number
  },
  forecast: Array,
  timeIntervalForecast: Array,
  parConfig: Object
}
```

**Database**: `schedules` collection

**Known Issues**:

- ⚠️ Greedy algorithm doesn't optimize globally (just locally)
- ⚠️ No backtracking if schedule becomes infeasible
- ⚠️ Tightly coupled to forecast module

---

### 5. Simulation Module (`backend/abs/simulation/`)

**Purpose**: Real-time simulation of schedule execution

**What It Does**:

- Simulates a full business day at accelerated speed (60x default)
- Processes customer orders (preset or manual)
- Manages inventory with FIFO (first-in-first-out)
- Detects stockouts
- Tracks batch lifecycle (scheduled → baking → cooling → available)
- Provides batch suggestions (predictive and reactive)
- Supports catering orders (pre-orders requiring specific batches)
- Auto-removal of surplus batches

**Simulation State**:

```javascript
{
  id: string,
  scheduleDate: string,
  currentTime: number (minutes since midnight),
  speedMultiplier: number (60 = 60x speed),
  status: "running" | "paused" | "stopped" | "completed",

  // Inventory tracking
  inventoryUnits: Map<itemGuid, Array<{availableAt, batchId}>>,
  inventory: Map<itemGuid, quantity>,

  // Batch tracking
  batches: Array,
  completedBatches: Array,

  // Order tracking
  presetOrders: Array,
  processedOrders: Set,
  missedOrders: Map,

  // Statistics
  stats: {
    batchesStarted, batchesCompleted, batchesPulled,
    totalInventory, peakInventory,
    itemsProcessed, itemsTotal, itemsMissed
  },

  // Events log
  events: Array
}
```

**Key Features**:

1. **Time Progression**:

   - Updates every 100ms real-time
   - Advances simulation time based on speedMultiplier
   - Can pause/resume

2. **Batch Lifecycle**:

   - `scheduled` → `baking` (at startTime)
   - `baking` → `cooling` (at endTime)
   - `cooling` → `available` (at availableTime)
   - Inventory units added when available

3. **Order Processing**:

   - Preset mode: Load actual orders for the date
   - Manual mode: User places orders via POS interface
   - FIFO inventory consumption
   - Stockout detection

4. **Suggestions System**:

   - **Predictive**: Analyze upcoming demand, suggest batches proactively
   - **Reactive**: Detect low inventory, suggest batches reactively
   - Consider fresh windows and batch timing

5. **Catering Orders**:

   - Pre-orders with specific delivery times
   - Can reschedule batches to meet catering deadlines
   - Approval workflow

6. **Auto-Removal**:
   - Periodically checks for surplus inventory
   - Removes batches that would create excess
   - Configurable interval and max removals

**Key Functions**:

- `startSimulation(config)` - Initialize and start
- `updateSimulation(id)` - Advance time and process events
- `pauseSimulation(id)` / `resumeSimulation(id)` - Control playback
- `stopSimulation(id)` - End simulation
- `purchaseItems(id, items)` - Process customer order
- `addBatch(id, batch)` - Add batch to schedule
- `removeBatch(id, batchId)` - Remove batch from schedule
- `suggestBatches(id)` - Get predictive/reactive suggestions

**WebSocket Events**:

- `simulation:update` - Periodic state updates
- `simulation:batch_started` - Batch enters oven
- `simulation:batch_completed` - Batch finished baking
- `simulation:order_processed` - Customer order fulfilled
- `simulation:stockout` - Item unavailable

**Database**: Uses in-memory Map (not persisted)

**Known Issues**:

- ⚠️ 2489 lines in single file
- ⚠️ Complex state management
- ⚠️ No persistence (simulations lost on restart)
- ⚠️ Tight coupling with forecast and schedule modules

---

### 6. Velocity Module (`backend/velocity/`)

**Purpose**: Analyze historical sales velocity

**Key Features**:

- Calculate sales velocity per SKU
- Daily velocity aggregation
- Intraday velocity (by time bucket)
- Used for trend analysis

**Key Functions**:

- `getDailyVelocity()` - Daily sales by SKU
- `getIntradayVelocity()` - Sales by time bucket

**Database**: Queries `menu_items` collection

---

### 7. Inventory Module (`backend/inventory/`)

**Purpose**: Calculate projected inventory over time

**Algorithm**:

1. Get schedule for date range
2. For each time interval:
   - Add production (batches that become available)
   - Subtract consumption (forecast demand)
   - Track running inventory
3. Detect stockouts (inventory < 0)

**Key Features**:

- Projected inventory by time interval
- Stockout detection
- Available batch tracking

**Key Functions**:

- `getInventoryProjection()` - Calculate inventory over time
- Uses schedule batches and forecast demand

**Known Issues**:

- ⚠️ Doesn't account for fresh windows
- ⚠️ Simplified consumption model (actual orders are bursty)

---

## Data Flow

### Main Data Flows

#### 1. Order Import Flow

```
POS System (Square/Toast)
  → JSON Export
  → Order Loader Page
  → POST /api/orders/upload
  → Transform & Validate
  → MongoDB (menu_items)
```

#### 2. Forecast Generation Flow

```
Historical Orders (menu_items)
  → Forecast Service
    → Calculate Patterns
    → Generate Daily Forecast
    → Distribute to Time Intervals
  → Cache (forecasts collection)
  → Return to Client
```

#### 3. Schedule Generation Flow

```
User Request (date, params)
  → POST /api/abs/schedule/generate
  → Get/Generate Forecast
  → Get Bake Specs
  → Calculate Batches
  → Schedule to Racks
  → Save Schedule (schedules collection)
  → Return Schedule
```

#### 4. Simulation Flow

```
User Starts Simulation
  → POST /api/simulation/start
  → Load Schedule + Forecast
  → Initialize State (in-memory)
  → WebSocket Connection

Simulation Loop (every 100ms):
  → Update Time
  → Process Batch Events
  → Process Orders (preset mode)
  → Update Inventory
  → Send State via WebSocket
```

#### 5. Forecast Accuracy Flow

```
User Requests Accuracy
  → GET /api/forecast/overall-accuracy
  → For each historical date:
    → Generate Forecast
    → Get Actual Orders
    → Compare & Calculate Errors
  → Compute Lag Analysis
  → Return Statistics
```

---

## Key Algorithms

### 1. Forecasting Algorithm

**Pattern-Based Forecasting** (3-step approach):

```
Step 1: Calculate Historical Averages
  For each SKU:
    total_quantity / unique_days = average_per_day

Step 2: Day-of-Week Patterns
  For each SKU + DayOfWeek:
    day_average / overall_average = day_pattern

  Example: If Fridays average 120 and overall is 100, Friday pattern = 1.2

Step 3: Trend Detection (Linear Regression)
  For each SKU:
    Fit line to daily totals over time
    weekly_trend = 1.0 + (slope * 7) / average

  Example: If growing 5 units/day on average of 100, trend = 1.35

Forecast Calculation:
  base_forecast = average * day_pattern
  trend_adjusted = base_forecast * (1 + (trend - 1) * weeks_from_start)
  final_forecast = trend_adjusted * growth_rate + scheduled_orders
```

**Intraday Distribution**:

```
1. Calculate time-of-day patterns from history
   For each SKU + DayOfWeek + TimeInterval:
     proportion = interval_average / daily_average

2. Distribute daily forecast across intervals
   interval_forecast = daily_forecast * proportion
```

### 2. Schedule Generation Algorithm

**Greedy Rack Assignment**:

```
For each batch (sorted by priority):
  1. Find earliest available rack
     - Check all 12 racks
     - Respect oven constraints
     - Find minimum endTime

  2. Round to next 20-minute increment
     - Start times: :00, :20, :40
     - Ensures synchronized baking

  3. Try to schedule at that time
     - Check if rack is free
     - Check if fits in business hours
     - If not, try next time slot

  4. Assign batch to rack
     - Calculate endTime (start + bake)
     - Calculate availableTime (end + cool)
     - Mark rack busy until endTime
```

### 3. Inventory Simulation Algorithm

**FIFO Inventory Management**:

```
Inventory Units: Array<{availableAt: time, batchId: string}>

When batch completes cooling:
  for i = 1 to quantity:
    inventoryUnits.push({
      availableAt: currentTime,
      batchId: batch.id
    })

When order placed:
  sort inventoryUnits by availableAt (FIFO)
  for each unit needed:
    if unit.availableAt <= currentTime:
      consume unit
    else:
      STOCKOUT
```

### 4. Batch Suggestion Algorithm

**Predictive Suggestions**:

```
1. Look ahead N minutes (e.g., 120 min)
2. For each time interval in lookahead:
   - Get forecasted demand
   - Get available inventory at that time
   - projected_shortfall = demand - inventory

3. If shortfall > threshold:
   - Calculate batches needed
   - Find earliest schedule time (considering bake + cool)
   - Return suggestion
```

**Reactive Suggestions**:

```
1. For each SKU with inventory < restock_threshold:
   - Calculate batches needed to reach threshold
   - Find earliest schedule time
   - Return suggestion
```

---

## Database Schema

### Collections

#### 1. `menu_items` (Orders)

```javascript
{
  _id: ObjectId,
  orderId: string,
  paidDate: Date,          // UTC timestamp
  itemGuid: string,        // SKU identifier
  displayName: string,     // Product name
  quantity: number,
  price: number,
  // Computed fields (via aggregation):
  date: string,            // YYYY-MM-DD in business timezone
  dayOfWeek: number,       // 1=Sunday, 7=Saturday (MongoDB format)
  hour: number,            // 0-23 in business timezone
  minute: number           // 0-59 in business timezone
}

Indexes:
  - paidDate
  - itemGuid
  - { paidDate: 1, itemGuid: 1 }
```

#### 2. `bake_specs`

```javascript
{
  _id: ObjectId,
  itemGuid: string (unique),
  displayName: string,
  capacityPerRack: number,
  bakeTimeMinutes: number,
  coolTimeMinutes: number,
  oven: number | null,
  freshWindowMinutes: number,
  restockThreshold: number,
  createdAt: Date,
  updatedAt: Date
}

Indexes:
  - itemGuid (unique)
```

#### 3. `schedules`

```javascript
{
  _id: ObjectId,
  date: string (unique),   // YYYY-MM-DD
  batches: Array<Batch>,
  forecast: Array,
  timeIntervalForecast: Array,
  parConfig: Object,
  summary: Object,
  parameters: Object,
  createdAt: Date,
  updatedAt: Date
}

Indexes:
  - date (unique)
```

#### 4. `forecasts` (Cache)

```javascript
{
  _id: ObjectId,
  forecastType: string,    // "daily"
  date: string,            // Start date
  parameters: Object,      // Request params
  data: Object,            // Forecast result
  createdAt: Date,
  expiresAt: Date
}

Indexes:
  - { forecastType: 1, date: 1, parameters: 1 }
  - expiresAt (TTL index)
```

---

## API Endpoints

### Orders

- `POST /api/orders/upload` - Bulk import orders
- `GET /api/orders?startDate&endDate&limit` - Get orders by date range

### Forecast

- `POST /api/forecast/generate` - Generate forecast
- `GET /api/forecast/cached` - Get cached forecast
- `DELETE /api/forecast/cache` - Clear cache
- `GET /api/forecast/compare?date` - Compare forecast vs actual for date
- `GET /api/forecast/overall-accuracy` - Get accuracy across all dates

### BakeSpecs

- `GET /api/bakespecs` - List all bake specs
- `POST /api/bakespecs` - Create bake spec
- `PUT /api/bakespecs/:itemGuid` - Update bake spec
- `DELETE /api/bakespecs/:itemGuid` - Delete bake spec

### Schedule (ABS)

- `POST /api/abs/schedule/generate` - Generate schedule for date
- `GET /api/abs/schedule/:date` - Get schedule by date
- `PUT /api/abs/schedule/:date/batch/:batchId` - Update batch in schedule
- `DELETE /api/abs/schedule/:date/batch/:batchId` - Delete batch from schedule

### Simulation

- `POST /api/simulation/start` - Start new simulation
- `GET /api/simulation/:id` - Get simulation state
- `POST /api/simulation/:id/pause` - Pause simulation
- `POST /api/simulation/:id/resume` - Resume simulation
- `POST /api/simulation/:id/stop` - Stop simulation
- `POST /api/simulation/:id/purchase` - Process order in simulation
- `POST /api/simulation/:id/batch` - Add batch to simulation
- `DELETE /api/simulation/:id/batch/:batchId` - Remove batch
- `GET /api/simulation/:id/suggestions` - Get batch suggestions
- `POST /api/simulation/:id/catering` - Add catering order
- `POST /api/simulation/:id/auto-remove` - Trigger auto-removal

### Velocity

- `GET /api/velocity/daily?startDate&endDate` - Daily velocity
- `GET /api/velocity/intraday?itemGuid&date&interval` - Intraday velocity

### Inventory

- `GET /api/inventory/projection?date&interval` - Projected inventory

---

## Pain Points & Issues

### 1. Date/Time Handling

**Problem**: Multiple representations and inconsistent handling

- `parseISO()` vs `startOfBusinessDay()`
- Date objects vs date strings
- UTC vs business timezone
- Day-of-week: 0-6 vs 1-7

**Impact**:

- 1-day lag in forecast accuracy
- Timezone bugs near midnight
- Hard to reason about correctness

**Files Affected**:

- `backend/forecast/service.js`
- `backend/config/timezone.js`
- `backend/shared/utils/dateUtils.js`

### 2. Code Duplication

**Problem**: Similar logic repeated across modules

- Date formatting in multiple places
- Validation logic duplicated
- Time interval calculations repeated

**Impact**:

- Hard to maintain consistency
- Bug fixes need to be applied in multiple places

### 3. Tight Coupling

**Problem**: Modules depend heavily on each other

- Forecast → Schedule → Simulation are tightly coupled
- Changing one breaks others
- Can't test in isolation

**Impact**:

- Fear of making changes
- Slow development velocity
- Hard to test

### 4. Large Files

**Problem**: Files are too long

- `backend/abs/simulation/service.js` - 2489 lines
- `backend/forecast/service.js` - 1032 lines
- `frontend/src/pages/SimulationPage.jsx` - 1533 lines

**Impact**:

- Hard to understand
- Hard to navigate
- Easy to introduce bugs

### 5. Lack of Types

**Problem**: No TypeScript or JSDoc types

- Function parameters undocumented
- Data structure shapes unclear
- Easy to pass wrong types

**Impact**:

- Runtime errors
- Hard to use APIs correctly
- Poor IDE support

### 6. No Comprehensive Tests

**Problem**: Limited test coverage

- Only a few test scripts
- No unit tests
- No integration tests
- Manual testing required

**Impact**:

- Fear of refactoring
- Regression bugs
- Slow verification

### 7. Complex State Management

**Problem**: Simulation state is complex

- Many Maps and Sets
- Mutable state
- Events log can grow large
- No persistence

**Impact**:

- Hard to debug
- Can't replay simulations
- Memory leaks possible

### 8. Performance Issues

**Problem**: Some operations are slow

- Forecast accuracy analysis runs for all dates
- Simulation with many orders is slow
- No pagination on some endpoints

**Impact**:

- Slow user experience
- Timeouts on long operations

---

## Frontend Pages

### 1. Order Loader Page

**Purpose**: Import orders from JSON
**Features**: Drag-and-drop, validation, progress tracking

### 2. Velocity Page

**Purpose**: Analyze sales velocity
**Features**: Date range selection, charts, tables

### 3. Forecast Page

**Purpose**: Generate and view forecasts
**Features**: Parameter controls, forecast table, charts

### 4. Forecast Accuracy Page

**Purpose**: Evaluate forecast performance
**Features**: Overall accuracy, lag analysis, day-of-week breakdown

### 5. Bake Specs Page

**Purpose**: Manage product bake specifications
**Features**: CRUD operations, validation

### 6. Schedule Page

**Purpose**: Generate and edit baking schedules
**Features**: Generate schedule, view timeline, edit batches

### 7. Simulation Page

**Purpose**: Real-time simulation of schedule
**Features**:

- Time controls (play/pause/speed)
- Visual inventory tracking
- Order processing
- Batch suggestions
- Catering orders
- Event log
- Statistics

### 8. Headless Simulation Page

**Purpose**: Batch run simulations across multiple dates
**Features**: Batch processing, export results

### 9. Inventory Page

**Purpose**: View projected inventory
**Features**: Date selection, inventory charts, stockout detection

---

## Configuration

### Constants (`backend/config/constants.js`)

```javascript
BUSINESS_TIMEZONE: "America/New_York"
BUSINESS_HOURS: {
  START_MINUTES: 360,  // 6:00 AM
  END_MINUTES: 1320    // 10:00 PM
}
OVEN_CONFIG: {
  RACKS_PER_OVEN: 6,
  TOTAL_RACKS: 12,
  OVENS: 2
}
```

### Environment Variables

- `MONGODB_URI` - MongoDB connection string
- `PORT` - Backend server port
- `NODE_ENV` - Environment (development/production)

---

## Deployment

### Backend

- **Platform**: Heroku
- **Container**: Docker
- **Process**: Web dyno (Express server)
- **Database**: MongoDB Atlas

### Frontend

- **Platform**: Heroku
- **Container**: Docker (serves static files)
- **Build**: Vite production build

---

## Next Steps for Rebuild

### Priorities for New System

1. **Fix Date/Time Handling**

   - Single DateTimeService
   - All dates in business timezone
   - Consistent day-of-week (0-6 everywhere)

2. **Decouple Modules**

   - Clear interfaces between modules
   - Dependency injection
   - Can test independently

3. **Add TypeScript**

   - Type safety
   - Better IDE support
   - Catch bugs at compile time

4. **Break Up Large Files**

   - Max 200-300 lines per file
   - Single responsibility
   - Clear file names

5. **Add Comprehensive Tests**

   - Unit tests for core logic
   - Integration tests for APIs
   - E2E tests for critical flows

6. **Simplify Simulation**

   - Extract state management
   - Use immutable updates
   - Add persistence

7. **Improve Performance**

   - Add caching strategically
   - Pagination on large datasets
   - Background jobs for slow operations

8. **Add Documentation**
   - JSDoc for all functions
   - README for each module
   - Architecture diagrams

---

## Questions to Answer in New Design

1. How should we handle timezone conversions consistently?
2. What's the right granularity for modules?
3. Should simulation state be persisted?
4. How can we make forecasting more extensible (ML in future)?
5. What testing strategy gives best ROI?
6. How can we visualize data flows better?
7. Should we use a state management library (Redux/Zustand)?
8. How do we handle real-time updates (WebSocket vs polling)?

---

**End of Documentation**

_This document should be updated as you learn more or as requirements change._
