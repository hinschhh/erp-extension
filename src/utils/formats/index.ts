// src/utils/formats/index.ts

export const formatCurrencyEUR = (value: number | null | undefined) => {
  const n = typeof value === "number" ? value : 0;
  return Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
};

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
