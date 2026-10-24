/**
 * SHOPMIND — Module 12: Settings & Business Constraints
 * Dataset metadata, model configurations, constraint boundaries, and deployment architecture docs.
 */

import React, { useState } from 'react';
import {
  Settings,
  RefreshCw,
  Database,
  Sliders,
  Server,
  Terminal,
  CheckCircle,
  FileCode,
} from 'lucide-react';
import { DatasetMetadata, BusinessConstraints } from '../../types/retail.ts';

interface SettingsViewProps {
  metadata: DatasetMetadata | null;
  constraints: BusinessConstraints;
  onUpdateConstraints: (c: BusinessConstraints) => void;
  onResetData: () => void;
  onOpenUpload: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  metadata,
  constraints,
  onUpdateConstraints,
  onResetData,
  onOpenUpload,
}) => {
  const [minMargin, setMinMargin] = useState<number>(constraints.min_profit_margin_pct);
  const [maxStockout, setMaxStockout] = useState<number>(constraints.max_stock_out_risk_pct);
  const [maxCeiling, setMaxCeiling] = useState<number>(constraints.max_price_ceiling);
  const [minFloor, setMinFloor] = useState<number>(constraints.min_price_floor);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const handleSave = () => {
    onUpdateConstraints({
      ...constraints,
      min_profit_margin_pct: minMargin,
      max_stock_out_risk_pct: maxStockout,
      max_price_ceiling: maxCeiling,
      min_price_floor: minFloor,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Configuration & Governance
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            System Settings & Architecture
          </h2>
          <div className="text-xs text-slate-400 mt-0.5">
            Configure global commercial thresholds, dataset sources, and inspect runtime specifications.
          </div>
        </div>

        <button
          onClick={handleSave}
          className="px-3.5 py-1.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 rounded transition-all cursor-pointer shadow-sm"
        >
          {isSaved ? '✓ Constraints Saved' : 'Save Global Settings'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Business Constraints */}
        <div className="lg:col-span-6 bg-[#0F172A] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-white">
              Global Business Constraint Boundaries
            </h3>
            <p className="text-xs text-slate-400">
              Synchronized with the Decision Center optimization engine and applied across all scenario simulations.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Minimum Profit Margin Floor (%)
              </label>
              <input
                type="number"
                value={minMargin}
                onChange={(e) => setMinMargin(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Maximum Tolerated Stock-Out Risk (%)
              </label>
              <input
                type="number"
                value={maxStockout}
                onChange={(e) => setMaxStockout(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Price Floor ($)
                </label>
                <input
                  type="number"
                  value={minFloor}
                  onChange={(e) => setMinFloor(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Price Ceiling ($)
                </label>
                <input
                  type="number"
                  value={maxCeiling}
                  onChange={(e) => setMaxCeiling(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              Note: To adjust multi-criteria decision weights (Profit vs. Stockout vs. Leftover), open the <span className="text-[#E2B774] font-medium">Decision Center</span> module.
            </div>
          </div>
        </div>

        {/* Right Column: Dataset Management & Reset */}
        <div className="lg:col-span-6 bg-[#0F172A] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-white">
              Dataset Ingestion & State Control
            </h3>
            <p className="text-xs text-slate-400">
              Active dataset information and clear/upload controls.
            </p>
          </div>

          <div className="space-y-3 text-xs text-slate-300 font-mono">
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="font-sans text-slate-400">Dataset Name:</span>
              <span className="text-white truncate max-w-[240px]">
                {metadata ? metadata.name : 'No Active Dataset'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="font-sans text-slate-400">Record Volume:</span>
              <span>
                {metadata ? `${metadata.row_count.toLocaleString()} observations` : '0 observations'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="font-sans text-slate-400">Classification:</span>
              <span className="text-[#E2B774]">
                {metadata ? (metadata.is_synthetic ? 'Deterministic Synthetic Fixture' : 'User Uploaded POS') : 'Unloaded'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/80">
              <span className="font-sans text-slate-400">Date Range:</span>
              <span>
                {metadata && metadata.date_range ? `${metadata.date_range.start} → ${metadata.date_range.end}` : 'N/A'}
              </span>
            </div>
          </div>

          <div className="pt-3 flex gap-3">
            <button
              onClick={onResetData}
              className="flex-1 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Clear Active Dataset</span>
            </button>
            <button
              onClick={onOpenUpload}
              className="px-4 py-2 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] rounded transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Upload CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Architecture & Engineering Documentation */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-white mb-2">
          Platform Architecture & Operational Environment
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Repository architecture and the runtime paths used by SHOPMIND.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3 bg-slate-900 rounded border border-slate-800 space-y-1.5">
            <div className="font-semibold text-white font-sans flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>1. Live UI/API Path</span>
            </div>
            <div className="text-slate-400">• Runtime: React + Vite; API routes in `src/server/apiMiddleware.ts`</div>
            <div className="text-slate-400">• Express alternative: `server.ts` (port configured by `SERVER_PORT`)</div>
            <div className="text-slate-400">• Validation: `npm test` and `npm run build` are checked in GitHub Actions</div>
            <div className="text-slate-400">• Data state: starts empty; successful CSV upload activates the dataset</div>
          </div>

          <div className="p-3 bg-slate-900 rounded border border-slate-800 space-y-1.5">
            <div className="font-semibold text-white font-sans flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#E2B774]" />
              <span>2. Separate Python Service (`/backend`)</span>
            </div>
            <div className="text-slate-400">• Framework: FastAPI, Pydantic, SQLAlchemy, Alembic</div>
            <div className="text-slate-400">• Integration: separate from the current UI/API path; not assumed to supply live screen results</div>
            <div className="text-slate-400">• Files: `Dockerfile` & `docker-compose.yml` included in repo</div>
            <div className="text-slate-400">• DB: PostgreSQL schema and migration configuration</div>
          </div>

          <div className="p-3 bg-slate-900 rounded border border-slate-800 space-y-1.5 md:col-span-2">
            <div className="font-semibold text-white font-sans flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>3. Firebase Connectivity</span>
              </div>
              <span className="text-[11px] font-sans px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/80 font-medium">
                Connection status only
              </span>
            </div>
            <div className="text-slate-400">• Purpose: connection health indicator for the current UI</div>
            <div className="text-slate-400">• Dataset source of truth: active uploaded CSV in the API process</div>
            <div className="text-slate-400">• Current use: connectivity check only; uploaded data and scenarios are not restored from Firestore</div>
          </div>
        </div>
      </div>
    </div>
  );
};
