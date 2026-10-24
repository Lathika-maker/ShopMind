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
 * Parse a complete CSV document, respecting escaped quotes, commas, CRLF/LF,
 * and line breaks embedded inside quoted fields. Blank physical lines are ignored.
 * Throws on an unterminated quoted field so malformed uploads are not misread.
 */
export function parseCSVText(content: string): string[][] {
  const input = content.replace(/^\uFEFF/, '');
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

    if (char === ',' && !inQuotes) {
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
export function inferColumnMapping(headers: string[]): ColumnMappingConfig {
  const mapping: ColumnMappingConfig = {};
  const lowerHeaders = headers.map(h => ({ raw: h, clean: h.toLowerCase().trim() }));

  for (const { raw, clean } of lowerHeaders) {
    if (!mapping.date && (clean.includes('date') || clean === 'day' || clean.includes('time'))) {
      mapping.date = raw;
    } else if (!mapping.product_id && (clean === 'product_id' || clean === 'sku' || clean === 'item_id' || clean === 'id' || clean.includes('product_id') || clean.includes('item_id') || clean.includes('sku') || clean.includes('stockcode') || clean.includes('stock_code') || clean.includes('item_code') || clean.includes('product_code') || clean === 'code')) {
      mapping.product_id = raw;
    } else if (!mapping.product_name && (clean.includes('title') || clean.includes('product_name') || clean.includes('item_name') || clean.includes('description') || clean === 'product' || clean === 'item' || clean.includes('name'))) {
      mapping.product_name = raw;
    } else if (!mapping.category && (clean.includes('cat') || clean.includes('dept') || clean.includes('group') || clean.includes('region') || clean.includes('location') || clean.includes('store'))) {
      mapping.category = raw;
    } else if (!mapping.revenue && (clean === 'revenue' || clean.includes('revenue') || clean.includes('sales_value') || clean.includes('gross_sales') || clean.includes('net_sales') || clean.includes('total_sales') || clean.includes('turnover'))) {
      mapping.revenue = raw;
    } else if (!mapping.units_sold && (clean.includes('units') || clean.includes('sold') || clean.includes('demand') || clean.includes('sales') || clean.includes('qty') || clean.includes('quantity') || clean.includes('volume'))) {
      mapping.units_sold = raw;
    } else if (!mapping.unit_cost && (clean.includes('cost') || clean.includes('cogs'))) {
      mapping.unit_cost = raw;
    } else if (!mapping.competitor_price && (clean.includes('comp') || clean.includes('competitor'))) {
      mapping.competitor_price = raw;
    } else if (!mapping.price && (clean === 'price' || clean.includes('price') || clean.includes('retail'))) {
      mapping.price = raw;
    } else if (!mapping.discount_pct && (clean.includes('disc') || clean.includes('markdown'))) {
      mapping.discount_pct = raw;
    } else if (!mapping.inventory_on_hand && (clean.includes('inv') || (clean.includes('stock') && !clean.includes('code')) || clean.includes('on_hand'))) {
      mapping.inventory_on_hand = raw;
    } else if (!mapping.promo_active && (clean.includes('promo') || clean.includes('campaign'))) {
      mapping.promo_active = raw;
    }
  }

  // Fallback: If product_name found but not product_id
  if (!mapping.product_id && mapping.product_name) {
    mapping.product_id = mapping.product_name;
  }

  return mapping;
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

  // Try standard Date parsing
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
    Object.values(userMapping).forEach(v => {
      if (v) claimedHeaders.add(v);
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
  const seenDateProdKeys = new Set<string>();
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
    mappedOptionalFields.forEach(([field, column]) => {
      if (column && !row[column]?.trim()) {
        optionalFieldComplete[field] = false;
        fieldsWithBlankValues.add(field);
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
    const units = Number(rawUnits);
    if (isNaN(units)) {
      errors.push(`Row ${lineNum}: Invalid non-numeric units sold value "${rawUnits}".`);
      continue;
    }
    if (units < 0) {
      errors.push(`Row ${lineNum}: Invalid negative units sold (${units}). Demand cannot be negative.`);
      continue;
    }

    // Product ID. A product name can serve as a grouping key when a separate SKU is absent.
    const productNameValue = prodNameCol && row[prodNameCol] ? row[prodNameCol] : '';
    const prodId = prodIdCol && row[prodIdCol]
      ? row[prodIdCol]
      : (productNameValue || 'UNSPECIFIED_PRODUCT');
    const prodName = productNameValue || prodId;
    const category = catCol && row[catCol] ? row[catCol] : 'General';

    // Duplicate detection
    const uniqueKey = `${prodId}_${normalizedDate}`;
    if (seenDateProdKeys.has(uniqueKey)) {
      duplicateCount++;
      warnings.push(`Row ${lineNum}: Duplicate observation for product "${prodId}" on date "${normalizedDate}".`);
    } else {
      seenDateProdKeys.add(uniqueKey);
    }

    // Price is only populated from an actual unit-price column.
    // Never infer price as revenue / quantity: that can create a false price-response signal.
    let price = 0;
    if (priceCol && priceCol !== '__derive_unit_price_from_revenue__' && row[priceCol] !== undefined && row[priceCol] !== '') {
      const p = Number(row[priceCol]);
      if (!Number.isFinite(p) || p < 0) {
        errors.push(`Row ${lineNum}: Invalid price value "${row[priceCol]}". Price must be a non-negative number.`);
        continue;
      }
      price = p;
    } else if (priceCol === '__derive_unit_price_from_revenue__') {
      errors.push('Unit price cannot be derived from total revenue for price-sensitivity modelling. Map a real unit-price column instead.');
      continue;
    }

    // Preserve total revenue separately when supplied.
    let revenue: number | undefined;
    if (revenueCol && row[revenueCol] !== undefined && row[revenueCol].trim() !== '') {
      const rawRevenue = row[revenueCol].trim();
      const revenueValue = Number(rawRevenue);
      if (!Number.isFinite(revenueValue) || revenueValue < 0) {
        errors.push(`Row ${lineNum}: Invalid revenue value "${rawRevenue}". Revenue must be a non-negative number.`);
        continue;
      }
      revenue = Math.round(revenueValue * 100) / 100;
    }

    // Cost validation (optional)
    let unitCost = 0;
    if (costCol && row[costCol] !== undefined && row[costCol] !== '') {
      const c = Number(row[costCol]);
      if (isNaN(c) || c < 0) {
        errors.push(`Row ${lineNum}: Invalid unit cost value "${row[costCol]}". Cost must be a non-negative number.`);
        continue;
      }
      unitCost = c;
    }

    // Discount validation (optional)
    let discountPct = 0;
    if (discCol && row[discCol] !== undefined && row[discCol] !== '') {
      const d = Number(row[discCol]);
      if (isNaN(d) || d < 0 || d > 100) {
        errors.push(`Row ${lineNum}: Invalid discount percentage "${row[discCol]}". Must be between 0 and 100.`);
        continue;
      }
      discountPct = d;
    }

    // Inventory validation (optional)
    let inv = 0;
    if (invCol && row[invCol] !== undefined && row[invCol] !== '') {
      const v = Number(row[invCol]);
      if (isNaN(v) || v < 0) {
        errors.push(`Row ${lineNum}: Invalid inventory value "${row[invCol]}". Inventory must be non-negative.`);
        continue;
      }
      inv = v;
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
      const cp = Number(row[compCol]);
      if (!isNaN(cp) && cp >= 0) {
        compPrice = cp;
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
  const uniqueCats = Array.from(new Set(cleanedRecords.map(r => r.category)));
  const productItems = Array.from(
    new Map(cleanedRecords.map(r => [r.product_id, { id: r.product_id, name: r.product_name, category: r.category }])).values()
  );

  const metadata: DatasetMetadata = {
    id: `ds_user_${Date.now()}`,
    name: datasetName,
    source: 'uploaded_csv',
    created_at: new Date().toISOString(),
    row_count: cleanedRecords.length,
    date_range: {
      start: dates[0] || '',
      end: dates[dates.length - 1] || '',
    },
    products: uniqueProds,
    product_items: productItems,
    categories: uniqueCats,
    is_synthetic: false,
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
