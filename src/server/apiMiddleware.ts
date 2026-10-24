/**
 * SHOPMIND — API Middleware Engine for Vite and Express
 * Handles all REST endpoints with real mathematical and data science computation.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import { convertRecordsToCSV } from '../data/syntheticDemo.ts';
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
} from '../services/calculations.ts';
import { parseAndValidateCSV, ColumnMappingConfig } from '../services/csvParser.ts';

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
  basePrice: number | null;
  elasticity: number | null;
}

function getProductBaseline(productId: string): ProductDemandBaseline | null {
  if (!activeMetadata || activeRecords.length === 0) return null;
  const productRecords = activeRecords.filter(record => record.product_id === productId);
  if (productRecords.length === 0) return null;

  // Aggregate volume across the observed calendar span, so multiple transactions
  // on the same date do not count as multiple selling days.
  const dates = productRecords.map(record => record.date).filter(Boolean).sort();
  const firstMs = dates.length ? Date.parse(String(dates[0]) + 'T00:00:00Z') : NaN;
  const lastMs = dates.length ? Date.parse(String(dates[dates.length - 1]) + 'T00:00:00Z') : NaN;
  const calendarDays = Number.isFinite(firstMs) && Number.isFinite(lastMs)
    ? Math.max(1, Math.floor((lastMs - firstMs) / 86400000) + 1)
    : Math.max(1, new Set(dates).size);
  const totalUnits = productRecords.reduce((sum, record) => sum + record.units_sold, 0);
  const averageDailyDemand = totalUnits / calendarDays;
  // The 30-day horizon is explicit; no generic benchmark demand is substituted.
  const baseDemand = Math.max(0, Math.round(averageDailyDemand * 30));

  const pricedRecords = activeMetadata?.available_fields?.price === true
    ? productRecords.filter(record => Number.isFinite(record.price) && record.price > 0)
    : [];
  const distinctPrices = new Set(pricedRecords.map(record => Math.round(record.price * 100) / 100));
  const basePrice = pricedRecords.length > 0
    ? pricedRecords.reduce((sum, record) => sum + record.price, 0) / pricedRecords.length
    : null;
  const elasticityResult = distinctPrices.size >= 2 && pricedRecords.length >= 10
    ? computePriceElasticity(productRecords)
    : null;
  const elasticity = elasticityResult && elasticityResult.sufficiency !== 'insufficient' &&
    Number.isFinite(elasticityResult.elasticity)
    ? elasticityResult.elasticity
    : null;

  return {
    id: productId,
    name: productRecords[0].product_name || productId,
    baseDemand,
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
  availableFields?: Record<string, boolean>
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
    const key = String(record.product_id) + '_' + String(record.date);
    if (seenKeys.has(key)) duplicateCount++;
    else seenKeys.add(key);

    if (!record.date) missingCols.date = (missingCols.date || 0) + 1;
    if (!record.product_id) missingCols.product_id = (missingCols.product_id || 0) + 1;

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
      column: 'product_id + date',
      severity: 'warning',
      count: duplicateCount,
      description: 'Detected ' + duplicateCount + ' duplicate records sharing identical product ID and date.',
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
    if (availableFields?.[field] === false) {
      issues.push({
        type: 'missing_value',
        column: field,
        severity: 'warning',
        count: records.length,
        description: 'No ' + label + ' column was mapped. Analyses requiring this field remain unavailable.',
      });
    }
  });

  const summary_stats = Object.entries(numericStats).map(([column, values]) => {
    if (values.length === 0) return { column, min: 0, max: 0, mean: 0, median: 0, std: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];
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

  const checkedFields = ['date', 'product_id', 'units_sold', 'revenue', 'price', 'unit_cost', 'discount_pct', 'inventory_on_hand']
    .filter(field => availableFields?.[field] !== false);
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
      quality: computeQualityReport(activeRecords, activeMetadata?.available_fields),
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
      total_units: Math.round(totalUnits * 100) / 100,
      average_units_per_record: Math.round((totalUnits / records.length) * 100) / 100,
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
        quality: computeQualityReport(activeRecords, activeMetadata?.available_fields),
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
      const prodRecords = activeRecords.filter(r => r.product_id === targetProd);
      if (prodRecords.length < 10) {
        return sendJson(res, 400, {
          error: `Insufficient observations for product ${targetProd}. Found ${prodRecords.length}, minimum 10 required.`,
        });
      }
      const forecast = trainAndEvaluateForecast(prodRecords, algorithm, train_ratio);
      return sendJson(res, 200, forecast);
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/regimes') {
    if (!activeMetadata || activeRecords.length === 0) {
      return sendJson(res, 400, { error: 'No active dataset. Upload a CSV before demand-regime analysis.' });
    }
    const targetProd = (parsed.query.product_id as string) || activeRecords[0]?.product_id;
    const prodRecords = activeRecords.filter(r => r.product_id === targetProd);
    if (prodRecords.length < 14) {
      return sendJson(res, 400, { error: `Need at least 14 days of data for regimes.` });
    }
    const result = detectDemandRegimes(prodRecords, 14);
    const forecast = trainAndEvaluateForecast(prodRecords, 'linear_regression', 0.8);
    const resMap = new Map(forecast.residuals.map(r => [r.date, Math.abs(r.residual)]));
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
      product_name: prodRecords[0]?.product_name,
      ...result,
      model_error_by_regime,
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
    const result = computePriceElasticity(prodRecords);
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
      activeConstraints = { ...activeConstraints, ...body };
      return sendJson(res, 200, activeConstraints);
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

    // 1. Empirical Price Sensitivity
    const elast = computePriceElasticity(primaryRecords);
    const meanPrice = primaryRecords.reduce((s, r) => s + r.price, 0) / (primaryRecords.length || 1);
    const meanUnits = primaryRecords.reduce((s, r) => s + r.units_sold, 0) / (primaryRecords.length || 1);

    // 2. Empirical Demand Regimes
    const regimesResult = primaryRecords.length >= 14 ? detectDemandRegimes(primaryRecords, 14) : null;
    const highSummary = regimesResult?.summary.find(s => s.regime === 'high');
    const lowSummary = regimesResult?.summary.find(s => s.regime === 'low');

    // 3. Chronological Forecast Model Benchmark
    const forecast = primaryRecords.length >= 10 ? trainAndEvaluateForecast(primaryRecords, 'linear_regression', 0.8) : null;

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
        supporting_data: `Evaluated on ${elast.sample_size} active observations (R² = ${(elast.r_squared || 0).toFixed(3)}). Average price: ${meanPrice.toFixed(2)}, average volume: ${meanUnits.toFixed(1)} units.`,
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
        observed: `${highSummary.percentage}% of calendar days operate in High Demand regime (Z > +0.95), while ${lowSummary?.percentage || 0}% operate in Low Demand regime (Z < -0.95).`,
        supporting_data: `14-day rolling window identified high regime demand averaging ${highSummary.average_demand} units/day vs ${lowSummary?.average_demand || 0} units/day during low regime.`,
        why_it_matters: 'Static reorder points create acute stock-out vulnerabilities during transition periods into high demand regimes.',
        possible_action: 'Shift safety inventory targets from fixed day-coverage units to dynamic regime-adaptive replenishment schedules.',
        uncertainty_limitations: 'Rolling Z-scores require consecutive trading periods and incorporate a 2-3 day lag following abrupt single-day demand shocks.',
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
        supporting_data: `Top-ranked candidate delivers $${topScen.estimated_profit.toLocaleString()} operating profit with ${topScen.profit_margin_pct}% margin and ${topScen.stock_out_risk_percent}% stock-out risk.`,
        why_it_matters: 'Commercial portfolio maintains sound margin protection without unhedged inventory shortages.',
        possible_action: 'Run Stress Testing module to verify downside resilience under an extreme -25% demand contraction shock.',
        uncertainty_limitations: 'Dependent on supplier cost stability and absence of aggressive competitor price wars.',
        severity: 'low',
      });
    }

    return sendJson(res, 200, insights);
  }

  if (next) next();
}
