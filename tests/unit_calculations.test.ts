/**
 * SHOPMIND — Automated Test Suite for Core Mathematical & Decision Formulas
 */

import {
  computeDecisionOutcomes,
  computeMAE,
  computeRMSE,
  computeR2,
  chronologicalSplit,
  solveLinearRegression,
  trainAndEvaluateForecast,
  computePriceElasticity,
  simulateScenario,
} from '../src/services/calculations.ts';
import { generateSyntheticDataset } from '../src/data/syntheticDemo.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

function assertCloseTo(actual: number, expected: number, tolerance = 0.01, testName: string) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(`  ✓ PASS: ${testName} (actual: ${actual}, expected: ${expected})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} (actual: ${actual}, expected: ${expected}, diff: ${diff})`);
    failed++;
  }
}

console.log('--- 1. Testing Decision Simulation Core Formulas ---');

// Case A: Demand exceeds Inventory (Stock-out scenario)
{
  const res = computeDecisionOutcomes({
    demand: 150,
    inventory: 100,
    selling_price: 50,
    unit_cost: 20,
    promotion_cost: 200,
    advertising_cost: 300,
  });

  // fulfilled = min(max(150, 0), max(100, 0)) = 100
  assertCloseTo(res.fulfilled, 100, 0.001, 'Fulfilled units capped at inventory when demand > inventory');
  // unmet = max(150 - 100, 0) = 50
  assertCloseTo(res.unmet, 50, 0.001, 'Unmet demand equals 50 units');
  // leftover = max(100 - 150, 0) = 0
  assertCloseTo(res.leftover, 0, 0.001, 'Leftover inventory is 0 during stock-out');
  // revenue = 50 * 100 = 5000
  assertCloseTo(res.revenue, 5000, 0.001, 'Revenue = selling_price * fulfilled = $5000');
  // estimated_profit = (50 - 20) * 100 - 200 - 300 = 3000 - 500 = 2500
  assertCloseTo(res.estimated_profit, 2500, 0.001, 'Estimated profit = (P - C) * fulfilled - promo - ad = $2500');
  // stock_out_risk_percent = ((150 - 100) / 150) * 100 = 33.3%
  assertCloseTo(res.stock_out_risk_percent, 33.3, 0.1, 'Stock out risk percent = 33.3%');
}

// Case B: Inventory exceeds Demand (Surplus inventory scenario)
{
  const res = computeDecisionOutcomes({
    demand: 60,
    inventory: 100,
    selling_price: 40,
    unit_cost: 15,
    promotion_cost: 100,
    advertising_cost: 150,
  });

  // fulfilled = min(60, 100) = 60
  assertCloseTo(res.fulfilled, 60, 0.001, 'Fulfilled units equals demand when demand < inventory');
  // unmet = max(60 - 100, 0) = 0
  assertCloseTo(res.unmet, 0, 0.001, 'Unmet demand is 0');
  // leftover = max(100 - 60, 0) = 40
  assertCloseTo(res.leftover, 40, 0.001, 'Leftover inventory equals 40 units');
  // revenue = 40 * 60 = 2400
  assertCloseTo(res.revenue, 2400, 0.001, 'Revenue = $2400');
  // profit = (40 - 15) * 60 - 100 - 150 = 1500 - 250 = 1250
  assertCloseTo(res.estimated_profit, 1250, 0.001, 'Estimated profit = $1250');
  // stock_out_risk = 0%
  assertCloseTo(res.stock_out_risk_percent, 0, 0.001, 'Stock out risk is 0% when inventory exceeds demand');
}

// Case C: Zero demand boundary check
{
  const res = computeDecisionOutcomes({
    demand: 0,
    inventory: 50,
    selling_price: 30,
    unit_cost: 10,
  });
  assertCloseTo(res.fulfilled, 0, 0.001, 'Fulfilled is 0 for zero demand');
  assertCloseTo(res.stock_out_risk_percent, 0, 0.001, 'Stock out risk handles zero demand safely without NaN');
}

console.log('\n--- 2. Testing Statistical Forecasting Metrics ---');

{
  const actuals = [10, 20, 30, 40, 50];
  const predictions = [12, 18, 33, 41, 47];

  // errors: [2, -2, 3, 1, -3]
  // abs: [2, 2, 3, 1, 3] -> sum = 11 -> MAE = 11 / 5 = 2.2
  const mae = computeMAE(actuals, predictions);
  assertCloseTo(mae, 2.2, 0.01, 'MAE calculation is exact');

  // sq: [4, 4, 9, 1, 9] -> sum = 27 -> mean = 5.4 -> sqrt(5.4) = 2.3238
  const rmse = computeRMSE(actuals, predictions);
  assertCloseTo(rmse, Math.sqrt(5.4), 0.01, 'RMSE calculation is exact');

  // meanActual = 30; ssTot = (-20)^2 + (-10)^2 + 0 + 10^2 + 20^2 = 400 + 100 + 0 + 100 + 400 = 1000
  // ssRes = 27; R2 = 1 - 27/1000 = 0.973
  const r2 = computeR2(actuals, predictions);
  assert(r2 !== null, 'R2 is not null when variation exists');
  if (r2 !== null) {
    assertCloseTo(r2, 0.973, 0.005, 'R2 calculation is exact');
  }

  // Degenerate case: constant actuals -> R2 must be null
  const constActuals = [20, 20, 20, 20];
  const constPreds = [21, 19, 20, 20];
  const constR2 = computeR2(constActuals, constPreds);
  assert(constR2 === null, 'R2 correctly returns null when ssTot == 0 (constant target variance)');
}

console.log('\n--- 3. Testing Chronological Train/Test Splitting ---');

{
  const mockDates = [
    { date: '2025-01-05', val: 5 },
    { date: '2025-01-01', val: 1 },
    { date: '2025-01-04', val: 4 },
    { date: '2025-01-02', val: 2 },
    { date: '2025-01-03', val: 3 },
  ];

  const split = chronologicalSplit(mockDates, 0.6);
  assert(split.train.length === 3, 'Train length is 3 (60% of 5)');
  assert(split.test.length === 2, 'Test length is 2 (40% of 5)');
  assert(split.train[0].date === '2025-01-01', 'Train is chronological starting at earliest date');
  assert(split.train[2].date === '2025-01-03', 'Train ends at chronological cutoff');
  assert(split.test[0].date === '2025-01-04', 'Test starts strictly after train cutoff (no leakage)');
}

console.log('\n--- 4. Testing Linear Regression Solver ---');

{
  // Simple relation: y = 10 + 3 * x
  const X = [
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
  ];
  const y = [13, 16, 19, 22, 25];

  const beta = solveLinearRegression(X, y);
  assertCloseTo(beta[0], 10, 0.05, 'Linear regression intercept recovers true beta_0 = 10');
  assertCloseTo(beta[1], 3, 0.05, 'Linear regression slope recovers true beta_1 = 3');
}

console.log('\n--- 5. Testing Forecasting Pipeline on Benchmark Data ---');

{
  const dataset = generateSyntheticDataset();
  const toteRecords = dataset.records.filter(r => r.product_id === 'PRD-101');
  assert(toteRecords.length === 365, 'Benchmark dataset contains 365 daily observations for PRD-101');

  const forecast = trainAndEvaluateForecast(toteRecords, 'linear_regression', 0.8);
  assert(forecast.metrics.train_sample_size === 292, 'Train set contains 292 days (80%)');
  assert(forecast.metrics.test_sample_size === 73, 'Test set contains 73 days (20%)');
  assert(forecast.metrics.mae > 0, 'MAE is positive and non-zero');
  assert(forecast.metrics.rmse >= forecast.metrics.mae, 'RMSE is mathematically >= MAE');
  assert(forecast.residuals.length === 73, 'Residuals populated for each test observation');
}

console.log('\n--- 6. Testing Price Elasticity Estimation ---');

{
  const dataset = generateSyntheticDataset();
  const knitRecords = dataset.records.filter(r => r.product_id === 'PRD-102');
  const elast = computePriceElasticity(knitRecords);

  assert(elast.elasticity < 0, 'Price elasticity is negative (law of demand holds)');
  assert(elast.sample_size === 365, 'Evaluated on complete sample size');
  assert(elast.confidence_interval_95[0] < elast.confidence_interval_95[1], '95% CI lower < upper');
  assert(elast.p_value <= 0.05, 'Price elasticity coefficient is statistically significant');
}

console.log('\n--- 7. Testing Decision Scoring, Weights Normalization & Constraint Feasibility ---');

{
  const inputA = {
    id: 'scen_a',
    name: 'Scenario A - 60% Margin',
    product_id: 'PRD-101',
    selling_price: 100,
    unit_cost: 40, // 60% margin
    discount_pct: 0,
    promotion_cost: 0,
    advertising_cost: 0,
    inventory: 100,
  };
  const inputB = {
    id: 'scen_b',
    name: 'Scenario B - 50% Margin',
    product_id: 'PRD-101',
    selling_price: 100,
    unit_cost: 50, // 50% margin
    discount_pct: 0,
    promotion_cost: 0,
    advertising_cost: 0,
    inventory: 100,
  };

  const constraints = {
    min_profit_margin_pct: 20,
    max_stock_out_risk_pct: 25,
    min_inventory_coverage_units: 10,
    max_price_ceiling: 500,
    min_price_floor: 10,
    weights: {
      profit_weight: 0.8,
      stockout_weight: 0.4,
      leftover_weight: 0.2, // sum = 1.4, tests total_weight division
    },
  };

  const resA = simulateScenario(inputA, 100, 'Test Product', 'user_assumed', constraints);
  const resB = simulateScenario(inputB, 100, 'Test Product', 'user_assumed', constraints);

  assert((resA.decision_score ?? 0) > (resB.decision_score ?? 0), 'Scenario A (60% margin) outscores Scenario B (50% margin) — no tie collision at >= 50%');
  assertCloseTo(resA.profit_margin_pct, 60, 0.01, 'Scenario A margin is exactly 60%');
  assertCloseTo(resB.profit_margin_pct, 50, 0.01, 'Scenario B margin is exactly 50%');
  assert(resA.is_feasible === true, 'Scenario A meets margin and stock-out constraints');

  // Test constraint violation penalty
  const breachedInput = {
    id: 'scen_breach',
    name: 'Breached Scenario',
    product_id: 'PRD-101',
    selling_price: 100,
    unit_cost: 85, // 15% margin (< 20% floor)
    discount_pct: 0,
    promotion_cost: 0,
    advertising_cost: 0,
    inventory: 20, // demand 100 -> stockout 80% (> 25% max)
  };
  const breachedRes = simulateScenario(breachedInput, 100, 'Test Product', 'user_assumed', constraints);
  assert(breachedRes.is_feasible === false, 'Constraint violations detected');
  assert(breachedRes.violated_constraints.length === 2, 'Both margin floor and stockout ceiling violations recorded');
  assert((breachedRes.decision_score ?? 0) < (resB.decision_score ?? 0), 'Breached scenario receives severe penalty deduction');
}

console.log(`\n========================================`);
console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
