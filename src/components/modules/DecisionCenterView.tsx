/**
 * SHOPMIND — Module 10: Constraint-Aware Decision Center
 * Multi-criteria ranking, transparent scoring weights, and trade-off explanations.
 */

import React, { useState } from 'react';
import {
  Sliders,
  CheckCircle,
  AlertTriangle,
  Award,
  HelpCircle,
  TrendingUp,
  Info,
} from 'lucide-react';
import {
  ScenarioSimulationResult,
  BusinessConstraints,
} from '../../types/retail.ts';
import { KPICard } from '../ui/KPICard.tsx';

interface DecisionCenterViewProps {
  scenarios: ScenarioSimulationResult[];
  constraints: BusinessConstraints;
  onUpdateConstraints: (c: BusinessConstraints) => void;
  onNavigate: (tab: string) => void;
}

export const DecisionCenterView: React.FC<DecisionCenterViewProps> = ({
  scenarios,
  constraints,
  onUpdateConstraints,
  onNavigate,
}) => {
  // Configurable weights
  const [profitWeight, setProfitWeight] = useState<number>(constraints.weights?.profit_weight || 0.5);
  const [stockoutWeight, setStockoutWeight] = useState<number>(constraints.weights?.stockout_weight || 0.3);
  const [leftoverWeight, setLeftoverWeight] = useState<number>(constraints.weights?.leftover_weight || 0.2);

  // Constraint thresholds
  const [minMargin, setMinMargin] = useState<number>(constraints.min_profit_margin_pct);
  const [maxStockout, setMaxStockout] = useState<number>(constraints.max_stock_out_risk_pct);

  React.useEffect(() => {
    setProfitWeight(constraints.weights?.profit_weight ?? 0.5);
    setStockoutWeight(constraints.weights?.stockout_weight ?? 0.3);
    setLeftoverWeight(constraints.weights?.leftover_weight ?? 0.2);
    setMinMargin(constraints.min_profit_margin_pct);
    setMaxStockout(constraints.max_stock_out_risk_pct);
  }, [constraints]);

  if (scenarios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 max-w-xl mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-5 text-[#E2B774] shadow-lg">
          <Sliders className="w-8 h-8" />
        </div>
        <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider mb-1.5">
          Constraint-Aware Decision Center
        </div>
        <h3 className="text-xl font-bold text-white tracking-tight mb-2">
          No Scenarios Available to Rank
        </h3>
        <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
          Create and simulate decision scenarios in Decision Studio to rank by profit margin, stock-out risk, and leftover inventory using your configured business weights.
        </p>
        <button
          onClick={() => onNavigate('decision_studio')}
          className="px-5 py-2.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 rounded transition-all cursor-pointer flex items-center gap-2 shadow-md"
        >
          <span>Create Scenario in Studio</span>
        </button>
      </div>
    );
  }

  const handleApplyConstraints = () => {
    onUpdateConstraints({
      ...constraints,
      min_profit_margin_pct: minMargin,
      max_stock_out_risk_pct: maxStockout,
      weights: {
        profit_weight: profitWeight,
        stockout_weight: stockoutWeight,
        leftover_weight: leftoverWeight,
      },
    });
  };

  // Re-rank scenarios by transparent multi-criteria decision score
  const rankedScenarios = [...scenarios].map(s => {
    const marginOk = s.profit_margin_pct >= minMargin;
    const stockoutOk = s.stock_out_risk_percent <= maxStockout;
    const priceFloorOk = constraints.min_price_floor <= 0 || s.effective_price >= constraints.min_price_floor;
    const priceCeilingOk = constraints.max_price_ceiling <= 0 || s.effective_price <= constraints.max_price_ceiling;
    const inventoryCoverageOk = constraints.min_inventory_coverage_units <= 0 || s.inventory >= constraints.min_inventory_coverage_units;
    const isFeasible = marginOk && stockoutOk && priceFloorOk && priceCeilingOk && inventoryCoverageOk;

    // Linear profit normalization: 0% to 100% margin scale (prevents collapsing ties at >= 50%)
    const normalizedProfit = Math.max(0, Math.min(100, s.profit_margin_pct));
    const normalizedStockout = Math.max(0, 100 - s.stock_out_risk_percent);
    const leftoverPct = s.inventory > 0 ? (s.leftover / s.inventory) * 100 : 0;
    const normalizedLeftover = Math.max(0, 100 - leftoverPct);

    const totalWeight = profitWeight + stockoutWeight + leftoverWeight || 1;
    const rawScore = isFeasible
      ? ((profitWeight * normalizedProfit +
          stockoutWeight * normalizedStockout +
          leftoverWeight * normalizedLeftover) /
          totalWeight)
      : Math.max(
          0,
          (((profitWeight * normalizedProfit + stockoutWeight * normalizedStockout) / totalWeight) * 0.4) - 10
        );

    // Precise unrounded score with 2 decimal places to resolve unexpected ties
    const score = Math.round(rawScore * 100) / 100;

    const currentConstraintViolations = [
      ...(!marginOk ? [`Margin ${s.profit_margin_pct}% is below the current ${minMargin}% floor`] : []),
      ...(!stockoutOk ? [`Stock-out risk ${s.stock_out_risk_percent}% exceeds the current ${maxStockout}% ceiling`] : []),
      ...(!priceFloorOk ? [`Effective price ${s.effective_price} is below the configured floor of ${constraints.min_price_floor}`] : []),
      ...(!priceCeilingOk ? [`Effective price ${s.effective_price} is above the configured ceiling of ${constraints.max_price_ceiling}`] : []),
      ...(!inventoryCoverageOk ? [`Inventory ${s.inventory} units is below minimum coverage of ${constraints.min_inventory_coverage_units} units`] : []),
    ];

    return {
      ...s,
      is_feasible: isFeasible,
      calculatedScore: score,
      currentConstraintViolations,
    };
  }).sort((a, b) => b.calculatedScore - a.calculatedScore);

  const topPick = rankedScenarios.find(s => s.is_feasible) || rankedScenarios[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Optimization Engine
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Constraint-Aware Decision Center
          </h2>
          <div className="text-xs text-slate-400 mt-0.5">
            Transparent multi-criteria ranking under configurable business constraints.
          </div>
        </div>

        <button
          onClick={handleApplyConstraints}
          className="px-3.5 py-1.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 rounded transition-all cursor-pointer shadow-sm"
        >
          Apply Constraint Thresholds
        </button>
      </div>

      {/* Constraints & Weighting Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Constraints Tuning */}
        <div className="lg:col-span-6 bg-[#0F172A] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-white">
              Hard Business Boundary Constraints
            </h3>
            <p className="text-xs text-slate-400">
              Scenarios violating any floor or ceiling are marked ineligible for executive sign-off.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Minimum Required Operating Profit Margin</span>
                <span className="font-mono text-white font-semibold">{minMargin}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="50"
                step="5"
                value={minMargin}
                onChange={(e) => setMinMargin(parseInt(e.target.value, 10))}
                className="w-full accent-[#E2B774] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Maximum Tolerated Stock-Out Risk</span>
                <span className="font-mono text-white font-semibold">{maxStockout}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                step="1"
                value={maxStockout}
                onChange={(e) => setMaxStockout(parseInt(e.target.value, 10))}
                className="w-full accent-[#E2B774] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Transparent Weights */}
        <div className="lg:col-span-6 bg-[#0F172A] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-white">
              Transparent Multi-Criteria Decision Weights
            </h3>
            <p className="text-xs text-slate-400">
              Weights reflect strategic executive priorities between margin growth and supply assurance.
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Profit Contribution Weight</span>
                <span className="font-mono text-[#E2B774] font-semibold">{Math.round(profitWeight * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={profitWeight}
                onChange={(e) => setProfitWeight(parseFloat(e.target.value))}
                className="w-full accent-[#E2B774] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Stock-Out Avoidance Weight</span>
                <span className="font-mono text-[#E2B774] font-semibold">{Math.round(stockoutWeight * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.6"
                step="0.05"
                value={stockoutWeight}
                onChange={(e) => setStockoutWeight(parseFloat(e.target.value))}
                className="w-full accent-[#E2B774] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Inventory Efficiency (Minimal Leftover)</span>
                <span className="font-mono text-[#E2B774] font-semibold">{Math.round(leftoverWeight * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.5"
                step="0.05"
                value={leftoverWeight}
                onChange={(e) => setLeftoverWeight(parseFloat(e.target.value))}
                className="w-full accent-[#E2B774] cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Top Ranked Strategy Card */}
      {topPick && (
        <div className="p-5 bg-gradient-to-r from-[#0F172A] to-slate-900 border border-[#E2B774]/50 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-lg">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#E2B774] uppercase tracking-wider">
              <Award className="w-4 h-4" />
              <span>{topPick.is_feasible ? 'Highest Ranked Feasible Commercial Alternative' : 'Best Available Alternative — Constraints Still Breached'}</span>
            </div>
            <h3 className="text-lg font-bold text-white">
              {topPick.name}
            </h3>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Generates an estimated <span className="font-mono font-bold text-emerald-400">${topPick.estimated_profit.toLocaleString()}</span> in direct operating profit with <span className="font-mono text-white">{topPick.profit_margin_pct}%</span> margin and stock-out risk of <span className="font-mono text-white">{topPick.stock_out_risk_percent}%</span>.
              {topPick.is_feasible
                ? ' This alternative passes the currently configured margin, stock-out, price, and inventory constraints.'
                : ' No candidate currently satisfies both active constraints. This is the highest-scoring available option, not a constraint-compliant recommendation.'}
            </p>
            {!topPick.is_feasible && (
              <ul className="mt-2 list-disc list-inside text-xs text-amber-300 space-y-1">
                {topPick.currentConstraintViolations.map((violation, index) => <li key={index}>{violation}</li>)}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-6 shrink-0 font-mono">
            <div className="text-center">
              <div className="text-[10px] text-slate-400 uppercase font-sans">Multi-Criteria Score</div>
              <div className="text-3xl font-bold text-[#E2B774] tabular-nums mt-0.5">
                {topPick.calculatedScore.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-500 font-sans">out of 100.00</div>
            </div>

            <button
              onClick={() => onNavigate('decision_studio')}
              className="px-4 py-2.5 text-xs font-semibold bg-[#E2B774] hover:bg-[#d8a860] text-[#0B1120] rounded transition-colors cursor-pointer"
            >
              Simulate in Studio →
            </button>
          </div>
        </div>
      )}

      {/* Full Ranked Table */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-white mb-3">
          Comprehensive Ranked Alternative Candidates
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-sans">
              <tr>
                <th className="py-2.5 px-4 w-12 text-center">Rank</th>
                <th className="py-2.5 px-4">Scenario Alternative</th>
                <th className="py-2.5 px-4">SKU Name</th>
                <th className="py-2.5 px-4 text-right">Profit ($)</th>
                <th className="py-2.5 px-4 text-right">Margin %</th>
                <th className="py-2.5 px-4 text-right">Stock-Out Risk</th>
                <th className="py-2.5 px-4 text-center">Eligibility</th>
                <th className="py-2.5 px-4 text-right">Decision Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 tabular-nums">
              {rankedScenarios.map((s, idx) => (
                <tr key={s.scenario_id} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 text-center font-bold text-[#E2B774]">#{idx + 1}</td>
                  <td className="py-2.5 px-4 font-sans font-medium text-white">{s.name}</td>
                  <td className="py-2.5 px-4 font-sans text-slate-400">{s.product_name}</td>
                  <td className="py-2.5 px-4 text-right font-bold text-emerald-400">${s.estimated_profit.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right">{s.profit_margin_pct}%</td>
                  <td className="py-2.5 px-4 text-right">
                    <span className={s.stock_out_risk_percent > maxStockout ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                      {s.stock_out_risk_percent}%
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-center font-sans">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                      s.is_feasible
                        ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/80'
                        : 'bg-rose-950/40 text-rose-400 border border-rose-800/80'
                    }`}>
                      {s.is_feasible ? 'Feasible' : 'Violates Constraint'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-white text-sm font-mono">
                    {s.calculatedScore.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 leading-relaxed space-y-1">
          <div className="font-semibold text-slate-300">Methodological Score Normalization & Weight Division:</div>
          <div>• Margin Score: Continuous 0–100% linear normalization without clipping at 50%, preventing unexpected ties between healthy margins.</div>
          <div>• Stock-out Score: 100 - StockOutRisk% (0% stockout = 100 points).</div>
          <div>• Leftover Score: 100 - (Leftover / Inventory × 100).</div>
          <div>• Score Aggregation: Raw score divided by total weights (w_profit + w_stockout + w_leftover), and rendered with 2-decimal precision.</div>
          <div>• Infeasible Alternatives: The profit/stock-out subscore is reduced to 40% and a further 10-point penalty is applied; all violations remain visible.</div>
        </div>
      </div>
    </div>
  );
};
