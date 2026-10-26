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
import { InsightItem, DatasetMetadata } from '../../types/retail.ts';

interface InsightsViewProps {
  metadata: DatasetMetadata | null;
  onNavigate: (tab: string) => void;
}

interface QuestionAnswerEntry {
  id: string;
  question: string;
  answer: string;
  model: string;
  scope: string;
}

export const InsightsView: React.FC<InsightsViewProps> = ({ metadata, onNavigate }) => {
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [questionProductId, setQuestionProductId] = useState('all');
  const [isAsking, setIsAsking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<QuestionAnswerEntry[]>([]);
  const questionRequestRef = React.useRef<AbortController | null>(null);

  const productOptions = metadata?.product_items?.length
    ? metadata.product_items
    : (metadata?.products || []).map(id => ({ id, name: id }));

  useEffect(() => () => questionRequestRef.current?.abort(), []);

  const askQuestion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanedQuestion = question.trim();
    if (cleanedQuestion.length < 5 || cleanedQuestion.length > 500) {
      setAiError('Enter a question between 5 and 500 characters.');
      return;
    }
    if (!metadata || metadata.row_count === 0) {
      setAiError('Upload a valid CSV dataset before asking a question.');
      return;
    }

    questionRequestRef.current?.abort();
    const controller = new AbortController();
    questionRequestRef.current = controller;
    setIsAsking(true);
    setAiError(null);
    try {
      const response = await fetch('/api/analysis/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          question: cleanedQuestion,
          ...(questionProductId !== 'all' ? { product_id: questionProductId } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI analysis request failed.');
      if (typeof data.answer !== 'string' || !data.answer.trim()) {
        throw new Error('The analysis service returned no answer. Try rephrasing your question.');
      }
      setAnswers(previous => [{
        id: `${Date.now()}-${previous.length}`,
        question: cleanedQuestion,
        answer: data.answer,
        model: data.model || data.provider || 'AI analysis',
        scope: data.scope === 'whole_dataset' ? 'Whole dataset' : (data.scope || 'Selected product'),
      }, ...previous].slice(0, 6));
      setQuestion('');
    } catch (err: any) {
      if (err.name !== 'AbortError' && !controller.signal.aborted) {
        setAiError(err.message || 'Unable to answer the question.');
      }
    } finally {
      if (!controller.signal.aborted) setIsAsking(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setInsights([]);
    setErrorMsg(null);

    const fetchInsights = async () => {
      try {
        const res = await fetch('/api/insights', { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Insights are unavailable for the active dataset.');
        setInsights(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setInsights([]);
          setErrorMsg(err.message || 'Failed to load insights.');
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    fetchInsights();
    return () => controller.abort();
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

      {errorMsg && (
        <div role="alert" className="p-3 bg-rose-950/30 border border-rose-800 rounded text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      <section className="bg-[#0F172A] border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#E2B774]">Dynamic Dataset Q&A</div>
            <h3 className="text-base font-bold text-white mt-1">Ask SHOPMIND about your retail data</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              Ask a question in natural language about demand, sales, price sensitivity, forecast metrics, product comparisons or scenario risk.
            </p>
          </div>
          <Lightbulb className="w-5 h-5 text-[#E2B774] shrink-0" />
        </div>

        <form onSubmit={askQuestion} className="space-y-3">
          <div>
            <label htmlFor="shopmind-analysis-question" className="block text-[11px] text-slate-400 mb-1">Question</label>
            <textarea
              id="shopmind-analysis-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              minLength={5}
              maxLength={500}
              rows={3}
              required
              placeholder="Example: Which product has the strongest recorded demand, and what evidence supports that conclusion?"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#E2B774]"
            />
            <div className="text-[10px] text-slate-500 text-right">{question.length}/500</div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label htmlFor="shopmind-analysis-product" className="block text-[11px] text-slate-400 mb-1">Analysis scope</label>
              <select
                id="shopmind-analysis-product"
                value={questionProductId}
                onChange={(event) => setQuestionProductId(event.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-white"
              >
                <option value="all">Whole dataset</option>
                {productOptions.map(product => (
                  <option key={product.id} value={product.id}>{product.name} ({product.id})</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={isAsking || !metadata || metadata.row_count === 0 || question.trim().length < 5}
              className="px-4 py-2 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] disabled:opacity-40 disabled:cursor-not-allowed rounded transition-all"
            >
              {isAsking ? 'Analyzing dataset…' : 'Ask AI Analyst'}
            </button>
          </div>
        </form>

        <div className="text-[10px] text-slate-500">
          Data handling: only compact aggregate metrics and model diagnostics are sent to Gemini for an answer. Raw CSV rows are not sent. This feature requires the server-side GEMINI_API_KEY.
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            'Which products have the highest recorded demand?',
            'What are the main limitations of the current dataset?',
            'How reliable is the price sensitivity estimate?',
            'Which saved scenarios have the highest stock-out risk?',
          ].map(suggestion => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setQuestion(suggestion)}
              className="px-2.5 py-1.5 rounded border border-slate-700 text-[10px] text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {aiError && (
          <div role="alert" className="p-3 bg-rose-950/30 border border-rose-800 rounded text-xs text-rose-200">
            {aiError}
          </div>
        )}

        {isAsking && (
          <div className="p-3 bg-slate-900/70 border border-slate-800 rounded text-xs text-slate-400">
            Preparing aggregate metrics and requesting a data-grounded answer…
          </div>
        )}

        {answers.length > 0 && (
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Recent answers</div>
            {answers.map(entry => (
              <article key={entry.id} className="p-4 bg-slate-900/70 border border-slate-800 rounded space-y-2">
                <div className="text-[11px] font-semibold text-[#E2B774]">Question · {entry.scope}</div>
                <p className="text-sm text-white font-medium">{entry.question}</p>
                <div className="border-t border-slate-800 pt-3 text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">{entry.answer}</div>
                <div className="text-[10px] text-slate-500">Generated with {entry.model} · based on aggregate active-dataset evidence</div>
              </article>
            ))}
          </div>
        )}
      </section>

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
