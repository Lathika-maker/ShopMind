/**
 * SHOPMIND — Module 6: Price Sensitivity & Elasticity Engine
 * Log-Log OLS regression, confounder controls, 95% confidence intervals, and association vs causality governance.
 */

import React, { useState, useEffect } from 'react';
import {
  Percent,
  HelpCircle,
  AlertTriangle,
  Info,
  TrendingDown,
  CheckCircle,
} from 'lucide-react';
import { KPICard } from '../ui/KPICard.tsx';
import { EmptyDatasetState } from '../ui/EmptyDatasetState.tsx';
import { PriceSensitivityResult, DatasetMetadata } from '../../types/retail.ts';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
  ComposedChart,
} from 'recharts';

interface PriceSensitivityViewProps {
  metadata: DatasetMetadata | null;
  onOpenUpload?: () => void;
}

export const PriceSensitivityView: React.FC<PriceSensitivityViewProps> = ({ metadata, onOpenUpload }) => {
  if (!metadata || metadata.row_count === 0) {
    return (
      <EmptyDatasetState
        moduleName="Price Sensitivity & Empirical Elasticity"
        description="Upload a CSV dataset with historical selling price variation to estimate log-log price elasticity, confidence bounds, and volume responsiveness."
        onOpenUpload={onOpenUpload || (() => {})}
      />
    );
  }

  const productOptions = metadata.product_items && metadata.product_items.length > 0
    ? metadata.product_items
    : (metadata.products || []).map(p => ({ id: p, name: p }));

  const [selectedProduct, setSelectedProduct] = useState<string>(productOptions[0]?.id || '');
  const [result, setResult] = useState<PriceSensitivityResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (productOptions.length > 0 && !productOptions.some(p => p.id === selectedProduct)) {
      setSelectedProduct(productOptions[0].id);
    }
  }, [productOptions, selectedProduct]);

  useEffect(() => {
    const fetchElasticity = async () => {
      if (!selectedProduct) return;
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/price-sensitivity?product_id=${selectedProduct}`);
        if (res.ok) {
          const data = await res.json();
          setResult(data);
        } else {
          const err = await res.json();
          setResult(null);
          setErrorMsg(err.error || 'Price sensitivity unavailable for this product.');
        }
      } catch (err: any) {
        setResult(null);
        setErrorMsg(err.message || 'Failed to load price sensitivity.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchElasticity();
  }, [selectedProduct]);

  // Downsample scatter data for clean chart rendering
  const scatterPoints = result?.scatter_data.filter((_, idx) => idx % 2 === 0) || [];
  const sortedFitted = [...scatterPoints].sort((a, b) => a.price - b.price);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Econometric Modeling
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Price Sensitivity & Empirical Elasticity
          </h2>
          <div className="text-xs text-slate-400 mt-0.5">
            Log-Log Ordinary Least Squares with promotion and weekend controls.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">SKU:</span>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-[#E2B774]"
          >
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Governance & Causal Distinction Callout */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-lg flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-5 h-5 text-[#E2B774] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-white">
            Association vs. Causal Elasticity Disclaimer
          </div>
          <p className="text-slate-400 leading-relaxed">
            The elasticity coefficient represents observed historical association from observational POS transactions, controlling for promotional status and weekend seasonality. True causal elasticity requires randomized price experiments or exogenous instrumental variables.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg flex items-start gap-3 text-xs text-red-200">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-white">Price Sensitivity Unavailable</div>
            <p className="mt-1 text-red-300">{errorMsg}</p>
          </div>
        </div>
      )}

      {result?.data_sufficiency_warning && (
        <div className="p-4 bg-amber-950/40 border border-amber-800 rounded-lg flex items-start gap-3 text-xs text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-white">Insufficient Price Data for Elasticity</div>
            <p className="mt-1 text-amber-300">{result.data_sufficiency_warning}</p>
          </div>
        </div>
      )}

      {/* Key Econometric Metrics */}
      {result && result.sufficiency !== 'insufficient' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Price Elasticity (β₁)"
            value={result.elasticity.toFixed(2)}
            subtext="Δ% demand per 1% price change"
            contextNote={result.elasticity_label.replace('_', ' ')}
            trend={{
              value: Math.abs(result.elasticity) > 1 ? 'Elastic Demand' : 'Inelastic Demand',
              isPositive: Math.abs(result.elasticity) > 1,
            }}
          />
          <KPICard
            label="95% Confidence Interval"
            value={`[${result.confidence_interval_95[0]}, ${result.confidence_interval_95[1]}]`}
            subtext="Uncertainty range"
            contextNote="Standard normal error bounds"
            trend={{ value: 'Rigorous bounds', neutral: true }}
          />
          <KPICard
            label="Statistical Significance"
            value={`p = ${result.p_value}`}
            subtext={result.p_value <= 0.05 ? 'Statistically Significant (p < 0.05)' : 'Not Significant'}
            contextNote={`Sample N = ${result.sample_size}`}
            trend={{
              value: result.p_value <= 0.05 ? 'High Confidence' : 'Weak Signal',
              isPositive: result.p_value <= 0.05,
            }}
          />
          <KPICard
            label="Model Fit (R² Log-Log)"
            value={result.r_squared.toFixed(3)}
            subtext="Log-demand variance explained"
            contextNote={result.sufficiency}
            trend={{ value: `${Math.round(result.r_squared * 100)}% fit`, isPositive: result.r_squared > 0.4 }}
          />
        </div>
      )}

      {/* Price-Demand Scatter & Regression Curve */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Price-Demand Scatter Plot & Econometric Fitted Response
            </h3>
            <p className="text-xs text-slate-400">
              Transaction observations across varying promotional discounts and base price levels.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Daily POS Points
            </span>
            <span className="flex items-center gap-1.5 text-[#E2B774]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#E2B774]" /> Fitted OLS Demand Curve
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sortedFitted} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis
                dataKey="price"
                type="number"
                domain={['auto', 'auto']}
                stroke="#64748B"
                fontSize={11}
                tickFormatter={(v) => `$${v}`}
              />
              <YAxis
                dataKey="units"
                type="number"
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0F172A',
                  borderColor: '#334155',
                  fontSize: '11px',
                  borderRadius: '4px',
                }}
                formatter={(val: any, name: any) => [
                  `${val} units`,
                  name === 'units' ? 'Actual Sales' : 'Fitted Demand',
                ]}
                labelFormatter={(lbl: any) => `Price: $${lbl}`}
              />
              <Scatter name="Actual Units" dataKey="units" fill="#94A3B8" opacity={0.6} />
              <Line
                name="Fitted Demand"
                dataKey="fitted_units"
                stroke="#E2B774"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            Controlled Confounders:{' '}
            <span className="text-slate-200 font-mono">
              {result?.confounders_controlled.join(' · ') || 'Promotions, Weekend Day'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Sample Sufficiency: <span className="text-emerald-400 uppercase font-semibold">{result?.sufficiency}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
