/**
 * SHOPMIND — Editorial Landing Page
 * Headline: "See what sells. Know what's next."
 * Cinematic deep navy, champagne gold, refined typography, and interactive live preview.
 */

import React, { useState } from 'react';
import {
  ArrowRight,
  TrendingUp,
  BarChart2,
  ShieldCheck,
  Calculator,
  Sliders,
  Check,
  Layers,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { computeDecisionOutcomes } from '../../services/calculations.ts';
import { formatCurrency } from '../../services/formatting.ts';

interface LandingViewProps {
  onEnterWorkspace: (targetTab?: string) => void;
  onOpenUpload: () => void;
  onLoadDemo: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onEnterWorkspace,
  onOpenUpload,
  onLoadDemo,
}) => {
  // Live interactive preview simulator in the hero
  const [heroPrice, setHeroPrice] = useState<number>(240);
  const [heroCost, setHeroCost] = useState<number>(80);
  const [heroInventory, setHeroInventory] = useState<number>(180);
  const [heroDemand, setHeroDemand] = useState<number>(210);

  const heroSimulation = computeDecisionOutcomes({
    demand: heroDemand,
    inventory: heroInventory,
    selling_price: heroPrice,
    unit_cost: heroCost,
    promotion_cost: 300,
    advertising_cost: 450,
  });

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col">
      {/* Hero Section */}
      <section className="relative pt-16 pb-20 px-6 sm:px-12 max-w-7xl mx-auto w-full">
        {/* Subtle geometric background grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#E2B774_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03] pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Editorial Headline & Narrative */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#E2B774]">
              <span>Full-Stack Retail Intelligence</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">Decision Science Platform</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.08] text-balance">
              See what sells. <br />
              <span className="bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] bg-clip-text text-transparent">
                Know what's next.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-300 max-w-2xl font-normal leading-relaxed">
              Every displayed analytical result originates directly from your active dataset, fitted chronological models, or mathematically verified simulation assumptions. No hallucinated metrics. No ungrounded projections.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                onClick={() => onEnterWorkspace('overview')}
                className="px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 transition-all rounded shadow-lg shadow-[#E2B774]/10 cursor-pointer flex items-center gap-2"
              >
                <span>Launch Analytics Console</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onLoadDemo}
                className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#F3E5CA] bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/80 rounded transition-all cursor-pointer flex items-center gap-2"
              >
                <BarChart2 className="w-4 h-4 text-emerald-300" />
                <span>Explore Demo Dataset</span>
              </button>

              <button
                onClick={onOpenUpload}
                className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-200 bg-[#1E293B]/80 hover:bg-[#1E293B] border border-slate-700/80 rounded transition-all cursor-pointer flex items-center gap-2"
              >
                <Database className="w-4 h-4 text-[#E2B774]" />
                <span>Ingest Custom POS Data</span>
              </button>
            </div>

            {/* Quick Guarantees */}
            <div className="pt-6 border-t border-slate-800/80 grid grid-cols-3 gap-4 text-xs text-slate-400">
              <div>
                <div className="font-semibold text-white">Chronological Splits</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Zero target leakage</div>
              </div>
              <div>
                <div className="font-semibold text-white">Verified Formulas</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Unit-tested economics</div>
              </div>
              <div>
                <div className="font-semibold text-white">Demand Regimes</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Clustered volatility</div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Live Decision Card */}
          <div className="lg:col-span-5">
            <div className="bg-[#0F172A] border border-slate-800/90 rounded-lg p-6 shadow-2xl relative">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-[#E2B774] tracking-wider">
                    Illustrative Mechanism Demo
                  </div>
                  <div className="text-sm font-bold text-white">
                    Example Decision Simulator
                  </div>
                </div>
                <div className="text-[11px] font-mono text-emerald-400">
                  Formula Engine Active
                </div>
              </div>

              <p className="text-[10px] text-slate-500 mb-3">
                Example inputs only — this interactive demonstration is not connected to an uploaded dataset. Currency is intentionally unspecified here.
              </p>

              {/* Sliders */}
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Retail Selling Price (amount units)</span>
                    <span className="font-mono text-white font-semibold">{formatCurrency(heroPrice, 'UNSPECIFIED')}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="450"
                    step="5"
                    value={heroPrice}
                    onChange={(e) => setHeroPrice(parseFloat(e.target.value))}
                    className="w-full accent-[#E2B774] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Unit Cost (COGS · amount units)</span>
                    <span className="font-mono text-white font-semibold">{formatCurrency(heroCost, 'UNSPECIFIED')}</span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="180"
                    step="5"
                    value={heroCost}
                    onChange={(e) => setHeroCost(parseFloat(e.target.value))}
                    className="w-full accent-[#E2B774] cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Inventory Ceiling</span>
                      <span className="font-mono text-white font-semibold">{heroInventory}</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="350"
                      step="10"
                      value={heroInventory}
                      onChange={(e) => setHeroInventory(parseInt(e.target.value, 10))}
                      className="w-full accent-[#E2B774] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Assumed Demand</span>
                      <span className="font-mono text-white font-semibold">{heroDemand}</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="350"
                      step="10"
                      value={heroDemand}
                      onChange={(e) => setHeroDemand(parseInt(e.target.value, 10))}
                      className="w-full accent-[#E2B774] cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Live Outcome Calculations Grid */}
              <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-3">
                <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-medium">Fulfilled Units</div>
                  <div className="text-base font-bold text-white font-mono tabular-nums">
                    {heroSimulation.fulfilled}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    min(demand, inventory)
                  </div>
                </div>

                <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-medium">Estimated Profit</div>
                  <div className="text-base font-bold text-[#E2B774] font-mono tabular-nums">
                    {formatCurrency(heroSimulation.estimated_profit, 'UNSPECIFIED')}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    (P - C)*F - Promo - Ad
                  </div>
                </div>

                <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-medium">Stock-Out Risk</div>
                  <div className={`text-base font-bold font-mono tabular-nums ${
                    heroSimulation.stock_out_risk_percent > 15 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {heroSimulation.stock_out_risk_percent}%
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    max(0, (D-I)/D)
                  </div>
                </div>

                <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-medium">Unmet Demand</div>
                  <div className="text-base font-bold text-slate-200 font-mono tabular-nums">
                    {heroSimulation.unmet} units
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    max(demand - inv, 0)
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <button
                  onClick={() => onEnterWorkspace('decision_studio')}
                  className="w-full py-2.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Explore Full 12-Module Workspace</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Overview Section */}
      <section className="py-16 px-6 sm:px-12 bg-[#0F172A]/60 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#E2B774] mb-2">
              End-to-End Retail Intelligence Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance">
              Engineered for empirical rigor, from raw POS ingestion to constraint-aware execution.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-[#0B1120] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded bg-[#E2B774]/10 text-[#E2B774] flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">
                1. Data Health & Ingestion
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Configurable CSV column mapping, date parsing, duplicate row detection, negative price guards, and comprehensive completeness scoring.
              </p>
              <button
                onClick={() => onEnterWorkspace('quality')}
                className="text-xs font-semibold text-[#E2B774] hover:underline cursor-pointer flex items-center gap-1"
              >
                Inspect Data Quality Scorecard →
              </button>
            </div>

            <div className="p-6 bg-[#0B1120] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded bg-[#E2B774]/10 text-[#E2B774] flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">
                2. Chronological Forecasting
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Chronological train/test splits that prevent target leakage. Evaluates MAE, RMSE, and mathematically valid R² alongside residual diagnostics.
              </p>
              <button
                onClick={() => onEnterWorkspace('forecasting')}
                className="text-xs font-semibold text-[#E2B774] hover:underline cursor-pointer flex items-center gap-1"
              >
                Run Model Evaluations →
              </button>
            </div>

            <div className="p-6 bg-[#0B1120] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded bg-[#E2B774]/10 text-[#E2B774] flex items-center justify-center mb-4">
                <Sliders className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">
                3. Constraint-Aware Decisions
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Simulate business decisions under explicit profit margin floors, stock-out limits, and inventory caps with transparent multi-criteria scoring.
              </p>
              <button
                onClick={() => onEnterWorkspace('decision_center')}
                className="text-xs font-semibold text-[#E2B774] hover:underline cursor-pointer flex items-center gap-1"
              >
                Review Decision Center →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto py-8 px-6 border-t border-slate-800 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-semibold text-slate-400">SHOPMIND Platform</span> · Built for empirical retail decision science.
          </div>
          <div className="font-mono text-[11px] text-slate-600">
            Node.js / Express / Vite / TypeScript · Port 3000
          </div>
        </div>
      </footer>
    </div>
  );
};
