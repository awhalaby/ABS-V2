# Rebuild Checklist

**Purpose**: Step-by-step guide for rebuilding the system

---

## Phase 1: Foundation (Week 1)

### Setup

- [ ] Create new repository `ABS-V3`
- [ ] Initialize TypeScript + Node.js project
- [ ] Setup ESLint + Prettier
- [ ] Setup Jest for testing
- [ ] Configure MongoDB connection
- [ ] Add basic Express server
- [ ] Setup GitHub Actions CI/CD

### Core Utilities

- [ ] Create `DateTimeService` class

  - [ ] `parseBusinessDate(dateStr)`
  - [ ] `formatBusinessDate(date)`
  - [ ] `getBusinessDayOfWeek(date)`
  - [ ] `startOfBusinessDay(date)`
  - [ ] `endOfBusinessDay(date)`
  - [ ] Add comprehensive tests
  - [ ] Document timezone handling strategy

- [ ] Create `ValidationService`

  - [ ] Use Zod for schema validation
  - [ ] Define schemas for all input types
  - [ ] Add validation helpers

- [ ] Create `TimeInterval` utility
  - [ ] Convert time to minutes
  - [ ] Format minutes to time
  - [ ] Round to 20-minute increments
  - [ ] Add tests

### Domain Models

- [ ] Define TypeScript interfaces:

  ```typescript
  interface Order {
    orderId: string;
    paidDate: Date;
    itemGuid: string;
    displayName: string;
    quantity: number;
    price: number;
  }

  interface BakeSpec {
    itemGuid: string;
    displayName: string;
    capacityPerRack: number;
    bakeTimeMinutes: number;
    coolTimeMinutes: number;
    oven: number | null;
    freshWindowMinutes: number;
    restockThreshold: number;
  }

  interface Batch {
    batchId: string;
    itemGuid: string;
    displayName: string;
    quantity: number;
    rackPosition: number;
    oven: number;
    startTime: string;
    endTime: string;
    availableTime: string;
    status: "scheduled" | "baking" | "cooling" | "available";
  }

  interface Forecast {
    date: string;
    dayOfWeek: number;
    itemGuid: string;
    displayName: string;
    forecast: number;
  }

  interface Schedule {
    date: string;
    batches: Batch[];
    forecast: Forecast[];
    summary: ScheduleSummary;
  }
  ```

---

## Phase 2: Data Layer (Week 1-2)

### Repositories

- [ ] Create `OrderRepository`

  - [ ] `findByDateRange(start, end): Promise<Order[]>`
  - [ ] `bulkInsert(orders): Promise<void>`
  - [ ] `countByDate(date): Promise<number>`
  - [ ] Add indexes
  - [ ] Add integration tests

- [ ] Create `BakeSpecRepository`

  - [ ] `findAll(): Promise<BakeSpec[]>`
  - [ ] `findByItemGuid(guid): Promise<BakeSpec | null>`
  - [ ] `upsert(spec): Promise<void>`
  - [ ] `delete(guid): Promise<void>`
  - [ ] Add tests

- [ ] Create `ScheduleRepository`

  - [ ] `findByDate(date): Promise<Schedule | null>`
  - [ ] `save(schedule): Promise<void>`
  - [ ] `delete(date): Promise<void>`
  - [ ] Add tests

- [ ] Create `ForecastCacheRepository`
  - [ ] `find(params): Promise<Forecast[] | null>`
  - [ ] `save(params, forecast): Promise<void>`
  - [ ] `clear(): Promise<void>`
  - [ ] Add TTL index
  - [ ] Add tests

---

## Phase 3: Forecast Module (Week 2)

### Pattern Analysis

- [ ] Create `PatternAnalyzer` class

  - [ ] `calculateAverages(orders): Map<sku, average>`
  - [ ] `calculateDayOfWeekPatterns(orders): Map<sku, Map<dow, multiplier>>`
  - [ ] `calculateIntradayPatterns(orders, interval): Map<sku, Map<dow, Map<time, proportion>>>`
  - [ ] Add unit tests with mock data

- [ ] Create `TrendAnalyzer` class
  - [ ] `detectTrend(orders): Map<sku, weeklyMultiplier>`
  - [ ] Use linear regression
  - [ ] Handle insufficient data
  - [ ] Add unit tests

### Forecast Generation

- [ ] Create `ForecastGenerator` class

  - [ ] `generate(params): DailyForecast[]`
  - [ ] Apply patterns + trends
  - [ ] Handle growth adjustments
  - [ ] Add scheduled orders
  - [ ] Add unit tests

- [ ] Create `IntradayDistributor` class
  - [ ] `distribute(dailyForecast, patterns): TimeIntervalForecast[]`
  - [ ] Handle rounding errors
  - [ ] Maintain totals
  - [ ] Add unit tests

### Forecast Service

- [ ] Create `ForecastService` class

  - [ ] `getForecast(params): Promise<ForecastResult>`
  - [ ] Check cache first
  - [ ] Orchestrate analysis + generation
  - [ ] Save to cache
  - [ ] Add integration tests

- [ ] Create `ForecastAccuracyService` class
  - [ ] `compareForDate(date): Promise<Comparison>`
  - [ ] `getOverallAccuracy(): Promise<AccuracyStats>`
  - [ ] Calculate lag analysis
  - [ ] Add tests

### API

- [ ] Create forecast routes
  - [ ] `POST /api/forecast/generate`
  - [ ] `DELETE /api/forecast/cache`
  - [ ] `GET /api/forecast/accuracy`
- [ ] Add request validation
- [ ] Add error handling
- [ ] Add API tests

---

## Phase 4: Schedule Module (Week 3)

### Batch Calculation

- [ ] Create `BatchCalculator` class
  - [ ] `calculateBatches(forecast, specs): Batch[]`
  - [ ] Handle restock thresholds
  - [ ] Validate bake specs
  - [ ] Add unit tests

### Rack Scheduling

- [ ] Create `RackScheduler` class
  - [ ] `schedule(batches): ScheduledBatch[]`
  - [ ] Implement greedy algorithm
  - [ ] Handle oven constraints
  - [ ] Round to 20-min increments
  - [ ] Add unit tests
  - [ ] [ ] TODO: Consider better algorithm later

### Schedule Service

- [ ] Create `ScheduleService` class
  - [ ] `generate(date, params): Promise<Schedule>`
  - [ ] Get forecast
  - [ ] Get bake specs
  - [ ] Calculate batches
  - [ ] Schedule to racks
  - [ ] Save to database
  - [ ] Add integration tests

### API

- [ ] Create schedule routes
  - [ ] `POST /api/schedule/generate`
  - [ ] `GET /api/schedule/:date`
  - [ ] `PUT /api/schedule/:date/batch/:id`
  - [ ] `DELETE /api/schedule/:date/batch/:id`
- [ ] Add validation
- [ ] Add tests

---

## Phase 5: Simulation Module (Week 3-4)

### State Management

- [ ] Create `SimulationState` class (immutable)

  - [ ] Use Immer for updates
  - [ ] Track inventory (FIFO)
  - [ ] Track batches
  - [ ] Track orders
  - [ ] Track events
  - [ ] Add serialization

- [ ] Create `SimulationStore` class
  - [ ] In-memory storage
  - [ ] CRUD operations
  - [ ] Consider Redis for persistence

### Time Management

- [ ] Create `TimeManager` class
  - [ ] Calculate time progression
  - [ ] Handle speed multiplier
  - [ ] Pause/resume logic
  - [ ] Add tests

### Batch Lifecycle

- [ ] Create `BatchManager` class
  - [ ] Handle batch transitions (scheduled → baking → cooling → available)
  - [ ] Add units to inventory
  - [ ] Remove units on expiry
  - [ ] Add tests

### Order Processing

- [ ] Create `OrderProcessor` class
  - [ ] Process customer orders
  - [ ] FIFO inventory consumption
  - [ ] Detect stockouts
  - [ ] Track statistics
  - [ ] Add tests

### Suggestions

- [ ] Create `PredictiveSuggestionEngine` class

  - [ ] Analyze upcoming demand
  - [ ] Suggest batches proactively
  - [ ] Add tests

- [ ] Create `ReactiveSuggestionEngine` class
  - [ ] Monitor inventory levels
  - [ ] Suggest when low
  - [ ] Add tests

### Simulation Service

- [ ] Create `SimulationService` class
  - [ ] `start(config): Promise<SimulationId>`
  - [ ] `update(id): Promise<SimulationState>`
  - [ ] `pause/resume(id): Promise<void>`
  - [ ] `stop(id): Promise<SimulationResult>`
  - [ ] `purchaseItems(id, items): Promise<void>`
  - [ ] `addBatch(id, batch): Promise<void>`
  - [ ] Add integration tests

### WebSocket

- [ ] Setup Socket.io
- [ ] Broadcast simulation updates
- [ ] Handle reconnection
- [ ] Add heartbeat
- [ ] Add tests

### API

- [ ] Create simulation routes
  - [ ] `POST /api/simulation/start`
  - [ ] `GET /api/simulation/:id`
  - [ ] `POST /api/simulation/:id/pause`
  - [ ] `POST /api/simulation/:id/resume`
  - [ ] `POST /api/simulation/:id/stop`
  - [ ] `POST /api/simulation/:id/purchase`
  - [ ] `POST /api/simulation/:id/batch`
- [ ] Add validation
- [ ] Add tests

---

## Phase 6: Frontend (Week 4-5)

### Setup

- [ ] Create React + TypeScript project
- [ ] Setup Vite
- [ ] Configure TailwindCSS
- [ ] Setup React Router
- [ ] Setup React Query (for API calls)
- [ ] Setup Zustand (for state management)

### Shared Components

- [ ] DatePicker component
- [ ] TimeRangePicker component
- [ ] LoadingSpinner component
- [ ] ErrorMessage component
- [ ] EmptyState component

### Pages

- [ ] Order Loader Page

  - [ ] File upload
  - [ ] Validation
  - [ ] Progress tracking

- [ ] Velocity Page

  - [ ] Date range selector
  - [ ] Charts
  - [ ] Tables

- [ ] Forecast Page

  - [ ] Parameter controls
  - [ ] Forecast table
  - [ ] Charts

- [ ] Forecast Accuracy Page

  - [ ] Overall stats
  - [ ] Lag analysis
  - [ ] Day-of-week breakdown

- [ ] Bake Specs Page

  - [ ] CRUD operations
  - [ ] Validation

- [ ] Schedule Page

  - [ ] Generate controls
  - [ ] Timeline view
  - [ ] Edit batches

- [ ] Simulation Page
  - [ ] Time controls
  - [ ] Visual inventory
  - [ ] Order processing
  - [ ] Suggestions
  - [ ] Event log

### API Integration

- [ ] Create API client with types
- [ ] Setup React Query hooks
- [ ] Handle errors globally
- [ ] Add loading states

---

## Phase 7: Testing (Ongoing)

### Unit Tests

- [ ] DateTimeService (100% coverage)
- [ ] PatternAnalyzer
- [ ] TrendAnalyzer
- [ ] ForecastGenerator
- [ ] BatchCalculator
- [ ] RackScheduler
- [ ] SimulationState
- [ ] OrderProcessor

### Integration Tests

- [ ] Forecast API
- [ ] Schedule API
- [ ] Simulation API
- [ ] Database operations

### E2E Tests

- [ ] Import orders → Generate forecast
- [ ] Generate forecast → Create schedule
- [ ] Create schedule → Run simulation
- [ ] Full workflow

### Performance Tests

- [ ] Forecast with large datasets
- [ ] Simulation with many orders
- [ ] Database query performance

---

## Phase 8: Migration (Week 5-6)

### Data Migration

- [ ] Export orders from old system
- [ ] Transform to new format
- [ ] Import to new system
- [ ] Verify counts match

- [ ] Export bake specs
- [ ] Import to new system
- [ ] Verify all specs present

### Parallel Run

- [ ] Run both systems simultaneously
- [ ] Compare forecast outputs
- [ ] Compare schedule outputs
- [ ] Compare simulation results
- [ ] Document discrepancies

### Cutover

- [ ] Final data sync
- [ ] Switch DNS/routing
- [ ] Monitor for errors
- [ ] Have rollback plan ready

---

## Phase 9: Polish (Week 6-7)

### Documentation

- [ ] README for each module
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Architecture diagrams
- [ ] Deployment guide
- [ ] User guide

### Performance Optimization

- [ ] Add database indexes
- [ ] Add caching where needed
- [ ] Optimize slow queries
- [ ] Add pagination

### Monitoring

- [ ] Add logging (Winston/Pino)
- [ ] Add error tracking (Sentry)
- [ ] Add metrics (response times, error rates)
- [ ] Setup alerts

### Security

- [ ] Add authentication (JWT)
- [ ] Add authorization (roles)
- [ ] Rate limiting
- [ ] Input sanitization
- [ ] HTTPS enforcement

---

## Definition of Done

### Code Quality

- [ ] All tests passing
- [ ] > 80% code coverage
- [ ] No ESLint errors
- [ ] TypeScript strict mode (no `any`)
- [ ] Code reviewed

### Documentation

- [ ] JSDoc for all public APIs
- [ ] README for each module
- [ ] Architecture documented
- [ ] API documented

### Performance

- [ ] Forecast generation < 2 seconds
- [ ] Schedule generation < 1 second
- [ ] Simulation updates at 60 FPS
- [ ] No memory leaks

### User Experience

- [ ] All pages load < 1 second
- [ ] Errors show helpful messages
- [ ] Loading states show progress
- [ ] Mobile responsive

---

## Success Criteria

### Functional

- [ ] Can import orders
- [ ] Can generate accurate forecasts
- [ ] Can create valid schedules
- [ ] Can run real-time simulations
- [ ] All features from old system work

### Quality

- [ ] No critical bugs
- [ ] Test coverage >80%
- [ ] All files <300 lines
- [ ] No circular dependencies
- [ ] TypeScript strict mode

### Performance

- [ ] Faster than old system
- [ ] No timeouts
- [ ] Handles 10,000+ orders

### Maintainability

- [ ] New developers can onboard in <1 week
- [ ] Can add new features without breaking old ones
- [ ] Clear where to make changes
- [ ] Easy to test changes

---

**Ready to start? Begin with Phase 1!**
