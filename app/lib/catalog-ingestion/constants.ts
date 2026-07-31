export const INGESTION_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxRecordsPerBatch: 5_000,
  maxFieldBytes: 64 * 1024,
  maxStringLength: 10_000,
  maxImagesPerProduct: 12,
  maxVariantsPerProduct: 50,
  maxOffersPerProduct: 50,
  maxIngredientsPerProduct: 500,
  maxWarningsPerProduct: 100,
  maxDirectionsPerProduct: 100,
} as const;

export const INGESTION_BATCH_STATUSES = [
  "uploaded", "parsing", "validating", "ready_for_review", "partially_valid",
  "approved", "publishing", "published", "failed", "rejected", "cancelled",
] as const;

export const INGESTION_RECORD_STATUSES = [
  "pending", "parsed", "valid", "valid_with_warnings", "invalid",
  "possible_duplicate", "approved", "rejected", "published", "failed",
] as const;

export const INGESTION_SOURCE_TYPES = [
  "manual", "manufacturer_page", "manufacturer_feed", "retailer_feed",
  "retailer_page", "distributor_feed", "third_party_feed", "api", "csv", "json",
] as const;

export const SUPPORTED_SIZE_UNITS = ["g", "kg", "oz", "lb", "ml", "l", "count"] as const;
export const FORMULA_PREFIXES = ["=", "+", "-", "@"] as const;

export const DEFAULT_CSV_COLUMN_MAPPING = {
  affiliateUrl: "affiliate_url",
  availability: "availability",
  brandName: "brand",
  categoryName: "category",
  countryCodes: "countries",
  currencyCode: "currency",
  description: "description",
  destinationUrl: "destination_url",
  directions: "directions",
  externalId: "external_id",
  gtin: "gtin",
  imageUrls: "images",
  ingredients: "ingredients",
  manufacturerProductCode: "manufacturer_product_code",
  offers: "offers",
  priceAmount: "price",
  productName: "product_name",
  productType: "product_type",
  retailerExternalId: "retailer_external_id",
  retailerName: "retailer",
  shortDescription: "short_description",
  sizeText: "size",
  sourceUrl: "source_url",
  speciesCodes: "species",
  subcategoryName: "subcategory",
  variants: "variants",
  warnings: "warnings",
} as const;
