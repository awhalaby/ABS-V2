# Design Decisions & Lessons Learned

**Purpose**: Document key design decisions and why they were made (or should have been made differently)

---

## What Worked Well

### 1. Modular Structure

✅ **Decision**: Separate modules for orders, forecast, schedule, simulation

**Why it worked**: Clear separation of concerns made it easier to understand each module's purpose

**Keep for new system**: Yes, but with better-defined interfaces

### 2. Pattern-Based Forecasting

✅ **Decision**: Use day-of-week patterns + trends instead of complex ML

**Why it worked**:

- Simple to understand and debug
- ~8% error is acceptable for business needs
- Fast to compute
- No training data or model management

**Keep for new system**: Yes, this is a good foundation

### 3. 20-Minute Time Intervals

✅ **Decision**: Use 20-minute buckets for scheduling and forecasting

**Why it worked**:

- Balances granularity with performance
- Natural for bakery operations (batches take ~40-60 min)
- Creates clear time slots (:00, :20, :40)

**Keep for new system**: Yes

### 4. Real-Time Simulation

✅ **Decision**: Simulate full day at accelerated speed

**Why it worked**:

- Validates schedules before execution
- Helps identify stockouts
- Engaging UI for stakeholders
- Reveals edge cases

**Keep for new system**: Yes, this is a killer feature

### 5. WebSocket for Simulation Updates

✅ **Decision**: Use WebSockets for real-time state updates

**Why it worked**:

- Low latency
- Push updates instead of polling
- Natural fit for real-time simulation

**Keep for new system**: Yes

---

## What Didn't Work

### 1. Date Handling Chaos

❌ **Decision**: No consistent strategy for date/timezone handling

**What went wrong**:

- `parseISO()` interprets dates as UTC
- `startOfBusinessDay()` interprets as business timezone
- Mixed usage throughout codebase
- Led to 1-day forecast lag issue

**For new system**:

```typescript
// Single source of truth
class DateTimeService {
  // All dates in business timezone
  parseBusinessDate(dateStr: string): Date;
  formatBusinessDate(date: Date): string;
  getBusinessDayOfWeek(date: Date): number;
}

// NEVER use Date constructors or parseISO directly
// ALWAYS go through DateTimeService
```

### 2. Large Monolithic Files

❌ **Decision**: Keep all forecast logic in one file

**What went wrong**:

- 1032 lines = impossible to navigate
- Multiple responsibilities mixed together
- Hard to test individual pieces
- Easy to introduce bugs

**For new system**:

```
forecast/
  ├── PatternAnalyzer.ts       // Learn patterns
  ├── TrendAnalyzer.ts          // Detect trends
  ├── ForecastGenerator.ts      // Apply patterns
  ├── IntradayDistributor.ts    // Time intervals
  ├── ForecastCache.ts          // Caching logic
  └── ForecastService.ts        // Orchestration
```

### 3. No Type Safety

❌ **Decision**: Use plain JavaScript

**What went wrong**:

- Runtime errors (forecastStart is not defined)
- Hard to know what shape data should be
- No IDE autocomplete
- Easy to pass wrong types

**For new system**: Use TypeScript with strict mode

### 4. Tight Coupling

❌ **Decision**: Direct imports and function calls between modules

**What went wrong**:

- Forecast imports Schedule
- Schedule imports Forecast
- Simulation imports both
- Can't test in isolation
- Changes cascade

**For new system**:

```typescript
// Dependency injection
class ScheduleService {
  constructor(
    private forecastService: IForecastService,
    private bakeSpecService: IBakeSpecService
  ) {}
}

// Can inject mocks for testing
```

### 5. Mutable State in Simulation

❌ **Decision**: Mutate simulation state directly

**What went wrong**:

```javascript
simulation.inventory.set(item, quantity); // Mutation
simulation.currentTime += delta; // Mutation
```

- Hard to debug (who changed what?)
- Can't replay or undo
- No audit trail
- Memory leaks possible

**For new system**:

```typescript
// Immutable updates
const newState = {
  ...oldState,
  inventory: new Map(oldState.inventory).set(item, quantity),
};

// OR use Immer for convenience
const newState = produce(oldState, (draft) => {
  draft.inventory.set(item, quantity);
});
```

### 6. No Validation Layer

❌ **Decision**: Validate inline in controllers/services

**What went wrong**:

- Validation logic duplicated
- Inconsistent error messages
- Easy to miss validations

**For new system**:

```typescript
// Use Zod or similar
const ForecastParamsSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lookbackWeeks: z.number().min(1).max(52),
  growthRate: z.number().min(0.5).max(2.0),
});

// Validate once at boundary
const params = ForecastParamsSchema.parse(req.body);
```

### 7. No Comprehensive Testing

❌ **Decision**: Manual testing only

**What went wrong**:

- Fear of refactoring (will it break?)
- Regression bugs
- Time-consuming manual verification
- Can't validate edge cases

**For new system**:

```typescript
// Unit tests for core logic
describe("PatternAnalyzer", () => {
  it("calculates day-of-week patterns correctly", () => {
    const orders = createMockOrders();
    const patterns = analyzer.analyze(orders);
    expect(patterns["item-123"][5]).toBeCloseTo(1.2);
  });
});

// Integration tests for APIs
describe("POST /api/forecast/generate", () => {
  it("returns forecast for valid date range", async () => {
    const response = await request(app)
      .post("/api/forecast/generate")
      .send({ startDate: "2025-11-21", endDate: "2025-11-21" });

    expect(response.status).toBe(200);
    expect(response.body.forecast).toBeDefined();
  });
});
```

### 8. Greedy Scheduling Algorithm

❌ **Decision**: Use greedy algorithm (first available rack)

**What went wrong**:

- Locally optimal, not globally optimal
- Can fill early racks and leave late racks empty
- No backtracking if schedule becomes infeasible
- Doesn't minimize total completion time

**For new system**:

```typescript
// Consider more sophisticated algorithms:
// 1. Constraint satisfaction (CSP)
// 2. Integer linear programming (ILP)
// 3. Genetic algorithm
// 4. Simulated annealing

// OR keep greedy but add:
// - Better heuristics (load balancing)
// - Backtracking when stuck
// - Multiple schedules comparison
```

---

## Architectural Decisions

### 1. Monorepo vs Multi-Repo

**Decision**: Monorepo (backend + frontend together)

**Pros**:

- Shared types/interfaces
- Atomic commits across stack
- Easier to keep in sync

**Cons**:

- Larger repository
- Shared dependencies can conflict

**Keep for new system**: Yes, monorepo is good here

### 2. REST API vs GraphQL

**Decision**: REST API

**Pros**:

- Simple to understand
- Well-supported
- Good for CRUD operations

**Cons**:

- Over-fetching data
- Multiple round trips
- No schema

**For new system**:

- Keep REST for simple CRUD
- Consider GraphQL if data fetching becomes complex
- OR use tRPC for type-safe RPC

### 3. WebSocket vs Polling

**Decision**: WebSocket for simulation

**Pros**:

- Real-time updates
- Efficient (no polling overhead)
- Natural for simulation

**Cons**:

- More complex (connection management)
- Scaling challenges

**Keep for new system**: Yes, but add:

- Reconnection logic
- Heartbeat/ping-pong
- Graceful fallback to polling

### 4. MongoDB vs PostgreSQL

**Decision**: MongoDB

**Pros**:

- Flexible schema
- Easy to get started
- Good for JSON documents

**Cons**:

- No foreign keys
- No transactions (initially)
- Data integrity harder

**For new system**: Consider PostgreSQL

- Better for relational data (orders → items)
- ACID guarantees
- Better query optimization
- JSON support (JSONB)

---

## Key Lessons Learned

### 1. "Don't optimize prematurely" applies to correctness too

❌ **What happened**: Tried to fix 1-day lag, broke schedules

**Lesson**: Don't optimize metrics at the expense of functionality. The 1-day lag is interesting data, but the system works fine with ~8% error. Focus on making it more maintainable first.

### 2. Timezone handling is hard - do it once

**Lesson**: Create a single DateTimeService and use it everywhere. No exceptions.

### 3. Big files are tech debt magnets

**Lesson**: Enforce max file size (300 lines). Break up early before it gets bad.

### 4. Coupling sneaks up on you

**Lesson**: Review imports regularly. If A imports B and B imports A, refactor immediately.

### 5. Tests are not optional

**Lesson**: Tests are the only way to refactor confidently. Write them as you go.

### 6. Type errors are caught at runtime in JavaScript

**Lesson**: TypeScript is worth it. Runtime errors are expensive.

### 7. Mutable state is hard to debug

**Lesson**: Use immutable updates. Makes debugging and testing easier.

### 8. Naming matters

**Lesson**: `forecastStart` vs `forecastStartBusiness` caused bugs. Be explicit.

### 9. Comments should explain "why" not "what"

```javascript
// ❌ Bad: Tells what code does (obvious)
// Loop through forecasts
forecastDays.forEach((date) => {

// ✅ Good: Explains why/reasoning
// Use next day's patterns because forecast lags actuals by 1 day
forecastDays.forEach((date) => {
```

### 10. Documentation rots quickly

**Lesson**: Keep docs close to code (JSDoc). Separate docs need ownership.

---

## Design Principles for New System

### 1. Single Responsibility

Each class/function should have one reason to change.

### 2. Dependency Inversion

Depend on abstractions (interfaces), not concretions.

### 3. Explicit is Better Than Implicit

`parseBusinessDate()` is better than `parseISO()` + assumptions.

### 4. Fail Fast

Validate at boundaries. Throw errors early.

### 5. Immutability By Default

Mutable state only when necessary (and clearly marked).

### 6. Type Safety

Use TypeScript strict mode. No `any` types.

### 7. Test Coverage

Aim for 80%+ coverage on business logic.

### 8. Code Reviews

No merge without review. Catch issues early.

### 9. Incremental Refactoring

Small, safe changes. Ship often.

### 10. Measure What Matters

- Forecast accuracy (MAPE)
- Schedule utilization (% racks used)
- Simulation performance (updates/sec)
- User satisfaction

---

**End of Design Decisions**

_Use this document to guide architectural decisions in the new system._
