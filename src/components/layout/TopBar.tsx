/**
 * SHOPMIND — Top Navigation Bar
 * Follows strict Top Bar Contract: Brand Wordmark | 4-5 Single-Line Links | 1 Primary Action
 */

import React from 'react';
import { Database, Sparkles, SlidersHorizontal, BarChart3, HelpCircle } from 'lucide-react';

interface TopBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  datasetName: string;
  isSynthetic: boolean;
  firebaseConnected?: boolean;
  onOpenUpload: () => void;
  onResetData: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  datasetName,
  isSynthetic,
  firebaseConnected = true,
  onOpenUpload,
  onResetData,
}) => {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0B1120]/95 backdrop-blur-md border-b border-slate-800/80">
      {/* Zone 1: Single text wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => setActiveTab('landing')}
          className="text-left group flex items-center gap-2 cursor-pointer focus:outline-none"
        >
          <div className="w-7 h-7 rounded-sm bg-gradient-to-br from-[#E2B774] to-[#997738] flex items-center justify-center text-[#0B1120] font-black text-sm tracking-tighter shadow-sm">
            SM
          </div>
          <span className="text-lg font-bold tracking-tight text-white group-hover:text-[#F3E5CA] transition-colors whitespace-nowrap">
            SHOPMIND
          </span>
        </button>
      </div>

      {/* Zone 2: 4–5 clean single-line text navigation links */}
      <nav className="hidden lg:flex items-center gap-7 text-xs tracking-wider uppercase font-semibold text-slate-400">
        <button
          onClick={() => setActiveTab('overview')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'overview' ? 'text-[#E2B774] border-b-2 border-[#E2B774] pb-1' : ''
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('explorer')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'explorer' || activeTab === 'quality' ? 'text-[#E2B774] border-b-2 border-[#E2B774] pb-1' : ''
          }`}
        >
          Data Lab
        </button>
        <button
          onClick={() => setActiveTab('forecasting')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'forecasting' || activeTab === 'regimes' ? 'text-[#E2B774] border-b-2 border-[#E2B774] pb-1' : ''
          }`}
        >
          Forecasting & Regimes
        </button>
        <button
          onClick={() => setActiveTab('decision_studio')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'decision_studio' || activeTab === 'decision_center' || activeTab === 'comparison' ? 'text-[#E2B774] border-b-2 border-[#E2B774] pb-1' : ''
          }`}
        >
          Decision Studio
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'insights' ? 'text-[#E2B774] border-b-2 border-[#E2B774] pb-1' : ''
          }`}
        >
          Insights
        </button>
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
          <span className="text-slate-500 font-mono text-[11px] truncate max-w-[140px]">
            {datasetName}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-[11px] text-emerald-400 font-medium">
            {firebaseConnected ? 'Firestore Connected' : 'Local'}
          </span>
        </div>

        <button
          onClick={onOpenUpload}
          className="px-3.5 py-1.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-[0.98] transition-all rounded shadow-sm whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
        >
          <Database className="w-3.5 h-3.5" />
          <span>Upload CSV</span>
        </button>
      </div>
    </header>
  );
};
