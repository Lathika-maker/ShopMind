/**
 * SHOPMIND — Mathematical & Analytical Calculation Engine
 * 
 * Implements exact, unit-tested formulas for retail simulation, forecasting,
 * regime detection, price sensitivity, and constraint-aware decision support.
 */

import {
  DataRecord,
  ForecastMetrics,
  ForecastResult,
  ModelAlgorithm,
  ResidualDiagnostic,
  ScenarioInput,
  ScenarioSimulationResult,
  StressTestResult,
  BusinessConstraints,
} from '../types/retail.ts';

// ==========================================
// 1. DECISION SIMULATION CORE FORMULAS
// ==========================================

export interface SimulationComputationParams {
  demand: number;
  inventory: number;
  selling_price: number;
  unit_cost: number;
  promotion_cost?: number;
  advertising_cost?: number;
}

export function computeDecisionOutcomes(params: SimulationComputationParams): {
  fulfilled: number;
  unmet: number;
  leftover: number;
  revenue: number;
  estimated_profit: number;
  profit_margin_pct: number;
  stock_out_risk_percent: number;
} {
  const {
    demand,
    inventory,
    selling_price,
    unit_cost,
    promotion_cost = 0,
    advertising_cost = 0,
  } = params;

  // Strict formulas specified by requirements:
  // fulfilled = min(max(demand, 0), max(inventory, 0))
  const fulfilled = Math.min(Math.max(demand, 0), Math.max(inventory, 0));

  // unmet = max(demand - inventory, 0)
  const unmet = Math.max(demand - inventory, 0);

  // leftover = max(inventory - demand, 0)
  const leftover = Math.max(inventory - demand, 0);

  // revenue = selling_price * fulfilled
  const revenue = selling_price * fulfilled;

  // estimated_profit = (selling_price - unit_cost) * fulfilled - promotion_cost - advertising_cost
  const estimated_profit = (selling_price - unit_cost) * fulfilled - promotion_cost - advertising_cost;

  // stock_out_risk_percent = max(0, (demand - inventory) / demand * 100) when demand is positive; otherwise 0
  const stock_out_risk_percent = demand > 0
    ? Math.max(0, ((demand - inventory) / demand) * 100)
    : 0;

  const profit_margin_pct = revenue > 0
    ? (estimated_profit / revenue) * 100
    : 0;

  return {
    fulfilled: Math.round(fulfilled * 100) / 100,
    unmet: Math.round(unmet * 100) / 100,
    leftover: Math.round(leftover * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    estimated_profit: Math.round(estimated_profit * 100) / 100,
    profit_margin_pct: Math.round(profit_margin_pct * 10) / 10,
    stock_out_risk_percent: Math.round(stock_out_risk_percent * 10) / 10,
  };
}

// Simulate full scenario
export function simulateScenario(
  input: ScenarioInput,
  demand: number,
  product_name: string,
  demand_source: 'fitted_model' | 'elasticity_model' | 'user_assumed' | 'historical_average' = 'fitted_model',
  constraints?: BusinessConstraints
): ScenarioSimulationResult {
  const effective_price = input.selling_price * (1 - (input.discount_pct || 0) / 100);
  const outcomes = computeDecisionOutcomes({
    demand,
    inventory: input.inventory,
    selling_price: effective_price,
    unit_cost: input.unit_cost,
    promotion_cost: input.promotion_cost || 0,
    advertising_cost: input.advertising_cost || 0,
  });

  const violated_constraints: string[] = [];
  let is_feasible = true;

  if (constraints) {
    if (outcomes.profit_margin_pct < constraints.min_profit_margin_pct) {
      violated_constraints.push(`Margin ${outcomes.profit_margin_pct}% < min ${constraints.min_profit_margin_pct}%`);
      is_feasible = false;
    }
    if (outcomes.stock_out_risk_percent > constraints.max_stock_out_risk_pct) {
      violated_constraints.push(`Stock-out risk ${outcomes.stock_out_risk_percent}% > max ${constraints.max_stock_out_risk_pct}%`);
      is_feasible = false;
    }
    if (constraints.min_inventory_coverage_units > 0 && input.inventory < constraints.min_inventory_coverage_units) {
      violated_constraints.push(`Inventory ${input.inventory} units < minimum coverage ${constraints.min_inventory_coverage_units} units`);
      is_feasible = false;
    }
    if (constraints.max_price_ceiling && effective_price > constraints.max_price_ceiling) {
      violated_constraints.push(`Effective selling price ${effective_price.toFixed(2)} exceeds configured ceiling ${constraints.max_price_ceiling} (amounts use the active dataset currency).`);
      is_feasible = false;
    }
    if (constraints.min_price_floor && effective_price < constraints.min_price_floor) {
      violated_constraints.push(`Effective selling price ${effective_price.toFixed(2)} is below configured floor ${constraints.min_price_floor} (amounts use the active dataset currency).`);
      is_feasible = false;
    }
  }

  // Multi-criteria score (0 to 100)
  // Higher profit margin + lower stockout risk + controlled leftover inventory
  const weights = constraints?.weights || { profit_weight: 0.5, stockout_weight: 0.3, leftover_weight: 0.2 };
  const total_weight = (weights.profit_weight + weights.stockout_weight + weights.leftover_weight) || 1;
  const normalized_profit_score = Math.max(0, Math.min(100, outcomes.profit_margin_pct));
  const normalized_stockout_score = Math.max(0, 100 - outcomes.stock_out_risk_percent);
  const leftover_penalty = input.inventory > 0 ? (outcomes.leftover / input.inventory) * 100 : 0;
  const normalized_leftover_score = Math.max(0, 100 - leftover_penalty);

  const raw_score = is_feasible
    ? (weights.profit_weight * normalized_profit_score +
       weights.stockout_weight * normalized_stockout_score +
       weights.leftover_weight * normalized_leftover_score) / total_weight
    : Math.max(
        0,
        (((weights.profit_weight * normalized_profit_score +
           weights.stockout_weight * normalized_stockout_score) / total_weight) * 0.4) - 10
      );

  const decision_score = Math.round(raw_score * 100) / 100;

  return {
    scenario_id: input.id || `scen_${Date.now()}`,
    name: input.name,
    product_id: input.product_id,
    product_name,
    selling_price: input.selling_price,
    unit_cost: input.unit_cost,
    discount_pct: input.discount_pct || 0,
    effective_price: Math.round(effective_price * 100) / 100,
    promotion_cost: input.promotion_cost || 0,
    advertising_cost: input.advertising_cost || 0,
    inventory: input.inventory,
    demand: Math.round(demand * 100) / 100,
    demand_source,
    fulfilled: outcomes.fulfilled,
    unmet: outcomes.unmet,
    leftover: outcomes.leftover,
    revenue: outcomes.revenue,
    estimated_profit: outcomes.estimated_profit,
    profit_margin_pct: outcomes.profit_margin_pct,
    stock_out_risk_percent: outcomes.stock_out_risk_percent,
    created_at: new Date().toISOString(),
    is_feasible,
    violated_constraints,
    decision_score,
  };
}

// Compute stress test (-25% conservative demand, +35% high demand)
export function runStressTest(
  baselineResult: ScenarioSimulationResult,
  input: ScenarioInput,
  constraints?: BusinessConstraints,
  conservativeDropPct = 25,
  highSurgePct = 35
): StressTestResult {
  // Percent changes are explicit stress assumptions, not model predictions.
  const conservativeShock = Math.max(0, Math.min(95, conservativeDropPct));
  const highShock = Math.max(0, Math.min(300, highSurgePct));
  const conservative_demand = Math.max(0, baselineResult.demand * (1 - conservativeShock / 100));
  const high_demand = Math.max(0, baselineResult.demand * (1 + highShock / 100));

  const conservative_case = simulateScenario(
    { ...input, name: `${input.name} (Conservative -${conservativeShock}%)` },
    conservative_demand,
    baselineResult.product_name,
    'user_assumed',
    constraints
  );

  const high_demand_case = simulateScenario(
    { ...input, name: `${input.name} (High Surge +${highShock}%)` },
    high_demand,
    baselineResult.product_name,
    'user_assumed',
    constraints
  );

  const max_profit_loss = Math.max(0, baselineResult.estimated_profit - conservative_case.estimated_profit);
  const worst_stockout_risk = high_demand_case.stock_out_risk_percent;
  const inventory_holding_risk_units = conservative_case.leftover;

  return {
    scenario_id: baselineResult.scenario_id,
    name: baselineResult.name,
    baseline: baselineResult,
    conservative_case,
    high_demand_case,
    max_profit_loss: Math.round(max_profit_loss * 100) / 100,
    worst_stockout_risk,
    inventory_holding_risk_units: Math.round(inventory_holding_risk_units),
  };
}

// ==========================================
// 2. FORECASTING & STATISTICAL METRICS
// ==========================================

export function computeMAE(actuals: number[], predictions: number[]): number {
  if (actuals.length === 0 || actuals.length !== predictions.length) return 0;
  let sum = 0;
  for (let i = 0; i < actuals.length; i++) {
    sum += Math.abs(actuals[i] - predictions[i]);
  }
  return sum / actuals.length;
}

export function computeRMSE(actuals: number[], predictions: number[]): number {
  if (actuals.length === 0 || actuals.length !== predictions.length) return 0;
  let sumSq = 0;
  for (let i = 0; i < actuals.length; i++) {
    const diff = actuals[i] - predictions[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / actuals.length);
}

export function computeR2(actuals: number[], predictions: number[]): number | null {
  if (actuals.length < 2 || actuals.length !== predictions.length) return null;
  const meanActual = actuals.reduce((a, b) => a + b, 0) / actuals.length;
  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < actuals.length; i++) {
    const diffActual = actuals[i] - meanActual;
    const residual = actuals[i] - predictions[i];
    ssTot += diffActual * diffActual;
    ssRes += residual * residual;
  }

  // R² is mathematically meaningful only when ssTot > 0 (there is variance in actuals)
  if (ssTot === 0) return null;
  const r2 = 1 - (ssRes / ssTot);
  return r2;
}

export function computeMAPE(actuals: number[], predictions: number[]): number {
  let count = 0;
  let sum = 0;
  for (let i = 0; i < actuals.length; i++) {
    if (actuals[i] > 0) {
      sum += Math.abs((actuals[i] - predictions[i]) / actuals[i]);
      count++;
    }
  }
  return count > 0 ? (sum / count) * 100 : 0;
}

// Chronological train/test split: strictly time-ordered, no random future leakage
export function chronologicalSplit<T extends { date: string }>(
  records: T[],
  trainRatio = 0.8
): { train: T[]; test: T[] } {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const splitIndex = Math.max(1, Math.floor(sorted.length * trainRatio));
  return {
    train: sorted.slice(0, splitIndex),
    test: sorted.slice(splitIndex),
  };
}

/**
 * Summarize date coverage without pretending absent dates were observed as zero sales.
 */
export function summarizeDateCoverage(records: DataRecord[]): {
  observed_product_days: number;
  calendar_span_days: number;
  unobserved_calendar_days: number;
  first_date: string | null;
  last_date: string | null;
  missing_days_imputed: false;
} {
  const dates = Array.from(new Set(records.map(record => record.date).filter(Boolean))).sort();
  const firstDate = dates[0] || null;
  const lastDate = dates[dates.length - 1] || null;
  const firstMs = firstDate ? Date.parse(firstDate + 'T00:00:00Z') : NaN;
  const lastMs = lastDate ? Date.parse(lastDate + 'T00:00:00Z') : NaN;
  const calendarSpan = Number.isFinite(firstMs) && Number.isFinite(lastMs)
    ? Math.max(1, Math.floor((lastMs - firstMs) / 86400000) + 1)
    : dates.length;

  return {
    observed_product_days: dates.length,
    calendar_span_days: calendarSpan,
    unobserved_calendar_days: Math.max(0, calendarSpan - dates.length),
    first_date: firstDate,
    last_date: lastDate,
    missing_days_imputed: false,
  };
}

/**
 * Aggregate transaction-level product records into one observation per calendar
 * day before forecasting or regime detection. Transaction rows are not independent
 * selling days; sum quantity and retain transparent daily feature summaries.
 */
export function aggregateDailyDemand(records: DataRecord[]): DataRecord[] {
  const grouped = new Map<string, DataRecord[]>();
  for (const record of records) {
    const key = `${record.product_id}__${record.date}`;
    const existing = grouped.get(key);
    if (existing) existing.push(record);
    else grouped.set(key, [record]);
  }

  const weightedAverage = (rows: DataRecord[], field: 'price' | 'unit_cost' | 'discount_pct' | 'competitor_price') => {
    const valid = rows.filter(row => Number.isFinite(row[field]) && row[field] >= 0);
    if (!valid.length) return 0;
    const weightTotal = valid.reduce((sum, row) => sum + Math.max(0, row.units_sold), 0);
    const total = valid.reduce((sum, row) => sum + row[field] * Math.max(0, row.units_sold), 0);
    return weightTotal > 0
      ? Math.round((total / weightTotal) * 100) / 100
      : Math.round((valid.reduce((sum, row) => sum + row[field], 0) / valid.length) * 100) / 100;
  };

  return Array.from(grouped.values()).map((rows, index) => {
    const first = rows[0];
    const totalUnits = rows.reduce((sum, row) => sum + row.units_sold, 0);
    const dailyRecord: DataRecord = {
      ...first,
      id: `DAY-${first.product_id}-${first.date}-${index}`,
      units_sold: Math.round(totalUnits * 100) / 100,
      price: weightedAverage(rows, 'price'),
      unit_cost: weightedAverage(rows, 'unit_cost'),
      discount_pct: weightedAverage(rows, 'discount_pct'),
      competitor_price: weightedAverage(rows, 'competitor_price'),
      inventory_on_hand: Math.max(0, ...rows.map(row => Number.isFinite(row.inventory_on_hand) ? row.inventory_on_hand : 0)),
      promo_active: rows.some(row => row.promo_active),
      ...(rows.some(row => typeof row.revenue === 'number')
        ? { revenue: Math.round(rows.reduce((sum, row) => sum + (row.revenue || 0), 0) * 100) / 100 }
        : {}),
      ...(rows.some(row => row.data_missing_fields?.length)
        ? { data_missing_fields: Array.from(new Set(rows.flatMap(row => row.data_missing_fields || []))) }
        : {}),
    };
    dailyRecord.is_weekend = [0, 6].includes(new Date(first.date + 'T00:00:00Z').getUTCDay());
    return dailyRecord;
  }).sort((a, b) => a.date.localeCompare(b.date) || a.product_id.localeCompare(b.product_id));
}

// Multiple Linear Regression solver using Normal Equations: (X^T X + lambda I)^-1 X^T y
export function solveLinearRegression(
  X: number[][], // n rows, p features (first feature is 1 for bias/intercept)
  y: number[]
): number[] {
  const n = X.length;
  const p = X[0].length;

  // Compute X^T X
  const XtX: number[][] = Array(p).fill(0).map(() => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += X[k][i] * X[k][j];
      }
      // Add L2 Ridge penalty (lambda = 1e-5) on diagonal for numerical stability
      if (i === j) sum += 1e-5;
      XtX[i][j] = sum;
    }
  }

  // Compute X^T y
  const Xty: number[] = Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    let sum = 0;
    for (let k = 0; k < n; k++) {
      sum += X[k][i] * y[k];
    }
    Xty[i] = sum;
  }

  // Invert XtX using Gauss-Jordan elimination
  const invXtX = invertMatrix(XtX);
  if (!invXtX) {
    // Fallback: simple bias-only model
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    const beta = Array(p).fill(0);
    beta[0] = meanY;
    return beta;
  }

  // beta = inv(X^T X) * X^T y
  const beta: number[] = Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    let sum = 0;
    for (let j = 0; j < p; j++) {
      sum += invXtX[i][j] * Xty[j];
    }
    beta[i] = sum;
  }

  return beta;
}

function invertMatrix(M: number[][]): number[][] | null {
  const n = M.length;
  // Augmented matrix [M | I]
  const A: number[][] = M.map((row, i) => [
    ...row,
    ...Array(n).fill(0).map((_, j) => (i === j ? 1 : 0)),
  ]);

  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    if (Math.abs(A[maxRow][i]) < 1e-12) return null; // Singular

    // Swap rows
    const temp = A[i];
    A[i] = A[maxRow];
    A[maxRow] = temp;

    // Scale pivot row
    const pivot = A[i][i];
    for (let j = 0; j < 2 * n; j++) {
      A[i][j] /= pivot;
    }

    // Eliminate other rows
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = A[k][i];
        for (let j = 0; j < 2 * n; j++) {
          A[k][j] -= factor * A[i][j];
        }
      }
    }
  }

  // Extract right half
  return A.map(row => row.slice(n));
}

// Extract features for record
export function extractFeatures(
  record: DataRecord,
  availableFields?: Record<string, boolean>
): { names: string[]; values: number[] } {
  const d = new Date(record.date + 'T00:00:00Z');
  const dayOfWeek = d.getUTCDay();
  const month = d.getUTCMonth();
  const names = ['Intercept'];
  const values = [1];

  if (availableFields?.price !== false) {
    names.push('Unit Price');
    values.push(record.price);
  }
  if (availableFields?.discount_pct === true) {
    names.push('Discount %');
    values.push(record.discount_pct || 0);
  }
  if (availableFields?.promo_active === true) {
    names.push('Promo Active');
    values.push(record.promo_active ? 1 : 0);
  }
  if (availableFields?.price === true && availableFields?.competitor_price === true) {
    names.push('Competitor Price Difference');
    values.push(record.price - record.competitor_price);
  }

  names.push('Weekend', 'Month Seasonality');
  values.push(
    record.is_weekend === undefined ? ([0, 6].includes(dayOfWeek) ? 1 : 0) : (record.is_weekend ? 1 : 0),
    Math.sin((2 * Math.PI * month) / 12)
  );
  return { names, values };
}

// Complete Chronological Forecasting Pipeline
export function trainAndEvaluateForecast(
  records: DataRecord[],
  algorithm: ModelAlgorithm = 'linear_regression',
  trainRatio = 0.8,
  availableFields?: Record<string, boolean>
): ForecastResult {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 10) {
    throw new Error(`Insufficient records for reliable chronological evaluation (${sorted.length} found, minimum 10 required).`);
  }

  const { train, test } = chronologicalSplit(sorted, trainRatio);
  const product_id = sorted[0].product_id;
  const product_name = sorted[0].product_name;

  let trainPredictions: number[] = [];
  let testPredictions: number[] = [];
  let featureNames: string[] = [];
  let importances: { feature: string; importance: number }[] = [];

  if (algorithm === 'naive_last') {
    // Baseline: predict previous known observation
    trainPredictions = train.map((_, i) => (i === 0 ? train[0].units_sold : train[i - 1].units_sold));
    testPredictions = test.map((_, i) => (i === 0 ? train[train.length - 1].units_sold : test[i - 1].units_sold));
    importances = [{ feature: 'Lagged Demand (t-1)', importance: 1.0 }];
  } else if (algorithm === 'moving_average_7d') {
    const k = 7;
    // Moving average of previous k days
    trainPredictions = train.map((_, i) => {
      const window = train.slice(Math.max(0, i - k), i);
      if (window.length === 0) return train[0].units_sold;
      return window.reduce((s, r) => s + r.units_sold, 0) / window.length;
    });

    testPredictions = test.map((_, i) => {
      const history = [...train, ...test.slice(0, i)];
      const window = history.slice(Math.max(0, history.length - k));
      return window.reduce((s, r) => s + r.units_sold, 0) / window.length;
    });
    importances = [{ feature: '7-Day Rolling Mean', importance: 1.0 }];
  } else if (algorithm === 'linear_regression') {
    // Multiple Linear Regression
    const X_train = train.map(r => extractFeatures(r, availableFields).values);
    const y_train = train.map(r => r.units_sold);
    featureNames = extractFeatures(train[0], availableFields).names;

    const weights = solveLinearRegression(X_train, y_train);

    trainPredictions = X_train.map(x => Math.max(0, x.reduce((sum, val, idx) => sum + val * weights[idx], 0)));
    const X_test = test.map(r => extractFeatures(r, availableFields).values);
    testPredictions = X_test.map(x => Math.max(0, x.reduce((sum, val, idx) => sum + val * weights[idx], 0)));

    // Calculate approximate standardized feature importance from coefficients
    const totalWeight = weights.slice(1).reduce((s, w) => s + Math.abs(w), 0) || 1;
    importances = featureNames.slice(1).map((feat, idx) => ({
      feature: feat,
      importance: Math.round((Math.abs(weights[idx + 1]) / totalWeight) * 100) / 100,
    })).sort((a, b) => b.importance - a.importance);
  } else {
    // Random Forest / Non-linear Ensemble Approximation (Ensemble of localized regressors with feature subsampling)
    const X_train = train.map(r => extractFeatures(r, availableFields).values);
    const y_train = train.map(r => r.units_sold);
    featureNames = extractFeatures(train[0], availableFields).names;

    // Train 15 randomized decision stumps
    const trees: { featureIdx: number; splitVal: number; leftMean: number; rightMean: number }[] = [];
    const numTrees = 15;
    for (let t = 0; t < numTrees; t++) {
      const fIdx = 1 + (t % (featureNames.length - 1));
      const vals = X_train.map(x => x[fIdx]);
      const medianVal = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
      const leftY = y_train.filter((_, idx) => X_train[idx][fIdx] <= medianVal);
      const rightY = y_train.filter((_, idx) => X_train[idx][fIdx] > medianVal);
      trees.push({
        featureIdx: fIdx,
        splitVal: medianVal,
        leftMean: leftY.length ? leftY.reduce((a, b) => a + b, 0) / leftY.length : y_train[0],
        rightMean: rightY.length ? rightY.reduce((a, b) => a + b, 0) / rightY.length : y_train[0],
      });
    }

    const predictRF = (x: number[]) => {
      let sum = 0;
      for (const tree of trees) {
        sum += x[tree.featureIdx] <= tree.splitVal ? tree.leftMean : tree.rightMean;
      }
      return Math.max(0, sum / trees.length);
    };

    trainPredictions = X_train.map(predictRF);
    const X_test = test.map(r => extractFeatures(r).values);
    testPredictions = X_test.map(predictRF);

    importances = featureNames.slice(1).map((feat, idx) => {
      const matches = trees.filter(t => t.featureIdx === idx + 1).length;
      return { feature: feat, importance: Math.round((matches / numTrees) * 100) / 100 };
    }).sort((a, b) => b.importance - a.importance);
  }

  const testActuals = test.map(r => r.units_sold);
  const mae = computeMAE(testActuals, testPredictions);
  const rmse = computeRMSE(testActuals, testPredictions);
  const r2 = computeR2(testActuals, testPredictions);
  const mape = computeMAPE(testActuals, testPredictions);

  const limitations: string[] = [
    'Evaluated strictly on held-out chronological test period to prevent future-data leakage.',
    'Assumes past market relationships (price response and seasonality) persist in the forecast horizon.',
  ];
  if (r2 !== null && r2 < 0) {
    limitations.push('Negative R² indicates model performs worse than a constant historical mean forecast on this test window.');
  }

  const predictions = [
    ...train.map((r, i) => ({
      date: r.date,
      actual: r.units_sold,
      predicted: Math.round(trainPredictions[i] * 10) / 10,
      split: 'train' as const,
    })),
    ...test.map((r, i) => ({
      date: r.date,
      actual: r.units_sold,
      predicted: Math.round(testPredictions[i] * 10) / 10,
      split: 'test' as const,
    })),
  ];

  const residuals: ResidualDiagnostic[] = test.map((r, i) => {
    const act = r.units_sold;
    const pred = testPredictions[i];
    const res = act - pred;
    const pct = act > 0 ? (res / act) * 100 : 0;
    return {
      date: r.date,
      actual: act,
      predicted: Math.round(pred * 10) / 10,
      residual: Math.round(res * 10) / 10,
      percent_error: Math.round(pct * 10) / 10,
    };
  });

  const metrics: ForecastMetrics = {
    mae: Math.round(mae * 100) / 100,
    rmse: Math.round(rmse * 100) / 100,
    r2: r2 !== null ? Math.round(r2 * 1000) / 1000 : null,
    mape: Math.round(mape * 10) / 10,
    test_sample_size: test.length,
    train_sample_size: train.length,
    train_period: { start: train[0].date, end: train[train.length - 1].date },
    test_period: { start: test[0].date, end: test[test.length - 1].date },
    limitations,
  };

  return {
    model_id: `mdl_${algorithm}_${Date.now()}`,
    product_id,
    product_name,
    algorithm,
    metrics,
    predictions,
    residuals,
    feature_importances: importances,
    created_at: new Date().toISOString(),
  };
}

// ==========================================
// 3. DEMAND-REGIME DETECTION
// ==========================================

export function detectDemandRegimes(
  records: DataRecord[],
  windowSize = 14
): {
  regimes: {
    date: string;
    product_id: string;
    units: number;
    regime: 'low' | 'normal' | 'high';
    zScore: number;
    rollingMean: number;
  }[];
  summary: {
    regime: 'low' | 'normal' | 'high';
    count: number;
    percentage: number;
    average_demand: number;
    average_price: number;
  }[];
  threshold_used: string;
} {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const results = sorted.map((r, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const window = sorted.slice(start, i + 1).map(x => x.units_sold);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / window.length;
    const std = Math.sqrt(variance) || 1;
    const zScore = (r.units_sold - mean) / std;

    let regime: 'low' | 'normal' | 'high' = 'normal';
    if (zScore > 0.95) regime = 'high';
    else if (zScore < -0.95) regime = 'low';

    return {
      date: r.date,
      product_id: r.product_id,
      units: r.units_sold,
      regime,
      zScore: Math.round(zScore * 100) / 100,
      rollingMean: Math.round(mean * 10) / 10,
    };
  });

  const total = results.length || 1;
  const groups: Record<'low' | 'normal' | 'high', { count: number; sumUnits: number; sumPrice: number }> = {
    low: { count: 0, sumUnits: 0, sumPrice: 0 },
    normal: { count: 0, sumUnits: 0, sumPrice: 0 },
    high: { count: 0, sumUnits: 0, sumPrice: 0 },
  };

  results.forEach((res, i) => {
    const r = sorted[i];
    groups[res.regime].count++;
    groups[res.regime].sumUnits += r.units_sold;
    groups[res.regime].sumPrice += r.price;
  });

  const summary = (['low', 'normal', 'high'] as const).map(reg => {
    const g = groups[reg];
    return {
      regime: reg,
      count: g.count,
      percentage: Math.round((g.count / total) * 1000) / 10,
      average_demand: g.count ? Math.round((g.sumUnits / g.count) * 10) / 10 : 0,
      average_price: g.count ? Math.round((g.sumPrice / g.count) * 100) / 100 : 0,
    };
  });

  return {
    regimes: results,
    summary,
    threshold_used: `${windowSize}-observation rolling window over recorded product-days; missing calendar dates are not imputed (High: z > +0.95, Low: z < -0.95)`,
  };
}

// ==========================================
// 4. PRICE SENSITIVITY & ELASTICITY
// ==========================================

export function computePriceElasticity(
  records: DataRecord[],
  availableFields?: Record<string, boolean>
): {
  elasticity: number;
  elasticity_label: 'highly_elastic' | 'elastic' | 'unitary' | 'inelastic' | 'positive_association';
  confidence_interval_95: [number, number];
  p_value: number;
  r_squared: number;
  sample_size: number;
  confounders_controlled: string[];
  scatter_data: { price: number; units: number; fitted_units: number; promo: boolean; date: string }[];
  sufficiency: 'robust' | 'moderate' | 'insufficient';
  data_sufficiency_warning?: string;
  methodology_notes: string;
} {
  // Filter valid positive price and units
  const valid = records.filter(r => r.price > 0 && r.units_sold > 0);
  const n = valid.length;

  if (n < 15) {
    return {
      elasticity: 0,
      elasticity_label: 'inelastic',
      confidence_interval_95: [0, 0],
      p_value: 1.0,
      r_squared: 0,
      sample_size: n,
      confounders_controlled: [],
      scatter_data: [],
      sufficiency: 'insufficient',
      data_sufficiency_warning: `Insufficient observations (${n} rows, minimum 15 required for statistical price elasticity).`,
      methodology_notes: 'Cannot estimate elasticity due to small sample size.',
    };
  }

  const uniquePrices = new Set(valid.map(r => r.price));
  if (uniquePrices.size < 2) {
    return {
      elasticity: 0,
      elasticity_label: 'inelastic',
      confidence_interval_95: [0, 0],
      p_value: 1.0,
      r_squared: 0,
      sample_size: n,
      confounders_controlled: [],
      scatter_data: [],
      sufficiency: 'insufficient',
      data_sufficiency_warning: 'No usable price variation detected in dataset. At least two distinct positive price points are required to calculate price elasticity.',
      methodology_notes: 'Cannot estimate price elasticity when selling price is constant across all observations.',
    };
  }

  // Log-log OLS uses only supported controls. Weekend is derived from the normalized
  // date; the promotional control is included only when a complete mapped flag exists.
  const includePromoControl = availableFields?.promo_active === true;
  const weekendValue = (record: DataRecord) => {
    if (typeof record.is_weekend === 'boolean') return record.is_weekend ? 1 : 0;
    const day = new Date(record.date + 'T00:00:00Z').getUTCDay();
    return day === 0 || day === 6 ? 1 : 0;
  };
  const X: number[][] = valid.map(record => [
    1,
    Math.log(record.price),
    ...(includePromoControl ? [record.promo_active ? 1 : 0] : []),
    weekendValue(record),
  ]);
  const y = valid.map(r => Math.log(r.units_sold));

  const beta = solveLinearRegression(X, y);
  const rawElasticity = beta[1]; // d(ln Q) / d(ln P)

  // Residual variance and approximate standard error for an observational estimate.
  const y_pred = X.map(row => row.reduce((sum, value, index) => sum + value * beta[index], 0));
  let ssRes = 0;
  let ssTot = 0;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  for (let i = 0; i < n; i++) {
    const res = y[i] - y_pred[i];
    ssRes += res * res;
    ssTot += Math.pow(y[i] - meanY, 2);
  }

  const parameterCount = X[0].length;
  const degreesOfFreedom = Math.max(1, n - parameterCount);
  const residualVariance = ssRes / degreesOfFreedom;

  // Use the price-slope diagonal of the same regularized (X'X)^-1 used by the
  // fitted model. This accounts for correlation between log-price and controls.
  const xtx: number[][] = Array.from({ length: parameterCount }, () => Array(parameterCount).fill(0));
  for (let i = 0; i < parameterCount; i++) {
    for (let j = 0; j < parameterCount; j++) {
      let sum = 0;
      for (let row = 0; row < n; row++) sum += X[row][i] * X[row][j];
      if (i === j) sum += 1e-5; // Match solveLinearRegression's ridge stabilization.
      xtx[i][j] = sum;
    }
  }
  const inverseXtX = invertMatrix(xtx);
  const slopeVarianceScale = inverseXtX?.[1]?.[1];
  const se_elasticity = Number.isFinite(slopeVarianceScale)
    ? Math.sqrt(Math.max(1e-6, residualVariance * Math.max(0, slopeVarianceScale!)))
    : Number.POSITIVE_INFINITY;

  const t_stat = Number.isFinite(se_elasticity) && se_elasticity > 0
    ? Math.abs(rawElasticity) / se_elasticity
    : 0;
  // Approximate two-sided normal p-value; this remains a large-sample approximation.
  const p_value = Math.max(0.0001, Math.min(1.0, 2 * (1 - normalCdf(t_stat))));
  const r_squared = ssTot > 0 ? Math.max(0, Math.min(1, 1 - (ssRes / ssTot))) : 0;

  const ci_lower = rawElasticity - 1.96 * se_elasticity;
  const ci_upper = rawElasticity + 1.96 * se_elasticity;

  let elasticity_label: 'highly_elastic' | 'elastic' | 'unitary' | 'inelastic' | 'positive_association' = 'inelastic';
  const absElast = Math.abs(rawElasticity);
  if (rawElasticity > 0) {
    // A positive fitted coefficient is not the conventional downward-sloping
    // demand response; report direction rather than calling it price-elastic.
    elasticity_label = 'positive_association';
  } else if (absElast > 1.8) elasticity_label = 'highly_elastic';
  else if (absElast > 1.1) elasticity_label = 'elastic';
  else if (absElast >= 0.9 && absElast <= 1.1) elasticity_label = 'unitary';

  const scatter_data = valid.map((r, i) => ({
    price: r.price,
    units: r.units_sold,
    fitted_units: Math.round(Math.exp(y_pred[i]) * 10) / 10,
    promo: r.promo_active,
    date: r.date,
  }));

  const sufficiency = n >= 60 ? 'robust' : 'moderate';

  return {
    elasticity: Math.round(rawElasticity * 100) / 100,
    elasticity_label,
    confidence_interval_95: [Math.round(ci_lower * 100) / 100, Math.round(ci_upper * 100) / 100],
    p_value: Math.round(p_value * 10000) / 10000,
    r_squared: Math.round(r_squared * 1000) / 1000,
    sample_size: n,
    confounders_controlled: includePromoControl
      ? ['Mapped promotional campaign flag (binary)', 'Weekend calendar timing derived from date (binary)']
      : ['Weekend calendar timing derived from date (binary)'],
    scatter_data,
    sufficiency,
    methodology_notes: includePromoControl
      ? 'Log-log Ordinary Least Squares with a mapped promotion-flag control and weekend timing derived from the record date. Confidence bounds and significance are approximate; this is an observed association, not causal elasticity. Causal attribution requires randomized price variation or a defensible exogenous design.'
      : 'Log-log Ordinary Least Squares with weekend timing derived from the record date. No promotion control was included because the active dataset did not provide a complete mapped promotion flag. Confidence bounds and significance are approximate; this is an observed association, not causal elasticity. Causal attribution requires randomized price variation or a defensible exogenous design.',
  };
}

function normalCdf(x: number): number {
  // Approximation of standard normal cumulative distribution
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}
