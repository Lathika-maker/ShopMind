/**
 * SHOPMIND — Module 3: Data Quality & Validation
 * Detailed audit of dataset completeness, duplicate checks, anomalies, and numeric distributions.
 */

import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet,
  Info,
  Layers,
} from 'lucide-react';
import { DataQualityReport, DatasetMetadata } from '../../types/retail.ts';
import { KPICard } from '../ui/KPICard.tsx';
import { EmptyDatasetState } from '../ui/EmptyDatasetState.tsx';

interface DataQualityViewProps {
  metadata: DatasetMetadata | null;
  quality: DataQualityReport | null;
  onOpenUpload?: () => void;
}

export const DataQualityView: React.FC<DataQualityViewProps> = ({
  metadata,
  quality,
  onOpenUpload,
}) => {
  if (!metadata || !quality || metadata.row_count === 0) {
    return (
      <EmptyDatasetState
        moduleName="Data Quality & Completeness Audit"
        description="Upload a CSV dataset to run strict validation checks across required fields, detect duplicate records, identify null or out-of-bounds values, and evaluate completeness scores."
        onOpenUpload={onOpenUpload || (() => {})}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Validation & Integrity
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Data Quality & Completeness Audit
          </h2>
          <div className="text-xs text-slate-400 mt-0.5">
            Validation results for active dataset: {metadata.name}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Integrity Standard:</span>
          <span className="font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/80 px-2 py-0.5 rounded">
            Strict POS Validation
          </span>
        </div>
      </div>

      {/* Top Integrity KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Mapped Field Quality"
          value={`${quality.completeness_score} / 100`}
          subtext="Row-level validation score"
          contextNote="Checks over available columns"
          trend={{ value: quality.completeness_score >= 95 ? 'Strong' : 'Review needed', isPositive: quality.completeness_score >= 95 }}
        />
        <KPICard
          label="Source Rows Audited"
          value={quality.total_records.toLocaleString()}
          subtext={`${quality.valid_records.toLocaleString()} distinct normalized row signatures`}
          contextNote="Duplicate signatures are flagged, not deleted"
          trend={{
            value: quality.total_records ? `${Math.round((quality.valid_records / quality.total_records) * 100)}% unique signatures` : 'No records',
            isPositive: quality.valid_records === quality.total_records,
          }}
        />
        <KPICard
          label="Exact Duplicate Records"
          value={quality.duplicate_count}
          subtext="Matching normalized business fields"
          contextNote="Flagged for review; kept in the active dataset"
          trend={{ value: quality.duplicate_count === 0 ? 'None detected' : 'Review duplicates', isPositive: quality.duplicate_count === 0 }}
        />
        <KPICard
          label="Date Span"
          value={`${quality.date_range_days} days`}
          subtext={`${metadata.date_range.start} → ${metadata.date_range.end}`}
          contextNote="Inclusive calendar span"
          trend={{ value: 'From uploaded dates', neutral: true }}
        />
      </div>

      {/* Issues & Integrity Checks */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Data Integrity Checks & Anomaly Log
            </h3>
            <p className="text-xs text-slate-400">
              Checks required values and any optional fields present in the uploaded CSV.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {quality.issues.length} Issues Flagged
          </span>
        </div>

        {quality.issues.length === 0 ? (
          <div className="py-6 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" />
            <span>No row-level issues were flagged by the current checks. Fields marked N/A below were not supplied in the uploaded CSV.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {quality.issues.map((issue, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-900 border border-slate-800 rounded flex items-start justify-between gap-4 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      issue.severity === 'error' ? 'text-rose-400' : 'text-amber-400'
                    }`}
                  />
                  <div>
                    <div className="font-semibold text-white">{issue.description}</div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Column: {issue.column} · {issue.count} occurrences
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {issue.severity}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Column Summary Statistics Table */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
        <div className="mb-4 pb-3 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">
            Distribution & Descriptive Statistics
          </h3>
          <p className="text-xs text-slate-400">
            Quantile distributions across numeric fields to confirm realistic retail scales and standard deviations.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-sans">
              <tr>
                <th className="py-2.5 px-4">Column Name</th>
                <th className="py-2.5 px-4 text-right">Min</th>
                <th className="py-2.5 px-4 text-right">Mean (μ)</th>
                <th className="py-2.5 px-4 text-right">Median</th>
                <th className="py-2.5 px-4 text-right">Max</th>
                <th className="py-2.5 px-4 text-right">Std Dev (σ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 tabular-nums">
              {quality.summary_stats.map((stat) => (
                <tr key={stat.column} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-sans font-medium text-white">{stat.column}</td>
                  <td className="py-2.5 px-4 text-right">{metadata.available_fields?.[stat.column] === false ? 'N/A' : stat.min}</td>
                  <td className="py-2.5 px-4 text-right text-[#E2B774] font-semibold">{metadata.available_fields?.[stat.column] === false ? 'N/A' : stat.mean}</td>
                  <td className="py-2.5 px-4 text-right">{metadata.available_fields?.[stat.column] === false ? 'N/A' : stat.median}</td>
                  <td className="py-2.5 px-4 text-right">{metadata.available_fields?.[stat.column] === false ? 'N/A' : stat.max}</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">{metadata.available_fields?.[stat.column] === false ? 'N/A' : stat.std}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
