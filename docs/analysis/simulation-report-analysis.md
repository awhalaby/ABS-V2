# Simulation Report Analysis - 2025-11-21

## Executive Summary

The simulation shows **86 units missed** across **61 orders** (8.3% miss rate) with **109 units of waste** at end of day. The algorithm is reactive rather than proactive, causing stockouts before batches arrive.

## Key Metrics

- **Total Orders**: 798 orders
- **Processed**: 947 units (91.7%)
- **Missed**: 86 units (8.3%)
- **Final Inventory**: 109 units (waste)
- **Peak Inventory**: 195 units
- **Batches Added**: 40 batches by algorithm
- **Stockout Events**: 61 orders missed

## Critical Issues Identified

### 1. **Timing Problem: Batches Arrive Too Late**

**Problem**: The algorithm calculates when batches should be available using a flawed formula:

```javascript
const minutesUntilShortfall =
  remainingExpected > 0 && consumptionRatio > 0
    ? Math.max(
        60,
        Math.min(
          300,
          remainingExpected / consumptionRatio / (consumptionRatio * 10)
        )
      )
    : 120;
```

This formula doesn't account for:

- When demand actually occurs in the forecast curve
- The actual depletion rate based on forecast intervals
- Lead time needed for baking + cooling

**Evidence from Report**:

- At **08:30**, algorithm detects shortfall for Croissant and Ham & Cheese
- Batches are scheduled to start at **09:00** (available at **09:20**)
- But stockouts occur at **09:00** - batches arrive 20 minutes too late
- Result: **19 Croissant orders** and **24 Ham & Cheese orders** missed

**Impact**: ~43 missed orders could have been prevented with better timing

### 2. **No Forward-Looking Demand Curve Analysis**

**Problem**: Algorithm calculates total remaining demand but doesn't analyze WHEN demand occurs.

**Current Approach**:

- Sums all remaining forecast values
- Uses a rough time estimate
- Doesn't simulate inventory depletion over time

**What's Needed**:

- Step through forecast intervals chronologically
- Calculate when inventory will actually hit zero
- Account for batches already scheduled
- Schedule new batches to arrive BEFORE depletion

**Example from Report**:

- At 08:30, Croissant has 10 units current + 142 future = 152 total
- Forecast shows high demand at 09:00-09:30
- Algorithm should detect: "Inventory will run out at 09:15"
- Should schedule batch to arrive at 09:10 (start at 08:50)

### 3. **Batch Clustering Causes Inventory Spikes**

**Problem**: All batches for the same item are scheduled at the exact same time:

```javascript
const batchStartTime = roundedStartTime; // All batches start at the same time
```

**Evidence from Report**:

- At 08:30: 3 Croissant batches all scheduled for 09:00
- At 09:30: 3 Chocolate Croissant batches all scheduled for 10:00
- At 10:30: 3 Chocolate Croissant batches all scheduled for 11:00

**Impact**:

- Large inventory spikes (e.g., 42 → 123 → 75)
- Waste at end of day (109 units)
- Doesn't smooth production across time

**Solution**: Stagger batch start times based on:

- Actual demand curve
- Fresh window constraints
- Minimum spacing to avoid waste

### 4. **Low Confidence Thresholds Lead to Premature Batching**

**Problem**: Algorithm suggests batches even with very low confidence:

**Evidence from Report**:

- Apple Pie Bite at 08:00: **6% confidence** (only 3 expected units observed)
- Still suggests 2 batches
- Result: 28 units waste at end of day

**Current Logic**:

```javascript
if (shortfall > 5) { // Only checks shortfall, not confidence
```

**What's Needed**:

- Minimum confidence threshold (e.g., 30-50%)
- Scale batch quantity based on confidence
- Be more conservative early in the day

### 5. **No Fresh Window Consideration**

**Problem**: Algorithm doesn't use `freshWindowMinutes` to avoid baking too early.

**Current Code**:

- Reads `freshWindowMinutes` from bake spec
- But doesn't use it in timing calculations

**Impact**:

- Batches may be baked too early
- Quality degradation
- More waste from items going stale

**Solution**:

- Calculate latest acceptable bake time based on fresh window
- Don't suggest batches that would exceed freshness window before peak demand

### 6. **Reactive Rather Than Proactive**

**Problem**: Algorithm waits until shortfall exists before suggesting batches.

**Current Flow**:

1. Check current inventory + future batches
2. Calculate shortfall
3. If shortfall > 5, suggest batches

**Better Approach**:

1. Simulate inventory depletion forward through forecast
2. Identify when inventory will hit restock threshold
3. Schedule batches proactively to arrive BEFORE threshold is hit
4. Account for lead time (bake + cool)

### 7. **Consumption Ratio Applied Too Aggressively**

**Problem**: Consumption ratio is always >= 1.0, never scales down:

```javascript
const projectedRemainingDemand =
  remainingExpected * Math.max(1.0, consumptionRatio);
```

**Evidence from Report**:

- Consumption ratios range from 1.33 to 2.34
- Always inflates demand upward
- Never accounts for demand being softer than forecast

**Impact**:

- Over-production
- End-of-day waste
- Should allow downward adjustment when demand is soft

## Recommended Improvements

### Priority 1: Fix Timing Calculation

**Replace** the rough `minutesUntilShortfall` estimate with **forward simulation**:

```javascript
// Simulate inventory depletion through forecast intervals
function calculateDepletionTime(
  currentInventory,
  futureInventory,
  forecastIntervals,
  consumptionRatio
) {
  let inventory = currentInventory + futureInventory;
  let currentTime = simulation.currentTime;

  for (const forecast of forecastIntervals) {
    if (forecast.timeInterval <= currentTime) continue;

    const demand = forecast.forecast * consumptionRatio;
    inventory -= demand;

    if (inventory <= restockThreshold) {
      return forecast.timeInterval; // This is when we'll run out
    }
  }

  return null; // Won't run out
}
```

### Priority 2: Stagger Batch Start Times

**Instead of** scheduling all batches at once:

```javascript
// Stagger batches based on demand curve
const batchesNeeded = Math.ceil(shortfall / batchSize);
const demandIntervals = getDemandIntervals(forecastIntervals, currentTime);

for (let i = 0; i < batchesNeeded; i++) {
  const targetInterval = demandIntervals[i % demandIntervals.length];
  const targetAvailableTime = targetInterval.time - 10; // 10 min buffer
  const batchStartTime = targetAvailableTime - bakeTime - coolTime;
  // ... schedule batch
}
```

### Priority 3: Add Confidence Thresholds

```javascript
const MIN_CONFIDENCE_FOR_BATCHING = 30; // Don't batch below 30% confidence

if (shortfall > 5 && confidencePercent >= MIN_CONFIDENCE_FOR_BATCHING) {
  // Scale batch quantity by confidence
  const confidenceMultiplier = confidencePercent / 100;
  const adjustedShortfall = shortfall * confidenceMultiplier;
  const batchesNeeded = Math.ceil(adjustedShortfall / batchSize);
  // ...
}
```

### Priority 4: Use Fresh Window

```javascript
// Don't bake too early
const latestAcceptableBakeTime = peakDemandTime - freshWindowMinutes;
const earliestAcceptableBakeTime = depletionTime - bakeTime - coolTime - 20; // 20 min buffer

const optimalBakeTime = Math.max(
  earliestAcceptableBakeTime,
  Math.min(latestAcceptableBakeTime, currentTime + 20)
);
```

### Priority 5: Allow Downward Consumption Ratio Adjustment

```javascript
// Allow consumption ratio to go below 1.0 if demand is soft
const consumptionRatio =
  expectedQuantity > 0 ? actualQuantity / expectedQuantity : 1.0;

// Cap at reasonable bounds
const adjustedRatio = Math.max(0.7, Math.min(2.0, consumptionRatio));
```

## Expected Impact

With these improvements:

- **Stockouts**: Reduce from 86 to <20 units (75% reduction)
- **Waste**: Reduce from 109 to <40 units (65% reduction)
- **Miss Rate**: Improve from 8.3% to <2%
- **Inventory Stability**: Smoother inventory curve, fewer spikes

## Implementation Priority

1. **Week 1**: Fix timing calculation (Priority 1)
2. **Week 2**: Add confidence thresholds (Priority 3)
3. **Week 3**: Implement batch staggering (Priority 2)
4. **Week 4**: Add fresh window logic (Priority 4)
5. **Week 5**: Allow downward consumption ratio (Priority 5)
