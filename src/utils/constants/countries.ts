// src/utils/constants/countries.ts

/**
 * ISO 3166-1 alpha-2 country codes for EU member states
 * Includes "EU" as a catch-all code
 */
export const EU_COUNTRY_CODES = new Set<string>([
  "AT", // Austria
  "BE", // Belgium
  "BG", // Bulgaria
  "HR", // Croatia
  "CY", // Cyprus
  "CZ", // Czech Republic
  "DK", // Denmark
  "EE", // Estonia
  "FI", // Finland
  "FR", // France
  "DE", // Germany
  "GR", // Greece
  "HU", // Hungary
  "IE", // Ireland
  "IT", // Italy
  "LV", // Latvia
  "LT", // Lithuania
  "LU", // Luxembourg
  "MT", // Malta
  "NL", // Netherlands
  "PL", // Poland
  "PT", // Portugal
  "RO", // Romania
  "SK", // Slovakia
  "SI", // Slovenia
  "ES", // Spain
  "SE", // Sweden
  "EU", // Generic EU code
]);

/**
 * Check if a country code is an EU member state
 * @param code - ISO 3166-1 alpha-2 country code (case-insensitive)
 * @returns true if the country is in the EU
 */
export const isEUCountry = (code: string | null | undefined): boolean => {
  if (!code) return false;
  return EU_COUNTRY_CODES.has(code.trim().toUpperCase());
};

/**
 * Origin bucket for tax and accounting purposes
 */
export type OriginBucket = "DE" | "EU" | "Drittland";

/**
 * Determine the origin bucket based on country code
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns Origin bucket (DE, EU, or Drittland)
 */
export const getOriginBucket = (
  countryCode: string | null | undefined
): OriginBucket => {
  const code = (countryCode ?? "").trim().toUpperCase();
  
  if (!code) return "Drittland";
  if (code === "DE") return "DE";
  if (EU_COUNTRY_CODES.has(code)) return "EU";
  return "Drittland";
};
