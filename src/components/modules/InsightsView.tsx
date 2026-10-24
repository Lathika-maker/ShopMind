/**
 * SHOPMIND — Module 11: Explainable Insights & Diagnostics
 * 5-field structured empirical findings originating strictly from active data and fitted models.
 */

import React, { useState, useEffect } from 'react';
import {
  Lightbulb,
  AlertTriangle,
  Info,
  TrendingUp,
  ShieldCheck,
  Percent,
  Activity,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { InsightItem } from '../../types/retail.ts';

interface InsightsViewProps {
  onNavigate: (tab: string) => void;
}

export const InsightsView: React.FC<InsightsViewProps> = ({ onNavigate }) => {
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchInsights = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/insights');
        if (res.ok) {
          const data = await res.json();
          setInsights(data);
        }
      } catch (err) {
        console.error('Failed to load insights:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInsights();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Evidence-Based Diagnostics
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Explainable Insights & Governance Findings
          </h2>
          <div className="text-xs text-slate-400 mt-0.5">
            Every finding includes observed data, significance, actionable test, and uncertainty bounds.
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span>{insights.length} Empirical Insights Active</span>
        </div>
      </div>

      {/* Insights Cards List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Synthesizing findings from active dataset and econometric models...
          </div>
        ) : insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 max-w-xl mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-5 text-[#E2B774] shadow-lg">
              <Lightbulb className="w-8 h-8" />
            </div>
            <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider mb-1.5">
              Evidence-Based Diagnostics
            </div>
            <h3 className="text-xl font-bold text-white tracking-tight mb-2">
              No Empirical Insights Available
            </h3>
            <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
              Upload a CSV dataset to automatically compute evidence-based findings across price elasticity, regime transitions, and forecast benchmarks.
            </p>
            <button
              onClick={() => onNavigate('explorer')}
              className="px-5 py-2.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 rounded transition-all cursor-pointer flex items-center gap-2 shadow-md"
            >
              <span>Go to Data Explorer & Upload</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          insights.map((item) => (
            <div
              key={item.id}
              className="bg-[#0F172A] border border-slate-800 rounded-lg p-5 transition-all hover:border-slate-700 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded ${
                    item.severity === 'high'
                      ? 'bg-amber-950/40 text-amber-400 border border-amber-800/80'
                      : 'bg-slate-800 text-[#E2B774] border border-slate-700'
                  }`}>
                    <Lightbulb className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold font-mono tracking-wider text-slate-500">
                      {item.category.replace('_', ' ')}
                    </span>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      {item.title}
                    </h3>
                  </div>
                </div>

                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                  item.severity === 'high'
                    ? 'bg-amber-950/40 text-amber-400 border border-amber-800/80'
                    : 'bg-slate-800 text-slate-300'
                }`}>
                  {item.severity} Priority
                </span>
              </div>

              {/* The 5 Structured Requirement Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2 border-t border-slate-800/80">
                <div className="space-y-1">
                  <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E2B774]" />
                    <span>1. What Was Observed</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed pl-3 font-mono text-[11px]">
                    {item.observed}
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                    <span>2. Supporting Data & Evidence</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed pl-3 font-mono text-[11px]">
                    {item.supporting_data}
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>3. Why This Finding Matters</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed pl-3 text-xs">
                    {item.why_it_matters}
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>4. Possible Commercial Action to Investigate</span>
                  </div>
                  <p className="text-slate-200 leading-relaxed pl-3 text-xs font-medium">
                    {item.possible_action}
                  </p>
                </div>
              </div>

              {/* Field 5: Uncertainty & Limitations */}
              <div className="p-3 bg-slate-900/60 rounded border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-300">5. Relevant Uncertainty & Limitations: </span>
                  {item.uncertainty_limitations}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
