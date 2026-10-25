/**
 * Currency formatting helpers for uploaded retail datasets.
 * Monetary values are not assumed to be USD when the uploader did not specify a code.
 */

export function currencyLabel(currencyCode?: string | null): string {
  if (!currencyCode || currencyCode === 'UNSPECIFIED') return 'source currency (unspecified)';
  return currencyCode;
}

export function formatCurrency(value: number | null | undefined, currencyCode?: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';

  const code = (currencyCode || 'UNSPECIFIED').toUpperCase();
  if (code === 'UNSPECIFIED') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${code}`;
  }
}

export function currencyContext(currencyCode?: string | null): string {
  return !currencyCode || currencyCode === 'UNSPECIFIED'
    ? 'Currency code not specified; amounts are shown without a currency symbol.'
    : `Amounts shown in ${currencyCode}.`;
}
