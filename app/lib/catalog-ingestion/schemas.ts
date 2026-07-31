import { INGESTION_LIMITS } from "./constants.ts";
import type {
  RawIngestionImage,
  RawIngestionOffer,
  RawIngestionProduct,
  RawIngestionVariant,
} from "./types";

export function rawProductFromObject(value: unknown): RawIngestionProduct {
  if (!isRecord(value)) throw new Error("Each product must be a JSON object.");
  const rawPayload = structuredClone(value);
  const sourceMetadata = value.sourceMetadata ?? value.source_metadata;
  return {
    brandName: optionalScalar(value.brandName ?? value.brand_name ?? value.brand),
    categoryName: optionalScalar(value.categoryName ?? value.category_name ?? value.category),
    countryCodes: stringList(value.countryCodes ?? value.country_codes ?? value.countries),
    description: optionalScalar(value.description),
    directions: stringList(value.directions),
    externalId: optionalScalar(value.externalId ?? value.external_id),
    gtin: optionalScalar(value.gtin),
    images: objectList(value.images).map(imageFromObject),
    ingredients: stringList(value.ingredients),
    manufacturerProductCode: optionalScalar(value.manufacturerProductCode ?? value.manufacturer_product_code),
    offers: objectList(value.offers).map(offerFromObject),
    productName: optionalScalar(value.productName ?? value.product_name ?? value.name),
    productType: optionalScalar(value.productType ?? value.product_type),
    rawPayload,
    shortDescription: optionalScalar(value.shortDescription ?? value.short_description),
    sourceMetadata: isRecord(sourceMetadata) ? structuredClone(sourceMetadata) : {},
    sourceUrl: optionalScalar(value.sourceUrl ?? value.source_url),
    speciesCodes: stringList(value.speciesCodes ?? value.species_codes ?? value.species),
    subcategoryName: optionalScalar(value.subcategoryName ?? value.subcategory_name ?? value.subcategory),
    variants: objectList(value.variants).map(variantFromObject),
    warnings: stringList(value.warnings),
  };
}

export function assertCollectionLimits(product: RawIngestionProduct) {
  const checks: [unknown[], number, string][] = [
    [product.images || [], INGESTION_LIMITS.maxImagesPerProduct, "images"],
    [product.variants || [], INGESTION_LIMITS.maxVariantsPerProduct, "variants"],
    [product.offers || [], INGESTION_LIMITS.maxOffersPerProduct, "offers"],
    [product.ingredients || [], INGESTION_LIMITS.maxIngredientsPerProduct, "ingredients"],
    [product.warnings || [], INGESTION_LIMITS.maxWarningsPerProduct, "warnings"],
    [product.directions || [], INGESTION_LIMITS.maxDirectionsPerProduct, "directions"],
  ];
  for (const [items, max, field] of checks) {
    if (items.length > max) throw new Error(`${field} exceeds the per-product limit of ${max}.`);
  }
}

function imageFromObject(value: Record<string, unknown>): RawIngestionImage {
  return {
    altText: optionalScalar(value.altText ?? value.alt_text),
    imageUrl: optionalScalar(value.imageUrl ?? value.image_url ?? value.url),
    isPrimary: value.isPrimary === true || value.is_primary === true,
    variantIdentifier: optionalScalar(value.variantIdentifier ?? value.variant_identifier),
  };
}

function offerFromObject(value: Record<string, unknown>): RawIngestionOffer {
  return {
    affiliateUrl: optionalScalar(value.affiliateUrl ?? value.affiliate_url),
    availability: optionalScalar(value.availability ?? value.availabilityStatus ?? value.availability_status),
    countryCode: optionalScalar(value.countryCode ?? value.country_code),
    currencyCode: optionalScalar(value.currencyCode ?? value.currency_code ?? value.currency),
    destinationUrl: optionalScalar(value.destinationUrl ?? value.destination_url ?? value.url),
    externalProductId: optionalScalar(value.externalProductId ?? value.external_product_id),
    feedVersion: optionalScalar(value.feedVersion ?? value.feed_version),
    fetchedAt: optionalScalar(value.fetchedAt ?? value.fetched_at),
    freshnessStatus: freshness(value.freshnessStatus ?? value.freshness_status),
    lastCheckedAt: optionalScalar(value.lastCheckedAt ?? value.last_checked_at),
    originalPriceAmount: optionalNumberLike(value.originalPriceAmount ?? value.original_price_amount),
    priceAmount: optionalNumberLike(value.priceAmount ?? value.price_amount ?? value.price),
    retailerName: optionalScalar(value.retailerName ?? value.retailer_name ?? value.retailer),
    sourceContentHash: optionalScalar(value.sourceContentHash ?? value.source_content_hash),
    sourceExportDate: optionalScalar(value.sourceExportDate ?? value.source_export_date),
    staleThresholdHours: optionalNumber(value.staleThresholdHours ?? value.stale_threshold_hours),
    variantIdentifier: optionalScalar(value.variantIdentifier ?? value.variant_identifier),
  };
}

function freshness(value: unknown): RawIngestionOffer["freshnessStatus"] {
  return value === "fresh" || value === "stale" || value === "unknown" ? value : undefined;
}

function optionalNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }

function variantFromObject(value: Record<string, unknown>): RawIngestionVariant {
  return {
    flavor: optionalScalar(value.flavor),
    gtin: optionalScalar(value.gtin),
    name: optionalScalar(value.name),
    originalSizeText: optionalScalar(value.originalSizeText ?? value.original_size_text ?? value.size),
    packageQuantity: optionalNumberLike(value.packageQuantity ?? value.package_quantity),
    sizeUnit: optionalScalar(value.sizeUnit ?? value.size_unit),
    sizeValue: optionalNumberLike(value.sizeValue ?? value.size_value),
    sku: optionalScalar(value.sku),
  };
}

function optionalScalar(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

function optionalNumberLike(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string | number => typeof item === "string" || typeof item === "number").map(String);
  if (typeof value === "string") return value.split(/[|;]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function objectList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
