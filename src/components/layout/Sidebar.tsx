/**
 * SHOPMIND — Collapsible Navigation Sidebar
 * Provides direct access to all 12 platform modules.
 */

import React from 'react';
import {
  LayoutDashboard,
  Table,
  ShieldCheck,
  TrendingUp,
  Activity,
  Percent,
  Calculator,
  Flame,
  GitCompare,
  Sliders,
  Lightbulb,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

interface NavItem {
  id: string;
  label: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: '1. Overview Dashboard', category: 'Executive', icon: LayoutDashboard },
  { id: 'explorer', label: '2. Data Explorer', category: 'Data Ingestion', icon: Table },
  { id: 'quality', label: '3. Quality & Validation', category: 'Data Ingestion', icon: ShieldCheck },
  { id: 'forecasting', label: '4. Demand Forecasting', category: 'Predictive Engine', icon: TrendingUp },
  { id: 'regimes', label: '5. Demand Regimes', category: 'Predictive Engine', icon: Activity },
  { id: 'price_sensitivity', label: '6. Price Sensitivity', category: 'Predictive Engine', icon: Percent },
  { id: 'decision_studio', label: '7. Decision Studio', category: 'Simulation', icon: Calculator },
  { id: 'stress_testing', label: '8. Stress Testing', category: 'Simulation', icon: Flame },
  { id: 'comparison', label: '9. Scenario Comparison', category: 'Simulation', icon: GitCompare },
  { id: 'decision_center', label: '10. Decision Center', category: 'Optimization', icon: Sliders },
  { id: 'insights', label: '11. Insights & Diagnostics', category: 'Governance', icon: Lightbulb },
  { id: 'settings', label: '12. System Settings', category: 'Governance', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
}) => {
  return (
    <aside
      className={`relative z-30 transition-all duration-300 ease-in-out bg-[#0F172A] border-r border-slate-800/80 flex flex-col shrink-0 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Workspace Label */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between">
        {!collapsed && (
          <div>
            <div className="text-[10px] tracking-wider uppercase font-semibold text-[#E2B774]">
              Intelligence Console
            </div>
            <div className="text-xs font-semibold text-white truncate">
              Retail Optimization
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded cursor-pointer transition-colors"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-left transition-all cursor-pointer group ${
                isActive
                  ? 'bg-gradient-to-r from-slate-800 to-slate-800/40 text-[#F3E5CA] font-medium border-l-2 border-[#E2B774]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-colors ${
                  isActive ? 'text-[#E2B774]' : 'text-slate-500 group-hover:text-slate-300'
                }`}
              />
              {!collapsed && (
                <span className="text-xs truncate tracking-tight">{item.label}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer System Status */}
      <div className="p-3 border-t border-slate-800/80">
        {!collapsed ? (
          <div className="text-[11px] text-slate-500 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span>Engine Status</span>
              <span className="text-emerald-400 font-medium">Ready</span>
            </div>
            <div className="text-[10px] text-slate-600 font-mono">
              Port 3000 · Verified OLS
            </div>
          </div>
        ) : (
          <div className="flex justify-center text-[10px] text-emerald-400 font-mono">
            OK
          </div>
        )}
      </div>
    </aside>
  );
};
