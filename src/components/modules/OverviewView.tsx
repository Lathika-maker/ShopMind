/**
 * SHOPMIND — Module 1: Overview Dashboard
 * Executive retail telemetry, demand trends preview, regime distributions, and action items.
 */

import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Package,
  DollarSign,
  AlertCircle,
  ArrowRight,
  Database,
  Sliders,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { KPICard } from '../ui/KPICard.tsx';
import { EmptyDatasetState } from '../ui/EmptyDatasetState.tsx';
import { DatasetMetadata, DataQualityReport, ScenarioSimulationResult } from '../../types/retail.ts';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface OverviewViewProps {
  metadata: DatasetMetadata | null;
  quality: DataQualityReport | null;
  scenarios: ScenarioSimulationResult[];
  onNavigate: (tab: string) => void;
  onOpenUpload: () => void;
}

interface MonthlyDemandPoint {
  period: string;
  units_sold: number;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  metadata,
  quality,
  scenarios,
  onNavigate,
  onOpenUpload,
}) => {
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyDemandPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!metadata) {
      setMonthlyTrend([]);
      return () => { cancelled = true; };
    }

    fetch('/api/dataset/trend')
      .then(response => {
        if (!response.ok) throw new Error('Unable to load demand trend.');
        return response.json();
      })
      .then((data: MonthlyDemandPoint[]) => {
        if (!cancelled) setMonthlyTrend(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setMonthlyTrend([]);
      });

    return () => { cancelled = true; };
  }, [metadata?.id]);

  if (!metadata || !quality || metadata.row_count === 0) {
    return (
      <EmptyDatasetState
        moduleName="Retail Decision Cockpit"
        description="Upload a CSV dataset to view empirical sales telemetry, dataset health audits, demand trends, and constraint feasibility."
        onOpenUpload={onOpenUpload}
      />
    );
  }

  // All headline values are derived from the active dataset. A row-level mean is
  // labelled as such; it is not described as daily demand unless dates were aggregated.
  const unitsStat = quality.summary_stats.find(s => s.column === 'units_sold');
  const priceStat = quality.summary_stats.find(s => s.column === 'price');
  const averageUnitsPerObservation = unitsStat ? unitsStat.mean.toFixed(1) : 'N/A';
  const hasUnitPrice = metadata.available_fields?.price !== false;
  const avgSellingPrice = hasUnitPrice && priceStat && priceStat.mean > 0
    ? priceStat.mean.toFixed(2)
    : 'N/A';
  const peakPeriod = monthlyTrend.reduce<MonthlyDemandPoint | null>(
    (best, point) => !best || point.units_sold > best.units_sold ? point : best,
    null
  );
  const latestScenario = scenarios[0] || null;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Workspace Overview
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Retail Intelligence & Decision Cockpit
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('forecasting')}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <TrendingUp className="w-3.5 h-3.5 text-[#E2B774]" />
            <span>Train Forecast</span>
          </button>
          <button
            onClick={() => onNavigate('decision_studio')}
            className="px-3.5 py-1.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 rounded transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>New Decision Scenario</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Active Dataset Observations"
          value={metadata.row_count.toLocaleString()}
          subtext={`${metadata.products.length} products`}
          contextNote={metadata.is_synthetic ? 'Test fixture' : 'Uploaded CSV'}
          trend={{
            value: `${quality.completeness_score}% completeness`,
            isPositive: quality.completeness_score >= 95,
          }}
        />
        <KPICard
          label="Average Units per Record"
          value={averageUnitsPerObservation === 'N/A' ? 'N/A' : `${averageUnitsPerObservation} units`}
          subtext="Mean of mapped units_sold values"
          contextNote="Per row; not automatically per day"
          trend={{ value: 'From dataset', neutral: true }}
        />
        <KPICard
          label="Average Unit Price"
          value={avgSellingPrice === 'N/A' ? 'N/A' : `${avgSellingPrice}`}
          subtext={hasUnitPrice ? 'Across mapped observations' : 'No unit-price column mapped'}
          contextNote={hasUnitPrice ? 'From uploaded data' : 'Price analysis unavailable'}
          trend={{ value: hasUnitPrice ? 'Mapped' : 'Not provided', neutral: true }}
        />
        <KPICard
          label="Saved Decision Scenarios"
          value={scenarios.length}
          subtext={`${scenarios.filter(s => s.is_feasible).length} feasible`}
          contextNote={scenarios.length ? 'Calculated from current dataset' : 'No scenarios created yet'}
          trend={scenarios.length ? {
            value: scenarios.some(s => s.stock_out_risk_percent > 15) ? 'Risk warning' : 'Within limits',
            isPositive: !scenarios.some(s => s.stock_out_risk_percent > 15),
          } : { value: 'None yet', neutral: true }}
        />
      </div>

      {/* Main Charts & Telemetry Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Trend Visualization Card */}
        <div className="lg:col-span-8 bg-[#0F172A] border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div>
              <div className="text-xs font-semibold text-white tracking-tight">
                Monthly Units Sold (Active Dataset)
              </div>
              <div className="text-[11px] text-slate-400">
                Actual units_sold summed by calendar month from uploaded records
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#E2B774]" /> Actual Units Sold
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            {monthlyTrend.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">
                No dated demand observations are available to chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="demandFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E2B774" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#E2B774" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="period" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      fontSize: '12px',
                      borderRadius: '4px',
                    }}
                    itemStyle={{ color: '#E2B774' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="units_sold"
                    name="Units Sold"
                    stroke="#E2B774"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#demandFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>{peakPeriod ? `Highest month by recorded unit sales: ${peakPeriod.period} (${peakPeriod.units_sold.toLocaleString()} units)` : 'Peak period: not available'}</span>
            <button
              onClick={() => onNavigate('regimes')}
              className="text-[#E2B774] hover:underline font-medium cursor-pointer"
            >
              Analyze Demand Regimes →
            </button>
          </div>
        </div>

        {/* Right Sidebar: Active Dataset Summary & Actionable Recommendations */}
        <div className="lg:col-span-4 space-y-4">
          {/* Active Dataset Identity Card */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#E2B774] mb-1">
              Active Dataset
            </div>
            <div className="text-sm font-bold text-white mb-2 truncate">
              {metadata.name}
            </div>

            <div className="space-y-2 text-xs text-slate-300 py-2 border-y border-slate-800 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Date Horizon</span>
                <span>{metadata.date_range.start} → {metadata.date_range.end}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Total Observations</span>
                <span>{metadata.row_count} rows</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Data Quality Score</span>
                <span className="text-emerald-400">{quality.completeness_score} / 100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Status</span>
                <span className="text-[#E2B774]">
                  {metadata.is_synthetic ? 'Test fixture' : 'Uploaded CSV'}
                </span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => onNavigate('explorer')}
                className="flex-1 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-center transition-colors cursor-pointer"
              >
                Inspect Records
              </button>
              <button
                onClick={onOpenUpload}
                className="px-3 py-2 text-xs font-semibold bg-[#E2B774]/15 hover:bg-[#E2B774]/25 text-[#E2B774] rounded transition-colors cursor-pointer"
              >
                Switch CSV
              </button>
            </div>
          </div>

          {/* Data-backed next action */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#E2B774] mb-2">
              <AlertCircle className="w-4 h-4" />
              <span>{latestScenario ? 'Latest Saved Scenario' : 'Recommended Next Step'}</span>
            </div>
            {latestScenario ? (
              <>
                <h4 className="text-sm font-bold text-white mb-1.5">{latestScenario.name}</h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Demand source: {latestScenario.demand_source.replace('_', ' ')}. Estimated revenue: ${latestScenario.revenue.toLocaleString()}, estimated profit: ${latestScenario.estimated_profit.toLocaleString()}, stockout exposure: {latestScenario.stock_out_risk_percent}%.
                </p>
              </>
            ) : (
              <>
                <h4 className="text-sm font-bold text-white mb-1.5">No scenario results yet</h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Create a scenario from the uploaded dataset after reviewing which fields are available. SHOPMIND will not invent price, cost, or inventory data to fill missing columns.
                </p>
              </>
            )}
            <button
              onClick={() => onNavigate('decision_studio')}
              className="text-xs font-semibold text-[#E2B774] hover:underline flex items-center gap-1 cursor-pointer"
            >
              {latestScenario ? 'Review Scenario →' : 'Create Decision Scenario →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
