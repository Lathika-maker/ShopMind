import 'dotenv/config';
/**
 * SHOPMIND — Production-Grade Full-Stack Retail Intelligence Server
 * 
 * Express API backend + Vite development middleware.
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { convertRecordsToCSV } from './src/data/syntheticDemo.ts';
import { formatCurrency, currencyContext } from './src/services/formatting.ts';
import {
  DataRecord,
  DatasetMetadata,
  DataQualityReport,
  ValidationIssue,
  ScenarioInput,
  ScenarioSimulationResult,
  BusinessConstraints,
  InsightItem,
} from './src/types/retail.ts';
import {
  trainAndEvaluateForecast,
  detectDemandRegimes,
  computePriceElasticity,
  simulateScenario,
  runStressTest,
  aggregateDailyDemand,
  summarizeDateCoverage,
} from './src/services/calculations.ts';

import {
  parseAndValidateCSV,
  ColumnMappingConfig,
} from './src/services/csvParser.ts';
import { answerDatasetQuestion, DatasetQuestionError } from './src/services/aiAnalysis.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==========================================
// IN-MEMORY / PERSISTENT STATE MANAGEMENT
// Uploaded CSV data is the ONLY default runtime data source.
// No synthetic data is loaded at startup or as fallback.
// ==========================================

let activeMetadata: DatasetMetadata | null = null;
let activeRecords: DataRecord[] = [];

// Default Business Constraints
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

// Saved Scenarios (starts empty until created or loaded from active dataset)
let savedScenarios: ScenarioSimulationResult[] = [];

// Helper: Validate Dataset Quality
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

    const fields: Array<[keyof DataRecord | 'revenue', string]> = [
      ['price', 'price'],
      ['unit_cost', 'unit_cost'],
      ['discount_pct', 'discount_pct'],
      ['inventory_on_hand', 'inventory_on_hand'],
    ];
    fields.forEach(([field]) => {
      if (availableFields?.[String(field)] === false) return;
      const value = Number(record[field as keyof DataRecord]);
      if (!Number.isFinite(value)) {
        missingCols[String(field)] = (missingCols[String(field)] || 0) + 1;
        return;
      }
      numericStats[String(field)].push(value);
      if (field === 'discount_pct' ? (value < 0 || value > 100) : value < 0) {
        negativeCols[String(field)] = (negativeCols[String(field)] || 0) + 1;
      }
    });
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

  const checkedFields = ['date', 'product_id', 'units_sold']
    .concat(['revenue', 'price', 'unit_cost', 'discount_pct', 'inventory_on_hand']
      .filter(field => mappedFields?.[field] === true));
  const totalPossibleChecks = records.length * checkedFields.length;
  const totalErrors = Object.values(missingCols).reduce((sum, count) => sum + count, 0) +
    Object.values(negativeCols).reduce((sum, count) => sum + count, 0) + duplicateCount;
  const completeness_score = totalPossibleChecks > 0
    ? Math.max(0, Math.min(100, Math.round(((totalPossibleChecks - totalErrors) / totalPossibleChecks) * 100)))
    : 0;

  const validDates = records.map(record => record.date).filter(Boolean).sort();
  const firstMs = validDates.length ? Date.parse(String(validDates[0]) + 'T00:00:00Z') : NaN;
  const lastMs = validDates.length ? Date.parse(String(validDates[validDates.length - 1]) + 'T00:00:00Z') : NaN;
  const dateRangeDays = Number.isFinite(firstMs) && Number.isFinite(lastMs)
    ? Math.max(1, Math.floor((lastMs - firstMs) / 86400000) + 1)
    : 0;

  return {
    total_records: records.length,
    valid_records: Math.max(0, records.length - duplicateCount),
    duplicate_count: duplicateCount,
    missing_values_by_column: missingCols,
    negative_values_by_column: negativeCols,
    date_range_days: dateRangeDays,
    completeness_score,
    issues,
    summary_stats,
  };
}

// ==========================================
// REST API ENDPOINTS
// ==========================================

// 1. Health & Server Info
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    platform: 'SHOPMIND Retail Decision Intelligence',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    dataset_records: activeRecords.length,
    active_dataset: activeMetadata ? activeMetadata.name : null,
    is_synthetic: activeMetadata ? activeMetadata.is_synthetic : false,
    has_dataset: activeRecords.length > 0,
  });
});

// 2. Dataset Metadata & Quality
app.get('/api/dataset', (_req: Request, res: Response) => {
  if (!activeMetadata || activeRecords.length === 0) {
    return res.json({
      metadata: null,
      quality: null,
      has_dataset: false,
    });
  }
  res.json({
    metadata: activeMetadata,
    quality: computeQualityReport(activeRecords, activeMetadata?.available_fields, activeMetadata?.mapped_fields),
    has_dataset: true,
  });
});

// 3. Paginated Records with Filtering
app.get('/api/dataset/trend', (_req: Request, res: Response) => {
  if (!activeMetadata || activeRecords.length === 0) return res.json([]);
  const monthlyTotals = new Map<string, number>();
  activeRecords.forEach(record => {
    const month = typeof record.date === 'string' ? record.date.slice(0, 7) : '';
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + record.units_sold);
  });
  const trend = Array.from(monthlyTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, units_sold]) => ({ period, units_sold: Math.round(units_sold * 100) / 100 }));
  res.json(trend);
});

app.get('/api/dataset/product-summary', (req: Request, res: Response) => {
  if (!activeMetadata || activeRecords.length === 0) {
    return res.status(400).json({ error: 'No active dataset. Upload a CSV first.' });
  }
  const productId = typeof req.query.product_id === 'string' ? req.query.product_id : '';
  const records = activeRecords.filter(record => record.product_id === productId);
  if (!productId || records.length === 0) {
    return res.status(404).json({ error: 'Select a product from the active uploaded dataset.' });
  }

  const average = (field: 'price' | 'unit_cost' | 'inventory_on_hand' | 'discount_pct' | 'competitor_price' | 'revenue') => {
    if (activeMetadata?.available_fields?.[field] !== true) return null;
    const values = records.map(record => (record as any)[field]).filter((value: unknown): value is number =>
      typeof value === 'number' && Number.isFinite(value) && (field !== 'price' || value > 0)
    );
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100;
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
  const baseline = getProductBaseline(productId);

  return res.json({
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
    average_units_per_record: Math.round(totalUnits / records.length * 100) / 100,
    mean_units_per_observed_product_day: baseline?.meanUnitsPerObservedProductDay ?? null,
    demand_baseline_method: 'Mean units per distinct recorded product-day extrapolated to 30 days; missing dates are not treated as zero sales.',
    estimated_30_day_demand_baseline: baseline?.baseDemand ?? null,
    average_unit_price: average('price'),
    derived_unit_price_from_revenue: activeMetadata.available_fields?.price === true || !hasTotalRevenue || totalUnits <= 0
      ? null
      : Math.round((totalRevenue / totalUnits) * 100) / 100,
    derived_unit_price_note: activeMetadata.available_fields?.price === true || !hasTotalRevenue || totalUnits <= 0
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
});

app.get('/api/dataset/records', (req: Request, res: Response) => {
  if (activeRecords.length === 0) {
    return res.json({
      total: 0,
      page: 1,
      limit: 50,
      total_pages: 0,
      records: [],
    });
  }

  const { product_id, category, start_date, end_date, page = '1', limit = '50' } = req.query;

  let filtered = [...activeRecords];

  if (product_id && typeof product_id === 'string' && product_id !== 'all') {
    filtered = filtered.filter(r => r.product_id === product_id);
  }
  if (category && typeof category === 'string' && category !== 'all') {
    filtered = filtered.filter(r => r.category === category);
  }
  if (start_date && typeof start_date === 'string') {
    filtered = filtered.filter(r => r.date >= start_date);
  }
  if (end_date && typeof end_date === 'string') {
    filtered = filtered.filter(r => r.date <= end_date);
  }

  const p = Math.max(1, parseInt(page as string, 10));
  const l = Math.max(1, Math.min(200, parseInt(limit as string, 10)));
  const total = filtered.length;
  const startIdx = (p - 1) * l;
  const paginated = filtered.slice(startIdx, startIdx + l);

  res.json({
    total,
    page: p,
    limit: l,
    total_pages: Math.ceil(total / l),
    records: paginated,
  });
});

// 4. Reset or clear the active dataset. Runtime never switches to demo data.
app.post('/api/dataset/reset', (_req: Request, res: Response) => {
  activeMetadata = null;
  activeRecords = [];
  savedScenarios = [];
  res.json({
    message: 'Active dataset and dependent scenarios cleared. Upload a CSV to begin.',
    metadata: null,
    has_dataset: false,
  });
});

// 5. Ingest Uploaded CSV Dataset
app.post('/api/dataset/upload', (req: Request, res: Response) => {
  try {
    const { name, csv_text, records, mapping } = req.body;
    let parseResult;

    if (csv_text && typeof csv_text === 'string') {
      parseResult = parseAndValidateCSV(csv_text, mapping, name || 'Uploaded Retail Data');
    } else if (Array.isArray(records) && records.length > 0) {
      // Reconstruct CSV text from records
      const headers = Object.keys(records[0]);
      const csvLines = [headers.join(',')];
      records.forEach((r: any) => {
        csvLines.push(headers.map(h => (r[h] !== undefined ? `"${String(r[h]).replace(/"/g, '""')}"` : '""')).join(','));
      });
      parseResult = parseAndValidateCSV(csvLines.join('\n'), mapping, name || 'Uploaded Retail Data');
    } else {
      return res.status(400).json({
        error: 'Upload validation failed: No valid CSV text or records array provided.',
        details: ['Empty upload payload.'],
      });
    }

    if (!parseResult.success) {
      // CRITICAL: Keep existing active dataset intact! Never corrupt or fallback to synthetic!
      return res.status(422).json({
        error: 'CSV validation failed. Please address the reported issues before proceeding.',
        details: parseResult.errors,
        warnings: parseResult.warnings,
        detectedMapping: parseResult.detectedMapping,
        rawHeaders: parseResult.rawHeaders,
      });
    }

    // Replace active dataset with strictly validated records
    activeRecords = parseResult.records!;
    activeMetadata = parseResult.metadata!;
    
    // Invalidate stale scenarios from previous dataset
    savedScenarios = [];

    res.json({
      message: 'Dataset uploaded, validated, and ingested successfully.',
      metadata: activeMetadata,
      quality: computeQualityReport(activeRecords, activeMetadata?.available_fields, activeMetadata?.mapped_fields),
      warnings: parseResult.warnings,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Dataset ingestion failed: ${err.message}` });
  }
});

// 6. Export Active Data to CSV
app.get('/api/dataset/export', (_req: Request, res: Response) => {
  if (activeRecords.length === 0 || !activeMetadata) {
    return res.status(400).json({ error: 'No active dataset available to export.' });
  }
  const csv = convertRecordsToCSV(activeRecords);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="shopmind_dataset_${activeMetadata.id}.csv"`);
  res.send(csv);
});

// Helper: Dynamically derive baseline demand and product metadata from active uploaded records
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
  const prodRecords = activeRecords.filter(r => r.product_id === productId);
  if (prodRecords.length === 0) return null;

  // Missing calendar dates are unknown coverage, not automatically observed zero-sales days.
  const dates = prodRecords.map(r => r.date).filter(Boolean).sort();
  const observedProductDays = new Set(dates).size;
  const firstMs = dates.length ? Date.parse(String(dates[0]) + 'T00:00:00Z') : NaN;
  const lastMs = dates.length ? Date.parse(String(dates[dates.length - 1]) + 'T00:00:00Z') : NaN;
  const calendarSpanDays = Number.isFinite(firstMs) && Number.isFinite(lastMs)
    ? Math.max(1, Math.floor((lastMs - firstMs) / 86400000) + 1)
    : observedProductDays;
  const unobservedCalendarDays = Math.max(0, calendarSpanDays - observedProductDays);
  const totalUnits = prodRecords.reduce((sum, record) => sum + record.units_sold, 0);
  const meanUnitsPerObservedProductDay = totalUnits / Math.max(1, observedProductDays);
  const baseDemand = Math.max(0, Math.round(meanUnitsPerObservedProductDay * 30));

  const pricedRecords = activeMetadata?.available_fields?.price === true
    ? prodRecords.filter(r => Number.isFinite(r.price) && r.price > 0)
    : [];
  const distinctPrices = new Set(pricedRecords.map(r => Math.round(r.price * 100) / 100));
  const basePrice = pricedRecords.length
    ? pricedRecords.reduce((sum, r) => sum + r.price, 0) / pricedRecords.length
    : null;
  const elasticityResult = distinctPrices.size >= 2 && pricedRecords.length >= 10
    ? computePriceElasticity(prodRecords, activeMetadata?.available_fields)
    : null;
  const elasticity = elasticityResult && elasticityResult.sufficiency !== 'insufficient' &&
    Number.isFinite(elasticityResult.elasticity)
    ? elasticityResult.elasticity
    : null;

  return {
    id: productId,
    name: prodRecords[0].product_name || productId,
    baseDemand,
    meanUnitsPerObservedProductDay: Math.round(meanUnitsPerObservedProductDay * 100) / 100,
    observedProductDays,
    calendarSpanDays,
    unobservedCalendarDays,
    basePrice,
    elasticity,
  };
}

function estimateScenarioDemand(product: ProductDemandBaseline, input: ScenarioInput): {
  demand: number;
  source: ScenarioDemandSource;
} {
  const effectivePrice = input.selling_price * (1 - (input.discount_pct || 0) / 100);
  const useElasticity = product.basePrice !== null &&
    product.basePrice > 0 &&
    product.elasticity !== null &&
    effectivePrice > 0;
  // Promotion lift is not assumed. Only use price-response adjustment when the
  // uploaded dataset contains enough actual price variation to estimate it.
  const priceEffect = useElasticity
    ? Math.pow(effectivePrice / product.basePrice!, product.elasticity!)
    : 1;
  return {
    demand: Math.max(0, Math.round(product.baseDemand * priceEffect)),
    source: useElasticity ? 'elasticity_model' : 'historical_average',
  };
}

// 7. Train & Evaluate Forecasting Model
app.post('/api/forecasting/train', (req: Request, res: Response) => {
  try {
    if (!activeMetadata || activeRecords.length === 0) {
      return res.status(400).json({
        error: 'No active dataset available. Please upload a CSV dataset before training forecasting models.',
      });
    }

    const { product_id, algorithm = 'linear_regression', train_ratio = 0.8 } = req.body;
    const targetProd = product_id || activeRecords[0]?.product_id;

    const transactionRecords = activeRecords.filter(r => r.product_id === targetProd);
    const dailyRecords = aggregateDailyDemand(transactionRecords);
    if (dailyRecords.length < 10) {
      return res.status(400).json({
        error: `Insufficient daily observations for product "${targetProd}". Found ${dailyRecords.length} unique product-days from ${transactionRecords.length} transaction rows; at least 10 product-days are required.`,
      });
    }
    if (!Number.isFinite(Number(train_ratio)) || Number(train_ratio) <= 0.5 || Number(train_ratio) >= 1) {
      return res.status(400).json({ error: 'Training split must be greater than 50% and less than 100% so a meaningful chronological test set remains.' });
    }

    const forecast = trainAndEvaluateForecast(dailyRecords, algorithm, train_ratio, activeMetadata.available_fields);
    res.json({
      ...forecast,
      observation_grain: 'daily_product',
      transaction_rows: transactionRecords.length,
      daily_observations: dailyRecords.length,
      date_coverage: summarizeDateCoverage(dailyRecords),
      available_features: activeMetadata.available_fields,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Forecasting failed: ${err.message}` });
  }
});

// 8. Demand-Regime Analysis
app.get('/api/regimes', (req: Request, res: Response) => {
  try {
    if (!activeMetadata || activeRecords.length === 0) {
      return res.status(400).json({
        error: 'No active dataset available. Please upload a CSV dataset to detect demand regimes.',
      });
    }

    const { product_id } = req.query;
    const targetProd = (product_id as string) || activeRecords[0]?.product_id;
    const transactionRecords = activeRecords.filter(r => r.product_id === targetProd);
    const dailyRecords = aggregateDailyDemand(transactionRecords);

    if (dailyRecords.length < 14) {
      return res.status(400).json({
        error: `Insufficient daily observations for regime detection. Found ${dailyRecords.length} unique product-days from ${transactionRecords.length} transaction rows; at least 14 product-days are required.`,
      });
    }

    const result = detectDemandRegimes(dailyRecords, 14);

    // Compute model error by regime using standard linear regression if sample allows
    let model_error_by_regime = [
      { regime: 'low', mae: 0, sample_size: 0 },
      { regime: 'normal', mae: 0, sample_size: 0 },
      { regime: 'high', mae: 0, sample_size: 0 },
    ];

    if (dailyRecords.length >= 10) {
      try {
        const forecast = trainAndEvaluateForecast(dailyRecords, 'linear_regression', 0.8, activeMetadata.available_fields);
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

        model_error_by_regime = (['low', 'normal', 'high'] as const).map(k => ({
          regime: k,
          mae: errorByRegime[k].count ? Math.round((errorByRegime[k].sumErr / errorByRegime[k].count) * 100) / 100 : 0,
          sample_size: errorByRegime[k].count,
        }));
      } catch {
        // Forecast could not be trained; default to empty error profile
      }
    }

    res.json({
      product_id: targetProd,
      product_name: transactionRecords[0]?.product_name || targetProd,
      ...result,
      model_error_by_regime,
      observation_grain: 'daily_product',
      transaction_rows: transactionRecords.length,
      daily_observations: dailyRecords.length,
      date_coverage: summarizeDateCoverage(dailyRecords),
    });
  } catch (err: any) {
    res.status(500).json({ error: `Demand regime detection failed: ${err.message}` });
  }
});

// 9. Price Sensitivity & Elasticity
app.get('/api/price-sensitivity', (req: Request, res: Response) => {
  try {
    if (!activeMetadata || activeRecords.length === 0) {
      return res.status(400).json({
        error: 'No active dataset available. Please upload a CSV dataset to analyze price sensitivity.',
      });
    }

    const { product_id } = req.query;
    const targetProd = (product_id as string) || activeRecords[0]?.product_id;
    const prodRecords = activeRecords.filter(r => r.product_id === targetProd);

    if (activeMetadata.available_fields?.price !== true || !prodRecords.some(r => r.price > 0)) {
      return res.status(400).json({
        error: 'Price sensitivity is unavailable because complete, mapped unit-price observations are not available. Revenue-derived prices are only scenario seeds and are never used to fit elasticity.',
      });
    }

    const result = computePriceElasticity(prodRecords, activeMetadata?.available_fields);
    res.json({
      product_id: targetProd,
      product_name: prodRecords[0]?.product_name || targetProd,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Price sensitivity calculation failed: ' + err.message });
  }
});

// 10. Scenario Management (CRUD)
app.get('/api/scenarios', (_req: Request, res: Response) => {
  res.json(savedScenarios);
});

app.post('/api/scenarios', (req: Request, res: Response) => {
  try {
    const input: ScenarioInput = req.body;
    if (!activeMetadata || activeRecords.length === 0) {
      return res.status(400).json({ error: 'No active dataset. Upload a CSV before creating a commercial scenario.' });
    }
    const validationError = validateScenarioInput(input);
    if (validationError) return res.status(400).json({ error: validationError });
    if (!input.product_id || !Number.isFinite(input.selling_price) || input.selling_price <= 0) {
      return res.status(400).json({ error: 'Select a product from the active dataset and provide a positive selling price.' });
    }
    if (!Number.isFinite(input.unit_cost) || input.unit_cost < 0) {
      return res.status(400).json({ error: 'Provide an explicit non-negative unit cost for this scenario.' });
    }
    if (!Number.isFinite(input.inventory) || input.inventory < 0) {
      return res.status(400).json({ error: 'Provide an explicit non-negative inventory quantity for this scenario.' });
    }

    const product = getProductBaseline(input.product_id);
    if (!product) {
      return res.status(404).json({ error: 'The selected product does not exist in the active uploaded dataset.' });
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
    res.json(simulated);
  } catch (err: any) {
    res.status(500).json({ error: `Scenario creation failed: ${err.message}` });
  }
});

app.put('/api/scenarios/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = savedScenarios.findIndex(s => s.scenario_id === id);
  if (idx === -1) {
    return res.status(404).json({ error: `Scenario ${id} not found.` });
  }
  if (!activeMetadata || activeRecords.length === 0) {
    return res.status(400).json({ error: 'No active dataset. Upload a CSV before updating a scenario.' });
  }

  const input: ScenarioInput = req.body;
  const validationError = validateScenarioInput(input);
  if (validationError) return res.status(400).json({ error: validationError });
  const product = getProductBaseline(input.product_id);
  if (!product) {
    return res.status(404).json({ error: 'The selected product does not exist in the active uploaded dataset.' });
  }
  const estimate = estimateScenarioDemand(product, input);
  const updated = simulateScenario(
    { ...input, id },
    estimate.demand,
    product.name,
    estimate.source,
    activeConstraints
  );

  savedScenarios[idx] = updated;
  res.json(updated);
});

app.delete('/api/scenarios/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  savedScenarios = savedScenarios.filter(s => s.scenario_id !== id);
  res.json({ message: `Scenario ${id} deleted successfully.` });
});

app.post('/api/scenarios/duplicate/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = savedScenarios.find(s => s.scenario_id === id);
  if (!existing) {
    return res.status(404).json({ error: `Scenario ${id} not found.` });
  }
  const duplicated: ScenarioSimulationResult = {
    ...existing,
    scenario_id: `scen_dup_${Date.now()}`,
    name: `${existing.name} (Copy)`,
    created_at: new Date().toISOString(),
  };
  savedScenarios.unshift(duplicated);
  res.json(duplicated);
});

// 11. Instant Scenario Simulation
app.post('/api/scenarios/simulate', (req: Request, res: Response) => {
  try {
    const input: ScenarioInput = req.body;
    if (!activeMetadata || activeRecords.length === 0) {
      return res.status(400).json({ error: 'No active dataset. Upload a CSV before simulating a scenario.' });
    }
    if (!Number.isFinite(input.selling_price) || input.selling_price <= 0) {
      return res.status(400).json({ error: 'Explicit positive selling price is required.' });
    }
    if (!Number.isFinite(input.unit_cost) || input.unit_cost < 0) {
      return res.status(400).json({ error: 'Explicit non-negative unit cost is required.' });
    }
    if (!Number.isFinite(input.inventory) || input.inventory < 0) {
      return res.status(400).json({ error: 'Explicit non-negative inventory is required.' });
    }

    const product = getProductBaseline(input.product_id);
    if (!product) {
      return res.status(404).json({ error: 'The selected product does not exist in the active uploaded dataset.' });
    }
    const estimate = estimateScenarioDemand(product, input);
    const result = simulateScenario(
      input,
      estimate.demand,
      product.name,
      estimate.source,
      activeConstraints
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: `Simulation failed: ${err.message}` });
  }
});

// 12. Scenario Stress Testing
app.post('/api/scenarios/stress-test', (req: Request, res: Response) => {
  try {
    const input: ScenarioInput = req.body;
    if (!activeMetadata || activeRecords.length === 0) {
      return res.status(400).json({ error: 'No active dataset. Upload a CSV before stress testing.' });
    }
    if (!Number.isFinite(input.selling_price) || input.selling_price <= 0 ||
        !Number.isFinite(input.unit_cost) || input.unit_cost < 0 ||
        !Number.isFinite(input.inventory) || input.inventory < 0) {
      return res.status(400).json({ error: 'Provide a positive selling price, non-negative unit cost, and non-negative inventory.' });
    }

    const product = getProductBaseline(input.product_id);
    if (!product) {
      return res.status(404).json({ error: 'The selected product does not exist in the active uploaded dataset.' });
    }
    const estimate = estimateScenarioDemand(product, input);
    const baseline = simulateScenario(
      input,
      estimate.demand,
      product.name,
      estimate.source,
      activeConstraints
    );

    const stress = runStressTest(baseline, input, activeConstraints);
    res.json(stress);
  } catch (err: any) {
    res.status(500).json({ error: `Stress test failed: ${err.message}` });
  }
});

// 13. Constraints Configuration
app.get('/api/constraints', (_req: Request, res: Response) => {
  res.json(activeConstraints);
});

app.put('/api/constraints', (req: Request, res: Response) => {
  const body = req.body || {};
  const proposed: BusinessConstraints = {
    ...activeConstraints,
    ...body,
    weights: { ...activeConstraints.weights, ...(body.weights || {}) },
  };
  const validationError = validateBusinessConstraints(proposed);
  if (validationError) return res.status(400).json({ error: validationError });

  activeConstraints = proposed;
  // Re-evaluate stored scenarios so all modules read consistent feasibility flags.
  savedScenarios = savedScenarios.map(scen => {
    const input: ScenarioInput = {
      id: scen.scenario_id,
      name: scen.name,
      product_id: scen.product_id,
      selling_price: scen.selling_price,
      unit_cost: scen.unit_cost,
      discount_pct: scen.discount_pct,
      promotion_cost: scen.promotion_cost,
      advertising_cost: scen.advertising_cost,
      inventory: scen.inventory,
    };
    return simulateScenario(input, scen.demand, scen.product_name, scen.demand_source, activeConstraints);
  });
  res.json(activeConstraints);
});

app.post('/api/analysis/ask', async (req: Request, res: Response) => {
  const metadata = activeMetadata;
  if (!metadata || activeRecords.length === 0) {
    return res.status(400).json({ error: 'Upload a valid CSV dataset before asking for AI analysis.' });
  }
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (question.length < 5 || question.length > 500) {
    return res.status(400).json({ error: 'Enter a question between 5 and 500 characters.' });
  }
  const productId = typeof req.body?.product_id === 'string' && req.body.product_id.trim()
    ? req.body.product_id.trim()
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
    return res.json(answer);
  } catch (error: any) {
    const status = error instanceof DatasetQuestionError ? error.statusCode : 502;
    return res.status(status).json({
      error: error?.message || 'AI analysis failed. Try rephrasing the question.',
      code: error instanceof DatasetQuestionError ? error.code : 'analysis_failed',
    });
  }
});

// 14. Explainable Insights Generator (Originating strictly from active dataset & models)
app.get('/api/insights', (_req: Request, res: Response) => {
  const insights: InsightItem[] = [];

  if (!activeMetadata || activeRecords.length === 0) {
    return res.json([]);
  }

  const uniqueProductIds = Array.from(new Set(activeRecords.map(r => r.product_id)));

  // Insight A: High Elasticity Opportunity from active products
  for (const pid of uniqueProductIds) {
    const prodRecords = activeRecords.filter(r => r.product_id === pid);
    if (activeMetadata.available_fields?.price === true &&
        prodRecords.length >= 15 && prodRecords.some(r => r.price > 0)) {
      const elast = computePriceElasticity(prodRecords, activeMetadata?.available_fields);
      if (elast.sufficiency !== 'insufficient' && elast.elasticity < -1.5) {
        const prodName = prodRecords[0].product_name || pid;
        insights.push({
          id: `ins_price_elasticity_${pid}`,
          category: 'price_sensitivity',
          title: `High Price Elasticity in ${prodName}`,
          observed: `Estimated empirical elasticity of ${elast.elasticity} (95% CI: [${elast.confidence_interval_95.join(', ')}], p = ${elast.p_value}).`,
          supporting_data: `Sample of ${elast.sample_size} observations with R² = ${elast.r_squared} controlling for promotions.`,
          why_it_matters: 'Demand responds more than proportionately to price adjustments, indicating that strategic promotional markdown may drive volume expansion.',
          possible_action: 'Test a controlled markdown window to verify unit volume elasticity before committing forward purchase orders.',
          uncertainty_limitations: 'Elasticity is an empirical regression association. Confounders and macro conditions may shift curve.',
          severity: 'high',
        });
        break; // Show top elastic product
      }
    }
  }

  // Insight B: Demand Regime Clustering in active products
  for (const pid of uniqueProductIds) {
    const prodRecords = activeRecords.filter(r => r.product_id === pid);
    const dailyRecords = aggregateDailyDemand(prodRecords);
    if (dailyRecords.length >= 14) {
      const regimes = detectDemandRegimes(dailyRecords, 14);
      const highRegime = regimes.summary.find(s => s.regime === 'high');
      if (highRegime && highRegime.percentage >= 15) {
        const prodName = prodRecords[0].product_name || pid;
        insights.push({
          id: `ins_demand_regime_${pid}`,
          category: 'demand_regime',
          title: `Demand Regime Clustering Detected for ${prodName}`,
          observed: `${highRegime.percentage}% of recorded product-day observations are classified as High Demand (Z > +0.95).`,
          supporting_data: `A 14-observation rolling window identified average high-regime demand of ${highRegime.average_demand} units per recorded product-day. Calendar-date gaps are not imputed.`,
          why_it_matters: 'Fixed buffer stock risks stock-outs during regime transitions into volume surges.',
          possible_action: 'Transition from fixed buffer stocks to regime-adaptive replenishment schedules.',
          uncertainty_limitations: 'The rolling Z-score uses recorded product-day observations; missing calendar dates are not imputed, so irregular source coverage can affect interpretation.',
          severity: 'medium',
        });
        break;
      }
    }
  }

  // Insight C: Stock-out Risk in Saved Scenarios
  const riskyScenario = savedScenarios.find(s => s.stock_out_risk_percent > 15);
  if (riskyScenario) {
    insights.push({
      id: 'ins_scenario_stockout',
      category: 'inventory_risk',
      title: `Stock-Out Vulnerability in '${riskyScenario.name}'`,
      observed: `Simulated stock-out risk reaches ${riskyScenario.stock_out_risk_percent}% with ${riskyScenario.unmet} unmet customer orders.`,
      supporting_data: `Assumed demand of ${riskyScenario.demand} units against available inventory ceiling of ${riskyScenario.inventory} units.`,
      why_it_matters: `Causes an estimated ${formatCurrency(riskyScenario.unmet * (riskyScenario.selling_price - riskyScenario.unit_cost), activeMetadata?.currency_code)} in lost gross margin contribution. ${currencyContext(activeMetadata?.currency_code)}`,
      possible_action: 'Allocate emergency buffer inventory or adjust promotional budget to preserve fulfillment rates.',
      uncertainty_limitations: 'Assumes unfulfilled shoppers do not backorder or substitute for adjacent catalog items.',
      severity: 'high',
    });
  }

  // Insight D: Model Chronological Performance
  for (const pid of uniqueProductIds) {
    const prodRecords = activeRecords.filter(r => r.product_id === pid);
    const dailyRecords = aggregateDailyDemand(prodRecords);
    if (dailyRecords.length >= 10) {
      try {
        const lrForecast = trainAndEvaluateForecast(dailyRecords, 'linear_regression', 0.8, activeMetadata.available_fields);
        const prodName = prodRecords[0].product_name || pid;
        insights.push({
          id: `ins_forecast_metrics_${pid}`,
          category: 'forecast_quality',
          title: `Chronological Forecast Benchmark (${prodName})`,
          observed: `Multiple Linear Regression achieves MAE = ${lrForecast.metrics.mae} units and RMSE = ${lrForecast.metrics.rmse} units on out-of-sample test period.`,
          supporting_data: `Evaluated on ${lrForecast.metrics.test_sample_size} chronological test days (${lrForecast.metrics.test_period.start} to ${lrForecast.metrics.test_period.end}) with zero target leakage.`,
          why_it_matters: 'Provides a dependable baseline for replenishment safety buffer calculations with documented residual distribution.',
          possible_action: 'Incorporate competitor price difference and promotional calendar as forecast features.',
          uncertainty_limitations: 'Model residuals may widen during extreme markdown events.',
          severity: 'low',
        });
        break;
      } catch {
        // Skip if cannot forecast
      }
    }
  }

  res.json(insights);
});

// ==========================================
// STATIC ASSET & VITE MIDDLEWARE HANDLING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SHOPMIND] Full-Stack Retail Intelligence Server active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[SHOPMIND] Failed to initialize server:', err);
  process.exit(1);
});
