/**
 * SHOPMIND — CSV Ingestion & Configurable Column Mapping Modal
 */

import React, { useState } from 'react';
import { Upload, X, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { inferColumnMapping, parseCSVText, type ColumnMappingConfig } from '../../services/csvParser.ts';

interface CSVUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const CSVUploadModal: React.FC<CSVUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [datasetName, setDatasetName] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);

  // Column mapping state
  const [mapping, setMapping] = useState<ColumnMappingConfig>({
    date: '',
    product_id: '',
    product_name: '',
    category: '',
    units_sold: '',
    price: '',
    unit_cost: '',
    discount_pct: '',
    inventory_on_hand: '',
    competitor_price: '',
    revenue: '',
    promo_active: '',
    negative_units_policy: 'reject',
    currency_code: 'UNSPECIFIED',
  });

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    // Allow the same file to be selected again after correcting a mapping or validation issue.
    e.target.value = '';

    if (selected.size > 40 * 1024 * 1024) {
      clearSelectedFile();
      setErrorMsg('CSV files must be 40 MB or smaller for this upload workflow. Reduce the file size or split it into smaller exports.');
      setErrorDetails([]);
      e.target.value = '';
      return;
    }

    const extension = selected.name.split('.').pop()?.toLowerCase();
    const allowedMimeTypes = [
      '',
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'text/plain',
      'application/octet-stream',
    ];
    if (extension !== 'csv' || !allowedMimeTypes.includes(selected.type)) {
      clearSelectedFile();
      setErrorMsg('Please upload a .csv file. Excel .xlsx files are not supported here; open the workbook in Excel or Numbers and export it as CSV.');
      setErrorDetails([]);
      e.target.value = '';
      return;
    }

    clearSelectedFile();
    setErrorMsg(null);
    setErrorDetails([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = typeof event.target?.result === 'string' ? event.target.result : '';
      // XLSX files are ZIP containers and begin with the PK signature. Never show binary bytes as text.
      if (text.startsWith('PK\u0003\u0004') || text.includes('[Content_Types].xml')) {
        setErrorMsg('This appears to be an Excel .xlsx workbook, not a CSV. Export or Save As → CSV, then upload the .csv file.');
        setErrorDetails([]);
        e.target.value = '';
        return;
      }

      if (!parsePreview(text)) {
        e.target.value = '';
        return;
      }

      setFile(selected);
      setDatasetName(selected.name.replace(/\.csv$/i, ''));
      setRawText(text.replace(/^\uFEFF/, ''));
    };
    reader.onerror = () => {
      clearSelectedFile();
      setErrorMsg('Failed to read the selected file.');
      setErrorDetails([]);
      e.target.value = '';
    };
    reader.readAsText(selected);
  };

  const clearSelectedFile = () => {
    setFile(null);
    setRawText('');
    setHeaders([]);
    setPreviewRows([]);
    setDatasetName('');
    setMapping({
      date: '',
      product_id: '',
      product_name: '',
      category: '',
      units_sold: '',
      price: '',
      unit_cost: '',
      discount_pct: '',
      inventory_on_hand: '',
      competitor_price: '',
      revenue: '',
      promo_active: '',
      negative_units_policy: 'reject',
      currency_code: 'UNSPECIFIED',
    });
  };

  const parsePreview = (csvContent: string): boolean => {
    if (!csvContent.trim()) {
      setErrorMsg('The selected CSV is empty.');
      setErrorDetails([]);
      clearSelectedFile();
      return false;
    }

    let rows: string[][];
    try {
      rows = parseCSVText(csvContent);
    } catch (error: any) {
      setErrorMsg(error?.message || 'Unable to parse CSV. Check quoted fields and separators.');
      setErrorDetails([]);
      clearSelectedFile();
      return false;
    }

    if (rows.length < 2) {
      setErrorMsg('The CSV must contain a header row and at least one data row.');
      setErrorDetails([]);
      clearSelectedFile();
      return false;
    }

    const headerCols = rows[0].map(header => header.trim());
    if (headerCols.length === 0 || headerCols.some(header => !header)) {
      setErrorMsg('The CSV header row contains an empty column name. Please correct the header row.');
      setErrorDetails([]);
      clearSelectedFile();
      return false;
    }
    if (new Set(headerCols).size !== headerCols.length) {
      setErrorMsg('The CSV contains duplicate column names. Rename the duplicate headers and upload again.');
      setErrorDetails([]);
      clearSelectedFile();
      return false;
    }

    const mappingGuess = inferColumnMapping(headerCols);
    setHeaders(headerCols);
    setMapping({
      date: mappingGuess.date || '',
      product_id: mappingGuess.product_id || '',
      product_name: mappingGuess.product_name || '',
      category: mappingGuess.category || '',
      units_sold: mappingGuess.units_sold || '',
      price: mappingGuess.price || '',
      unit_cost: mappingGuess.unit_cost || '',
      discount_pct: mappingGuess.discount_pct || '',
      inventory_on_hand: mappingGuess.inventory_on_hand || '',
      competitor_price: mappingGuess.competitor_price || '',
      revenue: mappingGuess.revenue || '',
      promo_active: mappingGuess.promo_active || '',
      negative_units_policy: 'reject',
      currency_code: 'UNSPECIFIED',
    });

    const previewRows = rows.slice(1, 6).map(values => {
      const rowObj: Record<string, string> = {};
      headerCols.forEach((column, idx) => {
        rowObj[column] = values[idx] ?? '';
      });
      return rowObj;
    });
    setPreviewRows(previewRows);
    return true;
  };

  const handleSubmit = async () => {
    if (!mapping.date || !mapping.units_sold) {
      setErrorMsg('Please map the required columns: Date and Units Sold (Demand).');
      setErrorDetails([]);
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    setErrorDetails([]);

    try {
      const response = await fetch('/api/dataset/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: datasetName || (file ? file.name.replace(/\.csv$/i, '') : 'Uploaded Retail Data'),
          csv_text: rawText,
          mapping,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.error || 'Upload request failed.');
        if (Array.isArray(data.details)) {
          setErrorDetails(data.details);
        }
        return;
      }

      onUploadSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred during ingestion.');
      setErrorDetails([]);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight">
              Ingest Retail Dataset (CSV)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload time-series sales data with explicit column mappings and validation.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-950/40 border border-red-800/80 rounded text-xs text-red-200 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <span className="font-semibold">{errorMsg}</span>
              </div>
              {errorDetails.length > 0 && (
                <ul className="pl-6 space-y-1 list-disc text-red-300/90 text-[11px]">
                  {errorDetails.slice(0, 8).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                  {errorDetails.length > 8 && (
                    <li>...and {errorDetails.length - 8} more errors.</li>
                  )}
                </ul>
              )}
            </div>
          )}

          {/* Upload Area */}
          {!file ? (
            <div className="border-2 border-dashed border-slate-700 hover:border-[#E2B774] rounded-lg p-8 text-center transition-colors">
              <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <div className="text-sm font-medium text-slate-200">
                Choose a retail POS or sales CSV file
              </div>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Must include chronological dates, product identifier, units sold, and pricing.
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded cursor-pointer transition-colors border border-slate-700">
                <span>Select Local File</span>
                <input
                  type="file"
                  accept=".csv,text/csv,application/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-900 rounded border border-slate-800">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-[#E2B774]" />
                  <div>
                    <div className="text-xs font-semibold text-white">{file.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {(file.size / 1024).toFixed(1)} KB · {headers.length} Columns Detected
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setHeaders([]);
                    setPreviewRows([]);
                  }}
                  className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
                >
                  Change File
                </button>
              </div>

              {/* Dataset Name Input */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Dataset Identifier Name
                </label>
                <input
                  type="text"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-[#E2B774]"
                  placeholder="e.g. Q4 Flagship Store POS Records"
                />
              </div>

              {/* Column Mapping Grid */}
              <div>
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Verify & Map Field Schema
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-900/60 rounded border border-slate-800">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Date Column <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={mapping.date}
                      onChange={(e) => setMapping({ ...mapping, date: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Select Date --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Product ID (Optional)
                    </label>
                    <select
                      value={mapping.product_id}
                      onChange={(e) => setMapping({ ...mapping, product_id: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Auto-generate or single product --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Product Name (Optional)
                    </label>
                    <select
                      value={mapping.product_name}
                      onChange={(e) => setMapping({ ...mapping, product_name: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Same as ID --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Category / Region (Optional)
                    </label>
                    <select
                      value={mapping.category}
                      onChange={(e) => setMapping({ ...mapping, category: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Not provided --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Units Sold (Target) <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={mapping.units_sold}
                      onChange={(e) => setMapping({ ...mapping, units_sold: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Select Units Sold --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Selling Price (Optional)
                    </label>
                    <select
                      value={mapping.price}
                      onChange={(e) => setMapping({ ...mapping, price: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Not provided: price analysis unavailable --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Unit Cost (COGS) (Optional)
                    </label>
                    <select
                      value={mapping.unit_cost}
                      onChange={(e) => setMapping({ ...mapping, unit_cost: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Not provided: cost must be entered for scenarios --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Discount % (Optional)
                    </label>
                    <select
                      value={mapping.discount_pct}
                      onChange={(e) => setMapping({ ...mapping, discount_pct: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Not provided --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Inventory On Hand (Optional)
                    </label>
                    <select
                      value={mapping.inventory_on_hand}
                      onChange={(e) => setMapping({ ...mapping, inventory_on_hand: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Not provided: inventory analysis unavailable --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Promotion / Campaign Flag (Optional)
                    </label>
                    <select
                      value={mapping.promo_active}
                      onChange={(e) => setMapping({ ...mapping, promo_active: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Not provided --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Competitor Price (Optional)
                    </label>
                    <select
                      value={mapping.competitor_price}
                      onChange={(e) => setMapping({ ...mapping, competitor_price: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Not provided --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Currency of Monetary Columns
                    </label>
                    <select
                      value={mapping.currency_code || 'UNSPECIFIED'}
                      onChange={(e) => setMapping({ ...mapping, currency_code: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="UNSPECIFIED">Not specified — do not assume USD</option>
                      <option value="INR">INR — Indian Rupee (₹)</option>
                      <option value="USD">USD — US Dollar ($)</option>
                      <option value="EUR">EUR — Euro (€)</option>
                      <option value="GBP">GBP — Pound Sterling (£)</option>
                      <option value="CAD">CAD — Canadian Dollar</option>
                      <option value="AUD">AUD — Australian Dollar</option>
                      <option value="JPY">JPY — Japanese Yen (¥)</option>
                      <option value="CNY">CNY — Chinese Yuan (¥)</option>
                      <option value="SGD">SGD — Singapore Dollar</option>
                      <option value="AED">AED — UAE Dirham</option>
                    </select>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Applies to price, cost, revenue and scenario amounts. Values are not converted; this only formats the existing monetary units.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Negative Quantity Handling
                    </label>
                    <select
                      value={mapping.negative_units_policy || 'reject'}
                      onChange={(e) => setMapping({
                        ...mapping,
                        negative_units_policy: e.target.value as 'reject' | 'exclude',
                      })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="reject">Reject upload if negative quantities appear</option>
                      <option value="exclude">Exclude negative rows (returns / cancellations)</option>
                    </select>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Excluding rows omits those records from every analysis and reports the excluded count. It does not net returns against sales.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Revenue (Optional — total sales value)
                    </label>
                    <select
                      value={mapping.revenue}
                      onChange={(e) => setMapping({ ...mapping, revenue: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="">-- Not provided --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Total revenue is kept separate from unit price and is never used as a substitute for it.
                    </p>
                  </div>
                </div>
              </div>

              {/* Data Preview */}
              {previewRows.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Raw Sample Preview (First 5 Rows)
                  </div>
                  <div className="overflow-x-auto border border-slate-800 rounded bg-slate-900/40 text-[11px]">
                    <table className="w-full text-left font-mono">
                      <thead className="bg-slate-800/80 text-slate-400 border-b border-slate-700">
                        <tr>
                          {headers.slice(0, 6).map(h => (
                            <th key={h} className="p-2 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {previewRows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-800/30">
                            {headers.slice(0, 6).map(h => (
                              <td key={h} className="p-2 whitespace-nowrap">{r[h]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-900 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || isUploading}
            className={`px-4 py-2 text-xs font-semibold rounded transition-all flex items-center gap-1.5 ${
              !file || isUploading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#F3E5CA] via-[#E2B774] to-[#C49B58] text-[#0B1120] hover:brightness-105 active:scale-95'
            }`}
          >
            {isUploading ? (
              <span>Validating & Processing...</span>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Ingest & Validate Dataset</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
