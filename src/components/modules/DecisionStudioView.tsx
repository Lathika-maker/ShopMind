/**
 * SHOPMIND — Module 7: Decision Studio (Interactive Simulation)
 * Interactive configuration, real-time formula computation, and scenario saving.
 */

import React, { useState } from 'react';
import {
  Calculator,
  Save,
  Copy,
  Trash2,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Info,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  ScenarioInput,
  ScenarioSimulationResult,
  DatasetMetadata,
  BusinessConstraints,
} from '../../types/retail.ts';
import { KPICard } from '../ui/KPICard.tsx';
import { EmptyDatasetState } from '../ui/EmptyDatasetState.tsx';


interface DecisionStudioViewProps {
  metadata: DatasetMetadata | null;
  scenarios: ScenarioSimulationResult[];
  constraints: BusinessConstraints;
  onRefreshScenarios: () => void;
  onNavigate: (tab: string) => void;
}

export const DecisionStudioView: React.FC<DecisionStudioViewProps> = ({
  metadata,
  scenarios,
  constraints,
  onRefreshScenarios,
  onNavigate,
}) => {
  const productOptions = metadata?.product_items && metadata.product_items.length > 0
    ? metadata.product_items
    : (metadata?.products || []).map(product => ({ id: product, name: product }));

  const [name, setName] = useState<string>('Retail Decision Scenario');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<number | ''>('');
  const [sellingPriceSource, setSellingPriceSource] = useState<'mapped' | 'derived' | 'missing'>('missing');
  const [unitCost, setUnitCost] = useState<number | ''>('');
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [promoCost, setPromoCost] = useState<number>(0);
  const [advertisingCost, setAdvertisingCost] = useState<number>(0);
  const [inventory, setInventory] = useState<number | ''>('');
  const [isPromo, setIsPromo] = useState<boolean>(false);
  const [competitorPrice, setCompetitorPrice] = useState<number | ''>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [productSummary, setProductSummary] = useState<any>(null);
  const [previewResult, setPreviewResult] = useState<ScenarioSimulationResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  const firstProductId = productOptions[0]?.id || '';
  React.useEffect(() => {
    if (firstProductId && !productOptions.some(product => product.id === selectedProduct)) {
      setSelectedProduct(firstProductId);
    }
    if (!firstProductId) setSelectedProduct('');
  }, [metadata?.id, firstProductId, selectedProduct]);

  // Populate only fields that actually exist in the uploaded dataset.
  React.useEffect(() => {
    if (!metadata || !selectedProduct) {
      setProductSummary(null);
      setPreviewResult(null);
      setMissingFields([]);
      return;
    }
    const controller = new AbortController();
    setProductSummary(null);
    setPreviewResult(null);
    setErrorMsg(null);
    setSellingPrice('');
    setSellingPriceSource('missing');
    setUnitCost('');
    setInventory('');
    setCompetitorPrice('');
    setDiscountPct(0);
    setMissingFields([]);
    fetch('/api/dataset/product-summary?product_id=' + encodeURIComponent(selectedProduct), {
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to inspect the selected product.');
        return data;
      })
      .then(summary => {
        setProductSummary(summary);
        if (typeof summary.average_unit_price === 'number' && summary.average_unit_price > 0) {
          setSellingPrice(summary.average_unit_price);
          setSellingPriceSource('mapped');
        } else if (typeof summary.derived_unit_price_from_revenue === 'number' && summary.derived_unit_price_from_revenue > 0) {
          // Useful scenario seed only. The model API will still use historical demand
          // unless genuine unit-price variation is available for elasticity estimation.
          setSellingPrice(summary.derived_unit_price_from_revenue);
          setSellingPriceSource('derived');
        } else {
          setSellingPrice('');
          setSellingPriceSource('missing');
        }
        setUnitCost(typeof summary.average_unit_cost === 'number' ? summary.average_unit_cost : '');
        setInventory(typeof summary.average_inventory_on_hand === 'number' ? summary.average_inventory_on_hand : '');
        setDiscountPct(typeof summary.average_discount_pct === 'number' ? summary.average_discount_pct : 0);
        setCompetitorPrice(typeof summary.average_competitor_price === 'number' ? summary.average_competitor_price : '');
        const missing = [];
        if (!(typeof summary.average_unit_price === 'number' && summary.average_unit_price > 0) &&
            !(typeof summary.derived_unit_price_from_revenue === 'number' && summary.derived_unit_price_from_revenue > 0)) {
          missing.push('selling price');
        }
        if (summary.average_unit_cost === null) missing.push('unit cost');
        if (summary.average_inventory_on_hand === null) missing.push('inventory');
        setMissingFields(missing);
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setProductSummary(null);
          setErrorMsg(error.message || 'Unable to load product summary.');
        }
      });
    return () => controller.abort();
  }, [metadata?.id, selectedProduct]);

  const validPrice = typeof sellingPrice === 'number' && Number.isFinite(sellingPrice) && sellingPrice > 0;
  const validCost = typeof unitCost === 'number' && Number.isFinite(unitCost) && unitCost >= 0;
  const validInventory = typeof inventory === 'number' && Number.isFinite(inventory) && inventory >= 0;
  const canPreview = Boolean(metadata && selectedProduct && productSummary && validPrice && validCost && validInventory);
  const effectivePrice = validPrice ? sellingPrice * (1 - discountPct / 100) : null;

  // All scenario outputs come from the same server-side pathway used to save the scenario.
  // If required inputs are absent, do not display made-up preview numbers.
  React.useEffect(() => {
    if (!canPreview || effectivePrice === null || typeof sellingPrice !== 'number' ||
        typeof unitCost !== 'number' || typeof inventory !== 'number') {
      setPreviewResult(null);
      setPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    setPreviewLoading(true);
    setPreviewResult(null);
    setErrorMsg(null);
    const timer = window.setTimeout(() => {
      fetch('/api/scenarios/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          name,
          product_id: selectedProduct,
          selling_price: sellingPrice,
          unit_cost: unitCost,
          discount_pct: discountPct,
          promotion_cost: promoCost,
          advertising_cost: advertisingCost,
          inventory,
          competitor_price: typeof competitorPrice === 'number' ? competitorPrice : undefined,
          is_promo: isPromo,
        }),
      })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Unable to calculate scenario preview.');
          return data as ScenarioSimulationResult;
        })
        .then(result => setPreviewResult(result))
        .catch(error => {
          if (error.name !== 'AbortError') setErrorMsg(error.message || 'Scenario preview failed.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    canPreview, effectivePrice, name, selectedProduct, sellingPrice, unitCost,
    discountPct, promoCost, advertisingCost, inventory, competitorPrice, isPromo,
  ]);

  const handleSaveScenario = async () => {
    if (!canPreview || typeof sellingPrice !== 'number' || typeof unitCost !== 'number' ||
        typeof inventory !== 'number') {
      setErrorMsg('Enter a valid selling price, unit cost, and inventory quantity. Values missing from the dataset must be supplied explicitly before financial outcomes can be calculated.');
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const payload: ScenarioInput = {
        name,
        product_id: selectedProduct,
        selling_price: sellingPrice,
        unit_cost: unitCost,
        discount_pct: discountPct,
        promotion_cost: promoCost,
        advertising_cost: advertisingCost,
        inventory,
        ...(typeof competitorPrice === 'number' ? { competitor_price: competitorPrice } : {}),
        is_promo: isPromo,
      };

      const response = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the scenario.');

      // Persisting this scenario to Firestore is intentionally not used as a data source:
      // scenarios must belong to the currently active uploaded dataset.
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 2500);
      onRefreshScenarios();
    } catch (error: any) {
      setErrorMsg(error.message || 'Failed to save scenario.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteScenario = async (id: string) => {
    try {
      await fetch(`/api/scenarios/${id}`, { method: 'DELETE' });
      onRefreshScenarios();
    } catch (err) {
      console.error('Failed to delete scenario:', err);
    }
  };

  const handleDuplicateScenario = async (id: string) => {
    try {
      await fetch(`/api/scenarios/duplicate/${id}`, { method: 'POST' });
      onRefreshScenarios();
    } catch (err) {
      console.error('Failed to duplicate scenario:', err);
    }
  };

  if (!metadata || metadata.row_count === 0) {
    return (
      <EmptyDatasetState
        moduleName="Decision Studio"
        description="Upload a CSV dataset to simulate scenarios using observed demand and explicitly supplied commercial inputs."
        onOpenUpload={() => onNavigate('explorer')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Decision Simulation Engine
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Decision Studio & Commercial Sandbox
          </h2>
          <div className="text-xs text-slate-400 mt-0.5">
            Configure pricing, inventory, and promotions. Calculate revenue, margins, and stock-out risks.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('stress_testing')}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors cursor-pointer"
          >
            Stress Test Scenario →
          </button>
          <button
            onClick={() => onNavigate('comparison')}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors cursor-pointer"
          >
            Compare All Scenarios ({scenarios.length}) →
          </button>
        </div>
      </div>

      {/* Main Studio Grid: Inputs on Left, Real-time Simulation on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Commercial Configuration Controls */}
        <div className="lg:col-span-6 bg-[#0F172A] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-white">
              Commercial Scenario Parameters
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              Active uploaded data
            </span>
          </div>

          {/* Scenario Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Scenario Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-[#E2B774]"
            />
          </div>

          {/* Product Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Target Product
            </label>
            <select
              value={selectedProduct}
              onChange={(e) => {
                setSelectedProduct(e.target.value);
          
              }}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-[#E2B774]"
            >
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </div>

          {/* Price & Unit Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Selling Price ($){sellingPriceSource === 'derived' ? ' — derived' : sellingPriceSource === 'mapped' ? ' — from CSV' : ''}
              </label>
              {sellingPriceSource === 'derived' && (
                <p className="text-[10px] text-amber-300 mb-1">
                  Seeded from total revenue ÷ units sold; not used to estimate price elasticity.
                </p>
              )}
              <input
                type="number"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Unit Cost (COGS $)
              </label>
              <input
                type="number"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Discount % & Promo Toggle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Promotional Discount</span>
                <span className="font-mono text-white font-semibold">{discountPct}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="5"
                value={discountPct}
                onChange={(e) => setDiscountPct(parseInt(e.target.value, 10))}
                className="w-full accent-[#E2B774] cursor-pointer"
              />
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Effective Price: ${effectivePrice.toFixed(2)}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Campaign Marketing (no assumed lift)
              </label>
              <label className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPromo}
                  onChange={(e) => setIsPromo(e.target.checked)}
                  className="rounded text-[#E2B774] accent-[#E2B774]"
                />
                <span>Active Campaign Lift</span>
              </label>
            </div>
          </div>

          {/* Marketing & Promotion Costs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Promotion Budget ($, assumption)
              </label>
              <input
                type="number"
                value={promoCost}
                onChange={(e) => setPromoCost(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Advertising Budget ($, assumption)
              </label>
              <input
                type="number"
                value={advertisingCost}
                onChange={(e) => setAdvertisingCost(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Inventory Available & Competitor Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Available Inventory (units)
              </label>
              <input
                type="number"
                value={inventory}
                onChange={(e) => setInventory(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Competitor Reference Price ($)
              </label>
              <input
                type="number"
                value={competitorPrice}
                onChange={(e) => setCompetitorPrice(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Save Action */}
          <div className="pt-2">
            <button
              onClick={handleSaveScenario}
              disabled={isSaving || !canPreview || previewLoading}
              className="w-full py-2.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Persisting...' : saveSuccess ? '✓ Scenario Saved!' : 'Save Decision Scenario'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: calculated, data-grounded preview */}
        <div className="lg:col-span-6 bg-[#0F172A] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-white">Scenario Preview</h3>
              <p className="text-xs text-slate-400">
                Results are returned by the same API logic used when saving a scenario.
              </p>
            </div>
            {previewResult && (
              <span className={`text-xs font-mono px-2 py-0.5 rounded ${previewResult.is_feasible
                ? 'bg-emerald-950/40 border border-emerald-800/80 text-emerald-400'
                : 'bg-rose-950/40 border border-rose-800/80 text-rose-400'}`}>
                {previewResult.is_feasible ? 'Constraints Feasible' : 'Constraint Violation'}
              </span>
            )}
          </div>

          {!productSummary ? (
            <div className="py-10 text-center text-sm text-slate-500">
              {metadata ? 'Loading product summary from the active dataset…' : 'Upload a CSV to begin.'}
            </div>
          ) : missingFields.length > 0 && (
            <div className="p-3 bg-amber-950/20 border border-amber-800/60 rounded text-xs text-amber-200">
              <div className="font-semibold mb-1">Enter the missing commercial inputs</div>
              The uploaded file does not contain {missingFields.join(', ')}. These fields are left blank, not estimated from unrelated columns. Enter values explicitly to calculate profit and inventory outcomes.
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="p-3 bg-rose-950/30 border border-rose-800 rounded text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {!previewResult && productSummary && (
            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded space-y-3">
              <div className="text-sm font-semibold text-white">Observed demand summary</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase text-slate-500">Estimated 30-day demand baseline</div>
                  <div className="text-lg font-mono text-[#E2B774]">
                    {productSummary.estimated_30_day_demand_baseline === null
                      ? 'N/A'
                      : `${Number(productSummary.estimated_30_day_demand_baseline).toLocaleString()} units`}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500">Rows for selected product</div>
                  <div className="text-lg font-mono text-white">{productSummary.row_count}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500">Total recorded units</div>
                  <div className="text-lg font-mono text-white">{Number(productSummary.total_units).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500">Recorded product-days</div>
                  <div className="text-lg font-mono text-white">
                    {productSummary.observed_product_days ?? productSummary.row_count}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500">Dates without rows</div>
                  <div className="text-lg font-mono text-white">
                    {productSummary.unobserved_calendar_days ?? 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500">Observed date span</div>
                  <div className="text-xs font-mono text-white">{productSummary.date_start || 'N/A'} → {productSummary.date_end || 'N/A'}</div>
                </div>
              </div>
              {missingFields.length > 0 && (
                <p className="text-[11px] text-slate-400">
                  This demand summary is based on observed units and dates. To calculate financial and stock-out outcomes, supply {missingFields.filter(field => field !== 'selling price').join(' and ') || 'the missing commercial inputs'} explicitly.
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                Baseline method: {productSummary.demand_baseline_method || 'Observed units scaled to a 30-day horizon'}.
                {productSummary.unobserved_calendar_days > 0
                  ? ' Dates without rows are not assumed to be zero-sales days.'
                  : ''}
              </p>
            </div>
          )}

          {previewLoading ? (
            <div className="py-10 text-center text-sm text-slate-400">Recalculating from the active dataset…</div>
          ) : previewResult ? (
            <>
              <div className="p-3 bg-slate-900/70 border border-slate-800 rounded text-xs text-slate-300">
                <div className="font-semibold text-white mb-1">Demand method</div>
                {previewResult.demand_source === 'elasticity_model'
                  ? 'Empirical price-elasticity adjustment. The uploaded data contained enough real price variation to estimate a response.'
                  : 'Historical 30-day demand baseline. Price-response adjustment was not applied because the uploaded data did not support a reliable elasticity estimate.'}
              </div>

              {!previewResult.is_feasible && previewResult.violated_constraints.length > 0 && (
                <div className="p-3 bg-rose-950/30 border border-rose-800/80 rounded text-xs text-rose-300 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Constraint violations</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {previewResult.violated_constraints.map((item, index) => <li key={index}>{item}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ['Estimated Demand (30 days)', `${previewResult.demand.toLocaleString()} units`],
                  ['Fulfilled Units', `${previewResult.fulfilled.toLocaleString()} units`],
                  ['Gross Revenue', `$${previewResult.revenue.toLocaleString()}`],
                  ['Estimated Profit', `$${previewResult.estimated_profit.toLocaleString()}`],
                  ['Profit Margin', `${previewResult.profit_margin_pct}%`],
                  ['Stock-out Risk', `${previewResult.stock_out_risk_percent}%`],
                ].map(([label, value]) => (
                  <div key={label} className="p-3 bg-slate-900 rounded border border-slate-800">
                    <div className="text-slate-400 text-[10px] uppercase font-medium">{label}</div>
                    <div className="text-xl font-bold font-mono text-white tabular-nums mt-1">{value}</div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-900/60 rounded border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Unmet demand / leftover inventory</span>
                <span className="text-slate-200 font-mono">{previewResult.unmet} / {previewResult.leftover} units</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Profit uses the explicitly entered unit cost and campaign budgets. It is a scenario estimate, not an observed profit value.
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-sm text-slate-400">
              Enter a positive selling price, a unit cost, and available inventory to calculate a scenario preview. No financial output is shown until those inputs are provided.
            </div>
          )}
        </div>
      </div>
      {/* Saved Scenarios List */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Saved Commercial Scenarios — Current Session ({scenarios.length})
            </h3>
            <p className="text-xs text-slate-400">
              Scenarios can be reviewed and duplicated during this session. A new CSV clears them so results cannot be mixed across datasets.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-sans">
              <tr>
                <th className="py-2.5 px-4">Scenario Name</th>
                <th className="py-2.5 px-4">Product</th>
                <th className="py-2.5 px-4 text-right">Price</th>
                <th className="py-2.5 px-4 text-right">Demand</th>
                <th className="py-2.5 px-4 text-right">Fulfilled</th>
                <th className="py-2.5 px-4 text-right">Revenue</th>
                <th className="py-2.5 px-4 text-right">Profit</th>
                <th className="py-2.5 px-4 text-right">Stock-Out</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 tabular-nums">
              {scenarios.map((s) => (
                <tr key={s.scenario_id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-sans font-medium text-white">{s.name}</td>
                  <td className="py-2.5 px-4 font-sans text-slate-400">{s.product_name}</td>
                  <td className="py-2.5 px-4 text-right">${s.effective_price.toFixed(2)}</td>
                  <td className="py-2.5 px-4 text-right">{s.demand}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-white">{s.fulfilled}</td>
                  <td className="py-2.5 px-4 text-right">${s.revenue.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right font-bold text-emerald-400">${s.estimated_profit.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right">
                    <span className={s.stock_out_risk_percent > 15 ? 'text-amber-400' : 'text-slate-300'}>
                      {s.stock_out_risk_percent}%
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`text-[10px] font-sans px-2 py-0.5 rounded ${
                      s.is_feasible
                        ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/80'
                        : 'bg-rose-950/40 text-rose-400 border border-rose-800/80'
                    }`}>
                      {s.is_feasible ? 'Feasible' : 'Violated'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-sans">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleDuplicateScenario(s.scenario_id)}
                        className="p-1 text-slate-400 hover:text-white transition-colors"
                        title="Duplicate Scenario"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteScenario(s.scenario_id)}
                        className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete Scenario"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
