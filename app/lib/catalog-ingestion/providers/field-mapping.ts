import type { RawIngestionProduct } from "../types";

export type AuthorizedCatalogField =
  | "externalProductId" | "productName" | "brand" | "description" | "category"
  | "subcategory" | "species" | "country" | "currency" | "price" | "originalPrice"
  | "stockState" | "productUrl" | "affiliateUrl" | "imageUrl" | "gtin" | "sku"
  | "manufacturerCode" | "size" | "flavor" | "ingredients" | "warnings" | "directions"
  | "retailerName" | "fetchedAt" | "lastCheckedAt" | "feedVersion";

export type AuthorizedFieldMapping = Partial<Record<AuthorizedCatalogField, readonly string[]>>;
export type FieldMappingIssue = { field: AuthorizedCatalogField; code: "ambiguous_mapping" | "missing_required_mapping"; candidates: string[] };

export const COMMON_AUTHORIZED_FIELD_MAPPING: AuthorizedFieldMapping = {
  affiliateUrl: ["affiliate_url", "tracking_url", "trackingUrl"],
  brand: ["brand", "manufacturer", "brandName", "brand_name"],
  category: ["category", "categoryName", "category_name"],
  country: ["country", "countries", "countryCode", "country_code"],
  currency: ["currency", "currencyCode", "currency_code"],
  description: ["description", "long_description", "productDescription"],
  directions: ["directions", "usage_directions"],
  externalProductId: ["external_id", "product_id", "productId", "catalog_item_id"],
  feedVersion: ["feed_version", "feedVersion", "content_hash"],
  fetchedAt: ["fetched_at", "fetchedAt"],
  flavor: ["flavor", "flavour"],
  gtin: ["gtin", "upc", "ean"],
  imageUrl: ["image_url", "imageUrl", "image", "image_link"],
  ingredients: ["ingredients", "ingredient_list"],
  lastCheckedAt: ["last_checked_at", "lastCheckedAt"],
  manufacturerCode: ["manufacturer_code", "manufacturerProductCode", "mpn"],
  originalPrice: ["original_price", "originalPrice", "regular_price"],
  price: ["price", "current_price", "currentPrice"],
  productName: ["product_name", "productName", "name", "title"],
  productUrl: ["destination_url", "product_url", "productUrl", "url", "deep_link"],
  retailerName: ["retailer", "merchant", "advertiser_name", "merchant_name"],
  size: ["size", "size_text", "package_size"],
  sku: ["sku", "stock_keeping_unit"],
  species: ["species", "pet_type", "animal_type"],
  stockState: ["availability", "stock_state", "stockStatus", "stock_availability"],
  subcategory: ["subcategory", "sub_category"],
  warnings: ["warnings", "warning_text"],
};

export function resolveAuthorizedFieldMapping(
  sourceFields: string[],
  mapping: AuthorizedFieldMapping,
  required: AuthorizedCatalogField[] = ["externalProductId", "productName", "brand"],
) {
  const resolved: Partial<Record<AuthorizedCatalogField, string>> = {};
  const issues: FieldMappingIssue[] = [];
  const fields = new Set(sourceFields);
  for (const [canonical, aliases] of Object.entries(mapping) as [AuthorizedCatalogField, readonly string[]][]) {
    const matches = aliases.filter((alias) => fields.has(alias));
    if (matches.length === 1) resolved[canonical] = matches[0];
    else if (matches.length > 1) issues.push({ candidates: matches, code: "ambiguous_mapping", field: canonical });
  }
  for (const field of required) {
    if (!resolved[field] && !issues.some((issue) => issue.field === field)) {
      issues.push({ candidates: mapping[field] ? [...mapping[field]!] : [], code: "missing_required_mapping", field });
    }
  }
  return { issues, resolved };
}

export function mapAuthorizedCatalogRow(
  row: Record<string, unknown>,
  resolved: Partial<Record<AuthorizedCatalogField, string>>,
  defaults: { country: string; retailerName: string },
): RawIngestionProduct {
  const value = (field: AuthorizedCatalogField) => scalar(resolved[field] ? row[resolved[field]!] : null);
  const countries = list(value("country") || defaults.country).map((item) => item.toUpperCase());
  const productUrl = value("productUrl");
  const affiliateUrl = value("affiliateUrl");
  const sizes = list(value("size"));
  const skus = list(value("sku"));
  const gtins = list(value("gtin"));
  const flavors = list(value("flavor"));
  const variantCount = Math.max(sizes.length, skus.length, gtins.length, flavors.length);
  const hasOffer = Boolean(productUrl || affiliateUrl || value("price") || value("stockState"));
  return {
    brandName: value("brand"),
    categoryName: value("category"),
    countryCodes: countries,
    description: value("description"),
    directions: list(value("directions")),
    externalId: value("externalProductId"),
    gtin: gtins[0] || null,
    images: value("imageUrl") ? [{ imageUrl: value("imageUrl"), isPrimary: true }] : [],
    ingredients: list(value("ingredients")),
    manufacturerProductCode: value("manufacturerCode"),
    offers: hasOffer ? [{
      affiliateUrl,
      availability: value("stockState"),
      countryCode: countries[0] || defaults.country,
      currencyCode: value("currency"),
      destinationUrl: productUrl,
      externalProductId: value("externalProductId"),
      feedVersion: value("feedVersion"),
      fetchedAt: value("fetchedAt"),
      lastCheckedAt: value("lastCheckedAt"),
      originalPriceAmount: value("originalPrice"),
      priceAmount: value("price"),
      retailerName: value("retailerName") || defaults.retailerName,
    }] : [],
    productName: value("productName"),
    productType: value("subcategory") || value("category"),
    rawPayload: structuredClone(row),
    sourceUrl: productUrl,
    speciesCodes: list(value("species")),
    subcategoryName: value("subcategory"),
    variants: Array.from({ length: variantCount }, (_, index) => ({
      flavor: flavors[index] || flavors[0] || null,
      gtin: gtins[index] || null,
      name: sizes[index] || flavors[index] || skus[index] || `Variant ${index + 1}`,
      originalSizeText: sizes[index] || null,
      sku: skus[index] || null,
    })),
    warnings: list(value("warnings")),
  };
}

function scalar(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || null;
  return null;
}
function list(value: string | null) { return value ? value.split(/[|;]+/).map((item) => item.trim()).filter(Boolean) : []; }
