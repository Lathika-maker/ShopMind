/**
 * SHOPMIND — Module 8: Uncertainty-Aware Stress Testing
 * Compares Baseline, Conservative-Demand (-25%), and High-Demand (+35%) scenarios.
 */

import React, { useState } from 'react';
import {
  Flame,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { ScenarioSimulationResult, StressTestResult, DatasetMetadata } from '../../types/retail.ts';
import { formatCurrency, currencyLabel } from '../../services/formatting.ts';
import { runStressTest } from '../../services/calculations.ts';
import { KPICard } from '../ui/KPICard.tsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

interface StressTestingViewProps {
  metadata: DatasetMetadata | null;
  scenarios: ScenarioSimulationResult[];
  onNavigate: (tab: string) => void;
}

export const StressTestingView: React.FC<StressTestingViewProps> = ({
  metadata,
  scenarios,
  onNavigate,
}) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    scenarios[0]?.scenario_id || ''
  );
  const [conservativeDropPct, setConservativeDropPct] = useState<number>(25);
  const [highSurgePct, setHighSurgePct] = useState<number>(35);

  React.useEffect(() => {
    if (scenarios.length > 0 && !scenarios.some(s => s.scenario_id === selectedScenarioId)) {
      setSelectedScenarioId(scenarios[0].scenario_id);
    } else if (scenarios.length === 0 && selectedScenarioId !== '') {
      setSelectedScenarioId('');
    }
  }, [scenarios, selectedScenarioId]);

  if (scenarios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 max-w-xl mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-5 text-[#E2B774] shadow-lg">
          <Flame className="w-8 h-8" />
        </div>
        <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider mb-1.5">
          Scenario Stress Testing
        </div>
        <h3 className="text-xl font-bold text-white tracking-tight mb-2">
          No Scenarios Available for Stress Testing
        </h3>
        <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
          Create and simulate decision scenarios in Decision Studio to test your inventory and pricing strategy against hypothetical volume shocks that you can adjust below.
        </p>
        <button
          onClick={() => onNavigate('decision_studio')}
          className="px-5 py-2.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 rounded transition-all cursor-pointer flex items-center gap-2 shadow-md"
        >
          <span>Open Decision Studio</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }


  const activeScenario = scenarios.find(s => s.scenario_id === selectedScenarioId) || scenarios[0];

  const stressResult: StressTestResult | null = activeScenario
    ? runStressTest(activeScenario, {
        name: activeScenario.name,
        product_id: activeScenario.product_id,
        selling_price: activeScenario.selling_price,
        unit_cost: activeScenario.unit_cost,
        discount_pct: activeScenario.discount_pct,
        promotion_cost: activeScenario.promotion_cost,
        advertising_cost: activeScenario.advertising_cost,
        inventory: activeScenario.inventory,
      }, undefined, conservativeDropPct, highSurgePct)
    : null;

  const comparisonChartData = stressResult
    ? [
        {
          case: `Conservative (-${conservativeDropPct}%)`,
          demand: stressResult.conservative_case.demand,
          fulfilled: stressResult.conservative_case.fulfilled,
          profit: stressResult.conservative_case.estimated_profit,
          stockout: stressResult.conservative_case.stock_out_risk_percent,
        },
        {
          case: 'Baseline Forecast',
          demand: stressResult.baseline.demand,
          fulfilled: stressResult.baseline.fulfilled,
          profit: stressResult.baseline.estimated_profit,
          stockout: stressResult.baseline.stock_out_risk_percent,
        },
        {
          case: `High Surge (+${highSurgePct}%)`,
          demand: stressResult.high_demand_case.demand,
          fulfilled: stressResult.high_demand_case.fulfilled,
          profit: stressResult.high_demand_case.estimated_profit,
          stockout: stressResult.high_demand_case.stock_out_risk_percent,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Risk & Uncertainty
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Scenario Stress Testing & Volatility Analysis
          </h2>
          <div className="text-xs text-slate-400 mt-0.5">
            Evaluate financial downside and stock-out shocks against extreme market conditions.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Target Scenario:</span>
          <select
            value={selectedScenarioId}
            onChange={(e) => setSelectedScenarioId(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-[#E2B774]"
          >
            {scenarios.map((s) => (
              <option key={s.scenario_id} value={s.scenario_id}>
                {s.name} ({s.product_name})
              </option>
            ))}
          </select>
        </div>
      </div>

      {stressResult && (
        <>
          <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Stress Assumptions</h3>
              <p className="text-xs text-slate-400 mt-1">
                Adjust hypothetical demand changes. These percentages are user-selected stress scenarios, not learned forecasts.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                  <label htmlFor="conservative-shock">Demand contraction</label>
                  <span className="font-mono text-[#E2B774]">−{conservativeDropPct}%</span>
                </div>
                <input
                  id="conservative-shock"
                  type="range"
                  min={0}
                  max={75}
                  step={5}
                  value={conservativeDropPct}
                  onChange={e => setConservativeDropPct(Number(e.target.value))}
                  className="w-full accent-[#E2B774]"
                />
                <div className="text-[10px] text-slate-500">Range: 0% to 75% below baseline</div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                  <label htmlFor="high-demand-shock">Demand surge</label>
                  <span className="font-mono text-[#E2B774]">+{highSurgePct}%</span>
                </div>
                <input
                  id="high-demand-shock"
                  type="range"
                  min={0}
                  max={150}
                  step={5}
                  value={highSurgePct}
                  onChange={e => setHighSurgePct(Number(e.target.value))}
                  className="w-full accent-[#E2B774]"
                />
                <div className="text-[10px] text-slate-500">Range: 0% to 150% above baseline</div>
              </div>
            </div>
          </div>

          {/* Stress Vulnerability KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard
              label="Max Profit Downside Exposure"
              value={`-$${stressResult.max_profit_loss.toLocaleString()}`}
              subtext={`Under -${conservativeDropPct}% demand contraction`}
              contextNote="Direct margin loss"
              trend={{ value: 'Downside Risk', isPositive: false }}
            />
            <KPICard
              label="Worst-Case Stock-Out Risk"
              value={`${stressResult.worst_stockout_risk}%`}
              subtext={`Under +${highSurgePct}% demand spike`}
              contextNote={`${stressResult.high_demand_case.unmet} unmet units`}
              trend={{
                value: stressResult.worst_stockout_risk > 20 ? 'High Vulnerability' : 'Acceptable',
                isPositive: stressResult.worst_stockout_risk <= 20,
              }}
            />
            <KPICard
              label="Excess Inventory Holding"
              value={`${stressResult.inventory_holding_risk_units} units`}
              subtext="Unsold stock in conservative case"
              contextNote="Working capital tie-up"
              trend={{ value: 'Holding Risk', neutral: true }}
            />
          </div>

          {/* Comparative Chart */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
            <div className="mb-4 pb-3 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Financial & Volume Comparison Across Demand Regimes
                </h3>
                <p className="text-xs text-slate-400">
                  Contrast estimated operating profit and fulfilled volume across stress states.
                </p>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonChartData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="case" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis
                    yAxisId="profit"
                    orientation="left"
                    stroke="#E2B774"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <YAxis
                    yAxisId="units"
                    orientation="right"
                    stroke="#94A3B8"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `${v} u`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      fontSize: '11px',
                      borderRadius: '4px',
                    }}
                    formatter={(val: any, name: any) => [
                      name.includes('Profit') ? `$${Number(val).toLocaleString()}` : `${val} units`,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar
                    yAxisId="profit"
                    dataKey="profit"
                    name="Estimated Profit ($)"
                    fill="#E2B774"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    yAxisId="units"
                    dataKey="fulfilled"
                    name="Fulfilled Units"
                    fill="#38BDF8"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Scenario Details Table */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-white mb-3">
              Stress Test Case Breakdown
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-sans">
                  <tr>
                    <th className="py-2.5 px-4">Case Scenario</th>
                    <th className="py-2.5 px-4 text-right">Assumed Demand</th>
                    <th className="py-2.5 px-4 text-right">Inventory</th>
                    <th className="py-2.5 px-4 text-right">Fulfilled</th>
                    <th className="py-2.5 px-4 text-right">Revenue</th>
                    <th className="py-2.5 px-4 text-right">Profit</th>
                    <th className="py-2.5 px-4 text-right">Stock-Out %</th>
                    <th className="py-2.5 px-4 text-right">Leftover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300 tabular-nums">
                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-sans font-medium text-amber-400">{`Conservative (-${conservativeDropPct}%)`}</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.conservative_case.demand}</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.conservative_case.inventory}</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.conservative_case.fulfilled}</td>
                    <td className="py-2.5 px-4 text-right">${stressResult.conservative_case.revenue.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right text-slate-200">${stressResult.conservative_case.estimated_profit.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.conservative_case.stock_out_risk_percent}%</td>
                    <td className="py-2.5 px-4 text-right text-amber-400 font-bold">{stressResult.conservative_case.leftover}</td>
                  </tr>
                  <tr className="hover:bg-slate-800/40 bg-slate-900/40">
                    <td className="py-2.5 px-4 font-sans font-medium text-white">Baseline Forecast</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.baseline.demand}</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.baseline.inventory}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-white">{stressResult.baseline.fulfilled}</td>
                    <td className="py-2.5 px-4 text-right">${stressResult.baseline.revenue.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-[#E2B774]">${stressResult.baseline.estimated_profit.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.baseline.stock_out_risk_percent}%</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.baseline.leftover}</td>
                  </tr>
                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-sans font-medium text-emerald-400">{`High Surge (+${highSurgePct}%)`}</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.high_demand_case.demand}</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.high_demand_case.inventory}</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.high_demand_case.fulfilled}</td>
                    <td className="py-2.5 px-4 text-right">${stressResult.high_demand_case.revenue.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400 font-bold">${stressResult.high_demand_case.estimated_profit.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right text-amber-400 font-bold">{stressResult.high_demand_case.stock_out_risk_percent}%</td>
                    <td className="py-2.5 px-4 text-right">{stressResult.high_demand_case.leftover}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
