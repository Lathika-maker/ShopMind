/**
 * SHOPMIND — Retail Intelligence Platform Types
 */

export interface DataRecord {
  id: string;
  date: string; // YYYY-MM-DD
  product_id: string;
  product_name: string;
  category: string;
  units_sold: number;
  revenue?: number; // Total sales value if supplied; distinct from unit price.
  price: number;
  unit_cost: number;
  discount_pct: number;
  promo_active: boolean;
  inventory_on_hand: number;
  competitor_price: number;
  is_weekend?: boolean;
}

export interface DatasetMetadata {
  id: string;
  name: string;
  source: 'synthetic_demo' | 'uploaded_csv';
  created_at: string;
  row_count: number;
  date_range: {
    start: string;
    end: string;
  };
  products: string[];
  product_items?: { id: string; name: string; category?: string }[];
  categories: string[];
  is_synthetic: boolean;
}

export interface ValidationIssue {
  type: 'missing_value' | 'negative_value' | 'duplicate_record' | 'date_gap' | 'outlier';
  column: string;
  severity: 'error' | 'warning' | 'info';
  count: number;
  sample_rows?: number[];
  description: string;
}

export interface DataQualityReport {
  total_records: number;
  valid_records: number;
  duplicate_count: number;
  missing_values_by_column: Record<string, number>;
  negative_values_by_column: Record<string, number>;
  date_range_days: number;
  completeness_score: number; // 0 to 100
  issues: ValidationIssue[];
  summary_stats: {
    column: string;
    min: number;
    max: number;
    mean: number;
    median: number;
    std: number;
  }[];
}

export type ModelAlgorithm = 'naive_last' | 'moving_average_7d' | 'linear_regression' | 'random_forest';

export interface ForecastingConfig {
  product_id: string;
  algorithm: ModelAlgorithm;
  train_ratio: number; // e.g. 0.8
  features: string[]; // ['price', 'discount_pct', 'promo_active', 'competitor_price', 'day_of_week', 'month']
  rolling_window?: number;
}

export interface ResidualDiagnostic {
  date: string;
  actual: number;
  predicted: number;
  residual: number; // actual - predicted
  percent_error: number;
}

export interface FeatureImportance {
  feature: string;
  importance: number; // 0 to 1
}

export interface ForecastMetrics {
  mae: number;
  rmse: number;
  r2: number | null;
  mape: number;
  test_sample_size: number;
  train_sample_size: number;
  train_period: { start: string; end: string };
  test_period: { start: string; end: string };
  limitations: string[];
}

export interface ForecastResult {
  model_id: string;
  product_id: string;
  product_name: string;
  algorithm: ModelAlgorithm;
  metrics: ForecastMetrics;
  predictions: {
    date: string;
    actual: number;
    predicted: number;
    split: 'train' | 'test';
  }[];
  residuals: ResidualDiagnostic[];
  feature_importances: FeatureImportance[];
  created_at: string;
}

export interface DemandRegime {
  regime: 'low' | 'normal' | 'high';
  start_date: string;
  end_date: string;
  product_id: string;
  product_name: string;
  mean_units: number;
  threshold_used: string;
  observation_count: number;
  mae_in_regime?: number;
}

export interface DemandRegimeSummary {
  method: string;
  threshold_description: string;
  regimes: DemandRegime[];
  regime_breakdown: {
    regime: 'low' | 'normal' | 'high';
    percentage: number;
    count: number;
    average_demand: number;
    average_price: number;
  }[];
  model_error_by_regime?: {
    regime: 'low' | 'normal' | 'high';
    mae: number;
    sample_size: number;
  }[];
}

export interface PriceSensitivityResult {
  product_id: string;
  product_name: string;
  elasticity: number; // percentage change in demand per 1% change in price
  elasticity_label: 'highly_elastic' | 'elastic' | 'unitary' | 'inelastic';
  confidence_interval_95: [number, number];
  p_value: number;
  r_squared: number;
  sample_size: number;
  confounders_controlled: string[];
  scatter_data: {
    price: number;
    units: number;
    fitted_units: number;
    promo: boolean;
    date: string;
  }[];
  sufficiency: 'robust' | 'moderate' | 'insufficient';
  data_sufficiency_warning?: string;
  methodology_notes: string;
}

export interface ScenarioInput {
  id?: string;
  name: string;
  description?: string;
  product_id: string;
  selling_price: number;
  unit_cost: number;
  discount_pct: number;
  promotion_cost: number;
  advertising_cost: number;
  inventory: number;
  competitor_price?: number;
  is_promo?: boolean;
}

export interface ScenarioSimulationResult {
  scenario_id: string;
  name: string;
  product_id: string;
  product_name: string;
  selling_price: number;
  unit_cost: number;
  discount_pct: number;
  effective_price: number;
  promotion_cost: number;
  advertising_cost: number;
  inventory: number;
  demand: number;
  demand_source: 'fitted_model' | 'elasticity_model' | 'user_assumed';
  fulfilled: number;
  unmet: number;
  leftover: number;
  revenue: number;
  estimated_profit: number;
  profit_margin_pct: number;
  stock_out_risk_percent: number;
  created_at: string;
  is_feasible: boolean;
  violated_constraints: string[];
  decision_score?: number;
}

export interface StressTestResult {
  scenario_id: string;
  name: string;
  baseline: ScenarioSimulationResult;
  conservative_case: ScenarioSimulationResult; // -25% demand
  high_demand_case: ScenarioSimulationResult; // +35% demand
  max_profit_loss: number;
  worst_stockout_risk: number;
  inventory_holding_risk_units: number;
}

export interface BusinessConstraints {
  min_profit_margin_pct: number; // e.g. 25%
  max_stock_out_risk_pct: number; // e.g. 15%
  min_inventory_coverage_units: number;
  max_price_ceiling: number;
  min_price_floor: number;
  weights: {
    profit_weight: number; // 0 to 1
    stockout_weight: number; // 0 to 1
    leftover_weight: number; // 0 to 1
  };
}

export interface InsightItem {
  id: string;
  category: 'demand_regime' | 'price_sensitivity' | 'inventory_risk' | 'forecast_quality' | 'decision_opportunity';
  title: string;
  observed: string;
  supporting_data: string;
  why_it_matters: string;
  possible_action: string;
  uncertainty_limitations: string;
  severity: 'high' | 'medium' | 'low';
}
