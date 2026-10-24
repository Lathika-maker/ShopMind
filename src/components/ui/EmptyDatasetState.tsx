/**
 * SHOPMIND — Reusable Empty Dataset State Component
 * Displayed across data-dependent modules when no CSV dataset has been uploaded.
 */

import React from 'react';
import { Database, Upload, AlertCircle, FileSpreadsheet } from 'lucide-react';

interface EmptyDatasetStateProps {
  moduleName?: string;
  description?: string;
  onOpenUpload: () => void;
}

export const EmptyDatasetState: React.FC<EmptyDatasetStateProps> = ({
  moduleName = 'This Module',
  description = 'This analytical module requires an active uploaded dataset to compute genuine empirical metrics, charts, and recommendations.',
  onOpenUpload,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 max-w-2xl mx-auto text-center">
      <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-5 text-[#E2B774] shadow-lg">
        <Database className="w-8 h-8" />
      </div>

      <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider mb-1.5">
        Dataset Required
      </div>
      <h3 className="text-xl font-bold text-white tracking-tight mb-2">
        No CSV Dataset Active for {moduleName}
      </h3>
      <p className="text-xs text-slate-400 max-w-lg mb-6 leading-relaxed">
        {description}
      </p>

      <div className="p-4 bg-slate-900/80 rounded-lg border border-slate-800 max-w-md w-full mb-6 text-left">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-2">
          <FileSpreadsheet className="w-4 h-4 text-[#E2B774]" />
          <span>Expected CSV Schema</span>
        </div>
        <ul className="text-[11px] text-slate-400 space-y-1 list-disc list-inside">
          <li><strong className="text-slate-200">Mandatory fields:</strong> Chronological Date and Demand/Units Sold.</li>
          <li><strong className="text-slate-200">Optional fields:</strong> Product ID/Name, Selling Price, Unit Cost, Inventory, Promotions.</li>
          <li><strong className="text-slate-200">Zero Synthetic Fallback:</strong> Only genuine data from your uploaded file is processed.</li>
        </ul>
      </div>

      <button
        onClick={onOpenUpload}
        className="px-5 py-2.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 rounded transition-all cursor-pointer flex items-center gap-2 shadow-md"
      >
        <Upload className="w-4 h-4" />
        <span>Upload Retail CSV Dataset</span>
      </button>
    </div>
  );
};
