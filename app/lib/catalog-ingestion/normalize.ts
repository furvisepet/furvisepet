import { mapSourceCategory } from "./category-mapping.ts";
import { mapSpeciesCodes } from "./species-mapping.ts";
import type {
  NormalizedIngestionOffer,
  NormalizedIngestionProduct,
  NormalizedIngestionVariant,
  RawIngestionProduct,
} from "./types";
import { normalizeSizeUnit, parseSizeText } from "./units.ts";

export function normalizeIngestionProduct(raw: RawIngestionProduct): NormalizedIngestionProduct {
  const brandName = normalizeBrandName(raw.brandName);
  const productName = clean(raw.productName) || "";
  const species = mapSpeciesCodes(raw.speciesCodes || []);
  const variants = (raw.variants || []).map(normalizeVariant);
  return {
    brandName,
    brandSlug: slugify(brandName),
    category: mapSourceCategory(clean(raw.categoryName), clean(raw.subcategoryName)),
    countryCodes: unique((raw.countryCodes || []).map((value) => clean(value)?.toUpperCase() || "").filter(Boolean)),
    description: clean(raw.description),
    directions: unique((raw.directions || []).map(clean).filter(isString)),
    externalId: clean(raw.externalId),
    gtin: digits(raw.gtin),
    images: (raw.images || []).map((image) => ({
      altText: clean(image.altText),
      imageUrl: clean(image.imageUrl) || "",
      isPrimary: image.isPrimary === true,
      variantIdentifier: clean(image.variantIdentifier),
    })),
    ingredients: unique((raw.ingredients || []).map(clean).filter(isString)),
    manufacturerProductCode: clean(raw.manufacturerProductCode),
    offers: (raw.offers || []).map(normalizeOffer),
    productName,
    productSlug: slugify(`${brandName}-${productName}`),
    productType: clean(raw.productType) || clean(raw.subcategoryName) || clean(raw.categoryName) || "product",
    shortDescription: clean(raw.shortDescription),
    sourceMetadata: { ...(raw.sourceMetadata || {}), unsupportedSpeciesValues: species.unsupported },
    sourceUrl: clean(raw.sourceUrl),
    speciesCodes: species.codes,
    variants,
    warnings: unique((raw.warnings || []).map(clean).filter(isString)),
  };
}

export function slugify(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function normalizeDecimal(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return text;
  const negative = text.startsWith("-");
  const [wholeRaw, fractionRaw = ""] = text.replace(/^-/, "").split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionRaw.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function normalizeVariant(variant: RawIngestionProduct["variants"] extends (infer T)[] | undefined ? T : never): NormalizedIngestionVariant {
  const parsed = parseSizeText(clean(variant.originalSizeText));
  const explicitUnit = normalizeSizeUnit(clean(variant.sizeUnit));
  const explicitValue = normalizeDecimal(variant.sizeValue);
  const packageQuantity = integerOrNull(variant.packageQuantity) ?? parsed.packageQuantity;
  return {
    flavor: clean(variant.flavor),
    gtin: digits(variant.gtin),
    name: clean(variant.name) || parsed.originalSizeText || "Default",
    originalSizeText: parsed.originalSizeText,
    packageQuantity,
    sizeUnit: explicitUnit || parsed.sizeUnit,
    sizeValue: explicitValue || parsed.sizeValue,
    sku: clean(variant.sku),
  };
}

function normalizeOffer(offer: RawIngestionProduct["offers"] extends (infer T)[] | undefined ? T : never): NormalizedIngestionOffer {
  const retailerName = normalizeBrandName(offer.retailerName);
  return {
    affiliateUrl: clean(offer.affiliateUrl),
    availabilityStatus: normalizeAvailability(offer.availability),
    countryCode: clean(offer.countryCode)?.toUpperCase() || "",
    currencyCode: clean(offer.currencyCode)?.toUpperCase() || "",
    destinationUrl: clean(offer.destinationUrl) || "",
    externalProductId: clean(offer.externalProductId),
    feedVersion: clean(offer.feedVersion),
    fetchedAt: isoDateOrNull(offer.fetchedAt),
    freshnessStatus: offer.freshnessStatus === "fresh" || offer.freshnessStatus === "stale" ? offer.freshnessStatus : "unknown",
    lastCheckedAt: isoDateOrNull(offer.lastCheckedAt),
    originalPriceAmount: normalizeDecimal(offer.originalPriceAmount),
    priceAmount: normalizeDecimal(offer.priceAmount),
    retailerName,
    retailerSlug: slugify(retailerName),
    sourceContentHash: clean(offer.sourceContentHash),
    sourceExportDate: isoDateOrNull(offer.sourceExportDate),
    staleThresholdHours: nonNegativeNumberOrNull(offer.staleThresholdHours),
    variantIdentifier: clean(offer.variantIdentifier),
  };
}

function normalizeAvailability(value: string | null | undefined): NormalizedIngestionOffer["availabilityStatus"] {
  const key = clean(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "available" || key === "in_stock" || key === "instock") return "in_stock";
  if (key === "unavailable" || key === "out_of_stock" || key === "outofstock") return "out_of_stock";
  if (key === "preorder" || key === "pre_order") return "preorder";
  return "unknown";
}

function normalizeBrandName(value: string | null | undefined) {
  const normalized = clean(value) || "";
  if (!normalized || /[A-Z]/.test(normalized)) return normalized;
  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

function integerOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function nonNegativeNumberOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function isoDateOrNull(value: string | null | undefined) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function digits(value: string | null | undefined) { return clean(value)?.replace(/[\s-]+/g, "") || null; }
function clean(value: string | null | undefined) { return value?.trim().replace(/\s+/g, " ") || null; }
function unique<T>(values: T[]) { return [...new Set(values)]; }
function isString(value: string | null): value is string { return Boolean(value); }
