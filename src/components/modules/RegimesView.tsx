/**
 * SHOPMIND — Module 5: Demand-Regime Analysis
 * Detection of High, Normal, and Low demand regimes with model error evaluation by regime.
 */

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Layers,
  Calendar,
  AlertCircle,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';
import { KPICard } from '../ui/KPICard.tsx';
import { DatasetMetadata } from '../../types/retail.ts';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { EmptyDatasetState } from '../ui/EmptyDatasetState.tsx';

interface RegimesViewProps {
  metadata: DatasetMetadata | null;
  onOpenUpload?: () => void;
}

export const RegimesView: React.FC<RegimesViewProps> = ({ metadata, onOpenUpload }) => {
  if (!metadata || metadata.row_count === 0) {
    return (
      <EmptyDatasetState
        moduleName="Demand-Regime Analysis"
        description="Upload a CSV dataset to detect High, Normal, and Low demand regimes with rolling Z-scores and evaluate forecast model error across volatility regimes."
        onOpenUpload={onOpenUpload || (() => {})}
      />
    );
  }

  const productOptions = metadata.product_items && metadata.product_items.length > 0
    ? metadata.product_items
    : (metadata.products || []).map(p => ({ id: p, name: p }));

  const [selectedProduct, setSelectedProduct] = useState<string>(productOptions[0]?.id || '');
  const [regimeData, setRegimeData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (productOptions.length > 0 && !productOptions.some(p => p.id === selectedProduct)) {
      setSelectedProduct(productOptions[0].id);
    }
  }, [productOptions, selectedProduct]);

  useEffect(() => {
    const fetchRegimes = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/regimes?product_id=${selectedProduct}`);
        if (res.ok) {
          const data = await res.json();
          setRegimeData(data);
        }
      } catch (err) {
        console.error('Failed to load regimes:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRegimes();
  }, [selectedProduct]);

  const summary = regimeData?.summary || [];
  const modelErrors = regimeData?.model_error_by_regime || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Research-Oriented Analytics
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Demand-Regime Detection & State Breakdown
          </h2>
          <div className="text-xs text-slate-400 mt-0.5">
            Statistical separation of structural demand shifts from daily noise.
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

      {/* Threshold & Methodology Banner */}
      <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#E2B774]/15 text-[#E2B774] flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-white">Documented Detection Methodology</div>
            <div className="text-slate-400 mt-0.5">
              {regimeData?.threshold_used || '14-day rolling window Z-Score (High: z > +0.95, Low: z < -0.95)'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 font-mono text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> High Demand (Surge)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Normal Baseline
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Low Demand (Trough)
          </span>
        </div>
      </div>

      {/* Regime Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summary.map((item: any) => {
          const isHigh = item.regime === 'high';
          const isLow = item.regime === 'low';
          return (
            <div
              key={item.regime}
              className="p-4 bg-[#0F172A] border border-slate-800 rounded-lg space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  {item.regime} Demand Regime
                </span>
                <span className={`text-xs font-mono font-bold ${
                  isHigh ? 'text-emerald-400' : isLow ? 'text-amber-400' : 'text-slate-300'
                }`}>
                  {item.percentage}% of Days
                </span>
              </div>

              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                {item.average_demand} <span className="text-xs font-sans text-slate-400 font-normal">avg units/day</span>
              </div>

              <div className="text-xs text-slate-400 flex justify-between pt-2 border-t border-slate-800/80">
                <span>Avg Realized Price:</span>
                <span className="font-mono text-white">${item.average_price.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Model Error by Regime Card */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
        <div className="mb-4 pb-3 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">
            Model Forecast Accuracy Segmented by Demand Regime
          </h3>
          <p className="text-xs text-slate-400">
            Assessing where standard time-series algorithms suffer highest residual dispersion.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          {modelErrors.map((me: any) => (
            <div key={me.regime} className="p-3 bg-slate-900 rounded border border-slate-800">
              <div className="text-slate-400 capitalize font-sans mb-1">{me.regime} Regime MAE</div>
              <div className="text-lg font-bold text-white tabular-nums">
                {me.mae} units error
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-sans">
                Sample: {me.sample_size} test observations
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 leading-relaxed">
          <span className="font-semibold text-white">Empirical Takeaway:</span> Error rates in High Demand regimes typically widen due to promotional stocking rushes and holiday surges. Dynamic safety stock formulas should increase buffer targets during detected High Regimes.
        </div>
      </div>
    </div>
  );
};
