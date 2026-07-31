export const CATALOG_DEFAULT_RESULT_LIMIT = 24;
export const CATALOG_MAX_RESULT_LIMIT = 60;

export const CATALOG_PRODUCT_STATUSES = ["draft", "active", "inactive", "discontinued", "rejected"] as const;
export const CATALOG_MARKET_STATUSES = ["available", "unavailable", "unknown", "discontinued"] as const;
export const CATALOG_OFFER_AVAILABILITY = ["in_stock", "out_of_stock", "preorder", "unknown"] as const;
export const CATALOG_SUITABILITY_TYPES = ["intended", "compatible", "restricted"] as const;

export function clampCatalogResultLimit(value: number | null | undefined) {
  if (!Number.isFinite(value)) return CATALOG_DEFAULT_RESULT_LIMIT;
  return Math.min(CATALOG_MAX_RESULT_LIMIT, Math.max(1, Math.trunc(value!)));
}

export function normalizeCatalogCountryCode(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function normalizeCatalogSpeciesCode(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^[a-z][a-z0-9_]*$/.test(normalized) ? normalized : null;
}

export function normalizeCatalogCursor(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : null;
}
