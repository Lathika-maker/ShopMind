/**
 * SHOPMIND — Clean KPI Card
 * Anti-slop disciplined metric card with unboxed metadata and tabular numbers.
 */

import React from 'react';

interface KPICardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
    neutral?: boolean;
  };
  contextNote?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  label,
  value,
  subtext,
  trend,
  contextNote,
}) => {
  return (
    <div className="bg-[#0F172A] border border-slate-800/90 rounded-md p-4 transition-all hover:border-slate-700/80">
      <div className="text-xs font-medium text-slate-400 tracking-wide mb-1.5 flex items-center justify-between">
        <span>{label}</span>
        {trend && (
          <span
            className={`text-xs font-mono font-medium ${
              trend.neutral
                ? 'text-slate-400'
                : trend.isPositive
                ? 'text-emerald-400'
                : 'text-amber-400'
            }`}
          >
            {trend.value}
          </span>
        )}
      </div>

      <div className="text-2xl font-bold tracking-tight text-white font-mono tabular-nums">
        {value}
      </div>

      {subtext && (
        <div className="mt-1 text-xs text-slate-400 flex items-center gap-1.5">
          <span>{subtext}</span>
          {contextNote && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-[11px] text-slate-500">{contextNote}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
