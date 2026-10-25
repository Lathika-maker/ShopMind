/**
 * SHOPMIND — Module 2: Data Explorer & CSV Ingestion
 * Filter, slice, paginate, inspect schema mappings, and export verified records.
 */

import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Upload,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Database,
  Calendar,
  Layers,
} from 'lucide-react';
import { DataRecord, DatasetMetadata } from '../../types/retail.ts';
import { EmptyDatasetState } from '../ui/EmptyDatasetState.tsx';
import { formatCurrency, currencyLabel } from '../../services/formatting.ts';

interface DataExplorerViewProps {
  metadata: DatasetMetadata | null;
  onOpenUpload: () => void;
  onResetData: () => void;
}

export const DataExplorerView: React.FC<DataExplorerViewProps> = ({
  metadata,
  onOpenUpload,
  onResetData,
}) => {
  if (!metadata || metadata.row_count === 0) {
    return (
      <EmptyDatasetState
        moduleName="Data Explorer"
        description="Upload a CSV dataset to inspect raw transactions, filter by product and category, verify schema mappings, and export cleaned records."
        onOpenUpload={onOpenUpload}
      />
    );
  }

  const [records, setRecords] = useState<DataRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [page, setPage] = useState<number>(1);
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '25',
      });
      if (selectedProduct !== 'all') params.append('product_id', selectedProduct);
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const res = await fetch(`/api/dataset/records?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records);
        setTotal(data.total);
        setTotalPages(data.total_pages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch dataset records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [page, selectedProduct, selectedCategory, startDate, endDate]);

  const handleExportCSV = () => {
    window.location.href = '/api/dataset/export';
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-semibold text-[#E2B774] uppercase tracking-wider">
            Data Repository
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Data Explorer & CSV Ingestion
          </h2>
          <div className="text-xs text-slate-400 mt-0.5">
            Inspecting {total.toLocaleString()} validated observations in active dataset.
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onResetData}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors cursor-pointer flex items-center gap-1.5"
            title="Clear active uploaded dataset and dependent scenarios"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Clear Dataset</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Clean CSV</span>
          </button>
          <button
            onClick={onOpenUpload}
            className="px-3.5 py-1.5 text-xs font-semibold text-[#0B1120] bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] hover:brightness-105 active:scale-95 rounded transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload New CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-[#0F172A] border border-slate-800 rounded-lg flex flex-wrap items-center gap-4 text-xs">
        {/* Product Filter */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Product:</span>
          <select
            value={selectedProduct}
            onChange={(e) => {
              setSelectedProduct(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-[#E2B774]"
          >
            <option value="all">All Catalog Items ({metadata.products.length})</option>
            <option value="PRD-101">Artisan Leather Tote (PRD-101)</option>
            <option value="PRD-102">Cashmere Blend Knit (PRD-102)</option>
            <option value="PRD-103">Heritage Brass Lamp (PRD-103)</option>
            <option value="PRD-104">Ceramic Pour-Over Set (PRD-104)</option>
            <option value="PRD-105">Organic Silk Scarf (PRD-105)</option>
          </select>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Category:</span>
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-[#E2B774]"
          >
            <option value="all">All Categories</option>
            {metadata.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Date Filters */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">From:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs font-mono"
          />
          <span className="text-slate-400 font-medium">To:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs font-mono"
          />
        </div>

        {(selectedProduct !== 'all' || selectedCategory !== 'all' || startDate || endDate) && (
          <button
            onClick={() => {
              setSelectedProduct('all');
              setSelectedCategory('all');
              setStartDate('');
              setEndDate('');
              setPage(1);
            }}
            className="text-xs text-[#E2B774] hover:underline cursor-pointer ml-auto"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* High-Density Data Table */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">SKU / ID</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Units Sold</th>
                <th className="py-3 px-4 text-right">Revenue ({currencyLabel(metadata.currency_code)})</th>
                <th className="py-3 px-4 text-right">Selling Price ({currencyLabel(metadata.currency_code)})</th>
                <th className="py-3 px-4 text-right">Unit Cost ({currencyLabel(metadata.currency_code)})</th>
                <th className="py-3 px-4 text-right">Discount</th>
                <th className="py-3 px-4 text-center">Promo</th>
                <th className="py-3 px-4 text-right">Inventory</th>
                <th className="py-3 px-4 text-right">Competitor ({currencyLabel(metadata.currency_code)})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300 text-xs tabular-nums">
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-500 font-sans">
                    Loading records from active dataset...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500 font-sans">
                    No matching records found for the applied filters.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-sans text-slate-400 whitespace-nowrap">{r.date}</td>
                    <td className="py-2.5 px-4 text-[#E2B774] font-medium whitespace-nowrap">{r.product_id}</td>
                    <td className="py-2.5 px-4 font-sans text-white font-medium whitespace-nowrap">{r.product_name}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-400 whitespace-nowrap">{metadata.available_fields?.category === false || !r.category ? 'N/A' : r.category}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-white">{r.units_sold}</td>
                    <td className="py-2.5 px-4 text-right text-slate-200">
                      {metadata.available_fields?.revenue === false || typeof r.revenue !== 'number' ? <span className="text-slate-500">N/A</span> : formatCurrency(r.revenue, metadata.currency_code)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {metadata.available_fields?.price === false ? <span className="text-slate-500">N/A</span> : formatCurrency(r.price, metadata.currency_code)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      {metadata.available_fields?.unit_cost === false ? <span className="text-slate-500">N/A</span> : formatCurrency(r.unit_cost, metadata.currency_code)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {metadata.available_fields?.discount_pct === false ? <span className="text-slate-500">N/A</span> : r.discount_pct > 0 ? (
                        <span className="text-amber-400">-{r.discount_pct}%</span>
                      ) : (
                        <span className="text-slate-500">0%</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {metadata.available_fields?.promo_active === false ? (
                        <span className="text-slate-500">N/A</span>
                      ) : r.promo_active ? (
                        <span className="text-emerald-400 font-sans font-medium text-[11px]">Active</span>
                      ) : (
                        <span className="text-slate-600 font-sans text-[11px]">No</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-200">
                      {metadata.available_fields?.inventory_on_hand === false ? <span className="text-slate-500">N/A</span> : r.inventory_on_hand}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      {metadata.available_fields?.competitor_price === false ? <span className="text-slate-500">N/A</span> : formatCurrency(r.competitor_price, metadata.currency_code)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing Page <span className="font-mono text-white">{page}</span> of{' '}
            <span className="font-mono text-white">{totalPages}</span> ({total} records total)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
