/**
 * SHOPMIND — Reliable CSV Parser, Schema Inferrer, and Data Validator
 * 
 * Enforces strict, zero-fabrication validation of incoming CSV datasets.
 * Supports auto-detection of canonical headers and customizable user mapping.
 */

import { DataRecord, DatasetMetadata } from '../types/retail.ts';

export interface CSVParseResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  records?: DataRecord[];
  metadata?: DatasetMetadata;
  detectedMapping?: Record<string, string>;
  rawHeaders?: string[];
}

export interface ColumnMappingConfig {
  date?: string;
  product_id?: string;
  product_name?: string;
  category?: string;
  units_sold?: string;
  price?: string;
  unit_cost?: string;
  discount_pct?: string;
  inventory_on_hand?: string;
  promo_active?: string;
  competitor_price?: string;
  revenue?: string;
  /** How negative units are handled when they represent returns/cancellations. */
  negative_units_policy?: 'reject' | 'exclude';
  /** ISO 4217 currency code, or UNSPECIFIED to avoid assuming a currency. */
  currency_code?: string;
}

/**
 * Split CSV line respecting double quotes
 */
export function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Detect common CSV delimiters using the first logical header row.
 * Counts only separators outside quoted header text.
 */
export function detectCSVDelimiter(content: string): ',' | ';' | '\t' | '|' {
  const input = content.replace(/^\uFEFF/, '');
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (inQuotes && input[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) break;
    if (!inQuotes && Object.prototype.hasOwnProperty.call(counts, char)) counts[char]++;
  }

  const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] as ',' | ';' | '\t' | '|';
  return counts[delimiter] > 0 ? delimiter : ',';
}

/**
 * Parse a complete CSV document, respecting escaped quotes, the detected delimiter,
 * CRLF/LF, and line breaks embedded inside quoted fields.
 * Throws on an unterminated quoted field so malformed uploads are not misread.
 */
export function parseCSVText(content: string): string[][] {
  const input = content.replace(/^\uFEFF/, '');
  const delimiter = detectCSVDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === '"') {
      if (inQuotes && input[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field.trim());
      field = '';
      if (row.some(value => value.trim().length > 0)) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error('CSV contains an unterminated quoted field. Check double quotes around text values.');
  }

  row.push(field.trim());
  if (row.some(value => value.trim().length > 0)) rows.push(row);
  return rows;
}

/**
 * Infer column names to canonical fields
 */
function normalizeHeaderName(raw: string): string {
  return raw
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

/**
 * Infer canonical retail fields from common, ERP, POS, ecommerce, and analyst-defined
 * header names. Unknown columns are intentionally left unmapped and preserved as custom
 * attributes; they must not be guessed into a financial field merely because they are numeric.
 */
export function inferColumnMapping(headers: string[]): ColumnMappingConfig {
  type MappableField =
    | 'date' | 'product_id' | 'product_name' | 'category' | 'units_sold'
    | 'revenue' | 'unit_cost' | 'price' | 'discount_pct' | 'inventory_on_hand'
    | 'promo_active' | 'competitor_price';

  const normalized = headers.map(raw => ({ raw, clean: normalizeHeaderName(raw) }));
  const aliases: Record<MappableField, string[]> = {
    date: [
      'date', 'day', 'datetime', 'timestamp', 'time_stamp', 'transaction_date',
      'transaction_datetime', 'trans_date', 'txn_date', 'txn_datetime', 'invoice_date',
      'invoice_datetime', 'order_date', 'order_datetime', 'sales_date', 'sale_date',
      'date_of_sale', 'business_date', 'business_day', 'receipt_date', 'bill_date',
      'posting_date', 'posted_date', 'created_at', 'sold_at', 'order_created_at',
      'sales_day', 'calendar_date', 'date_key',
    ],
    product_id: [
      'product_id', 'productid', 'product_code', 'product_number', 'product_no',
      'item_id', 'item_code', 'item_number', 'item_no', 'sku', 'sku_id', 'skuid',
      'stock_code', 'stockcode', 'barcode', 'upc', 'ean', 'gtin', 'plu', 'variant_id',
      'article_number', 'material_id', 'inventory_item_id', 'style_code', 'item_key',
      'product_key',
    ],
    product_name: [
      'product_name', 'productname', 'item_name', 'itemname', 'description',
      'item_description', 'product_description', 'product_title', 'item_title',
      'title', 'product', 'item', 'article_name', 'style_name', 'merchandise_name',
      'product_label', 'item_label',
    ],
    category: [
      'category', 'product_category', 'merchandise_category', 'subcategory',
      'sub_category', 'product_subcategory', 'department', 'dept', 'product_family',
      'family', 'merchandise_class', 'product_class',
    ],
    units_sold: [
      'units', 'unit', 'units_sold', 'unit_sold', 'sold_units', 'quantity', 'qty',
      'sales_qty', 'sales_quantity', 'quantity_sold', 'qty_sold', 'units_sold_qty',
      'volume_sold', 'sales_volume', 'demand', 'demand_units', 'net_quantity',
      'net_units', 'item_quantity', 'ordered_quantity', 'order_quantity', 'ordered_qty',
      'qty_ordered', 'quantity_ordered', 'shipped_quantity', 'shipped_qty',
      'quantity_shipped', 'fulfilled_units', 'units_fulfilled', 'dispatch_qty',
      'invoiced_qty', 'sales_units', 'units_out', 'quantity_out', 'line_quantity',
      'line_qty', 'item_qty', 'qty_per_line', 'quantity_per_line',
    ],
    revenue: [
      'revenue', 'total_revenue', 'sales_value', 'gross_sales', 'net_sales',
      'total_sales', 'sales_amount', 'net_amount', 'gross_amount', 'line_total',
      'line_amount', 'total_amount', 'transaction_total', 'invoice_total',
      'extended_price', 'turnover', 'sales_value_amount', 'total_line_value',
      'gross_revenue', 'net_revenue', 'total_line_amount', 'sales_total',
    ],
    unit_cost: [
      'unit_cost', 'unitcost', 'cost_per_unit', 'cost_price', 'purchase_price',
      'purchase_cost', 'supplier_cost', 'supplier_price', 'acquisition_cost',
      'landed_cost', 'landed_unit_cost', 'avg_cost', 'average_cost', 'average_unit_cost',
      'avg_unit_cost', 'standard_cost', 'material_cost', 'wholesale_cost', 'unit_cogs',
      'cogs', 'cost_of_goods_sold', 'cost', 'item_cost', 'product_cost',
    ],
    price: [
      'price', 'unit_price', 'unitprice', 'selling_price', 'sellingprice',
      'retail_price', 'sale_price', 'sales_price', 'item_price', 'product_price',
      'price_per_unit', 'average_selling_price', 'avg_selling_price', 'current_price',
      'current_selling_price', 'net_unit_price', 'gross_unit_price', 'effective_price',
      'retail_unit_price', 'sale_rate', 'mrp',
    ],
    discount_pct: [
      'discount', 'discount_pct', 'discount_percent', 'discount_percentage',
      'discount_rate', 'markdown', 'markdown_pct', 'markdown_percent', 'markdown_rate',
      'promo_discount_pct', 'promotion_discount_pct', 'promotion_percentage',
      'offer_percentage', 'price_reduction_pct', 'discount_ratio',
    ],
    inventory_on_hand: [
      'inventory', 'inventory_on_hand', 'inventory_qty', 'inventory_quantity',
      'inventory_count', 'current_inventory', 'stock', 'stock_on_hand', 'stock_onhand',
      'on_hand', 'onhand', 'on_hand_qty', 'qty_on_hand', 'quantity_on_hand',
      'available_stock', 'stock_available', 'available_inventory', 'available_qty',
      'quantity_in_stock', 'stock_qty', 'stock_quantity', 'stock_balance',
      'closing_stock', 'ending_stock', 'ending_inventory', 'current_stock',
      'remaining_stock', 'warehouse_stock', 'available_to_sell',
    ],
    promo_active: [
      'promo', 'promotion', 'promo_active', 'promotion_active', 'campaign',
      'campaign_active', 'is_promo', 'is_promotion', 'promo_flag', 'promotion_flag',
      'campaign_flag', 'promo_indicator', 'promotion_indicator', 'on_promotion',
      'is_on_promotion', 'on_sale', 'sale_flag', 'offer_active', 'is_discounted',
    ],
    competitor_price: [
      'competitor_price', 'competitorprice', 'competitor_unit_price', 'comp_price',
      'comp_unit_price', 'rival_price', 'rival_unit_price', 'competitor_selling_price',
      'competitor_retail_price',
    ],
  };

  const fieldOrder: MappableField[] = [
    'date', 'product_id', 'product_name', 'category', 'units_sold', 'revenue',
    'unit_cost', 'competitor_price', 'price', 'discount_pct', 'inventory_on_hand',
    'promo_active',
  ];
  const mapping: ColumnMappingConfig = {};
  const claimed = new Set<string>();

  const scoreHeader = (field: MappableField, header: string): number => {
    const tokens = header.split('_').filter(Boolean);
    const tokenSet = new Set(tokens);
    const list = aliases[field];
    if (list.includes(header)) return 100 + header.length / 100;
    if (list.some(alias => header.endsWith('_' + alias) || header.startsWith(alias + '_'))) {
      return 88 + Math.min(header.length, 30) / 100;
    }

    if (field === 'date' &&
        (tokenSet.has('date') || tokenSet.has('datetime') || tokenSet.has('timestamp') ||
         (tokenSet.has('day') && ['business', 'sales', 'order', 'transaction'].some(t => tokenSet.has(t))))) return 82;

    if (field === 'product_id') {
      const productObject = tokenSet.has('product') || tokenSet.has('item') || tokenSet.has('article') || tokenSet.has('material') || tokenSet.has('style');
      const identity = ['id', 'code', 'number', 'no', 'key', 'barcode', 'sku', 'upc', 'ean', 'gtin'].some(t => tokenSet.has(t));
      const transactionIdentity = ['invoice', 'order', 'transaction', 'customer', 'supplier', 'vendor', 'store', 'location'].some(t => tokenSet.has(t));
      if (productObject && identity && !transactionIdentity) return 86;
      if (['sku', 'barcode', 'upc', 'ean', 'gtin'].some(t => tokenSet.has(t))) return 90;
    }

    if (field === 'product_name') {
      const subject = tokenSet.has('product') || tokenSet.has('item') || tokenSet.has('article') || tokenSet.has('style');
      const descriptor = ['name', 'description', 'title', 'label', 'text'].some(t => tokenSet.has(t));
      if (subject && descriptor) return 85;
    }

    if (field === 'category') {
      const taxonomy = ['category', 'subcategory', 'department', 'dept', 'family', 'class'].some(t => tokenSet.has(t));
      if (taxonomy && !tokenSet.has('customer') && !tokenSet.has('store')) return 84;
    }

    if (field === 'units_sold') {
      const quantity = ['quantity', 'qty', 'units', 'volume', 'demand'].some(t => tokenSet.has(t));
      const nonSalesQuantity = ['inventory', 'stock', 'onhand', 'on_hand', 'available', 'opening', 'closing', 'return', 'returned', 'refund'].some(t => tokenSet.has(t));
      const context = ['sold', 'sales', 'order', 'ordered', 'shipped', 'fulfilled', 'dispatch', 'invoiced', 'demand', 'out', 'line'].some(t => tokenSet.has(t));
      if (quantity && context && !nonSalesQuantity) return 84;
    }

    if (field === 'revenue') {
      const salesTerm = tokenSet.has('sales') || tokenSet.has('revenue') || tokenSet.has('turnover');
      const valueTerm = ['value', 'amount', 'total', 'gross', 'net', 'revenue', 'turnover'].some(t => tokenSet.has(t));
      if ((salesTerm && valueTerm) || tokenSet.has('revenue') || tokenSet.has('turnover')) return 82;
    }

    if (field === 'competitor_price') {
      const competitor = tokenSet.has('competitor') || tokenSet.has('rival');
      if (competitor && tokenSet.has('price')) return 90;
    }

    if (field === 'price') {
      const priceTerm = tokenSet.has('price') || tokenSet.has('rate');
      const conflictingContext = ['competitor', 'rival', 'market', 'wholesale', 'cost', 'purchase', 'shipping'].some(t => tokenSet.has(t));
      const ownPriceContext = ['unit', 'item', 'product', 'retail', 'selling', 'sale', 'current', 'effective', 'average', 'avg', 'net', 'gross', 'mrp'].some(t => tokenSet.has(t));
      if (priceTerm && ownPriceContext && !conflictingContext) return 81;
    }

    if (field === 'unit_cost') {
      const costTerm = tokenSet.has('cost') || tokenSet.has('cogs');
      const conflictingContext = ['shipping', 'freight', 'transport', 'delivery', 'marketing', 'advertising', 'promotion', 'campaign', 'operating', 'labor'].some(t => tokenSet.has(t));
      const unitContext = ['unit', 'item', 'product', 'purchase', 'supplier', 'acquisition', 'landed', 'average', 'avg', 'standard', 'material', 'wholesale', 'goods'].some(t => tokenSet.has(t));
      if (costTerm && unitContext && !conflictingContext) return 81;
    }

    if (field === 'discount_pct') {
      const discountTerm = tokenSet.has('discount') || tokenSet.has('markdown') || tokenSet.has('reduction');
      const percentageTerm = ['pct', 'percent', 'percentage', 'rate', 'ratio'].some(t => tokenSet.has(t));
      const monetaryTerm = ['amount', 'value', 'currency'].some(t => tokenSet.has(t));
      if (discountTerm && percentageTerm && !monetaryTerm) return 82;
      if (discountTerm && tokens.length === 1) return 72;
    }

    if (field === 'inventory_on_hand') {
      const stockTerm = ['inventory', 'stock', 'onhand'].some(t => tokenSet.has(t));
      const quantityTerm = ['qty', 'quantity', 'units', 'balance', 'count', 'available', 'remaining', 'closing', 'ending', 'current'].some(t => tokenSet.has(t));
      if (stockTerm && quantityTerm && !tokenSet.has('code') && !tokenSet.has('id')) return 83;
    }

    if (field === 'promo_active') {
      const promotionTerm = ['promo', 'promotion', 'campaign', 'offer'].some(t => tokenSet.has(t));
      const flagTerm = ['active', 'flag', 'indicator', 'is', 'on', 'applied', 'used'].some(t => tokenSet.has(t));
      if (promotionTerm && flagTerm) return 81;
    }

    return 0;
  };

  for (const field of fieldOrder) {
    const ranked = normalized
      .filter(candidate => !claimed.has(candidate.raw))
      .map(candidate => ({ ...candidate, score: scoreHeader(field, candidate.clean) }))
      .filter(candidate => candidate.score > 0)
      .sort((a, b) => b.score - a.score || b.clean.length - a.clean.length);

    if (ranked.length > 0) {
      const selected = ranked[0];
      Object.assign(mapping, { [field]: selected.raw });
      claimed.add(selected.raw);
    }
  }

  // Backward-compatible dimension mapping: region/store/location can act as a
  // category-like grouping only when no true product taxonomy field is present.
  // Other unmapped source columns are preserved separately as custom_attributes.
  if (!mapping.category) {
    const dimension = normalized.find(candidate =>
      !claimed.has(candidate.raw) &&
      ['region', 'store', 'store_name', 'store_id', 'country', 'location', 'sales_channel', 'channel'].includes(candidate.clean)
    );
    if (dimension) mapping.category = dimension.raw;
  }

  return mapping;
}

/**
 * Parse common retail numeric formats without guessing decimal conventions.
 * Accepts currency symbols, thousands separators, and an optional percent sign.
 * Returns null for ambiguous or non-numeric values.
 */
export function parseNumericValue(value: string, allowPercent = false): number | null {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (!text) return null;

  let isParenthesizedNegative = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    isParenthesizedNegative = true;
    text = text.slice(1, -1).trim();
  }

  text = text.replace(/[$£€₹¥]/g, '').trim();
  if (allowPercent && text.endsWith('%')) text = text.slice(0, -1).trim();

  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
    text = text.replace(/,/g, '');
  } else if (/^[+-]?\d{1,3}( \d{3})+(\.\d+)?$/.test(text)) {
    text = text.replace(/ /g, '');
  }

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return isParenthesizedNegative ? -parsed : parsed;
}

/**
 * Standardize date to YYYY-MM-DD
 */
export function parseAndNormalizeDate(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Direct ISO check YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) {
        return trimmed;
      }
    }
    return null;
  }

  // Support unambiguous slash/dash date formats without relying on host locale.
  // A value such as 01/02/2025 is ambiguous (day/month versus month/day), so reject
  // it instead of silently choosing a locale-specific interpretation.
  const yearFirst = trimmed.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (yearFirst) {
    const [, yearText, monthText, dayText] = yearFirst;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year >= 1970 && year <= 2100 &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day) {
      return `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }

  const dayMonthOrMonthDay = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dayMonthOrMonthDay) {
    const first = Number(dayMonthOrMonthDay[1]);
    const second = Number(dayMonthOrMonthDay[2]);
    const year = Number(dayMonthOrMonthDay[3]);
    let month: number;
    let day: number;
    if (first > 12 && second >= 1 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first >= 1 && first <= 12) {
      month = first;
      day = second;
    } else {
      return null;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year >= 1970 && year <= 2100 &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }

  // ISO and unambiguous textual dates can safely use the built-in parser.
  const timestamp = Date.parse(trimmed);
  if (isNaN(timestamp)) return null;

  const dt = new Date(timestamp);
  if (isNaN(dt.getTime())) return null;

  const year = dt.getUTCFullYear();
  if (year < 1970 || year > 2100) return null;

  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Primary Parse and Validation Routine
 */
export function parseAndValidateCSV(
  csvContent: string,
  userMapping?: ColumnMappingConfig,
  datasetName = 'Uploaded Retail Dataset'
): CSVParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const negativeUnitsPolicy = userMapping?.negative_units_policy === 'exclude' ? 'exclude' : 'reject';
  let excludedNegativeUnitRows = 0;

  if (!csvContent || typeof csvContent !== 'string' || csvContent.trim().length === 0) {
    return {
      success: false,
      errors: ['The uploaded file is empty. Please provide a valid CSV with headers and data rows.'],
      warnings: [],
    };
  }

  let parsedRows: string[][];
  try {
    parsedRows = parseCSVText(csvContent);
  } catch (error: any) {
    return {
      success: false,
      errors: [error?.message || 'Unable to parse CSV. Check quoting and delimiters.'],
      warnings: [],
    };
  }

  if (parsedRows.length < 2) {
    return {
      success: false,
      errors: ['Insufficient file content. The CSV must contain a header row and at least 1 observation row.'],
      warnings: [],
    };
  }

  // Extract and validate headers
  const headers = parsedRows[0].map(header => header.trim());
  if (headers.some(header => !header)) {
    return {
      success: false,
      errors: ['The CSV header row contains an empty column name. Give every column a unique, non-empty header.'],
      warnings: [],
      rawHeaders: headers,
    };
  }
  const seenHeaders = new Set<string>();
  const duplicateHeaders: string[] = [];

  headers.forEach(h => {
    const clean = h.trim();
    if (seenHeaders.has(clean)) {
      duplicateHeaders.push(clean);
    } else {
      seenHeaders.add(clean);
    }
  });

  if (duplicateHeaders.length > 0) {
    errors.push(`Duplicate column header(s) detected: ${duplicateHeaders.join(', ')}. Each column must have a unique header.`);
    return { success: false, errors, warnings, rawHeaders: headers };
  }

  // Infer or apply mapping
  const inferred = inferColumnMapping(headers);

  // Set of headers already explicitly mapped by the user
  const claimedHeaders = new Set<string>();
  if (userMapping) {
    Object.entries(userMapping).forEach(([field, value]) => {
      // negative_units_policy is an upload policy value, not a source column name.
      if (field !== 'negative_units_policy' && field !== 'currency_code' && value) claimedHeaders.add(value);
    });
  }

  const resolveField = (userVal: string | undefined, inferredVal: string | undefined): string | undefined => {
    if (userVal !== undefined) return userVal;
    if (inferredVal && !claimedHeaders.has(inferredVal)) return inferredVal;
    return undefined;
  };

  const effectiveMapping: ColumnMappingConfig = {
    date: resolveField(userMapping?.date, inferred.date),
    product_id: resolveField(userMapping?.product_id, inferred.product_id),
    product_name: userMapping?.product_name || resolveField(undefined, inferred.product_name) || userMapping?.product_id || inferred.product_id,
    category: resolveField(userMapping?.category, inferred.category),
    units_sold: resolveField(userMapping?.units_sold, inferred.units_sold),
    price: resolveField(userMapping?.price, inferred.price),
    unit_cost: resolveField(userMapping?.unit_cost, inferred.unit_cost),
    discount_pct: resolveField(userMapping?.discount_pct, inferred.discount_pct),
    inventory_on_hand: resolveField(userMapping?.inventory_on_hand, inferred.inventory_on_hand),
    promo_active: resolveField(userMapping?.promo_active, inferred.promo_active),
    competitor_price: resolveField(userMapping?.competitor_price, inferred.competitor_price),
    revenue: resolveField(userMapping?.revenue, inferred.revenue),
  };

  // Check required fields: Date and Units Sold/Demand are strictly required
  if (!effectiveMapping.date) {
    errors.push('Missing required column: "date" (or equivalent transaction date column) could not be detected or mapped.');
  } else if (!headers.includes(effectiveMapping.date)) {
    errors.push(`Mapped date column "${effectiveMapping.date}" is not present in the CSV headers.`);
  }

  if (!effectiveMapping.units_sold) {
    errors.push('Missing required column: "units_sold" (or demand/sales quantity) could not be detected or mapped.');
  } else if (!headers.includes(effectiveMapping.units_sold)) {
    errors.push(`Mapped units_sold column "${effectiveMapping.units_sold}" is not present in the CSV headers.`);
  }

  // If there are mapping errors, abort before parsing rows
  if (errors.length > 0) {
    return {
      success: false,
      errors,
      warnings,
      detectedMapping: inferred as Record<string, string>,
      rawHeaders: headers,
    };
  }

  const dateCol = effectiveMapping.date!;
  const unitsCol = effectiveMapping.units_sold!;
  const prodIdCol = effectiveMapping.product_id;
  const prodNameCol = effectiveMapping.product_name;
  const catCol = effectiveMapping.category;
  const priceCol = effectiveMapping.price;
  const costCol = effectiveMapping.unit_cost;
  const discCol = effectiveMapping.discount_pct;
  const invCol = effectiveMapping.inventory_on_hand;
  const promoCol = effectiveMapping.promo_active;
  const compCol = effectiveMapping.competitor_price;
  const revenueCol = effectiveMapping.revenue;

  // Keep every source column that was not mapped to a canonical field. These values
  // stay available for custom retail attributes, inspection, and clean CSV export.
  const mappedSourceHeaders = new Set(
    Object.values(effectiveMapping).filter(
      (value): value is string => typeof value === 'string' && headers.includes(value)
    )
  );
  const customHeaders = headers.filter(header => !mappedSourceHeaders.has(header));

  // Revenue is total sales value, not a unit price. Keep it separate so it cannot
  // accidentally create a mechanically derived price/quantity relationship.
  if (!priceCol) {
    warnings.push('Price column was not detected or mapped; price sensitivity is unavailable. A total revenue column is not treated as unit price.');
  }
  if (!revenueCol) {
    // Revenue is optional; it is not needed for demand-only analysis.
  } else {
    warnings.push('Total revenue is preserved as a separate field and is not substituted for unit price.');
  }
  if (!costCol) {
    warnings.push('Unit cost column was not detected or mapped. Financial profit margin metrics will be unavailable.');
  }
  if (!invCol) {
    warnings.push('Inventory column was not detected or mapped. Stock-out risk and inventory tracking will be unavailable.');
  }

  const cleanedRecords: DataRecord[] = [];
  const seenSourceRows = new Set<string>();
  let duplicateCount = 0;
  const optionalFieldComplete: Record<string, boolean> = {
    price: Boolean(priceCol),
    revenue: Boolean(revenueCol),
    unit_cost: Boolean(costCol),
    discount_pct: Boolean(discCol),
    inventory_on_hand: Boolean(invCol),
    promo_active: Boolean(promoCol),
    competitor_price: Boolean(compCol),
  };
  const fieldsWithBlankValues = new Set<string>();

  for (let i = 1; i < parsedRows.length; i++) {
    const lineNum = i + 1;
    const values = parsedRows[i];

    if (values.length !== headers.length) {
      errors.push(`Row ${lineNum}: Expected ${headers.length} fields but found ${values.length}. Check for missing separators or malformed quoting.`);
      continue;
    }

    // Create row lookup from the parsed record, not by splitting physical lines.
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx].trim() : '';
    });

    // A mapped optional field with blank values is not silently treated as real zero.
    // Keep ingestion flexible, but mark that field unavailable for aggregate analysis
    // and show N/A in the UI until the source data is complete.
    const mappedOptionalFields: Array<[string, string | undefined]> = [
      ['price', priceCol],
      ['revenue', revenueCol],
      ['unit_cost', costCol],
      ['discount_pct', discCol],
      ['inventory_on_hand', invCol],
      ['promo_active', promoCol],
      ['competitor_price', compCol],
    ];
    const rowMissingFields: string[] = [];
    mappedOptionalFields.forEach(([field, column]) => {
      if (column && !row[column]?.trim()) {
        optionalFieldComplete[field] = false;
        fieldsWithBlankValues.add(field);
        rowMissingFields.push(field);
      }
    });

    // Date validation
    const rawDate = row[dateCol];
    const normalizedDate = parseAndNormalizeDate(rawDate);
    if (!normalizedDate) {
      errors.push(`Row ${lineNum}: Invalid or malformed date "${rawDate}". Expected standard format (e.g. YYYY-MM-DD).`);
      if (errors.length > 20) {
        errors.push('Exceeded maximum error reporting threshold (20 errors). Please correct the CSV and re-upload.');
        break;
      }
      continue;
    }

    // Units sold validation
    const rawUnits = row[unitsCol];
    if (rawUnits === undefined || rawUnits === '') {
      errors.push(`Row ${lineNum}: Missing required units sold value.`);
      continue;
    }
    const parsedUnits = parseNumericValue(rawUnits);
    if (parsedUnits === null) {
      errors.push(`Row ${lineNum}: Invalid non-numeric units sold value "${rawUnits}".`);
      continue;
    }
    const units = parsedUnits;
    if (units < 0) {
      if (negativeUnitsPolicy === 'exclude') {
        excludedNegativeUnitRows++;
        warnings.push(`Row ${lineNum}: Negative quantity (${units}) excluded as a return/cancellation according to the selected upload policy.`);
        continue;
      }
      errors.push(`Row ${lineNum}: Negative units sold (${units}) cannot be used as demand. If these are returns/cancellations, select the explicit option to exclude negative-quantity rows, then review the excluded-row count.`);
      continue;
    }

    // Product ID. A product name can serve as a grouping key when a separate SKU is absent.
    const productNameValue = prodNameCol && row[prodNameCol] ? row[prodNameCol] : '';
    const prodId = prodIdCol && row[prodIdCol]
      ? row[prodIdCol]
      : (productNameValue || 'UNSPECIFIED_PRODUCT');
    const prodName = productNameValue || prodId;
    const category = catCol && row[catCol] ? row[catCol] : '';

    // Flag an exact repeated source row, not every repeated product/date pair.
    // Multiple transactions for the same SKU on the same date are valid POS data.
    const uniqueKey = JSON.stringify(headers.map(header => row[header] ?? ''));
    if (seenSourceRows.has(uniqueKey)) {
      duplicateCount++;
      warnings.push(`Row ${lineNum}: Exact duplicate source row detected across all CSV columns. Review it; repeated transactions may still be legitimate.`);
    } else {
      seenSourceRows.add(uniqueKey);
    }

    // Price is only populated from an actual unit-price column.
    // Never infer price as revenue / quantity: that can create a false price-response signal.
    let price = 0;
    if (priceCol && priceCol !== '__derive_unit_price_from_revenue__' && row[priceCol] !== undefined && row[priceCol] !== '') {
      const parsedPrice = parseNumericValue(row[priceCol]);
      if (parsedPrice === null || parsedPrice < 0) {
        errors.push(`Row ${lineNum}: Invalid price value "${row[priceCol]}". Price must be a non-negative number.`);
        continue;
      }
      price = parsedPrice;
    } else if (priceCol === '__derive_unit_price_from_revenue__') {
      errors.push('Unit price cannot be derived from total revenue for price-sensitivity modelling. Map a real unit-price column instead.');
      continue;
    }

    // Preserve total revenue separately when supplied.
    let revenue: number | undefined;
    if (revenueCol && row[revenueCol] !== undefined && row[revenueCol].trim() !== '') {
      const rawRevenue = row[revenueCol].trim();
      const revenueValue = parseNumericValue(rawRevenue);
      if (revenueValue === null || revenueValue < 0) {
        errors.push(`Row ${lineNum}: Invalid revenue value "${rawRevenue}". Revenue must be a non-negative number.`);
        continue;
      }
      revenue = Math.round(revenueValue * 100) / 100;
    }

    // Cost validation (optional)
    let unitCost = 0;
    if (costCol && row[costCol] !== undefined && row[costCol] !== '') {
      const parsedCost = parseNumericValue(row[costCol]);
      if (parsedCost === null || parsedCost < 0) {
        errors.push(`Row ${lineNum}: Invalid unit cost value "${row[costCol]}". Cost must be a non-negative number.`);
        continue;
      }
      unitCost = parsedCost;
    }

    // Discount validation (optional)
    let discountPct = 0;
    if (discCol && row[discCol] !== undefined && row[discCol] !== '') {
      const parsedDiscount = parseNumericValue(row[discCol], true);
      if (parsedDiscount === null || parsedDiscount < 0 || parsedDiscount > 100) {
        errors.push(`Row ${lineNum}: Invalid discount percentage "${row[discCol]}". Must be between 0 and 100.`);
        continue;
      }
      discountPct = parsedDiscount;
    }

    // Inventory validation (optional)
    let inv = 0;
    if (invCol && row[invCol] !== undefined && row[invCol] !== '') {
      const parsedInventory = parseNumericValue(row[invCol]);
      if (parsedInventory === null || parsedInventory < 0) {
        errors.push(`Row ${lineNum}: Invalid inventory value "${row[invCol]}". Inventory must be non-negative.`);
        continue;
      }
      inv = parsedInventory;
    }

    // Promotion (optional)
    let promo = false;
    if (promoCol && row[promoCol] !== undefined && row[promoCol] !== '') {
      const v = row[promoCol].toLowerCase();
      promo = v === '1' || v === 'true' || v === 'yes' || v === 'y';
    }

    // Competitor Price (optional); do not substitute the product's own price.
    let compPrice = 0;
    if (compCol && row[compCol] !== undefined && row[compCol] !== '') {
      const parsedCompetitorPrice = parseNumericValue(row[compCol]);
      if (parsedCompetitorPrice !== null && parsedCompetitorPrice >= 0) {
        compPrice = parsedCompetitorPrice;
      } else {
        errors.push(`Row ${lineNum}: Invalid competitor price "${row[compCol]}". Expected a non-negative number.`);
        continue;
      }
    }

    cleanedRecords.push({
      id: `REC-${i}`,
      date: normalizedDate,
      product_id: prodId,
      product_name: prodName,
      category,
      units_sold: Math.round(units * 100) / 100,
      ...(revenue !== undefined ? { revenue } : {}),
      ...(rowMissingFields.length > 0 ? { data_missing_fields: rowMissingFields } : {}),
      ...(customHeaders.length > 0
        ? { custom_attributes: Object.fromEntries(customHeaders.map(header => [header, row[header] ?? ''])) }
        : {}),
      price: Math.round(price * 100) / 100,
      unit_cost: Math.round(unitCost * 100) / 100,
      discount_pct: Math.round(discountPct * 10) / 10,
      promo_active: promo,
      inventory_on_hand: Math.round(inv * 100) / 100,
      competitor_price: Math.round(compPrice * 100) / 100,
    });
  }

  if (!prodIdCol && !prodNameCol) {
    warnings.push('No product identifier or name was mapped. All rows are grouped under UNSPECIFIED_PRODUCT.');
  }

  fieldsWithBlankValues.forEach(field => {
    warnings.push(`The mapped ${field} column contains blank cells. That field is marked unavailable for the entire dataset so blanks are not interpreted as zero.`);
  });
  if (excludedNegativeUnitRows > 0) {
    warnings.push(`Excluded ${excludedNegativeUnitRows} rows with negative units as returns/cancellations. Demand and all other analytics exclude these rows.`);
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
      warnings,
      detectedMapping: inferred as Record<string, string>,
      rawHeaders: headers,
    };
  }

  // Check minimum observations
  if (cleanedRecords.length < 3) {
    return {
      success: false,
      errors: [`Dataset contains insufficient observations (${cleanedRecords.length} valid rows). At least 3 observations are required.`],
      warnings,
      detectedMapping: inferred as Record<string, string>,
      rawHeaders: headers,
    };
  }

  // Sort chronologically
  cleanedRecords.sort((a, b) => a.date.localeCompare(b.date));

  const dates = cleanedRecords.map(r => r.date);
  const uniqueProds = Array.from(new Set(cleanedRecords.map(r => r.product_name)));
  const uniqueCats = Array.from(new Set(cleanedRecords.map(r => r.category).filter(Boolean)));
  const productItems = Array.from(
    new Map(cleanedRecords.map(r => [
      r.product_id,
      { id: r.product_id, name: r.product_name, ...(r.category ? { category: r.category } : {}) },
    ])).values()
  );

  const metadata: DatasetMetadata = {
    id: `ds_user_${Date.now()}`,
    name: datasetName,
    source: 'uploaded_csv',
    created_at: new Date().toISOString(),
    row_count: cleanedRecords.length,
    excluded_negative_unit_rows: excludedNegativeUnitRows,
    currency_code: userMapping?.currency_code && /^[A-Z]{3}$/.test(userMapping.currency_code)
      ? userMapping.currency_code
      : 'UNSPECIFIED',
    date_range: {
      start: dates[0] || '',
      end: dates[dates.length - 1] || '',
    },
    products: uniqueProds,
    product_items: productItems,
    categories: uniqueCats,
    is_synthetic: false,
    custom_fields: customHeaders,
    mapped_fields: {
      date: Boolean(dateCol),
      product_id: Boolean(prodIdCol || prodNameCol),
      product_name: Boolean(prodNameCol || prodIdCol),
      category: Boolean(catCol),
      units_sold: true,
      price: Boolean(priceCol && priceCol !== '__derive_unit_price_from_revenue__'),
      revenue: Boolean(revenueCol),
      unit_cost: Boolean(costCol),
      discount_pct: Boolean(discCol),
      inventory_on_hand: Boolean(invCol),
      promo_active: Boolean(promoCol),
      competitor_price: Boolean(compCol),
    },
    available_fields: {
      date: Boolean(dateCol),
      product_id: Boolean(prodIdCol || prodNameCol),
      product_name: Boolean(prodNameCol || prodIdCol),
      category: Boolean(catCol),
      units_sold: true,
      price: Boolean(priceCol && priceCol !== '__derive_unit_price_from_revenue__' && optionalFieldComplete.price),
      revenue: Boolean(revenueCol && optionalFieldComplete.revenue),
      unit_cost: Boolean(costCol && optionalFieldComplete.unit_cost),
      discount_pct: Boolean(discCol && optionalFieldComplete.discount_pct),
      inventory_on_hand: Boolean(invCol && optionalFieldComplete.inventory_on_hand),
      promo_active: Boolean(promoCol && optionalFieldComplete.promo_active),
      competitor_price: Boolean(compCol && optionalFieldComplete.competitor_price),
    },
  };

  return {
    success: true,
    errors: [],
    warnings,
    records: cleanedRecords,
    metadata,
    detectedMapping: inferred as Record<string, string>,
    rawHeaders: headers,
  };
}
