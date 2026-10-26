/**
 * Shared empirical insight generator used by both the Vite middleware and Express API.
 * Findings are derived only from the currently active dataset, calculated models,
 * active business constraints, and saved scenario assumptions.
 */
import {
  BusinessConstraints,
  DataRecord,
  DatasetMetadata,
  InsightItem,
  ScenarioSimulationResult,
} from '../types/retail.ts';
import {
  aggregateDailyDemand,
  computePriceElasticity,
  detectDemandRegimes,
  summarizeDateCoverage,
  trainAndEvaluateForecast,
} from './calculations.ts';
import { currencyContext, formatCurrency } from './formatting.ts';

function byRecordedVolume(records: DataRecord[]): Array<{ productId: string; rows: DataRecord[]; totalUnits: number }> {
  const grouped = new Map<string, DataRecord[]>();
  for (const record of records) {
    const current = grouped.get(record.product_id) || [];
    current.push(record);
    grouped.set(record.product_id, current);
  }
  return Array.from(grouped.entries())
    .map(([productId, rows]) => ({
      productId,
      rows,
      totalUnits: rows.reduce((sum, record) => sum + record.units_sold, 0),
    }))
    .sort((a, b) => b.totalUnits - a.totalUnits);
}

function weightedMean(records: DataRecord[], field: 'price' | 'unit_cost'): number | null {
  const valid = records.filter(record =>
    Number.isFinite(record[field]) && record[field] > 0 && record.units_sold > 0
  );
  if (!valid.length) return null;
  const units = valid.reduce((sum, record) => sum + record.units_sold, 0);
  if (units <= 0) return null;
  return Math.round(valid.reduce((sum, record) => sum + record[field] * record.units_sold, 0) / units * 100) / 100;
}

function productName(rows: DataRecord[], productId: string): string {
  return rows[0]?.product_name?.trim() || productId;
}

export function generateEmpiricalInsights(
  records: DataRecord[],
  metadata: DatasetMetadata | null,
  scenarios: ScenarioSimulationResult[],
  constraints: BusinessConstraints
): InsightItem[] {
  if (!metadata || records.length === 0) return [];

  const products = byRecordedVolume(records);
  const insights: InsightItem[] = [];
  const currency = metadata.currency_code || 'UNSPECIFIED';

  // Price sensitivity: find the highest-volume product for which the active data
  // actually supports a variable-price estimate, not merely the first CSV row.
  if (metadata.available_fields?.price === true) {
    for (const product of products) {
      const priceDays = aggregateDailyDemand(product.rows);
      const priced = priceDays.filter(record => Number.isFinite(record.price) && record.price > 0);
      const uniquePrices = new Set(priced.map(record => Math.round(record.price * 100) / 100));
      if (priced.length < 15 || uniquePrices.size < 2) continue;

      const estimate = computePriceElasticity(priceDays, metadata.available_fields);
      if (estimate.sufficiency === 'insufficient') continue;

      const name = productName(product.rows, product.productId);
      const [ciLower, ciUpper] = estimate.confidence_interval_95;
      const intervalExcludesZero = ciLower > 0 || ciUpper < 0;
      const statisticalSignal = intervalExcludesZero && estimate.p_value < 0.05;
      let whyItMatters: string;
      let possibleAction: string;

      if (!statisticalSignal) {
        whyItMatters = 'The fitted price-demand association is uncertain at conventional thresholds; do not change price solely from this estimate.';
        possibleAction = 'Check sample coverage and confounders, then run a controlled pricing test before changing markdown policy.';
      } else if (estimate.elasticity < -1) {
        whyItMatters = 'The fitted association is price-elastic: the estimated percentage demand response is greater in magnitude than the percentage price change, but it is not causal proof.';
        possibleAction = 'Test a limited markdown range with a control group while tracking contribution margin and inventory availability.';
      } else if (estimate.elasticity < 0) {
        whyItMatters = 'The fitted association is negative but comparatively inelastic; broad discounts may reduce margin without a proportional unit response.';
        possibleAction = 'Compare contribution margin across controlled price points before extending a promotion.';
      } else {
        whyItMatters = 'The fitted association is non-negative, which is not the conventional downward-sloping demand pattern and may reflect confounding, selection, or limited variation.';
        possibleAction = 'Review date coverage, promotion controls, price endogeneity, and data quality; do not automatically recommend a markdown from this result.';
      }

      insights.push({
        id: 'ins_price_elasticity',
        category: 'price_sensitivity',
        title: `Observed Price Sensitivity: ${name}`,
        observed: `Log-log OLS elasticity estimate ${estimate.elasticity.toFixed(2)}; approximate 95% interval [${ciLower.toFixed(2)}, ${ciUpper.toFixed(2)}], approximate p-value ${estimate.p_value.toFixed(4)}.`,
        supporting_data: `N = ${estimate.sample_size} recorded product-day observations; R² = ${estimate.r_squared.toFixed(3)}; quantity-weighted recorded unit price = ${formatCurrency(weightedMean(priceDays, 'price'), currency)}. Controls reported by the fitted model: ${estimate.confounders_controlled.join(', ') || 'none'}.`,
        why_it_matters: whyItMatters,
        possible_action: possibleAction,
        uncertainty_limitations: estimate.methodology_notes,
        severity: statisticalSignal && estimate.elasticity < -1.5 ? 'high' : 'medium',
      });
      break;
    }
  }

  // Regime detection uses one observation per recorded product-day. Missing
  // calendar dates are not imputed as zero demand.
  for (const product of products) {
    const daily = aggregateDailyDemand(product.rows);
    if (daily.length < 14) continue;
    const result = detectDemandRegimes(daily, 14);
    const high = result.summary.find(summary => summary.regime === 'high');
    const low = result.summary.find(summary => summary.regime === 'low');
    if (!high) continue;

    const coverage = summarizeDateCoverage(daily);
    const name = productName(product.rows, product.productId);
    insights.push({
      id: 'ins_demand_regime',
      category: 'demand_regime',
      title: `Demand Regime Pattern: ${name}`,
      observed: `${high.percentage}% of recorded product-day observations are classified as high-demand; ${low?.percentage || 0}% are classified as low-demand.`,
      supporting_data: `The ${result.threshold_used}. Mean units per recorded product-day: high ${high.average_demand}, low ${low?.average_demand || 0}. Observed span ${coverage.first_date || 'N/A'} to ${coverage.last_date || 'N/A'} with ${coverage.unobserved_calendar_days} calendar dates lacking a row; missing dates were not imputed.`,
      why_it_matters: 'Replenishment decisions based only on an overall average can miss changes in recorded demand regimes.',
      possible_action: 'Review safety-stock settings for high-regime periods and validate the detected pattern against additional historical coverage.',
      uncertainty_limitations: 'Regimes are descriptive classifications from recorded product-day observations; irregular source coverage and short history can change the estimated pattern.',
      severity: high.percentage >= 20 ? 'high' : 'medium',
    });
    break;
  }

  // Compare the selected statistical model with a simple benchmark on exactly
  // the same chronological split, and disclose when the holdout is small.
  for (const product of products) {
    const daily = aggregateDailyDemand(product.rows);
    if (daily.length < 10) continue;
    try {
      const model = trainAndEvaluateForecast(daily, 'linear_regression', 0.8, metadata.available_fields);
      const naive = trainAndEvaluateForecast(daily, 'naive_last', 0.8, metadata.available_fields);
      const name = productName(product.rows, product.productId);
      const beatsBaseline = model.metrics.mae < naive.metrics.mae;
      insights.push({
        id: 'ins_forecast_metrics',
        category: 'forecast_quality',
        title: `Chronological Forecast Benchmark: ${name}`,
        observed: `Linear regression holdout MAE ${model.metrics.mae} units and RMSE ${model.metrics.rmse}; naive last-observation MAE ${naive.metrics.mae} and RMSE ${naive.metrics.rmse} on the same test dates. The selected model ${beatsBaseline ? 'beats' : 'does not beat'} the naive baseline on MAE.`,
        supporting_data: `N = ${model.metrics.test_sample_size} chronological test product-days (${model.metrics.test_period.start} to ${model.metrics.test_period.end}); ${model.metrics.train_sample_size} training observations.`,
        why_it_matters: 'Comparing against a simple baseline helps distinguish genuine predictive value from a model that merely appears sophisticated.',
        possible_action: beatsBaseline
          ? 'Compare this model with other baselines across more dates before using it for replenishment planning.'
          : 'Prefer the simpler naive baseline unless further models show robust improvement on future holdouts.',
        uncertainty_limitations: [
          model.metrics.test_sample_size < 30 ? 'The holdout contains fewer than 30 observations, so model differences are unstable.' : '',
          'The model is fitted only on training observations, but its test-period predictions are conditional on available covariates such as mapped price or promotion values; these must be known or planned at forecast time.',
          'Missing calendar dates are not imputed as zero demand.',
        ].filter(Boolean).join(' '),
        severity: 'low',
      });
      break;
    } catch {
      // An insufficient or numerically invalid candidate should not hide other products.
    }
  }

  // Prioritize a saved scenario that violates a constraint or exceeds the
  // configured stock-out ceiling. These are estimates under stated assumptions.
  const riskyScenario = [...scenarios]
    .filter(scenario => !scenario.is_feasible || scenario.stock_out_risk_percent > constraints.max_stock_out_risk_pct)
    .sort((a, b) => Number(a.is_feasible) - Number(b.is_feasible) || b.stock_out_risk_percent - a.stock_out_risk_percent)[0];

  if (riskyScenario) {
    insights.push({
      id: 'ins_scenario_risk',
      category: 'inventory_risk',
      title: `Scenario Constraint Alert: ${riskyScenario.name}`,
      observed: riskyScenario.is_feasible
        ? `Stock-out risk is ${riskyScenario.stock_out_risk_percent}% (${riskyScenario.unmet} unmet units), above the active ${constraints.max_stock_out_risk_pct}% ceiling.`
        : `Scenario violates one or more active constraints: ${riskyScenario.violated_constraints.join('; ')}.`,
      supporting_data: `Simulated demand ${riskyScenario.demand} units, inventory ${riskyScenario.inventory} units, expected fulfilled units ${riskyScenario.fulfilled}; product ${riskyScenario.product_name}.`,
      why_it_matters: 'A scenario outside active policy bounds should be reviewed before it is treated as an operational recommendation.',
      possible_action: 'Revisit price, discount, cost, inventory, and promotion assumptions in Decision Studio; run stress tests before approval.',
      uncertainty_limitations: 'Results are deterministic scenario estimates under the chosen assumptions, not observed financial outcomes.',
      severity: 'high',
    });
  } else if (scenarios.length > 0) {
    const best = [...scenarios].sort((a, b) => (b.decision_score ?? 0) - (a.decision_score ?? 0))[0];
    insights.push({
      id: 'ins_scenario_feasibility',
      category: 'decision_opportunity',
      title: `Scenario Feasibility Summary: ${best.name}`,
      observed: `All ${scenarios.length} saved scenarios satisfy the active feasibility constraints.`,
      supporting_data: `Highest scoring scenario estimates profit of ${formatCurrency(best.estimated_profit, currency)}, margin ${best.profit_margin_pct}%, and stock-out risk ${best.stock_out_risk_percent}%. ${currencyContext(currency)}`,
      why_it_matters: 'A consistent constraint check makes decision ranking easier to audit before execution.',
      possible_action: 'Run a conservative and high-demand stress test before approving the highest-scoring scenario.',
      uncertainty_limitations: 'Feasibility only covers the configured constraints and may omit supplier, labour, cash-flow, and competitor conditions.',
      severity: 'low',
    });
  }

  return insights;
}
