/**
 * SHOPMIND — Production-Grade Full-Stack Retail Intelligence Server
 * 
 * Express API backend + Vite development middleware.
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateSyntheticDataset,
  convertRecordsToCSV,
  PRODUCTS_CATALOG,
} from './src/data/syntheticDemo.ts';
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
} from './src/services/calculations.ts';

import {
  parseAndValidateCSV,
  ColumnMappingConfig,
} from './src/services/csvParser.ts';

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
function computeQualityReport(records: DataRecord[]): DataQualityReport {
  const issues: ValidationIssue[] = [];
  const missingCols: Record<string, number> = {};
  const negativeCols: Record<string, number> = {};
  let duplicateCount = 0;
  const seenKeys = new Set<string>();

  const numericStats: Record<string, number[]> = {
    units_sold: [],
    price: [],
    unit_cost: [],
    discount_pct: [],
    inventory_on_hand: [],
  };

  records.forEach((r, idx) => {
    // Duplicate detection by product + date
    const key = `${r.product_id}_${r.date}`;
    if (seenKeys.has(key)) {
      duplicateCount++;
    } else {
      seenKeys.add(key);
    }

    // Missing checks
    if (!r.date) missingCols['date'] = (missingCols['date'] || 0) + 1;
    if (!r.product_id) missingCols['product_id'] = (missingCols['product_id'] || 0) + 1;
    if (r.units_sold === undefined || r.units_sold === null || isNaN(r.units_sold)) {
      missingCols['units_sold'] = (missingCols['units_sold'] || 0) + 1;
    } else {
      numericStats['units_sold'].push(r.units_sold);
      if (r.units_sold < 0) negativeCols['units_sold'] = (negativeCols['units_sold'] || 0) + 1;
    }

    if (r.price === undefined || r.price === null || isNaN(r.price)) {
      missingCols['price'] = (missingCols['price'] || 0) + 1;
    } else {
      numericStats['price'].push(r.price);
      if (r.price < 0) negativeCols['price'] = (negativeCols['price'] || 0) + 1;
    }

    if (r.unit_cost === undefined || r.unit_cost === null || isNaN(r.unit_cost)) {
      missingCols['unit_cost'] = (missingCols['unit_cost'] || 0) + 1;
    } else {
      numericStats['unit_cost'].push(r.unit_cost);
      if (r.unit_cost < 0) negativeCols['unit_cost'] = (negativeCols['unit_cost'] || 0) + 1;
    }

    if (r.discount_pct !== undefined && !isNaN(r.discount_pct)) {
      numericStats['discount_pct'].push(r.discount_pct);
      if (r.discount_pct < 0 || r.discount_pct > 100) {
        negativeCols['discount_pct'] = (negativeCols['discount_pct'] || 0) + 1;
      }
    }

    if (r.inventory_on_hand !== undefined && !isNaN(r.inventory_on_hand)) {
      numericStats['inventory_on_hand'].push(r.inventory_on_hand);
      if (r.inventory_on_hand < 0) negativeCols['inventory_on_hand'] = (negativeCols['inventory_on_hand'] || 0) + 1;
    }
  });

  if (duplicateCount > 0) {
    issues.push({
      type: 'duplicate_record',
      column: 'product_id + date',
      severity: 'warning',
      count: duplicateCount,
      description: `Detected ${duplicateCount} duplicate records sharing identical product ID and date.`,
    });
  }

  for (const [col, count] of Object.entries(missingCols)) {
    if (count > 0) {
      issues.push({
        type: 'missing_value',
        column: col,
        severity: 'error',
        count,
        description: `Column '${col}' contains ${count} null or missing observations.`,
      });
    }
  }

  for (const [col, count] of Object.entries(negativeCols)) {
    if (count > 0) {
      issues.push({
        type: 'negative_value',
        column: col,
        severity: 'error',
        count,
        description: `Column '${col}' contains ${count} invalid negative or out-of-bounds values.`,
      });
    }
  }

  const summary_stats = Object.entries(numericStats).map(([col, values]) => {
    if (values.length === 0) {
      return { column: col, min: 0, max: 0, mean: 0, median: 0, std: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const variance = sorted.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / sorted.length;
    return {
      column: col,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      std: Math.round(Math.sqrt(variance) * 100) / 100,
    };
  });

  const totalPossibleChecks = Math.max(1, records.length * 6);
  const totalErrors = Object.values(missingCols).reduce((a, b) => a + b, 0) +
    Object.values(negativeCols).reduce((a, b) => a + b, 0) + duplicateCount;
  const completeness_score = records.length > 0
    ? Math.max(0, Math.min(100, Math.round(((totalPossibleChecks - totalErrors) / totalPossibleChecks) * 100)))
    : 0;

  const validDates = records.map(r => r.date).filter(Boolean).sort();
  let dateRangeDays = 0;
  if (validDates.length > 0) {
    const start = new Date(validDates[0]).getTime();
    const end = new Date(validDates[validDates.length - 1]).getTime();
    dateRangeDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
  }

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
    quality: computeQualityReport(activeRecords),
    has_dataset: true,
  });
});

// 3. Paginated Records with Filtering
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

// 4. Reset or Clear Dataset (Never loads synthetic by default into user session)
app.post('/api/dataset/reset', (req: Request, res: Response) => {
  if (req.query.mode === 'benchmark_test_only') {
    const fixture = generateSyntheticDataset();
    activeMetadata = fixture.metadata;
    activeRecords = fixture.records;
    savedScenarios = [];
    return res.json({
      message: 'Loaded isolated benchmark fixture for automated test execution.',
      metadata: activeMetadata,
      has_dataset: true,
    });
  }

  // Clear live runtime dataset to empty state
  activeMetadata = null;
  activeRecords = [];
  savedScenarios = [];
  res.json({
    message: 'Active dataset and dependent models cleared successfully.',
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
      quality: computeQualityReport(activeRecords),
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
function getProductBaseline(productId: string) {
  const prodRecords = activeRecords.filter(r => r.product_id === productId);
  if (prodRecords.length > 0) {
    const name = prodRecords[0].product_name || productId;
    const avgUnits = prodRecords.reduce((s, r) => s + r.units_sold, 0) / prodRecords.length;
    const avgPrice = prodRecords.reduce((s, r) => s + r.price, 0) / prodRecords.length;
    const avgCost = prodRecords.reduce((s, r) => s + r.unit_cost, 0) / prodRecords.length;
    const elastRes = computePriceElasticity(prodRecords);
    const elasticity = elastRes.sufficiency !== 'insufficient' ? elastRes.elasticity : -1.2;
    return {
      id: productId,
      name,
      baseDemand: Math.max(1, Math.round(avgUnits * 30)), // 30-day period demand
      elasticity,
      basePrice: avgPrice > 0 ? avgPrice : 100,
      baseCost: avgCost > 0 ? avgCost : 40,
    };
  }
  return {
    id: productId,
    name: productId,
    baseDemand: 100,
    elasticity: -1.2,
    basePrice: 100,
    baseCost: 50,
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

    const prodRecords = activeRecords.filter(r => r.product_id === targetProd);
    if (prodRecords.length < 10) {
      return res.status(400).json({
        error: `Insufficient observations for product "${targetProd}". Found ${prodRecords.length}, minimum 10 required for chronological evaluation.`,
      });
    }

    const forecast = trainAndEvaluateForecast(prodRecords, algorithm, train_ratio);
    res.json(forecast);
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
    const prodRecords = activeRecords.filter(r => r.product_id === targetProd);

    if (prodRecords.length < 14) {
      return res.status(400).json({
        error: `Insufficient observations for regime detection. Found ${prodRecords.length} records for product "${targetProd}", minimum 14 required.`,
      });
    }

    const result = detectDemandRegimes(prodRecords, 14);

    // Compute model error by regime using standard linear regression if sample allows
    let model_error_by_regime = [
      { regime: 'low', mae: 0, sample_size: 0 },
      { regime: 'normal', mae: 0, sample_size: 0 },
      { regime: 'high', mae: 0, sample_size: 0 },
    ];

    if (prodRecords.length >= 10) {
      try {
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
      product_name: prodRecords[0]?.product_name || targetProd,
      ...result,
      model_error_by_regime,
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

    // Verify presence of price column
    const hasPrice = prodRecords.some(r => r.price > 0);
    if (!hasPrice) {
      return res.status(400).json({
        error: `Price data is missing or zero for product "${targetProd}". Price sensitivity analysis requires valid price observations.`,
      });
    }

    const result = computePriceElasticity(prodRecords);
    res.json({
      product_id: targetProd,
      product_name: prodRecords[0]?.product_name || targetProd,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Price sensitivity calculation failed: ${err.message}` });
  }
});

// 10. Scenario Management (CRUD)
app.get('/api/scenarios', (_req: Request, res: Response) => {
  res.json(savedScenarios);
});

app.post('/api/scenarios', (req: Request, res: Response) => {
  try {
    const input: ScenarioInput = req.body;
    if (input.selling_price === undefined || input.selling_price <= 0) {
      return res.status(400).json({ error: 'Explicit positive selling price is required.' });
    }
    if (input.unit_cost === undefined || input.unit_cost < 0) {
      return res.status(400).json({ error: 'Explicit non-negative unit cost is required.' });
    }
    if (input.inventory === undefined || input.inventory < 0) {
      return res.status(400).json({ error: 'Explicit non-negative inventory is required.' });
    }

    const prod = getProductBaseline(input.product_id);

    // Calculate model-grounded demand based on empirical elasticity
    const effectivePrice = input.selling_price * (1 - (input.discount_pct || 0) / 100);
    const priceRatio = effectivePrice / (prod.basePrice || input.selling_price || 1);
    const promoLift = input.is_promo ? 1.3 : 1.0;
    const estimatedDemand = Math.max(1, Math.round(prod.baseDemand * Math.pow(priceRatio, prod.elasticity) * promoLift));

    const simulated = simulateScenario(
      input,
      estimatedDemand,
      prod.name,
      'fitted_model',
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
  const input: ScenarioInput = req.body;
  const prod = getProductBaseline(input.product_id);
  const effectivePrice = input.selling_price * (1 - (input.discount_pct || 0) / 100);
  const priceRatio = effectivePrice / (prod.basePrice || input.selling_price || 1);
  const promoLift = input.is_promo ? 1.3 : 1.0;
  const estimatedDemand = Math.max(1, Math.round(prod.baseDemand * Math.pow(priceRatio, prod.elasticity) * promoLift));

  const updated = simulateScenario(
    { ...input, id },
    estimatedDemand,
    prod.name,
    'fitted_model',
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
    if (input.selling_price === undefined || input.selling_price <= 0) {
      return res.status(400).json({ error: 'Explicit positive selling price is required.' });
    }
    if (input.unit_cost === undefined || input.unit_cost < 0) {
      return res.status(400).json({ error: 'Explicit non-negative unit cost is required.' });
    }

    const prod = getProductBaseline(input.product_id);
    const effectivePrice = input.selling_price * (1 - (input.discount_pct || 0) / 100);
    const priceRatio = effectivePrice / (prod.basePrice || input.selling_price || 1);
    const promoLift = input.is_promo ? 1.3 : 1.0;
    const estimatedDemand = Math.max(1, Math.round(prod.baseDemand * Math.pow(priceRatio, prod.elasticity) * promoLift));

    const result = simulateScenario(
      input,
      estimatedDemand,
      prod.name,
      'fitted_model',
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
    const prod = getProductBaseline(input.product_id);
    const effectivePrice = input.selling_price * (1 - (input.discount_pct || 0) / 100);
    const priceRatio = effectivePrice / (prod.basePrice || input.selling_price || 1);
    const promoLift = input.is_promo ? 1.3 : 1.0;
    const estimatedDemand = Math.max(1, Math.round(prod.baseDemand * Math.pow(priceRatio, prod.elasticity) * promoLift));

    const baseline = simulateScenario(
      input,
      estimatedDemand,
      prod.name,
      'fitted_model',
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
  activeConstraints = { ...activeConstraints, ...req.body };
  // Re-evaluate feasibility of saved scenarios
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
    if (prodRecords.length >= 15 && prodRecords.some(r => r.price > 0)) {
      const elast = computePriceElasticity(prodRecords);
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
    if (prodRecords.length >= 14) {
      const regimes = detectDemandRegimes(prodRecords, 14);
      const highRegime = regimes.summary.find(s => s.regime === 'high');
      if (highRegime && highRegime.percentage >= 15) {
        const prodName = prodRecords[0].product_name || pid;
        insights.push({
          id: `ins_demand_regime_${pid}`,
          category: 'demand_regime',
          title: `Demand Regime Clustering Detected for ${prodName}`,
          observed: `${highRegime.percentage}% of calendar days operate in a High Demand regime (Z > +0.95).`,
          supporting_data: `14-day rolling window identified average high regime demand of ${highRegime.average_demand} units vs overall sample mean.`,
          why_it_matters: 'Fixed buffer stock risks stock-outs during regime transitions into volume surges.',
          possible_action: 'Transition from fixed buffer stocks to regime-adaptive replenishment schedules.',
          uncertainty_limitations: 'Rolling Z-score lags abrupt single-day demand spikes by 2-3 trading days.',
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
      why_it_matters: `Causes an estimated $${(riskyScenario.unmet * (riskyScenario.selling_price - riskyScenario.unit_cost)).toFixed(2)} in lost gross margin contribution.`,
      possible_action: 'Allocate emergency buffer inventory or adjust promotional budget to preserve fulfillment rates.',
      uncertainty_limitations: 'Assumes unfulfilled shoppers do not backorder or substitute for adjacent catalog items.',
      severity: 'high',
    });
  }

  // Insight D: Model Chronological Performance
  for (const pid of uniqueProductIds) {
    const prodRecords = activeRecords.filter(r => r.product_id === pid);
    if (prodRecords.length >= 10) {
      try {
        const lrForecast = trainAndEvaluateForecast(prodRecords, 'linear_regression', 0.8);
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
