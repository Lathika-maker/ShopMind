/**
 * SHOPMIND — API Middleware Engine for Vite and Express
 * Handles all REST endpoints with real mathematical and data science computation.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import {
  generateSyntheticDataset,
  convertRecordsToCSV,
  PRODUCTS_CATALOG,
} from '../data/syntheticDemo.ts';
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

// State management
const initialDemo = generateSyntheticDataset();
let activeMetadata: DatasetMetadata = initialDemo.metadata;
let activeRecords: DataRecord[] = initialDemo.records;

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

function createDefaultBenchmarkScenarios(): ScenarioSimulationResult[] {
  return [
    simulateScenario(
      {
        id: 'scen_artisan_baseline',
        name: 'Artisan Tote — Standard Holiday Pricing',
        description: 'Baseline regular pricing with standard promotional weekend discount',
        product_id: 'PRD-101',
        selling_price: 285,
        unit_cost: 95,
        discount_pct: 10,
        promotion_cost: 450,
        advertising_cost: 600,
        inventory: 260,
        competitor_price: 295,
        is_promo: true,
      },
      215,
      'Artisan Leather Tote',
      'fitted_model',
      activeConstraints
    ),
    simulateScenario(
      {
        id: 'scen_cashmere_flash',
        name: 'Cashmere Knit — Flash Volume Push',
        description: 'Aggressive 20% discount paired with high digital marketing budget',
        product_id: 'PRD-102',
        selling_price: 165,
        unit_cost: 52,
        discount_pct: 20,
        promotion_cost: 850,
        advertising_cost: 1200,
        inventory: 480,
        competitor_price: 170,
        is_promo: true,
      },
      410,
      'Cashmere Blend Knit',
      'fitted_model',
      activeConstraints
    ),
    simulateScenario(
      {
        id: 'scen_brass_lamp_premium',
        name: 'Heritage Brass Lamp — Prestige Margin Hold',
        description: 'Zero discount strategy to preserve prestige luxury brand positioning',
        product_id: 'PRD-103',
        selling_price: 220,
        unit_cost: 78,
        discount_pct: 0,
        promotion_cost: 0,
        advertising_cost: 300,
        inventory: 140,
        competitor_price: 215,
        is_promo: false,
      },
      98,
      'Heritage Brass Lamp',
      'fitted_model',
      activeConstraints
    ),
  ];
}

function generateScenariosForDataset(
  records: DataRecord[],
  items: { id: string; name: string }[]
): ScenarioSimulationResult[] {
  const generated: ScenarioSimulationResult[] = [];
  const targetItems = items.slice(0, 3);
  targetItems.forEach((item, idx) => {
    const prodRecs = records.filter(r => r.product_id === item.id);
    const avgPrice = prodRecs.length > 0 ? prodRecs.reduce((s, r) => s + r.price, 0) / prodRecs.length : 100;
    const avgCost = prodRecs.length > 0 ? prodRecs.reduce((s, r) => s + r.unit_cost, 0) / prodRecs.length : Math.round(avgPrice * 0.4);
    const avgDemand = prodRecs.length > 0 ? Math.max(10, Math.round((prodRecs.reduce((s, r) => s + r.units_sold, 0) / prodRecs.length) * 7)) : 50;
    const avgInv = prodRecs.length > 0 ? Math.max(10, Math.round(prodRecs.reduce((s, r) => s + r.inventory_on_hand, 0) / prodRecs.length)) : Math.round(avgDemand * 1.2);

    generated.push(
      simulateScenario(
        {
          id: `scen_upl_${item.id}_baseline`,
          name: `${item.name} — Baseline Pricing`,
          description: `Empirical pricing baseline for ${item.name}`,
          product_id: item.id,
          selling_price: Math.round(avgPrice),
          unit_cost: Math.round(avgCost),
          discount_pct: 0,
          promotion_cost: 150,
          advertising_cost: 200,
          inventory: Math.round(avgInv),
          competitor_price: Math.round(avgPrice * 1.05),
          is_promo: false,
        },
        avgDemand,
        item.name,
        'fitted_model',
        activeConstraints
      )
    );

    if (idx < 2) {
      generated.push(
        simulateScenario(
          {
            id: `scen_upl_${item.id}_promo`,
            name: `${item.name} — Promotional Growth`,
            description: `15% discount promotional test for ${item.name}`,
            product_id: item.id,
            selling_price: Math.round(avgPrice),
            unit_cost: Math.round(avgCost),
            discount_pct: 15,
            promotion_cost: 300,
            advertising_cost: 450,
            inventory: Math.round(avgInv * 1.3),
            competitor_price: Math.round(avgPrice),
            is_promo: true,
          },
          Math.round(avgDemand * 1.35),
          item.name,
          'fitted_model',
          activeConstraints
        )
      );
    }
  });
  return generated.length > 0 ? generated : createDefaultBenchmarkScenarios();
}

let savedScenarios: ScenarioSimulationResult[] = createDefaultBenchmarkScenarios();

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

  records.forEach((r) => {
    const key = `${r.product_id}_${r.date}`;
    if (seenKeys.has(key)) duplicateCount++;
    else seenKeys.add(key);

    if (!r.date) missingCols['date'] = (missingCols['date'] || 0) + 1;
    if (!r.product_id) missingCols['product_id'] = (missingCols['product_id'] || 0) + 1;
    if (r.units_sold === undefined || isNaN(r.units_sold)) {
      missingCols['units_sold'] = (missingCols['units_sold'] || 0) + 1;
    } else {
      numericStats['units_sold'].push(r.units_sold);
      if (r.units_sold < 0) negativeCols['units_sold'] = (negativeCols['units_sold'] || 0) + 1;
    }

    if (r.price === undefined || isNaN(r.price)) {
      missingCols['price'] = (missingCols['price'] || 0) + 1;
    } else {
      numericStats['price'].push(r.price);
      if (r.price < 0) negativeCols['price'] = (negativeCols['price'] || 0) + 1;
    }

    if (r.unit_cost === undefined || isNaN(r.unit_cost)) {
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
    if (values.length === 0) return { column: col, min: 0, max: 0, mean: 0, median: 0, std: 0 };
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

  const totalPossibleChecks = records.length * 6;
  const totalErrors = Object.values(missingCols).reduce((a, b) => a + b, 0) +
    Object.values(negativeCols).reduce((a, b) => a + b, 0) + duplicateCount;
  const completeness_score = Math.max(0, Math.min(100, Math.round(((totalPossibleChecks - totalErrors) / totalPossibleChecks) * 100)));

  return {
    total_records: records.length,
    valid_records: Math.max(0, records.length - duplicateCount),
    duplicate_count: duplicateCount,
    missing_values_by_column: missingCols,
    negative_values_by_column: negativeCols,
    date_range_days: 365,
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
      active_dataset: activeMetadata.name,
      is_synthetic: activeMetadata.is_synthetic,
    });
  }

  if (req.method === 'GET' && pathname === '/api/dataset') {
    return sendJson(res, 200, {
      metadata: activeMetadata,
      quality: computeQualityReport(activeRecords),
    });
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
    const fresh = generateSyntheticDataset();
    activeMetadata = fresh.metadata;
    activeRecords = fresh.records;
    savedScenarios = createDefaultBenchmarkScenarios();
    return sendJson(res, 200, {
      message: 'Reset to deterministic benchmark dataset successfully.',
      metadata: activeMetadata,
    });
  }

  if (req.method === 'GET' && pathname === '/api/dataset/export') {
    const csv = convertRecordsToCSV(activeRecords);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="shopmind_dataset_${activeMetadata.id}.csv"`);
    return res.end(csv);
  }

  if (req.method === 'POST' && pathname === '/api/dataset/upload') {
    parseBody(req).then((body) => {
      const { name, records, mapping } = body;
      if (!Array.isArray(records) || records.length === 0) {
        return sendJson(res, 400, { error: 'No valid records provided.' });
      }
      const cleanedRecords: DataRecord[] = records.map((row: any, i: number) => {
        const dateVal = row[mapping?.date || 'date'] || row['Date'] || '';
        const prodId = String(row[mapping?.product_id || 'product_id'] || row['Product_ID'] || `P-${(i % 5) + 1}`);
        const prodName = String(row[mapping?.product_name || 'product_name'] || row['Product_Name'] || prodId);
        const cat = String(row[mapping?.category || 'category'] || row['Category'] || 'General Merchandise');
        const units = parseFloat(row[mapping?.units_sold || 'units_sold'] || row['Units_Sold'] || '0');
        const price = parseFloat(row[mapping?.price || 'price'] || row['Price'] || '0');
        const cost = parseFloat(row[mapping?.unit_cost || 'unit_cost'] || row['Unit_Cost'] || '0');
        const disc = parseFloat(row[mapping?.discount_pct || 'discount_pct'] || row['Discount_Pct'] || '0');
        const promo = Boolean(row[mapping?.promo_active || 'promo_active'] === '1' || row['promo_active'] === true);
        const inv = parseFloat(row[mapping?.inventory_on_hand || 'inventory_on_hand'] || row['Inventory_On_Hand'] || '100');
        const comp = parseFloat(row[mapping?.competitor_price || 'competitor_price'] || row['Competitor_Price'] || String(price));
        return {
          id: `UPL-${i + 1}`,
          date: dateVal,
          product_id: prodId,
          product_name: prodName,
          category: cat,
          units_sold: isNaN(units) ? 0 : units,
          price: isNaN(price) ? 0 : price,
          unit_cost: isNaN(cost) ? 0 : cost,
          discount_pct: isNaN(disc) ? 0 : disc,
          promo_active: promo,
          inventory_on_hand: isNaN(inv) ? 0 : inv,
          competitor_price: isNaN(comp) ? price : comp,
        };
      });
      cleanedRecords.sort((a, b) => a.date.localeCompare(b.date));
      const dates = cleanedRecords.map(r => r.date).filter(Boolean);
      const productMap = new Map<string, { id: string; name: string; category?: string }>();
      cleanedRecords.forEach(r => {
        if (!productMap.has(r.product_id)) {
          productMap.set(r.product_id, { id: r.product_id, name: r.product_name, category: r.category });
        }
      });
      const product_items = Array.from(productMap.values());
      activeMetadata = {
        id: `ds_user_${Date.now()}`,
        name: name || 'Uploaded Retail Dataset',
        source: 'uploaded_csv',
        created_at: new Date().toISOString(),
        row_count: cleanedRecords.length,
        date_range: { start: dates[0] || '', end: dates[dates.length - 1] || '' },
        products: product_items.map(p => p.name),
        product_items,
        categories: Array.from(new Set(cleanedRecords.map(r => r.category))),
        is_synthetic: false,
      };
      activeRecords = cleanedRecords;
      savedScenarios = generateScenariosForDataset(cleanedRecords, product_items);
      return sendJson(res, 200, {
        message: 'Dataset uploaded and processed successfully. Scenarios and metrics refreshed.',
        metadata: activeMetadata,
        quality: computeQualityReport(activeRecords),
      });
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/forecasting/train') {
    parseBody(req).then((body) => {
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
    const targetProd = (parsed.query.product_id as string) || activeRecords[0]?.product_id;
    const prodRecords = activeRecords.filter(r => r.product_id === targetProd);
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

  if (req.method === 'POST' && pathname === '/api/scenarios') {
    parseBody(req).then((input: ScenarioInput) => {
      const catalogProd = PRODUCTS_CATALOG.find(p => p.id === input.product_id);
      const prodRecords = activeRecords.filter(r => r.product_id === input.product_id);
      const avgPrice = prodRecords.length > 0 ? prodRecords.reduce((s, r) => s + r.price, 0) / prodRecords.length : input.selling_price;
      const avgDemand = prodRecords.length > 0 ? Math.max(1, Math.round(prodRecords.reduce((s, r) => s + r.units_sold, 0) / prodRecords.length * 7)) : 50;
      const prodName = catalogProd?.name || prodRecords[0]?.product_name || input.product_id;
      const elasticity = catalogProd?.elasticity || (prodRecords.length >= 10 ? computePriceElasticity(prodRecords).elasticity : -1.2);

      const effectivePrice = input.selling_price * (1 - (input.discount_pct || 0) / 100);
      const priceRatio = effectivePrice / (avgPrice || input.selling_price || 1);
      const promoLift = input.is_promo ? 1.3 : 1.0;
      const estimatedDemand = Math.max(1, Math.round(avgDemand * Math.pow(Math.max(0.1, priceRatio), elasticity) * promoLift));
      const simulated = simulateScenario(input, estimatedDemand, prodName, 'fitted_model', activeConstraints);
      savedScenarios.unshift(simulated);
      return sendJson(res, 200, simulated);
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

    const insights: InsightItem[] = [
      {
        id: 'ins_price_elasticity',
        category: 'price_sensitivity',
        title: `Empirical Price Elasticity: ${primaryProdName}`,
        observed: `Estimated empirical elasticity coefficient of ${elast.elasticity.toFixed(2)} (95% CI: [${elast.confidence_interval_95[0].toFixed(2)}, ${elast.confidence_interval_95[1].toFixed(2)}], p = ${elast.p_value.toFixed(4)}).`,
        supporting_data: `Evaluated on ${elast.sample_size} active observations (R² = ${(elast.r_squared || 0).toFixed(3)}). Average price: $${meanPrice.toFixed(2)}, average volume: ${meanUnits.toFixed(1)} units.`,
        why_it_matters: elast.elasticity < -1
          ? `Demand is price-elastic (coefficient ${elast.elasticity.toFixed(2)} < -1.0). Strategic promotional markdown stimulates more than proportional volume expansion.`
          : `Demand is price-inelastic (coefficient ${elast.elasticity.toFixed(2)} >= -1.0). Protect price floors to preserve gross margin rather than discounting.`,
        possible_action: elast.elasticity < -1
          ? 'Calibrate promotional markdown depth to capture incremental volume while monitoring inventory replenishment lead time.'
          : 'Hold prestige pricing and avoid broad-scale markdowns that dilute margin without proportional volume lift.',
        uncertainty_limitations: 'Calculated via Log-Log Ordinary Least Squares with promotion controls. Macro inflation, competitor matching, and local seasonality can shift demand curves.',
        severity: Math.abs(elast.elasticity) > 1.5 ? 'high' : 'medium',
      },
    ];

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
