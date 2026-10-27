/**
 * SHOPMIND — Production-Grade Full-Stack Retail Intelligence Platform
 * Entry Application Shell
 */

import React, { useState, useEffect } from 'react';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { LandingView } from './components/modules/LandingView';
import { OverviewView } from './components/modules/OverviewView';
import { DataExplorerView } from './components/modules/DataExplorerView';
import { DataQualityView } from './components/modules/DataQualityView';
import { ForecastingView } from './components/modules/ForecastingView';
import { RegimesView } from './components/modules/RegimesView';
import { PriceSensitivityView } from './components/modules/PriceSensitivityView';
import { DecisionStudioView } from './components/modules/DecisionStudioView';
import { StressTestingView } from './components/modules/StressTestingView';
import { ScenarioComparisonView } from './components/modules/ScenarioComparisonView';
import { DecisionCenterView } from './components/modules/DecisionCenterView';
import { InsightsView } from './components/modules/InsightsView';
import { SettingsView } from './components/modules/SettingsView';
import { CSVUploadModal } from './components/modules/CSVUploadModal';
import {
  DatasetMetadata,
  DataQualityReport,
  ScenarioSimulationResult,
  BusinessConstraints,
} from './types/retail.ts';
import { testFirestoreConnection } from './services/firebase.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('landing');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [firebaseConnected, setFirebaseConnected] = useState<boolean>(false);

  // Core Application Data State (Defaults to null - uploaded CSV is the ONLY default runtime data source)
  const [metadata, setMetadata] = useState<DatasetMetadata | null>(null);
  const [quality, setQuality] = useState<DataQualityReport | null>(null);

  const [scenarios, setScenarios] = useState<ScenarioSimulationResult[]>([]);
  const [constraints, setConstraints] = useState<BusinessConstraints>({
    min_profit_margin_pct: 25.0,
    max_stock_out_risk_pct: 15.0,
    min_inventory_coverage_units: 50,
    max_price_ceiling: 500,
    min_price_floor: 15,
    weights: {
      profit_weight: 0.5,
      stockout_weight: 0.3,
      leftover_weight: 0.2,
    },
  });

  // Fetch active dataset & quality
  const fetchDataset = async () => {
    try {
      const res = await fetch('/api/dataset');
      if (res.ok) {
        const data = await res.json();
        setMetadata(data.metadata || null);
        setQuality(data.quality || null);
      }
    } catch (err) {
      console.error('Failed to load active dataset:', err);
    }
  };

  // Fetch scenarios
  const fetchScenarios = async () => {
    try {
      const res = await fetch('/api/scenarios');
      if (res.ok) {
        const data = await res.json();
        setScenarios(data);
      }
    } catch (err) {
      console.error('Failed to load scenarios:', err);
    }
  };

  // Fetch constraints
  const fetchConstraints = async () => {
    try {
      const res = await fetch('/api/constraints');
      if (res.ok) {
        const data = await res.json();
        setConstraints(data);
      }
    } catch (err) {
      console.error('Failed to load constraints:', err);
    }
  };

  useEffect(() => {
    fetchDataset();
    fetchScenarios();
    fetchConstraints();

    // Verify Firestore connectivity only. Scenario results are loaded from the
    // active dataset API so scenarios from an older dataset cannot reappear.
    testFirestoreConnection()
      .then(res => setFirebaseConnected(res.connected))
      .catch(() => setFirebaseConnected(false));
  }, []);

  // Reset or clear dataset
  const handleResetData = async () => {
    try {
      const res = await fetch('/api/dataset/reset', { method: 'POST' });
      if (res.ok) {
        setMetadata(null);
        setQuality(null);
        setScenarios([]);
      }
    } catch (err) {
      console.error('Failed to reset dataset:', err);
    }
  };

  // Update business constraints
  const handleUpdateConstraints = async (updated: BusinessConstraints): Promise<boolean> => {
    try {
      const res = await fetch('/api/constraints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        console.error('Server rejected constraint update:', result.error || res.statusText);
        return false;
      }

      const savedConstraints = await res.json();
      setConstraints(savedConstraints);
      await fetchScenarios();
      return true;
    } catch (err) {
      console.error('Failed to update constraints:', err);
      return false;
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col font-sans selection:bg-[#E2B774]/20 selection:text-[#F3E5CA]">
      {/* Top Navigation Bar with strict Top Bar Contract */}
      <TopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        datasetName={metadata ? metadata.name : 'No Active Dataset'}
        isSynthetic={metadata ? metadata.is_synthetic : false}
        firebaseConnected={firebaseConnected}
        onOpenUpload={() => setIsUploadOpen(true)}
        onResetData={handleResetData}
      />

      {/* Main Workspace Frame */}
      {activeTab === 'landing' ? (
        <LandingView
          onEnterWorkspace={(targetTab = 'overview') => setActiveTab(targetTab)}
          onOpenUpload={() => setIsUploadOpen(true)}
          onLoadDemo={async () => {
            try {
              const response = await fetch('/api/dataset/demo', { method: 'POST' });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || 'Unable to load demo data');
              setMetadata(result.metadata || null);
              setQuality(result.quality || null);
              setScenarios([]);
              await fetchScenarios();
              setActiveTab('overview');
            } catch (error) {
              console.error('Could not load SHOPMIND demo dataset:', error);
              window.alert(error instanceof Error ? error.message : 'Unable to load demo data');
            }
          }}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Collapsible Sidebar */}
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
          />

          {/* Module Content Viewport */}
          <main className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
            {activeTab === 'overview' && (
              <OverviewView
                key={metadata?.id ?? 'no-dataset'}
                metadata={metadata}
                quality={quality}
                scenarios={scenarios}
                onNavigate={setActiveTab}
                onOpenUpload={() => setIsUploadOpen(true)}
              />
            )}

            {activeTab === 'explorer' && (
              <DataExplorerView
                key={metadata?.id ?? 'no-dataset'}
                metadata={metadata}
                onOpenUpload={() => setIsUploadOpen(true)}
                onResetData={handleResetData}
              />
            )}

            {activeTab === 'quality' && (
              <DataQualityView key={metadata?.id ?? 'no-dataset'} metadata={metadata} quality={quality} />
            )}

            {activeTab === 'forecasting' && (
              <ForecastingView key={metadata?.id ?? 'no-dataset'} metadata={metadata} />
            )}

            {activeTab === 'regimes' && (
              <RegimesView key={metadata?.id ?? 'no-dataset'} metadata={metadata} />
            )}

            {activeTab === 'price_sensitivity' && (
              <PriceSensitivityView key={metadata?.id ?? 'no-dataset'} metadata={metadata} />
            )}

            {activeTab === 'decision_studio' && (
              <DecisionStudioView
                key={metadata?.id ?? 'no-dataset'}
                metadata={metadata}
                scenarios={scenarios}
                constraints={constraints}
                onRefreshScenarios={fetchScenarios}
                onNavigate={setActiveTab}
              />
            )}

            {activeTab === 'stress_testing' && (
              <StressTestingView
                key={metadata?.id ?? 'no-dataset'}
                metadata={metadata}
                scenarios={scenarios}
                onNavigate={setActiveTab}
              />
            )}

            {activeTab === 'comparison' && (
              <ScenarioComparisonView
                key={metadata?.id ?? 'no-dataset'}
                metadata={metadata}
                scenarios={scenarios}
                onNavigate={setActiveTab}
              />
            )}

            {activeTab === 'decision_center' && (
              <DecisionCenterView
                key={metadata?.id ?? 'no-dataset'}
                metadata={metadata}
                scenarios={scenarios}
                constraints={constraints}
                onUpdateConstraints={handleUpdateConstraints}
                onNavigate={setActiveTab}
              />
            )}

            {activeTab === 'insights' && (
              <InsightsView key={metadata?.id ?? 'no-dataset'} metadata={metadata} onNavigate={setActiveTab} />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                metadata={metadata}
                constraints={constraints}
                onUpdateConstraints={handleUpdateConstraints}
                onResetData={handleResetData}
                onOpenUpload={() => setIsUploadOpen(true)}
              />
            )}
          </main>
        </div>
      )}

      {/* Ingestion & Mapping Modal */}
      <CSVUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={async () => {
          // Clear visible results immediately so a previous dataset cannot flash
          // while the freshly uploaded dataset metadata is being reloaded.
          setMetadata(null);
          setQuality(null);
          setScenarios([]);
          await fetchDataset();
          await fetchScenarios();
          setActiveTab('explorer');
        }}
      />
    </div>
  );
}
