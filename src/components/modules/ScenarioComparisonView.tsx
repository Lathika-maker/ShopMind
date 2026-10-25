/**
 * SHOPMIND — Module 9: Scenario Comparison Matrix
 * Multi-scenario side-by-side comparison, tradeoff visualization, and delta analysis.
 */

import React, { useState } from 'react';
import {
  GitCompare,
  ArrowRight,
  Sliders,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { ScenarioSimulationResult, DatasetMetadata } from '../../types/retail.ts';
import { formatCurrency, currencyLabel } from '../../services/formatting.ts';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

interface ScenarioComparisonViewProps {
  metadata: DatasetMetadata | null;
  scenarios: ScenarioSimulationResult[];
  onNavigate: (tab: string) => void;
}

export const ScenarioComparisonView: React.FC<ScenarioComparisonViewProps> = ({
  metadata,
  scenarios,
  onNavigate,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    scenarios.slice(0, 3).map(s => s.scenario_id)
  );

  React.useEffect(() => {
    const validIds = selectedIds.filter(id => scenarios.some(s => s.scenario_id === id));
    const nextIds = validIds.length > 0 ? validIds : scenarios.slice(0, 3).map(s => s.scenario_id);
    if (nextIds.join('|') !== selectedIds.join('|')) setSelectedIds(nextIds);
  }, [scenarios, selectedIds]);

  if (scenarios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 max-w-xl mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-5 text-[#E2B774] shadow-lg">
          <GitCompare className="w-8 h-8" />
        </div>
        <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider mb-1.5">
          Scenario Comparison Matrix
        </div>
        <h3 className="text-xl font-bold text-white tracking-tight mb-2">
          No Scenarios Available to Compare
        </h3>
        <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
          Create and simulate decision scenarios in Decision Studio to compare margin, revenue, stock-out risk, and fulfilled volume side-by-side.
        </p>
        <button
          onClick={() => onNavigate('decision_studio')}
          className="px-5 py-2.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 rounded transition-all cursor-pointer flex items-center gap-2 shadow-md"
        >
          <span>Create Scenario in Studio</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      if (selectedIds.length > 1) {
        setSelectedIds(selectedIds.filter(i => i !== id));
      }
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const comparedScenarios = scenarios.filter(s => selectedIds.includes(s.scenario_id));

  // Scatter chart data: Tradeoff between Estimated Profit ($) and Stock-Out Risk (%)
  const tradeoffData = scenarios.map(s => ({
    name: s.name,
    profit: s.estimated_profit,
    risk: s.stock_out_risk_percent,
    margin: s.profit_margin_pct,
    revenue: s.revenue,
    feasible: s.is_feasible,
    id: s.scenario_id,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Decision Governance
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Commercial Scenario Comparison Matrix
          </h2>
          <div className="text-xs text-slate-400 mt-0.5">
            Cross-evaluate margins, fulfillment, revenue, and stock-out exposure.
          </div>
        </div>

        <button
          onClick={() => onNavigate('decision_studio')}
          className="px-3.5 py-1.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 rounded transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>New Scenario</span>
        </button>
      </div>

      {/* Scenario Selector Chips */}
      <div className="p-3 bg-[#0F172A] border border-slate-800 rounded-lg flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400 font-medium mr-2">Select to Compare:</span>
        {scenarios.map(s => {
          const isSelected = selectedIds.includes(s.scenario_id);
          return (
            <button
              key={s.scenario_id}
              onClick={() => toggleSelect(s.scenario_id)}
              className={`px-3 py-1.5 rounded transition-all cursor-pointer text-xs font-medium flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-slate-800 text-white border border-[#E2B774]'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${s.is_feasible ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <span className="truncate max-w-[180px]">{s.name}</span>
            </button>
          );
        })}
      </div>

      {/* Side-by-Side Comparison Table */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">
            Side-by-Side Commercial Metrics Matrix
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-sans">
              <tr>
                <th className="py-3 px-4 w-52">Strategic Metric</th>
                {comparedScenarios.map(s => (
                  <th key={s.scenario_id} className="py-3 px-4 text-right">
                    <div className="font-bold text-white text-xs">{s.name}</div>
                    <div className="text-[10px] text-[#E2B774] font-normal">{s.product_name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 tabular-nums">
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-4 font-sans font-medium text-slate-400">Effective Selling Price</td>
                {comparedScenarios.map(s => (
                  <td key={s.scenario_id} className="py-2.5 px-4 text-right font-bold text-white">
                    ${s.effective_price.toFixed(2)}
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-4 font-sans font-medium text-slate-400">Promotional Discount %</td>
                {comparedScenarios.map(s => (
                  <td key={s.scenario_id} className="py-2.5 px-4 text-right">
                    {s.discount_pct > 0 ? `-${s.discount_pct}%` : '0% (Full Price)'}
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-4 font-sans font-medium text-slate-400">Model Predicted Demand</td>
                {comparedScenarios.map(s => (
                  <td key={s.scenario_id} className="py-2.5 px-4 text-right">
                    {s.demand} units
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-4 font-sans font-medium text-slate-400">Allocated Inventory</td>
                {comparedScenarios.map(s => (
                  <td key={s.scenario_id} className="py-2.5 px-4 text-right">
                    {s.inventory} units
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-4 font-sans font-medium text-slate-400">Fulfilled Demand Volume</td>
                {comparedScenarios.map(s => (
                  <td key={s.scenario_id} className="py-2.5 px-4 text-right text-slate-200">
                    {s.fulfilled} units
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-4 font-sans font-medium text-slate-400">Gross Sales Revenue</td>
                {comparedScenarios.map(s => (
                  <td key={s.scenario_id} className="py-2.5 px-4 text-right font-bold text-white">
                    ${s.revenue.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-800/30 bg-slate-900/40">
                <td className="py-2.5 px-4 font-sans font-semibold text-[#E2B774]">Estimated Operating Profit</td>
                {comparedScenarios.map(s => (
                  <td key={s.scenario_id} className="py-2.5 px-4 text-right font-bold text-emerald-400 text-sm">
                    ${s.estimated_profit.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-4 font-sans font-medium text-slate-400">Profit Margin %</td>
                {comparedScenarios.map(s => (
                  <td key={s.scenario_id} className="py-2.5 px-4 text-right">
                    {s.profit_margin_pct}%
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-4 font-sans font-medium text-slate-400">Stock-Out Vulnerability Risk</td>
                {comparedScenarios.map(s => (
                  <td key={s.scenario_id} className="py-2.5 px-4 text-right">
                    <span className={s.stock_out_risk_percent > 15 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                      {s.stock_out_risk_percent}%
                    </span>
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-4 font-sans font-medium text-slate-400">Leftover Inventory</td>
                {comparedScenarios.map(s => (
                  <td key={s.scenario_id} className="py-2.5 px-4 text-right text-slate-400">
                    {s.leftover} units
                  </td>
                ))}
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-4 font-sans font-medium text-slate-400">Constraint Feasibility</td>
                {comparedScenarios.map(s => (
                  <td key={s.scenario_id} className="py-2.5 px-4 text-right font-sans">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                      s.is_feasible
                        ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/80'
                        : 'bg-rose-950/40 text-rose-400 border border-rose-800/80'
                    }`}>
                      {s.is_feasible ? 'Feasible' : 'Violates Constraints'}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Tradeoff Scatter Visualization */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
        <div className="mb-4 pb-3 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">
            Strategic Efficient Frontier: Profit ($) vs. Stock-Out Risk (%)
          </h3>
          <p className="text-xs text-slate-400">
            Optimal alternatives lie in the top-left quadrant (high profit with minimal stockout exposure).
          </p>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 30, left: 25, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis
                dataKey="risk"
                name="Stock-Out Risk"
                type="number"
                domain={[0, (dataMax: number) => Math.max(25, Math.ceil((dataMax || 0) * 1.25))]}
                tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                stroke="#64748B"
                fontSize={11}
              />
              <YAxis
                dataKey="profit"
                name="Estimated Profit"
                type="number"
                tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                stroke="#64748B"
                fontSize={11}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0F172A',
                  borderColor: '#334155',
                  fontSize: '11px',
                  borderRadius: '4px',
                }}
                formatter={(val: any, name: any) => [
                  name === 'Estimated Profit' ? `$${Number(val).toLocaleString()}` : `${val}%`,
                  name,
                ]}
              />
              <Scatter name="Scenarios" data={tradeoffData}>
                {tradeoffData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.feasible ? '#E2B774' : '#F43F5E'}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
