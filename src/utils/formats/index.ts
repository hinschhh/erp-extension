// src/utils/formats/index.ts

export const formatCurrencyEUR = (value: number | null | undefined) => {
  const n = typeof value === "number" ? value : 0;
  return Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
};

/**
 * Format a number using German locale (non-currency)
 * Use for displaying quantities, percentages, or other numeric values
 */
export const formatNumberDE = (
  value: number | null | undefined,
  options?: { decimals?: number; suffix?: string }
): string => {
  const n = typeof value === "number" ? value : 0;
  const decimals = options?.decimals ?? 2;
  const formatted = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
  return formatted + (options?.suffix ?? "");
};

/**
 * Normalize a string value (trim whitespace)
 * Returns empty string for null/undefined
 */
export const normalize = (value: string | null | undefined): string => 
  (value ?? "").trim();

/**
 * Normalize and convert to uppercase
 * Useful for country codes, SKUs, etc.
 */
export const normalizeUpperCase = (value: string | null | undefined): string =>
  normalize(value).toUpperCase();

export const parseNumber = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const toISODate = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // assume already yyyy-mm-dd or iso
  return v.slice(0, 10);
};

export const fromISODate = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
