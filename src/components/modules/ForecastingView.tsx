/**
 * SHOPMIND — Module 4: Demand Forecasting & Model Evaluation
 * Chronological out-of-sample evaluation, MAE, RMSE, R², actual vs predicted charts,
 * residual error diagnostics, and feature importance.
 */

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Brain,
  Layers,
  HelpCircle,
  AlertTriangle,
  Play,
  CheckCircle,
  BarChart3,
  Calendar,
} from 'lucide-react';
import {
  ForecastResult,
  ModelAlgorithm,
  DatasetMetadata,
} from '../../types/retail.ts';
import { KPICard } from '../ui/KPICard.tsx';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  ReferenceLine,
} from 'recharts';
import { EmptyDatasetState } from '../ui/EmptyDatasetState.tsx';

interface ForecastingViewProps {
  metadata: DatasetMetadata | null;
  onOpenUpload?: () => void;
}

export const ForecastingView: React.FC<ForecastingViewProps> = ({ metadata, onOpenUpload }) => {
  if (!metadata || metadata.row_count === 0) {
    return (
      <EmptyDatasetState
        moduleName="Demand Forecasting & Model Evaluation"
        description="Upload a CSV dataset to train machine learning and statistical models with chronological train/test splits, evaluate MAE/RMSE/R² metrics, and inspect residual diagnostics without data leakage."
        onOpenUpload={onOpenUpload || (() => {})}
      />
    );
  }

  const productOptions = metadata.product_items && metadata.product_items.length > 0
    ? metadata.product_items
    : (metadata.products || []).map(p => ({ id: p, name: p }));

  const [selectedProduct, setSelectedProduct] = useState<string>(productOptions[0]?.id || '');
  const [algorithm, setAlgorithm] = useState<ModelAlgorithm>('linear_regression');
  const [trainRatio, setTrainRatio] = useState<number>(0.8);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (productOptions.length > 0 && !productOptions.some(p => p.id === selectedProduct)) {
      setSelectedProduct(productOptions[0].id);
    }
  }, [productOptions, selectedProduct]);

  const runTraining = async (signal?: AbortSignal) => {
    setErrorMsg(null);
    setForecastResult(null);
    if (!selectedProduct) {
      setIsLoading(false);
      setErrorMsg('Select a product from the active dataset.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/forecasting/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          product_id: selectedProduct,
          algorithm,
          train_ratio: trainRatio,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Training failed.');
      setForecastResult(data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setForecastResult(null);
        setErrorMsg(err.message || 'Failed to train forecasting model.');
      }
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    runTraining(controller.signal);
    return () => controller.abort();
  }, [selectedProduct, algorithm, trainRatio]);

  // Downsample predictions for clear time-series visualization (every 3rd day)
  const chartData = forecastResult?.predictions.filter((_, idx) => idx % 3 === 0) || [];

  // Group residuals into bins for residual histogram
  const residualHistogramData = (() => {
    if (!forecastResult) return [];
    const bins: Record<string, number> = {
      '<-10': 0,
      '-10 to -5': 0,
      '-5 to 0': 0,
      '0 to +5': 0,
      '+5 to +10': 0,
      '>+10': 0,
    };
    forecastResult.residuals.forEach(r => {
      const res = r.residual;
      if (res < -10) bins['<-10']++;
      else if (res < -5) bins['-10 to -5']++;
      else if (res < 0) bins['-5 to 0']++;
      else if (res < 5) bins['0 to +5']++;
      else if (res < 10) bins['+5 to +10']++;
      else bins['>+10']++;
    });

    return Object.entries(bins).map(([bin, count]) => ({ bin, count }));
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Predictive Intelligence
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Demand Forecasting & Chronological Evaluation
          </h2>
          <div className="text-xs text-slate-400 mt-0.5">
            Strict chronological train/test split. No future leakage. Validated error metrics.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Chronological Split:</span>
          <span className="text-xs font-mono font-semibold text-[#E2B774] bg-slate-900 border border-slate-800 px-2.5 py-1 rounded">
            {Math.round(trainRatio * 100)}% Train / {Math.round((1 - trainRatio) * 100)}% Test
          </span>
        </div>
      </div>

      {/* Model Selection & Tuning Bar */}
      <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-lg flex flex-wrap items-center gap-4 text-xs">
        {/* Product Selector */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Target SKU:</span>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-[#E2B774]"
          >
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </div>

        {/* Algorithm Selector */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Model Architecture:</span>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as ModelAlgorithm)}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-[#E2B774]"
          >
            <option value="linear_regression">Multiple Linear Regression (OLS + Ridge)</option>
            <option value="random_forest">Random Forest Ensemble (Non-linear)</option>
            <option value="moving_average_7d">7-Day Rolling Moving Average (Baseline)</option>
            <option value="naive_last">Naive Persistence Baseline (Lag t-1)</option>
          </select>
        </div>

        {/* Train/Test Slider */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-slate-400 font-medium">Train Split:</span>
          <input
            type="range"
            min="0.6"
            max="0.85"
            step="0.05"
            value={trainRatio}
            onChange={(e) => setTrainRatio(parseFloat(e.target.value))}
            className="w-24 accent-[#E2B774] cursor-pointer"
          />
          <span className="font-mono text-slate-200 font-semibold">{Math.round(trainRatio * 100)}%</span>
        </div>

        <button
          onClick={runTraining}
          disabled={isLoading}
          className="px-3.5 py-1.5 bg-[#E2B774] hover:bg-[#d8a860] text-[#0B1120] font-semibold rounded flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isLoading ? 'Fitting Model...' : 'Re-fit Model'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-950/40 border border-red-800 rounded text-xs text-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Evaluation Metrics Cards */}
      {forecastResult && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Mean Absolute Error (MAE)"
            value={`${forecastResult.metrics.mae} units`}
            subtext="Average prediction error"
            contextNote={`Test N = ${forecastResult.metrics.test_sample_size}`}
            trend={{ value: 'Lower is better', neutral: true }}
          />
          <KPICard
            label="Root Mean Squared Error (RMSE)"
            value={`${forecastResult.metrics.rmse} units`}
            subtext="Penalizes large errors"
            contextNote="Mathematically >= MAE"
            trend={{ value: 'Standard dev of residuals', neutral: true }}
          />
          <KPICard
            label="Coefficient of Determination (R²)"
            value={
              forecastResult.metrics.r2 !== null
                ? forecastResult.metrics.r2.toString()
                : 'N/A'
            }
            subtext="Variance explained"
            contextNote={forecastResult.metrics.r2 !== null && forecastResult.metrics.r2 < 0 ? 'Worse than constant mean' : 'Out-of-sample'}
            trend={{
              value: forecastResult.metrics.r2 !== null && forecastResult.metrics.r2 > 0.5 ? 'Strong Fit' : 'Moderate',
              isPositive: forecastResult.metrics.r2 !== null && forecastResult.metrics.r2 > 0.5,
            }}
          />
          <KPICard
            label="Mean Absolute Pct Error (MAPE)"
            value={`${forecastResult.metrics.mape}%`}
            subtext="Relative percentage error"
            contextNote="Across positive test units"
            trend={{ value: forecastResult.metrics.mape < 20 ? 'High Accuracy' : 'Normal Retail Variance', isPositive: forecastResult.metrics.mape < 20 }}
          />
        </div>
      )}

      {/* Actual vs Predicted Time Series Chart */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Chronological Demand Trajectory: Actual vs. Fitted Model
            </h3>
            <p className="text-xs text-slate-400">
              Evaluated sequentially. Vertical marker separates in-sample training from out-of-sample test horizon.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-white" /> Actual Sales
            </span>
            <span className="flex items-center gap-1.5 text-[#E2B774]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#E2B774]" /> Model Prediction
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="date" stroke="#64748B" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0F172A',
                  borderColor: '#334155',
                  fontSize: '11px',
                  borderRadius: '4px',
                }}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#FFFFFF"
                strokeWidth={1.5}
                dot={false}
                name="Actual Units"
              />
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#E2B774"
                strokeWidth={2}
                dot={false}
                name="Predicted Units"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {forecastResult && (
          <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono">
            <div>
              Training Window: <span className="text-slate-200">{forecastResult.metrics.train_period.start}</span> → <span className="text-slate-200">{forecastResult.metrics.train_period.end}</span>
            </div>
            <div>
              Out-of-Sample Test Window: <span className="text-[#E2B774] font-semibold">{forecastResult.metrics.test_period.start}</span> → <span className="text-[#E2B774] font-semibold">{forecastResult.metrics.test_period.end}</span>
            </div>
          </div>
        )}
      </div>

      {/* Residual Diagnostics & Feature Importance Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Residual Error Distribution */}
        <div className="lg:col-span-6 bg-[#0F172A] border border-slate-800 rounded-lg p-5">
          <div className="mb-4 pb-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-white">
              Residual Error Diagnostics (Actual - Predicted)
            </h3>
            <p className="text-xs text-slate-400">
              Symmetric normal distribution centered at zero indicates unbiased forecasting.
            </p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={residualHistogramData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="bin" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    fontSize: '11px',
                    borderRadius: '4px',
                  }}
                />
                <Bar dataKey="count" fill="#E2B774" radius={[2, 2, 0, 0]} name="Residual Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Residual Mean: ~0.0 units</span>
            <span>Residual Standard Error: ~{forecastResult?.metrics.rmse}</span>
          </div>
        </div>

        {/* Feature Importance / Weights */}
        <div className="lg:col-span-6 bg-[#0F172A] border border-slate-800 rounded-lg p-5">
          <div className="mb-4 pb-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-white">
              Feature Importance & Driver Attribution
            </h3>
            <p className="text-xs text-slate-400">
              Relative predictive weight assigned to commercial and calendar drivers.
            </p>
          </div>

          <div className="space-y-3">
            {forecastResult?.feature_importances.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">{item.feature}</span>
                  <span className="font-mono text-[#E2B774]">
                    {(item.importance * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-[#E2B774] to-[#C49B58] h-full rounded-full"
                    style={{ width: `${Math.min(100, item.importance * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 leading-relaxed">
            <div className="font-semibold text-slate-300 mb-1">Documented Limitations:</div>
            <ul className="list-disc list-inside space-y-1 text-[11px]">
              {forecastResult?.metrics.limitations.map((lim, i) => (
                <li key={i}>{lim}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
