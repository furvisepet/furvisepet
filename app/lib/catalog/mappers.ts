import type { MockProduct, ProductCategory, ProductCountry } from "../petwise";
import type {
  CatalogDirection,
  CatalogImage,
  CatalogIngredient,
  CatalogMarket,
  CatalogOffer,
  CatalogProductDetail,
  CatalogProductSummary,
  CatalogSpecies,
  CatalogVariant,
  CatalogWarning,
} from "./types";

type UnknownRow = Record<string, unknown>;

export function mapCatalogProductRow(row: UnknownRow): CatalogProductDetail {
  const brand = asRecord(first(row.product_brands));
  const category = asRecord(first(row.product_categories));
  const images = asRows(row.product_images).map(mapImage).sort(byPosition);
  const offers = asRows(row.product_offers).map(mapOffer).filter((offer) => offer.isActive);

  return {
    advisorSummary: nullableString(row.advisor_summary),
    brand: {
      id: requiredString(brand.id, "brand id"),
      name: requiredString(brand.name, "brand name"),
      slug: requiredString(brand.slug, "brand slug"),
    },
    category: {
      id: requiredString(category.id, "category id"),
      name: requiredString(category.name, "category name"),
      parentId: nullableString(category.parent_id),
      slug: requiredString(category.slug, "category slug"),
    },
    categoryRationale: nullableString(row.category_rationale),
    cautions: nullableString(row.cautions),
    concernTags: stringArray(row.concern_tags),
    defaultImageUrl: nullableString(row.default_image_url) || images.find((image) => image.isPrimary)?.imageUrl || images[0]?.imageUrl || null,
    description: nullableString(row.description),
    directions: asRows(row.product_directions).map(mapDirection),
    id: requiredString(row.id, "product id"),
    images,
    ingredientListComplete: row.ingredient_list_complete === true,
    ingredients: asRows(row.product_ingredients).map(mapIngredient).sort(byNullablePosition),
    lifeStage: mapLifeStage(row.life_stage),
    markets: asRows(row.product_markets).map(mapMarket),
    name: requiredString(row.name, "product name"),
    offers,
    primaryProtein: nullableString(row.primary_protein),
    productType: requiredString(row.product_type, "product type"),
    searchTags: stringArray(row.search_tags),
    shortDescription: nullableString(row.short_description),
    slug: requiredString(row.slug, "product slug"),
    species: asRows(row.product_species).map(mapSpecies),
    status: mapProductStatus(row.status),
    variants: asRows(row.product_variants).filter((variant) => variant.is_active !== false).map(mapVariant),
    warnings: asRows(row.product_warnings).map(mapWarning),
  };
}

export function toCatalogProductSummary(product: CatalogProductDetail): CatalogProductSummary {
  return {
    advisorSummary: product.advisorSummary,
    brand: product.brand,
    category: product.category,
    categoryRationale: product.categoryRationale,
    cautions: product.cautions,
    concernTags: product.concernTags,
    defaultImageUrl: product.defaultImageUrl,
    id: product.id,
    ingredientListComplete: product.ingredientListComplete,
    lifeStage: product.lifeStage,
    markets: product.markets,
    name: product.name,
    offers: product.offers,
    primaryProtein: product.primaryProtein,
    productType: product.productType,
    searchTags: product.searchTags,
    shortDescription: product.shortDescription,
    slug: product.slug,
    species: product.species,
    status: product.status,
  };
}

export function catalogProductToLegacyProduct(product: CatalogProductDetail, countryCode: string): MockProduct {
  if (countryCode !== "CA" && countryCode !== "US") throw new Error("Unsupported catalog country.");
  const country = (countryCode === "CA" ? "CA" : "US") as ProductCountry;
  const offer = product.offers
    .filter((item) => item.countryCode === country && item.isActive)
    .sort(compareCatalogOffers)[0];
  const category = mapLegacyCategory(product.category.slug);
  const ingredients = product.ingredients.map((ingredient) => ingredient.labelName);
  const warnings = product.warnings.map((warning) => warning.text);
  const directions = product.directions.map((direction) => direction.text).join("\n\n");

  return {
    active: product.status === "active",
    availabilityStatus: offer?.availabilityStatus,
    availableCountries: product.markets
      .filter((market) => market.status === "available" && market.countryCode === country)
      .map((market) => market.countryCode as ProductCountry),
    avoidIngredientKeywords: ingredients,
    brand: product.brand.name,
    category,
    cautions: product.cautions || warnings[0] || "Check the package before use.",
    concernTags: product.concernTags as MockProduct["concernTags"],
    currency: offer?.currencyCode,
    enrichmentStatus: product.ingredientListComplete ? "verified" : "partial",
    evidenceType: "catalog",
    excludedIngredients: ingredients,
    id: product.id,
    imageUrl: product.defaultImageUrl || undefined,
    ingredientHighlights: ingredients.slice(0, 4),
    ingredientsVerified: product.ingredientListComplete,
    lastVerifiedAt: product.markets.find((market) => market.countryCode === country)?.lastVerifiedAt || undefined,
    lifeStage: product.lifeStage,
    name: product.name,
    productPageUrl: offer?.publicUrl,
    price: offer?.priceAmount === null || offer?.priceAmount === undefined ? undefined : Number(offer.priceAmount),
    priceVerifiedAt: offer?.priceAmount ? offer.lastCheckedAt || undefined : undefined,
    productTypeLabel: humanize(product.productType),
    protein: product.primaryProtein || "Not specified",
    recommendationKind: "product",
    retailer: offer?.retailer.name,
    shortDescription: product.shortDescription || product.advisorSummary || undefined,
    source: "curated",
    species: product.species
      .filter((item) => item.suitabilityType !== "restricted" && (item.code === "dog" || item.code === "cat"))
      .map((item) => item.code as "dog" | "cat"),
    subcategory: product.productType,
    tags: product.searchTags,
    verifiedDescription: product.description || product.shortDescription || undefined,
    verifiedDirections: directions || undefined,
    verifiedIngredients: ingredients.length ? ingredients : undefined,
    verifiedProductPageUrl: offer?.destinationUrl,
    verifiedWarnings: warnings.length ? warnings : undefined,
    verificationSource: "manual_review",
    whyCategoryFits: product.categoryRationale || product.shortDescription || "This product relates to the search category.",
    whyItFits: product.advisorSummary || product.shortDescription || product.description || "Review the product details for fit.",
  };
}

function mapOffer(row: UnknownRow): CatalogOffer {
  const retailer = asRecord(first(row.retailers));
  const affiliateUrl = validHttpUrl(row.affiliate_url);
  const destinationUrl = validHttpUrl(row.destination_url) || "";
  return {
    affiliateUrl,
    availabilityStatus: mapOfferAvailability(row.availability_status),
    countryCode: requiredString(row.country_code, "offer country"),
    currencyCode: requiredString(row.currency_code, "offer currency"),
    destinationUrl,
    id: requiredString(row.id, "offer id"),
    isActive: row.is_active !== false,
    lastCheckedAt: nullableString(row.last_checked_at),
    originalPriceAmount: decimalString(row.original_price_amount),
    priceAmount: decimalString(row.price_amount),
    // The current Shop select does not load affiliate-use authorization.
    // Keep the value in the server-side domain model, but expose only the
    // organic destination until provenance proves affiliate use is permitted.
    publicUrl: destinationUrl,
    retailer: {
      id: requiredString(retailer.id, "retailer id"),
      name: requiredString(retailer.name, "retailer name"),
      slug: requiredString(retailer.slug, "retailer slug"),
    },
    variantId: nullableString(row.variant_id),
  };
}

export function compareCatalogOffers(a: CatalogOffer, b: CatalogOffer) {
  const stockDifference = Number(b.availabilityStatus === "in_stock") - Number(a.availabilityStatus === "in_stock");
  if (stockDifference) return stockDifference;
  const urlDifference = Number(Boolean(b.publicUrl)) - Number(Boolean(a.publicUrl));
  if (urlDifference) return urlDifference;
  if (a.currencyCode === b.currencyCode && a.priceAmount !== null && b.priceAmount !== null) {
    const priceDifference = Number(a.priceAmount) - Number(b.priceAmount);
    if (priceDifference) return priceDifference;
  }
  const retailerDifference = a.retailer.name.localeCompare(b.retailer.name);
  return retailerDifference || a.id.localeCompare(b.id);
}

function mapImage(row: UnknownRow): CatalogImage {
  return { altText: nullableString(row.alt_text), id: requiredString(row.id, "image id"), imageUrl: requiredString(row.image_url, "image URL"), isPrimary: row.is_primary === true, position: integer(row.position), variantId: nullableString(row.variant_id) };
}

function mapIngredient(row: UnknownRow): CatalogIngredient {
  const ingredient = asRecord(first(row.ingredients));
  return { canonicalName: nullableString(ingredient.canonical_name), id: requiredString(row.id, "ingredient id"), isActiveIngredient: typeof row.is_active_ingredient === "boolean" ? row.is_active_ingredient : null, labelName: requiredString(row.label_name, "ingredient label"), position: nullableInteger(row.position), variantId: nullableString(row.variant_id) };
}

function mapWarning(row: UnknownRow): CatalogWarning {
  return { id: requiredString(row.id, "warning id"), text: requiredString(row.text, "warning text"), type: requiredString(row.warning_type, "warning type"), variantId: nullableString(row.variant_id) };
}

function mapDirection(row: UnknownRow): CatalogDirection {
  return { id: requiredString(row.id, "direction id"), text: requiredString(row.text, "direction text"), type: requiredString(row.direction_type, "direction type"), variantId: nullableString(row.variant_id) };
}

function mapVariant(row: UnknownRow): CatalogVariant {
  return { flavor: nullableString(row.flavor), gtin: nullableString(row.gtin), id: requiredString(row.id, "variant id"), isDefault: row.is_default === true, name: requiredString(row.name, "variant name"), packageQuantity: nullableInteger(row.package_quantity), sizeUnit: nullableString(row.size_unit), sizeValue: decimalString(row.size_value), sku: nullableString(row.sku) };
}

function mapSpecies(row: UnknownRow): CatalogSpecies {
  const species = asRecord(first(row.species));
  const suitability = String(row.suitability_type);
  return { code: requiredString(species.code, "species code"), id: requiredString(species.id, "species id"), name: requiredString(species.name, "species name"), suitabilityType: suitability === "compatible" || suitability === "restricted" ? suitability : "intended" };
}

function mapMarket(row: UnknownRow): CatalogMarket {
  const status = String(row.status);
  return { countryCode: requiredString(row.country_code, "market country"), lastVerifiedAt: nullableString(row.last_verified_at), status: status === "available" || status === "unavailable" || status === "discontinued" ? status : "unknown" };
}

function mapLegacyCategory(slug: string): ProductCategory {
  if (slug === "food") return "food";
  if (slug === "grooming") return "grooming";
  return "health_essentials";
}

function mapProductStatus(value: unknown): CatalogProductDetail["status"] {
  const status = String(value);
  return status === "active" || status === "inactive" || status === "discontinued" || status === "rejected" ? status : "draft";
}

function mapOfferAvailability(value: unknown): CatalogOffer["availabilityStatus"] {
  const status = String(value);
  return status === "in_stock" || status === "out_of_stock" || status === "preorder" ? status : "unknown";
}

function mapLifeStage(value: unknown): CatalogProductDetail["lifeStage"] {
  return value === "puppy" || value === "kitten" || value === "adult" || value === "senior" ? value : "all";
}

function decimalString(value: unknown) {
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value.toFixed(2);
  return null;
}

function validHttpUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value.trim() : null;
  } catch {
    return null;
  }
}

function asRows(value: unknown): UnknownRow[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function asRecord(value: unknown): UnknownRow { return isRecord(value) ? value : {}; }
function first(value: unknown) { return Array.isArray(value) ? value[0] : value; }
function isRecord(value: unknown): value is UnknownRow { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function requiredString(value: unknown, label: string) { if (typeof value === "string" && value.trim()) return value.trim(); throw new Error(`Invalid catalog ${label}.`); }
function nullableString(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : []; }
function integer(value: unknown) { return typeof value === "number" && Number.isInteger(value) ? value : 0; }
function nullableInteger(value: unknown) { return typeof value === "number" && Number.isInteger(value) ? value : null; }
function byPosition(a: CatalogImage, b: CatalogImage) { return a.position - b.position; }
function byNullablePosition(a: CatalogIngredient, b: CatalogIngredient) { return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER); }
function humanize(value: string) { return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
