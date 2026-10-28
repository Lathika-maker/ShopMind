/**
 * SHOPMIND — Deterministic Synthetic Retail Dataset
 * 
 * Generates 365 daily observations across 5 distinct retail merchandise items
 * with realistic price fluctuations, promotional campaigns, inventory levels,
 * competitor pricing, and holiday seasonality.
 * 
 * CLEARLY IDENTIFIED AS DETERMINISTIC SYNTHETIC BENCHMARK DATA.
 */

import { DataRecord, DatasetMetadata } from '../types/retail.ts';

// Deterministic linear congruential generator (LCG)
class DeterministicPRNG {
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }

  // Returns float in [0, 1)
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  // Normal distribution via Box-Muller transform
  nextGaussian(mean = 0, std = 1): number {
    const u1 = Math.max(1e-7, this.next());
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * std;
  }
}

export const PRODUCTS_CATALOG = [
  {
    id: 'PRD-101',
    name: 'Artisan Leather Tote',
    category: 'Leather Goods',
    basePrice: 285,
    unitCost: 95,
    baseDemand: 18,
    elasticity: -1.35,
    inventoryBase: 260,
  },
  {
    id: 'PRD-102',
    name: 'Cashmere Blend Knit',
    category: 'Apparel',
    basePrice: 165,
    unitCost: 52,
    baseDemand: 34,
    elasticity: -1.65,
    inventoryBase: 420,
  },
  {
    id: 'PRD-103',
    name: 'Heritage Brass Lamp',
    category: 'Home & Lighting',
    basePrice: 220,
    unitCost: 78,
    baseDemand: 11,
    elasticity: -0.92,
    inventoryBase: 180,
  },
  {
    id: 'PRD-104',
    name: 'Ceramic Pour-Over Set',
    category: 'Tableware',
    basePrice: 68,
    unitCost: 21,
    baseDemand: 46,
    elasticity: -1.82,
    inventoryBase: 580,
  },
  {
    id: 'PRD-105',
    name: 'Organic Silk Scarf',
    category: 'Accessories',
    basePrice: 95,
    unitCost: 29,
    baseDemand: 28,
    elasticity: -1.18,
    inventoryBase: 340,
  },
];

export function generateSyntheticDataset(): {
  metadata: DatasetMetadata;
  records: DataRecord[];
} {
  const prng = new DeterministicPRNG(1337);
  const records: DataRecord[] = [];

  const startDate = new Date('2025-01-01T00:00:00Z');
  const days = 365;

  for (let d = 0; d < days; d++) {
    const currentDate = new Date(startDate.getTime() + d * 86400000);
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayOfWeek = currentDate.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const month = currentDate.getUTCMonth(); // 0 to 11

    // Seasonal boost: Q4 holiday season (Nov/Dec) has +35% to +50% demand lift
    const holidaySeason = month === 10 ? 1.3 : month === 11 ? 1.48 : 1.0;
    // Summer dip in July/August
    const summerSeason = month === 6 || month === 7 ? 0.92 : 1.0;

    for (const prod of PRODUCTS_CATALOG) {
      // Occasional promotional events (roughly every 2-3 weeks, especially weekends)
      const promoEvent = (d % 17 === 0 && isWeekend) || (month === 10 && d % 7 === 0) || (month === 11 && d % 4 === 0);
      const discountPct = promoEvent ? Math.round(10 + prng.next() * 15) : 0;
      const effectivePrice = Math.round(prod.basePrice * (1 - discountPct / 100) * 100) / 100;

      // Price ratio against base
      const priceRatio = effectivePrice / prod.basePrice;
      // Price response = (P / P_base) ^ elasticity
      const priceMultiplier = Math.pow(priceRatio, prod.elasticity);

      // Competitor price moves slightly (+- 8%)
      const compNoise = prng.nextGaussian(0, 0.04);
      const competitorPrice = Math.round(prod.basePrice * (1 + compNoise) * 100) / 100;

      // Weekend uplift (+25% retail traffic)
      const weekendUplift = isWeekend ? 1.25 : 1.0;

      // Promo direct lift (traffic & advertising effect beyond pure price cut)
      const promoDirectLift = promoEvent ? 1.35 : 1.0;

      // Calculate final daily units sold with noise
      const expectedUnits = prod.baseDemand *
        priceMultiplier *
        holidaySeason *
        summerSeason *
        weekendUplift *
        promoDirectLift;

      const randomShock = prng.nextGaussian(1.0, 0.12);
      const unitsSold = Math.max(1, Math.round(expectedUnits * randomShock));

      // Inventory depletion and weekly restock
      const dayCycle = d % 7;
      let inventoryOnHand = Math.max(
        0,
        Math.round(prod.inventoryBase * (1.2 - (dayCycle / 7) * 0.4) + prng.nextGaussian(0, 15))
      );
      // Ensure inventory is at least unitsSold + buffer
      if (inventoryOnHand < unitsSold) {
        inventoryOnHand = unitsSold + Math.round(prng.next() * 20);
      }

      records.push({
        id: `REC-${prod.id}-${dateStr}`,
        date: dateStr,
        product_id: prod.id,
        product_name: prod.name,
        category: prod.category,
        units_sold: unitsSold,
        price: effectivePrice,
        unit_cost: prod.unitCost,
        discount_pct: discountPct,
        promo_active: promoEvent,
        inventory_on_hand: inventoryOnHand,
        competitor_price: competitorPrice,
        is_weekend: isWeekend,
      });
    }
  }

  const metadata: DatasetMetadata = {
    id: 'ds_benchmark_synthetic_v1',
    name: 'Benchmark Retail Daily Observations (2025 Deterministic)',
    source: 'synthetic_demo',
    created_at: new Date('2025-01-01T00:00:00Z').toISOString(),
    row_count: records.length,
    date_range: {
      start: '2025-01-01',
      end: '2025-12-31',
    },
    products: PRODUCTS_CATALOG.map(p => p.name),
    product_items: PRODUCTS_CATALOG.map(p => ({ id: p.id, name: p.name, category: p.category })),
    categories: Array.from(new Set(PRODUCTS_CATALOG.map(p => p.category))),
    is_synthetic: true,
  };

  return { metadata, records };
}

// Convert the active dataset to CSV, including any source-specific fields preserved at ingestion.
export function convertRecordsToCSV(records: DataRecord[]): string {
  if (records.length === 0) return '';

  const canonicalHeaders = [
    'date',
    'product_id',
    'product_name',
    'category',
    'units_sold',
    ...(records.some(record => typeof record.revenue === 'number') ? ['revenue'] : []),
    'price',
    'unit_cost',
    'discount_pct',
    'promo_active',
    'inventory_on_hand',
    'competitor_price',
  ];
  const customHeaders = Array.from(new Set(
    records.flatMap(record => Object.keys(record.custom_attributes || {}))
  )).filter(header => !canonicalHeaders.includes(header));
  const headers = [...canonicalHeaders, ...customHeaders];

  const escapeCSV = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };

  const rows = records.map(record => {
    const row: Record<string, unknown> = {
      date: record.date,
      product_id: record.product_id,
      product_name: record.product_name,
      category: record.category,
      units_sold: record.units_sold,
      revenue: record.revenue,
      price: record.price,
      unit_cost: record.unit_cost,
      discount_pct: record.discount_pct,
      promo_active: record.promo_active ? 1 : 0,
      inventory_on_hand: record.inventory_on_hand,
      competitor_price: record.competitor_price,
      ...(record.custom_attributes || {}),
    };
    return headers.map(header => escapeCSV(row[header]));
  });

  return [headers.map(escapeCSV).join(','), ...rows.map(row => row.join(','))].join('\n');
}
