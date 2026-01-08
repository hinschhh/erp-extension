// src/utils/exports/index.ts

/**
 * Format a number using German locale (non-currency)
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "1.234,56")
 */
export const formatNumberDE = (
  value: number | null | undefined,
  decimals = 2
): string => {
  const n = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
};

/**
 * Escape a value for safe CSV usage
 * Handles quotes, newlines, and special characters
 */
export const csvEscape = (value: any): string => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // If contains comma, newline, or quotes, wrap in quotes and escape internal quotes
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Convert array of objects to CSV/TSV string
 * @param data - Array of objects to convert
 * @param headers - Array of header definitions with key and label
 * @param delimiter - Delimiter to use (default: tab for TSV)
 * @returns CSV/TSV string
 */
export const toCSV = <T extends Record<string, any>>(
  data: T[],
  headers: Array<{ key: keyof T; label: string }>,
  delimiter: "\t" | "," | ";" = "\t"
): string => {
  const headerRow = headers.map((h) => h.label).join(delimiter);
  
  const dataRows = data.map((row) =>
    headers
      .map((h) => {
        const value = row[h.key];
        return delimiter === "\t" 
          ? String(value ?? "").replace(/\r?\n/g, " ").trim() // Simple cleanup for TSV
          : csvEscape(value); // Full escaping for CSV
      })
      .join(delimiter)
  );

  return [headerRow, ...dataRows].join("\n");
};

/**
 * Trigger a file download in the browser
 * @param filename - Name of the file to download
 * @param content - File content as string
 * @param mimeType - MIME type (default: text/tab-separated-values)
 */
export const downloadTextFile = (
  filename: string,
  content: string,
  mimeType = "text/tab-separated-values;charset=utf-8"
): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
