/**
 * SHOPMIND — API Middleware Engine for Vite and Express
 * Handles all REST endpoints with real mathematical and data science computation.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import { convertRecordsToCSV } from '../data/syntheticDemo.ts';
import { formatCurrency, currencyContext } from '../services/formatting.ts';
import {
  DataRecord,
  DatasetMetadata,
  DataQualityReport,
  ValidationIssue,
  ScenarioInput,
  ScenarioSimulationResult,
  BusinessConstraints,
  InsightItem,
} from '../types/retail.ts';
import {
  trainAndEvaluateForecast,
  detectDemandRegimes,
  computePriceElasticity,
  simulateScenario,
  runStressTest,
  aggregateDailyDemand,
  summarizeDateCoverage,
} from '../services/calculations.ts';
import { parseAndValidateCSV, ColumnMappingConfig } from '../services/csvParser.ts';
import { answerDatasetQuestion, DatasetQuestionError } from '../services/aiAnalysis.ts';

// Runtime starts empty. Only a validated user-uploaded CSV activates a dataset.
let activeMetadata: DatasetMetadata | null = null;
let activeRecords: DataRecord[] = [];
let savedScenarios: ScenarioSimulationResult[] = [];

let activeConstraints: BusinessConstraints = {
  min_profit_margin_pct: 25.0,
  max_stock_out_risk_pct: 15.0,
  min_inventory_coverage_units: 50,
  max_price_ceiling: 500,
  min_price_floor: 15,
  weights: {
    profit_weight: 0.5,
    stockout_weight: 0.3,
    leftover_weight: 0.2,
  },
};

type ScenarioDemandSource = 'elasticity_model' | 'historical_average';
interface ProductDemandBaseline {
  id: string;
  name: string;
  baseDemand: number;
  meanUnitsPerObservedProductDay: number;
  observedProductDays: number;
  calendarSpanDays: number;
  unobservedCalendarDays: number;
  basePrice: number | null;
  elasticity: number | null;
}

function validateScenarioInput(input: ScenarioInput): string | null {
  if (!input || typeof input !== 'object') return 'Scenario payload must be a JSON object.';
  if (typeof input.name !== 'string' || !input.name.trim()) return 'Provide a non-empty scenario name.';
  if (input.name.trim().length > 120) return 'Scenario name must be 120 characters or fewer.';
  if (typeof input.product_id !== 'string' || !input.product_id.trim()) return 'Select a product from the active dataset.';
  if (!Number.isFinite(input.selling_price) || input.selling_price <= 0) return 'Selling price must be a finite positive number.';
  const discount = input.discount_pct ?? 0;
  if (!Number.isFinite(discount) || discount < 0 || discount >= 100) return 'Discount must be between 0% and less than 100%; the effective selling price must remain positive.';
  if (!Number.isFinite(input.unit_cost) || input.unit_cost < 0) return 'Unit cost must be a finite non-negative number.';
  if (!Number.isFinite(input.inventory) || input.inventory < 0) return 'Inventory must be a finite non-negative number.';
  const promotionCost = input.promotion_cost ?? 0;
  const advertisingCost = input.advertising_cost ?? 0;
  if (!Number.isFinite(promotionCost) || promotionCost < 0) return 'Promotion budget must be a finite non-negative number.';
  if (!Number.isFinite(advertisingCost) || advertisingCost < 0) return 'Advertising budget must be a finite non-negative number.';
  if (input.competitor_price !== undefined && (!Number.isFinite(input.competitor_price) || input.competitor_price < 0)) {
    return 'Competitor reference price must be a finite non-negative number.';
  }
  return null;
}

function validateBusinessConstraints(value: BusinessConstraints): string | null {
  const scalarValues: Array<[string, number]> = [
    ['Minimum profit margin', value.min_profit_margin_pct],
    ['Maximum stock-out risk', value.max_stock_out_risk_pct],
    ['Minimum inventory coverage', value.min_inventory_coverage_units],
    ['Price floor', value.min_price_floor],
    ['Price ceiling', value.max_price_ceiling],
  ];
  for (const [label, numberValue] of scalarValues) {
    if (!Number.isFinite(numberValue)) return label + ' must be a finite number.';
  }
  if (value.min_profit_margin_pct < 0 || value.min_profit_margin_pct > 100) return 'Minimum profit margin must be between 0% and 100%.';
  if (value.max_stock_out_risk_pct < 0 || value.max_stock_out_risk_pct > 100) return 'Maximum stock-out risk must be between 0% and 100%.';
  if (value.min_inventory_coverage_units < 0) return 'Minimum inventory coverage cannot be negative.';
  if (value.min_price_floor < 0 || value.max_price_ceiling < 0) return 'Price floor and ceiling cannot be negative.';
  if (value.max_price_ceiling > 0 && value.min_price_floor > value.max_price_ceiling) return 'Price floor cannot exceed the price ceiling.';
  const weights = [
    value.weights?.profit_weight,
    value.weights?.stockout_weight,
    value.weights?.leftover_weight,
  ];
  if (weights.some(weight => !Number.isFinite(weight) || (weight as number) < 0)) return 'Decision weights must be finite non-negative numbers.';
  if (weights.reduce((sum, weight) => sum + (weight as number), 0) <= 0) return 'At least one decision weight must be greater than zero.';
  return null;
}

function getProductBaseline(productId: string): ProductDemandBaseline | null {
  if (!activeMetadata || activeRecords.length === 0) return null;
  const productRecords = activeRecords.filter(record => record.product_id === productId);
  if (productRecords.length === 0) return null;

  // Missing calendar dates are unknown coverage, not automatically observed zero-sales days.
  const dates = productRecords.map(record => record.date).filter(Boolean).sort();
  const observedProductDays = new Set(dates).size;
  const firstMs = dates.length ? Date.parse(String(dates[0]) + 'T00:00:00Z') : NaN;
  const lastMs = dates.length ? Date.parse(String(dates[dates.length - 1]) + 'T00:00:00Z') : NaN;
  const calendarSpanDays = Number.isFinite(firstMs) && Number.isFinite(lastMs)
    ? Math.max(1, Math.floor((lastMs - firstMs) / 86400000) + 1)
    : observedProductDays;
  const unobservedCalendarDays = Math.max(0, calendarSpanDays - observedProductDays);
  const totalUnits = productRecords.reduce((sum, record) => sum + record.units_sold, 0);
  const meanUnitsPerObservedProductDay = totalUnits / Math.max(1, observedProductDays);
  // Explicit extrapolation from recorded product-days; missing dates are not assumed zero.
  const baseDemand = Math.max(0, Math.round(meanUnitsPerObservedProductDay * 30));

  const pricedRecords = activeMetadata?.available_fields?.price === true
    ? productRecords.filter(record => Number.isFinite(record.price) && record.price > 0)
    : [];
  const distinctPrices = new Set(pricedRecords.map(record => Math.round(record.price * 100) / 100));
  const basePrice = pricedRecords.length > 0
    ? pricedRecords.reduce((sum, record) => sum + record.price, 0) / pricedRecords.length
    : null;
  const elasticityResult = distinctPrices.size >= 2 && pricedRecords.length >= 10
    ? computePriceElasticity(productRecords, activeMetadata?.available_fields)
    : null;
  const elasticity = elasticityResult && elasticityResult.sufficiency !== 'insufficient' &&
    Number.isFinite(elasticityResult.elasticity)
    ? elasticityResult.elasticity
    : null;

  return {
    id: productId,
    name: productRecords[0].product_name || productId,
    baseDemand,
    meanUnitsPerObservedProductDay: Math.round(meanUnitsPerObservedProductDay * 100) / 100,
    observedProductDays,
    calendarSpanDays,
    unobservedCalendarDays,
    basePrice,
    elasticity,
  };
}

function estimateScenarioDemand(
  product: ProductDemandBaseline,
  input: ScenarioInput
): { demand: number; source: ScenarioDemandSource } {
  const effectivePrice = input.selling_price * (1 - (input.discount_pct || 0) / 100);
  const canUseEmpiricalElasticity =
    product.basePrice !== null &&
    product.basePrice > 0 &&
    product.elasticity !== null &&
    effectivePrice > 0;

  // Do not invent a price elasticity or promotional lift. Without enough real
  // price variation, use the observed historical baseline and label it honestly.
  const priceEffect = canUseEmpiricalElasticity
    ? Math.pow(effectivePrice / product.basePrice!, product.elasticity!)
    : 1;
  const demand = Math.max(0, Math.round(product.baseDemand * priceEffect));
  return {
    demand,
    source: canUseEmpiricalElasticity ? 'elasticity_model' : 'historical_average',
  };
}

function computeQualityReport(
  records: DataRecord[],
  availableFields?: Record<string, boolean>,
  mappedFields?: Record<string, boolean>
): DataQualityReport {
  const issues: ValidationIssue[] = [];
  const missingCols: Record<string, number> = {};
  const negativeCols: Record<string, number> = {};
  let duplicateCount = 0;
  const seenKeys = new Set<string>();

  const numericStats: Record<string, number[]> = {
    units_sold: [],
    revenue: [],
    price: [],
    unit_cost: [],
    discount_pct: [],
    inventory_on_hand: [],
  };

  records.forEach(record => {
    // Duplicate quality counts require a repeated full record; same SKU/date alone
    // is normal for transaction-level POS data.
    const key = JSON.stringify([
      record.date, record.product_id, record.product_name, record.category,
      record.units_sold, record.revenue ?? null, record.price, record.unit_cost,
      record.discount_pct, record.promo_active, record.inventory_on_hand,
      record.competitor_price, [...(record.data_missing_fields || [])].sort(),
    ]);
    if (seenKeys.has(key)) duplicateCount++;
    else seenKeys.add(key);

    if (!record.date) missingCols.date = (missingCols.date || 0) + 1;
    if (!record.product_id) missingCols.product_id = (missingCols.product_id || 0) + 1;

    // A mapped optional field with a blank cell is recorded per row by the CSV
    // parser. Count it as missing for data quality instead of pretending it was zero.
    (record.data_missing_fields || []).forEach(field => {
      missingCols[field] = (missingCols[field] || 0) + 1;
    });

    if (!Number.isFinite(record.units_sold)) {
      missingCols.units_sold = (missingCols.units_sold || 0) + 1;
    } else {
      numericStats.units_sold.push(record.units_sold);
      if (record.units_sold < 0) negativeCols.units_sold = (negativeCols.units_sold || 0) + 1;
    }

    if (availableFields?.revenue !== false && typeof record.revenue === 'number' && Number.isFinite(record.revenue)) {
      numericStats.revenue.push(record.revenue);
      if (record.revenue < 0) negativeCols.revenue = (negativeCols.revenue || 0) + 1;
    }

    if (availableFields?.price !== false) {
      if (!Number.isFinite(record.price)) {
        missingCols.price = (missingCols.price || 0) + 1;
      } else {
        numericStats.price.push(record.price);
        if (record.price < 0) negativeCols.price = (negativeCols.price || 0) + 1;
      }
    }

    if (availableFields?.unit_cost !== false) {
      if (!Number.isFinite(record.unit_cost)) {
        missingCols.unit_cost = (missingCols.unit_cost || 0) + 1;
      } else {
        numericStats.unit_cost.push(record.unit_cost);
        if (record.unit_cost < 0) negativeCols.unit_cost = (negativeCols.unit_cost || 0) + 1;
      }
    }

    if (availableFields?.discount_pct !== false) {
      if (!Number.isFinite(record.discount_pct)) {
        missingCols.discount_pct = (missingCols.discount_pct || 0) + 1;
      } else {
        numericStats.discount_pct.push(record.discount_pct);
        if (record.discount_pct < 0 || record.discount_pct > 100) {
          negativeCols.discount_pct = (negativeCols.discount_pct || 0) + 1;
        }
      }
    }

    if (availableFields?.inventory_on_hand !== false) {
      if (!Number.isFinite(record.inventory_on_hand)) {
        missingCols.inventory_on_hand = (missingCols.inventory_on_hand || 0) + 1;
      } else {
        numericStats.inventory_on_hand.push(record.inventory_on_hand);
        if (record.inventory_on_hand < 0) negativeCols.inventory_on_hand = (negativeCols.inventory_on_hand || 0) + 1;
      }
    }
  });

  if (duplicateCount > 0) {
    issues.push({
      type: 'duplicate_record',
      column: 'exact record fields',
      severity: 'warning',
      count: duplicateCount,
      description: 'Detected ' + duplicateCount + ' exact repeated records across the same business fields. Multiple transactions for a SKU on the same date are not automatically duplicates.',
    });
  }

  for (const [column, count] of Object.entries(missingCols)) {
    if (count > 0) {
      issues.push({
        type: 'missing_value',
        column,
        severity: 'error',
        count,
        description: "Column '" + column + "' contains " + count + ' null or missing observations.',
      });
    }
  }

  for (const [column, count] of Object.entries(negativeCols)) {
    if (count > 0) {
      issues.push({
        type: 'negative_value',
        column,
        severity: 'error',
        count,
        description: "Column '" + column + "' contains " + count + ' invalid negative or out-of-bounds values.',
      });
    }
  }

  const optionalFields: Array<[string, string]> = [
    ['price', 'unit-price'],
    ['revenue', 'total revenue'],
    ['unit_cost', 'unit cost'],
    ['discount_pct', 'discount'],
    ['inventory_on_hand', 'inventory'],
    ['promo_active', 'promotion indicator'],
    ['competitor_price', 'competitor-price'],
  ];
  optionalFields.forEach(([field, label]) => {
    if (mappedFields?.[field] === false) {
      issues.push({
        type: 'missing_value',
        column: field,
        severity: 'warning',
        count: records.length,
        description: 'No ' + label + ' column was mapped. Analyses requiring this field remain unavailable.',
      });
    } else if (mappedFields?.[field] === true && availableFields?.[field] === false) {
      const missingCount = records.filter(record => record.data_missing_fields?.includes(field)).length;
      issues.push({
        type: 'missing_value',
        column: field,
        severity: 'warning',
        count: missingCount || records.length,
        description: 'The mapped ' + label + ' column contains blank values. This field is unavailable for dataset-level analysis until the missing cells are handled.',
      });
    }
  });

  const summary_stats = Object.entries(numericStats).map(([column, values]) => {
    if (values.length === 0) return { column, min: 0, max: 0, mean: 0, median: 0, std: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
    const variance = sorted.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / sorted.length;
    return {
      column,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      std: Math.round(Math.sqrt(variance) * 100) / 100,
    };
  });

  const checkedFields = ['date', 'product_id', 'units_sold']
    .concat(['revenue', 'price', 'unit_cost', 'discount_pct', 'inventory_on_hand']
      .filter(field => mappedFields?.[field] === true));
  const totalPossibleChecks = records.length * checkedFields.length;
  const totalErrors = Object.values(missingCols).reduce((sum, count) => sum + count, 0) +
    Object.values(negativeCols).reduce((sum, count) => sum + count, 0) + duplicateCount;
  const completeness_score = totalPossibleChecks > 0
    ? Math.max(0, Math.min(100, Math.round(((totalPossibleChecks - totalErrors) / totalPossibleChecks) * 100)))
    : 0;

  const dates = records.map(record => record.date).filter(Boolean).sort();
  const firstMs = dates.length ? Date.parse(String(dates[0]) + 'T00:00:00Z') : NaN;
  const lastMs = dates.length ? Date.parse(String(dates[dates.length - 1]) + 'T00:00:00Z') : NaN;
  const date_range_days = Number.isFinite(firstMs) && Number.isFinite(lastMs)
    ? Math.max(1, Math.floor((lastMs - firstMs) / 86400000) + 1)
    : 0;

  return {
    total_records: records.length,
    valid_records: Math.max(0, records.length - duplicateCount),
    duplicate_count: duplicateCount,
    missing_values_by_column: missingCols,
    negative_values_by_column: negativeCols,
    date_range_days,
    completeness_score,
    issues,
    summary_stats,
  };
}

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export function handleApiRequest(req: IncomingMessage, res: ServerResponse, next?: () => void) {
  const parsed = parseUrl(req.url || '', true);
  const pathname = parsed.pathname || '';

  if (!pathname.startsWith('/api')) {
    if (next) next();
    return;
  }

  // Handle API routes
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      platform: 'SHOPMIND Retail Decision Intelligence',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      dataset_records: activeRecords.length,
      active_dataset: activeMetadata?.name ?? null,
      is_synthetic: activeMetadata?.is_synthetic ?? false,
      has_dataset: Boolean(activeMetadata && activeRecords.length > 0),
    });
  }

  if (req.method === 'GET' && pathname === '/api/dataset') {
    if (!activeMetadata || activeRecords.length === 0) {
      return sendJson(res, 200, {
        metadata: null,
        quality: null,
        has_dataset: false,
      });
    }
    return sendJson(res, 200, {
      metadata: activeMetadata,
      quality: computeQualityReport(activeRecords, activeMetadata?.available_fields, activeMetadata?.mapped_fields),
      has_dataset: true,
    });
  }

  if (req.method === 'GET' && pathname === '/api/dataset/product-summary') {
    if (!activeMetadata || activeRecords.length === 0) {
      return sendJson(res, 400, { error: 'No active dataset. Upload a CSV first.' });
    }
    const productId = typeof parsed.query.product_id === 'string' ? parsed.query.product_id : '';
    const records = activeRecords.filter(record => record.product_id === productId);
    if (!productId || records.length === 0) {
      return sendJson(res, 404, { error: 'Select a product from the active uploaded dataset.' });
    }

    const average = (field: 'price' | 'unit_cost' | 'inventory_on_hand' | 'discount_pct' | 'competitor_price' | 'revenue') => {
      const fieldExists = activeMetadata?.available_fields?.[field] === true;
      if (!fieldExists) return null;
      const values = records
        .map(record => (record as any)[field])
        .filter((value: unknown): value is number =>
          typeof value === 'number' &&
          Number.isFinite(value) &&
          (field !== 'price' || value > 0)
        );
      if (values.length === 0) return null;
      return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
    };

    const dates = records.map(record => record.date).filter(Boolean).sort();
    const firstMs = dates.length ? Date.parse(String(dates[0]) + 'T00:00:00Z') : NaN;
    const lastMs = dates.length ? Date.parse(String(dates[dates.length - 1]) + 'T00:00:00Z') : NaN;
    const spanDays = Number.isFinite(firstMs) && Number.isFinite(lastMs)
      ? Math.max(1, Math.floor((lastMs - firstMs) / 86400000) + 1)
      : Math.max(1, new Set(dates).size);
    const totalUnits = records.reduce((sum, record) => sum + record.units_sold, 0);
    const totalRevenue = records.reduce((sum, record) => sum + (typeof record.revenue === 'number' ? record.revenue : 0), 0);
    const hasTotalRevenue = activeMetadata.available_fields?.revenue === true;
    const derivedUnitRevenue = hasTotalRevenue && totalUnits > 0
      ? Math.round((totalRevenue / totalUnits) * 100) / 100
      : null;
    const baseline = getProductBaseline(productId);

    return sendJson(res, 200, {
      product_id: productId,
      product_name: records[0].product_name || productId,
      row_count: records.length,
      date_start: dates[0] || null,
      date_end: dates[dates.length - 1] || null,
      observed_calendar_days: spanDays,
      observed_product_days: new Set(dates).size,
      calendar_span_days: spanDays,
      unobserved_calendar_days: Math.max(0, spanDays - new Set(dates).size),
      total_units: Math.round(totalUnits * 100) / 100,
      average_units_per_record: Math.round((totalUnits / records.length) * 100) / 100,
      mean_units_per_observed_product_day: baseline?.meanUnitsPerObservedProductDay ?? null,
      demand_baseline_method: 'Mean units per distinct recorded product-day extrapolated to 30 days; missing dates are not treated as zero sales.',
      estimated_30_day_demand_baseline: baseline?.baseDemand ?? null,
      average_unit_price: average('price'),
      derived_unit_price_from_revenue: activeMetadata.available_fields?.price === true ? null : derivedUnitRevenue,
      derived_unit_price_note: activeMetadata.available_fields?.price === true || derivedUnitRevenue === null
        ? null
        : 'Calculated as total recorded revenue divided by total units sold; used only as a scenario price seed, never to fit price elasticity.',
      average_unit_cost: average('unit_cost'),
      average_inventory_on_hand: average('inventory_on_hand'),
      average_discount_pct: average('discount_pct'),
      average_competitor_price: average('competitor_price'),
      average_total_revenue: average('revenue'),
      demand_estimation_method: baseline?.elasticity === null ? 'historical_average' : 'empirical_price_elasticity',
      available_fields: activeMetadata.available_fields || {},
    });
  }

  if (req.method === 'GET' && pathname === '/api/dataset/trend') {
    if (!activeMetadata || activeRecords.length === 0) return sendJson(res, 200, []);
    const monthlyTotals = new Map<string, number>();
    activeRecords.forEach(record => {
      const month = typeof record.date === 'string' ? record.date.slice(0, 7) : '';
      if (!/^\d{4}-\d{2}$/.test(month)) return;
      monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + record.units_sold);
    });
    const trend = Array.from(monthlyTotals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, units_sold]) => ({ period, units_sold: Math.round(units_sold * 100) / 100 }));
    return sendJson(res, 200, trend);
  }

  if (req.method === 'GET' && pathname === '/api/dataset/records') {
    const q = parsed.query;
    let filtered = [...activeRecords];
    if (q.product_id && q.product_id !== 'all') {
      filtered = filtered.filter(r => r.product_id === q.product_id);
    }
    if (q.category && q.category !== 'all') {
      filtered = filtered.filter(r => r.category === q.category);
    }
    if (q.start_date) {
      filtered = filtered.filter(r => r.date >= (q.start_date as string));
    }
    if (q.end_date) {
      filtered = filtered.filter(r => r.date <= (q.end_date as string));
    }
    const page = Math.max(1, parseInt((q.page as string) || '1', 10));
    const limit = Math.max(1, Math.min(200, parseInt((q.limit as string) || '50', 10)));
    const total = filtered.length;
    const startIdx = (page - 1) * limit;
    const paginated = filtered.slice(startIdx, startIdx + limit);
    return sendJson(res, 200, {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
      records: paginated,
    });
  }

  if (req.method === 'POST' && pathname === '/api/dataset/reset') {
    activeMetadata = null;
    activeRecords = [];
    savedScenarios = [];
    return sendJson(res, 200, {
      message: 'Active dataset and dependent scenarios cleared. Upload a CSV to begin.',
      metadata: null,
      has_dataset: false,
    });
  }

  if (req.method === 'GET' && pathname === '/api/dataset/export') {
    if (!activeMetadata || activeRecords.length === 0) {
      return sendJson(res, 400, { error: 'No active dataset available to export.' });
    }
    const csv = convertRecordsToCSV(activeRecords);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="shopmind_dataset_${activeMetadata.id}.csv"`);
    return res.end(csv);
  }

  if (req.method === 'POST' && pathname === '/api/dataset/upload') {
    parseBody(req).then((body) => {
      const { name, csv_text, mapping } = body;
      if (typeof csv_text !== 'string' || !csv_text.trim()) {
        return sendJson(res, 400, {
          error: 'No CSV text provided. Select a valid .csv file and try again.',
          details: ['Expected the uploaded file content in the csv_text field.'],
        });
      }

      const result = parseAndValidateCSV(
        csv_text,
        mapping && typeof mapping === 'object' ? mapping as ColumnMappingConfig : undefined,
        typeof name === 'string' && name.trim() ? name.trim() : 'Uploaded Retail Dataset'
      );

      if (!result.success || !result.records || !result.metadata) {
        return sendJson(res, 422, {
          error: 'CSV validation failed. Correct the reported issues and upload again.',
          details: result.errors,
          warnings: result.warnings,
          detectedMapping: result.detectedMapping,
          rawHeaders: result.rawHeaders,
        });
      }

      // Activate the dataset only after full validation. Do not create synthetic
      // benchmark scenarios or preserve scenarios from a different dataset.
      activeRecords = result.records;
      activeMetadata = result.metadata;
      savedScenarios = [];

      return sendJson(res, 200, {
        message: 'CSV uploaded, validated, and ingested successfully.',
        metadata: activeMetadata,
        quality: computeQualityReport(activeRecords, activeMetadata?.available_fields, activeMetadata?.mapped_fields),
        warnings: result.warnings,
        available_fields: {
          price: activeRecords.some(record => record.price > 0),
          revenue: activeRecords.some(record => typeof record.revenue === 'number'),
          unit_cost: Boolean(mapping?.unit_cost),
          inventory_on_hand: Boolean(mapping?.inventory_on_hand),
          discount_pct: Boolean(mapping?.discount_pct),
        },
      });
    }).catch((error: any) => {
      return sendJson(res, 500, { error: `Dataset ingestion failed: ${error?.message || 'Unknown error'}` });
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/forecasting/train') {
    parseBody(req).then((body) => {
      if (!activeMetadata || activeRecords.length === 0) {
        return sendJson(res, 400, { error: 'No active dataset. Upload a CSV before forecasting.' });
      }
      const { product_id, algorithm = 'linear_regression', train_ratio = 0.8 } = body;
      const targetProd = product_id || activeRecords[0]?.product_id;
      const transactionRecords = activeRecords.filter(r => r.product_id === targetProd);
      const dailyRecords = aggregateDailyDemand(transactionRecords);
      if (dailyRecords.length < 10) {
        return sendJson(res, 400, {
          error: `Insufficient daily observations for product ${targetProd}. Found ${dailyRecords.length} unique product-days from ${transactionRecords.length} transaction rows; at least 10 product-days are required.`,
        });
      }
      if (Number(train_ratio) <= 0.5 || Number(train_ratio) >= 1) {
        return sendJson(res, 400, { error: 'Training split must be greater than 50% and less than 100% so a meaningful chronological test set remains.' });
      }
      const forecast = trainAndEvaluateForecast(dailyRecords, algorithm, train_ratio, activeMetadata.available_fields);
      const naiveBaseline = trainAndEvaluateForecast(dailyRecords, 'naive_last', train_ratio, activeMetadata.available_fields);
      return sendJson(res, 200, {
        ...forecast,
        benchmarks: {
          naive_last: {
            model_id: naiveBaseline.model_id,
            metrics: naiveBaseline.metrics,
            same_chronological_holdout: true,
          },
        },
        observation_grain: 'daily_product',
        transaction_rows: transactionRecords.length,
        daily_observations: dailyRecords.length,
        date_coverage: summarizeDateCoverage(dailyRecords),
        available_features: activeMetadata.available_fields,
      });
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/regimes') {
    if (!activeMetadata || activeRecords.length === 0) {
      return sendJson(res, 400, { error: 'No active dataset. Upload a CSV before demand-regime analysis.' });
    }
    const targetProd = (parsed.query.product_id as string) || activeRecords[0]?.product_id;
    const transactionRecords = activeRecords.filter(r => r.product_id === targetProd);
    const dailyRecords = aggregateDailyDemand(transactionRecords);
    if (dailyRecords.length < 14) {
      return sendJson(res, 400, {
        error: `Need at least 14 unique product-days for demand-regime analysis. Found ${dailyRecords.length} product-days from ${transactionRecords.length} transaction rows.`,
      });
    }
    const result = detectDemandRegimes(dailyRecords, 14);
    const forecast = dailyRecords.length >= 10
      ? trainAndEvaluateForecast(dailyRecords, 'linear_regression', 0.8, activeMetadata?.available_fields)
      : null;
    const resMap = new Map((forecast?.residuals || []).map(r => [r.date, Math.abs(r.residual)]));
    const errorByRegime: Record<'low' | 'normal' | 'high', { sumErr: number; count: number }> = {
      low: { sumErr: 0, count: 0 },
      normal: { sumErr: 0, count: 0 },
      high: { sumErr: 0, count: 0 },
    };
    result.regimes.forEach(reg => {
      const err = resMap.get(reg.date);
      if (err !== undefined) {
        errorByRegime[reg.regime].sumErr += err;
        errorByRegime[reg.regime].count++;
      }
    });
    const model_error_by_regime = (['low', 'normal', 'high'] as const).map(k => ({
      regime: k,
      mae: errorByRegime[k].count ? Math.round((errorByRegime[k].sumErr / errorByRegime[k].count) * 100) / 100 : 0,
      sample_size: errorByRegime[k].count,
    }));
    return sendJson(res, 200, {
      product_id: targetProd,
      product_name: transactionRecords[0]?.product_name,
      ...result,
      model_error_by_regime,
      observation_grain: 'daily_product',
      transaction_rows: transactionRecords.length,
      daily_observations: dailyRecords.length,
      date_coverage: summarizeDateCoverage(dailyRecords),
    });
  }

  if (req.method === 'GET' && pathname === '/api/price-sensitivity') {
    if (!activeMetadata || activeRecords.length === 0) {
      return sendJson(res, 400, { error: 'No active dataset. Upload a CSV before price-sensitivity analysis.' });
    }
    const targetProd = (parsed.query.product_id as string) || activeRecords[0]?.product_id;
    const prodRecords = activeRecords.filter(r => r.product_id === targetProd);
    if (activeMetadata.available_fields?.price !== true || !prodRecords.some(record => record.price > 0)) {
      return sendJson(res, 400, {
        error: 'Price sensitivity is unavailable because complete, mapped unit-price observations are not available. Revenue-derived prices are only scenario seeds and are never used to fit elasticity.',
      });
    }
    const result = computePriceElasticity(prodRecords, activeMetadata?.available_fields);
    return sendJson(res, 200, {
      product_id: targetProd,
      product_name: prodRecords[0]?.product_name,
      ...result,
    });
  }

  if (req.method === 'GET' && pathname === '/api/scenarios') {
    return sendJson(res, 200, savedScenarios);
  }

  if (req.method === 'POST' && pathname === '/api/scenarios/simulate') {
    parseBody(req).then((input: ScenarioInput) => {
      if (!activeMetadata || activeRecords.length === 0) {
        return sendJson(res, 400, { error: 'No active dataset. Upload a CSV before simulating a scenario.' });
      }
      const validationError = validateScenarioInput(input);
      if (validationError) return sendJson(res, 400, { error: validationError });

      if (!input.product_id || !Number.isFinite(input.selling_price) || input.selling_price <= 0) {
        return sendJson(res, 400, { error: 'A positive selling price is required.' });
      }
      if (!Number.isFinite(input.unit_cost) || input.unit_cost < 0) {
        return sendJson(res, 400, { error: 'Enter a verified non-negative unit cost to calculate profit.' });
      }
      if (!Number.isFinite(input.inventory) || input.inventory < 0) {
        return sendJson(res, 400, { error: 'Enter a verified non-negative inventory value to calculate fulfilment and stockout metrics.' });
      }

      const product = getProductBaseline(input.product_id);
      if (!product) {
        return sendJson(res, 404, { error: 'The selected product does not exist in the active uploaded dataset.' });
      }
      const estimate = estimateScenarioDemand(product, input);
      const preview = simulateScenario(input, estimate.demand, product.name, estimate.source, activeConstraints);
      return sendJson(res, 200, preview);
    }).catch((error: any) => {
      return sendJson(res, 500, { error: 'Scenario preview failed: ' + (error?.message || 'Unknown error') });
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/scenarios') {
    parseBody(req).then((input: ScenarioInput) => {
      if (!activeMetadata || activeRecords.length === 0) {
        return sendJson(res, 400, { error: 'No active dataset. Upload a CSV before creating a commercial scenario.' });
      }
      const validationError = validateScenarioInput(input);
      if (validationError) return sendJson(res, 400, { error: validationError });

      if (!input.product_id || !Number.isFinite(input.selling_price) || input.selling_price <= 0) {
        return sendJson(res, 400, { error: 'Select a product from the active dataset and provide a positive selling price.' });
      }
      if (!Number.isFinite(input.unit_cost) || input.unit_cost < 0) {
        return sendJson(res, 400, { error: 'Provide an explicit non-negative unit cost for this scenario.' });
      }
      if (!Number.isFinite(input.inventory) || input.inventory < 0) {
        return sendJson(res, 400, { error: 'Provide an explicit non-negative inventory quantity for this scenario.' });
      }

      const product = getProductBaseline(input.product_id);
      if (!product) {
        return sendJson(res, 404, { error: 'The selected product does not exist in the active uploaded dataset.' });
      }

      const estimate = estimateScenarioDemand(product, input);
      const simulated = simulateScenario(
        input,
        estimate.demand,
        product.name,
        estimate.source,
        activeConstraints
      );
      savedScenarios.unshift(simulated);
      return sendJson(res, 200, simulated);
    }).catch((error: any) => {
      return sendJson(res, 500, { error: `Scenario calculation failed: ${error?.message || 'Unknown error'}` });
    });
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/scenarios/')) {
    const id = pathname.replace('/api/scenarios/', '');
    savedScenarios = savedScenarios.filter(s => s.scenario_id !== id);
    return sendJson(res, 200, { message: `Scenario ${id} deleted.` });
  }

  if (req.method === 'POST' && pathname.startsWith('/api/scenarios/duplicate/')) {
    const id = pathname.replace('/api/scenarios/duplicate/', '');
    const existing = savedScenarios.find(s => s.scenario_id === id);
    if (!existing) return sendJson(res, 404, { error: 'Not found' });
    const duplicated: ScenarioSimulationResult = {
      ...existing,
      scenario_id: `scen_dup_${Date.now()}`,
      name: `${existing.name} (Copy)`,
      created_at: new Date().toISOString(),
    };
    savedScenarios.unshift(duplicated);
    return sendJson(res, 200, duplicated);
  }

  if (req.method === 'GET' && pathname === '/api/constraints') {
    return sendJson(res, 200, activeConstraints);
  }

  if (req.method === 'PUT' && pathname === '/api/constraints') {
    parseBody(req).then(body => {
      const proposed: BusinessConstraints = {
        ...activeConstraints,
        ...body,
        weights: { ...activeConstraints.weights, ...(body?.weights || {}) },
      };
      const validationError = validateBusinessConstraints(proposed);
      if (validationError) return sendJson(res, 400, { error: validationError });

      activeConstraints = proposed;
      savedScenarios = savedScenarios.map(scenario => {
        const input: ScenarioInput = {
          id: scenario.scenario_id,
          name: scenario.name,
          product_id: scenario.product_id,
          selling_price: scenario.selling_price,
          unit_cost: scenario.unit_cost,
          discount_pct: scenario.discount_pct,
          promotion_cost: scenario.promotion_cost,
          advertising_cost: scenario.advertising_cost,
          inventory: scenario.inventory,
        };
        return simulateScenario(input, scenario.demand, scenario.product_name, scenario.demand_source, activeConstraints);
      });
      return sendJson(res, 200, activeConstraints);
    }).catch((error: any) => {
      return sendJson(res, 400, { error: error?.message || 'Invalid constraint update.' });
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/analysis/ask') {
    parseBody(req).then(async (body) => {
      const metadata = activeMetadata;
      if (!metadata || activeRecords.length === 0) {
        return sendJson(res, 400, { error: 'Upload a valid CSV dataset before asking for AI analysis.' });
      }
      const question = typeof body?.question === 'string' ? body.question.trim() : '';
      if (question.length < 5 || question.length > 500) {
        return sendJson(res, 400, { error: 'Enter a question between 5 and 500 characters.' });
      }
      const productId = typeof body?.product_id === 'string' && body.product_id.trim()
        ? body.product_id.trim()
        : undefined;
      try {
        const answer = await answerDatasetQuestion({
          question,
          productId,
          records: activeRecords,
          metadata,
          constraints: activeConstraints,
          scenarios: savedScenarios,
        });
        return sendJson(res, 200, answer);
      } catch (error: any) {
        const status = error instanceof DatasetQuestionError ? error.statusCode : 502;
        return sendJson(res, status, {
          error: error?.message || 'AI analysis failed. Try rephrasing the question.',
          code: error instanceof DatasetQuestionError ? error.code : 'analysis_failed',
        });
      }
    }).catch((error: any) => {
      return sendJson(res, 400, { error: error?.message || 'Invalid analysis request.' });
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/insights') {
    if (activeRecords.length === 0) {
      return sendJson(res, 200, []);
    }

    // Select primary product from active dataset
    const primaryProdId = activeRecords[0].product_id;
    const primaryProdName = activeRecords[0].product_name || primaryProdId;
    const primaryRecords = activeRecords.filter(r => r.product_id === primaryProdId);
    const dailyRecords = aggregateDailyDemand(primaryRecords);

    // Price elasticity uses transaction-level rows; volume forecasting/regimes use product-day aggregates.
    const elast = computePriceElasticity(primaryRecords, activeMetadata?.available_fields);
    const pricedRecords = activeMetadata?.available_fields?.price === true
      ? primaryRecords.filter(record => record.price > 0)
      : [];
    const meanPrice = pricedRecords.length
      ? pricedRecords.reduce((sum, record) => sum + record.price, 0) / pricedRecords.length
      : null;
    const meanUnits = primaryRecords.length
      ? primaryRecords.reduce((sum, record) => sum + record.units_sold, 0) / primaryRecords.length
      : 0;

    // 2. Empirical Demand Regimes at daily grain
    const regimesResult = dailyRecords.length >= 14 ? detectDemandRegimes(dailyRecords, 14) : null;
    const highSummary = regimesResult?.summary.find(s => s.regime === 'high');
    const lowSummary = regimesResult?.summary.find(s => s.regime === 'low');

    // 3. Chronological Forecast Model Benchmark at daily grain
    const forecast = dailyRecords.length >= 10
      ? trainAndEvaluateForecast(dailyRecords, 'linear_regression', 0.8, activeMetadata?.available_fields)
      : null;

    // 4. Commercial Scenario Constraint & Downside Audit
    const highRiskScen = savedScenarios.find(s => !s.is_feasible || s.stock_out_risk_percent > activeConstraints.max_stock_out_risk_pct);
    const topScen = savedScenarios.find(s => s.is_feasible) || savedScenarios[0];

    const insights: InsightItem[] = [];

    // Only report price elasticity when genuine unit-price values and a sufficient
    // sample are available. Revenue or zero-filled missing prices cannot support it.
    if (activeMetadata?.available_fields?.price === true && primaryRecords.some(record => record.price > 0) && elast.sufficiency !== 'insufficient') {
      insights.push({
        id: 'ins_price_elasticity',
        category: 'price_sensitivity',
        title: `Empirical Price Elasticity: ${primaryProdName}`,
        observed: `Estimated empirical elasticity coefficient of ${elast.elasticity.toFixed(2)} (95% CI: [${elast.confidence_interval_95[0].toFixed(2)}, ${elast.confidence_interval_95[1].toFixed(2)}], p = ${elast.p_value.toFixed(4)}).`,
        supporting_data: `Evaluated on ${elast.sample_size} active observations (R² = ${(elast.r_squared || 0).toFixed(3)}). Average price: ${meanPrice!.toFixed(2)}, mean transaction volume: ${meanUnits.toFixed(1)} units.`,
        why_it_matters: elast.elasticity < -1
          ? `Demand is price-elastic (coefficient ${elast.elasticity.toFixed(2)} < -1.0). Strategic promotional markdown stimulates more than proportional volume expansion.`
          : `Demand is price-inelastic (coefficient ${elast.elasticity.toFixed(2)} >= -1.0). Protect price floors to preserve gross margin rather than discounting.`,
        possible_action: elast.elasticity < -1
          ? 'Calibrate promotional markdown depth to capture incremental volume while monitoring inventory replenishment lead time.'
          : 'Hold prestige pricing and avoid broad-scale markdowns that dilute margin without proportional volume lift.',
        uncertainty_limitations: 'Calculated via Log-Log Ordinary Least Squares with promotion controls. Macro inflation, competitor matching, and local seasonality can shift demand curves.',
        severity: Math.abs(elast.elasticity) > 1.5 ? 'high' : 'medium',
      });
    }

    if (regimesResult && highSummary) {
      insights.push({
        id: 'ins_demand_regime',
        category: 'demand_regime',
        title: `Demand Regime Dynamics: ${primaryProdName}`,
        observed: `${highSummary.percentage}% of recorded product-day observations are classified as High Demand (Z > +0.95), while ${lowSummary?.percentage || 0}% are classified as Low Demand (Z < -0.95).`,
        supporting_data: `A 14-observation rolling window identified average high-regime demand of ${highSummary.average_demand} units per recorded product-day vs ${lowSummary?.average_demand || 0} during low-regime observations. Calendar-date gaps are not imputed.`,
        why_it_matters: 'Static reorder points create acute stock-out vulnerabilities during transition periods into high demand regimes.',
        possible_action: 'Shift safety inventory targets from fixed day-coverage units to dynamic regime-adaptive replenishment schedules.',
        uncertainty_limitations: 'The rolling Z-score uses recorded product-day observations; missing calendar dates are not imputed, so irregular source coverage can affect regime interpretation.',
        severity: highSummary.percentage > 20 ? 'high' : 'medium',
      });
    }

    if (forecast) {
      insights.push({
        id: 'ins_forecast_metrics',
        category: 'forecast_quality',
        title: `Chronological Model Evaluation: ${primaryProdName}`,
        observed: `Multiple Linear Regression achieves MAE = ${forecast.metrics.mae} units and RMSE = ${forecast.metrics.rmse} units on out-of-sample test period.`,
        supporting_data: `Evaluated across ${forecast.metrics.test_sample_size} chronological test observations (${forecast.metrics.test_period.start} → ${forecast.metrics.test_period.end}) with zero future data leakage.`,
        why_it_matters: 'Establishes mathematically validated residual bounds to calculate replenishment safety stock and inventory coverage.',
        possible_action: 'Incorporate competitor price variance and marketing calendar features into automated weekly retraining cycles.',
        uncertainty_limitations: 'Prediction residuals widen during volatile promotional weekends and external holiday events.',
        severity: 'low',
      });
    }

    if (highRiskScen) {
      insights.push({
        id: 'ins_scenario_risk',
        category: 'inventory_risk',
        title: `Constraint Breach Alert: ${highRiskScen.name}`,
        observed: !highRiskScen.is_feasible
          ? `Scenario breaches active policy constraints: ${highRiskScen.violated_constraints.join('; ')}.`
          : `High stock-out exposure of ${highRiskScen.stock_out_risk_percent}% (${highRiskScen.unmet} unmet units).`,
        supporting_data: `Allocated inventory of ${highRiskScen.inventory} units against expected demand of ${highRiskScen.demand} units (${highRiskScen.product_name}).`,
        why_it_matters: 'Execution without adjustment risks stockouts, customer dissatisfaction, and forfeited operating revenue.',
        possible_action: 'Increase inventory allocation or temper promotional discounts in Decision Studio prior to executive sign-off.',
        uncertainty_limitations: 'Calculated using deterministic simulation assumptions under simulated scenario pricing.',
        severity: 'high',
      });
    } else if (topScen) {
      insights.push({
        id: 'ins_scenario_risk',
        category: 'decision_opportunity',
        title: `Commercial Feasibility Confirmed: ${topScen.name}`,
        observed: `All ${savedScenarios.length} active scenarios satisfy hard margin floors (≥${activeConstraints.min_profit_margin_pct}%) and risk bounds.`,
        supporting_data: `Top-ranked candidate delivers ${formatCurrency(topScen.estimated_profit, activeMetadata?.currency_code)} operating profit with ${topScen.profit_margin_pct}% margin and ${topScen.stock_out_risk_percent}% stock-out risk. ${currencyContext(activeMetadata?.currency_code)}`,
        why_it_matters: 'Commercial portfolio maintains sound margin protection without unhedged inventory shortages.',
        possible_action: 'Run Stress Testing module to verify downside resilience under an extreme -25% demand contraction shock.',
        uncertainty_limitations: 'Dependent on supplier cost stability and absence of aggressive competitor price wars.',
        severity: 'low',
      });
    }

    return sendJson(res, 200, insights.map(item => ({
      ...item,
      evidence_grain: item.category === 'price_sensitivity' ? 'transaction' : 'daily_product',
    })));
  }

  if (next) next();
}
