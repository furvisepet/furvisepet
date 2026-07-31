import type {
  INGESTION_BATCH_STATUSES,
  INGESTION_RECORD_STATUSES,
  INGESTION_SOURCE_TYPES,
  SUPPORTED_SIZE_UNITS,
} from "./constants";

export type IngestionBatchStatus = (typeof INGESTION_BATCH_STATUSES)[number];
export type IngestionRecordStatus = (typeof INGESTION_RECORD_STATUSES)[number];
export type IngestionSourceType = (typeof INGESTION_SOURCE_TYPES)[number];
export type NormalizedSizeUnit = (typeof SUPPORTED_SIZE_UNITS)[number];
export type DuplicateMatchType = "exact" | "probable" | "possible" | "none";
export type ProposedAction = "create" | "update" | "skip" | "merge" | "manual_review";
export type SourceUseStatus = "permitted" | "restricted" | "unresolved";
export type QualityState = "publishable" | "publishable_with_gaps" | "manual_review" | "blocked";

export type ClaimFlag = {
  claimType: string;
  publishDecision: "pending" | "allow" | "exclude";
  reviewStatus: "pending" | "reviewed";
  reviewerNote: string | null;
  sourceClaim: string;
  sourceField: string;
  sourceLocation: string;
};

export type QualityReason = {
  blocking: boolean;
  code: string;
  dimension:
    | "identity"
    | "source"
    | "species"
    | "country"
    | "category"
    | "image"
    | "description"
    | "ingredients"
    | "warnings"
    | "offer"
    | "duplicate"
    | "claims";
  message: string;
};

export type QualityAssessment = {
  assessedAt: string;
  reasons: QualityReason[];
  state: QualityState;
};

export type PublicationGateResult = {
  allowed: boolean;
  reasons: { code: string; message: string }[];
};

export type RawIngestionVariant = {
  flavor?: string | null;
  gtin?: string | null;
  name?: string | null;
  originalSizeText?: string | null;
  packageQuantity?: number | string | null;
  sizeUnit?: string | null;
  sizeValue?: number | string | null;
  sku?: string | null;
};

export type RawIngestionImage = {
  altText?: string | null;
  imageUrl?: string | null;
  isPrimary?: boolean;
  variantIdentifier?: string | null;
};

export type RawIngestionOffer = {
  affiliateUrl?: string | null;
  availability?: string | null;
  countryCode?: string | null;
  currencyCode?: string | null;
  destinationUrl?: string | null;
  externalProductId?: string | null;
  feedVersion?: string | null;
  fetchedAt?: string | null;
  freshnessStatus?: "fresh" | "stale" | "unknown";
  lastCheckedAt?: string | null;
  originalPriceAmount?: number | string | null;
  priceAmount?: number | string | null;
  retailerName?: string | null;
  sourceContentHash?: string | null;
  sourceExportDate?: string | null;
  staleThresholdHours?: number | null;
  variantIdentifier?: string | null;
};

export type RawIngestionProduct = {
  brandName?: string | null;
  categoryName?: string | null;
  countryCodes?: string[];
  description?: string | null;
  directions?: string[];
  externalId?: string | null;
  gtin?: string | null;
  images?: RawIngestionImage[];
  ingredients?: string[];
  manufacturerProductCode?: string | null;
  offers?: RawIngestionOffer[];
  productName?: string | null;
  productType?: string | null;
  rawPayload: Record<string, unknown>;
  shortDescription?: string | null;
  sourceMetadata?: Record<string, unknown>;
  sourceUrl?: string | null;
  speciesCodes?: string[];
  subcategoryName?: string | null;
  variants?: RawIngestionVariant[];
  warnings?: string[];
};

export type ParsedIngestionRecord = {
  product: RawIngestionProduct;
  rowNumber: number | null;
};

export type ProductIngestionAdapterInput = {
  body: string | Uint8Array | unknown;
  filename?: string | null;
};

export interface ProductIngestionAdapter {
  provider: string;
  sourceType: IngestionSourceType;
  parse(input: ProductIngestionAdapterInput): Promise<ParsedIngestionRecord[]>;
}

export type CategoryMapping = {
  categorySlug: string | null;
  sourceCategory: string | null;
  sourceSubcategory: string | null;
  subcategorySlug: string | null;
};

export type NormalizedIngestionVariant = {
  flavor: string | null;
  gtin: string | null;
  name: string;
  originalSizeText: string | null;
  packageQuantity: number | null;
  sizeUnit: NormalizedSizeUnit | null;
  sizeValue: string | null;
  sku: string | null;
};

export type NormalizedIngestionOffer = {
  affiliateUrl: string | null;
  availabilityStatus: "in_stock" | "out_of_stock" | "preorder" | "unknown";
  countryCode: string;
  currencyCode: string;
  destinationUrl: string;
  externalProductId: string | null;
  feedVersion: string | null;
  fetchedAt: string | null;
  freshnessStatus: "fresh" | "stale" | "unknown";
  lastCheckedAt: string | null;
  originalPriceAmount: string | null;
  priceAmount: string | null;
  retailerName: string;
  retailerSlug: string;
  sourceContentHash: string | null;
  sourceExportDate: string | null;
  staleThresholdHours: number | null;
  variantIdentifier: string | null;
};

export type NormalizedIngestionProduct = {
  brandName: string;
  brandSlug: string;
  category: CategoryMapping;
  countryCodes: string[];
  description: string | null;
  directions: string[];
  externalId: string | null;
  gtin: string | null;
  images: { altText: string | null; imageUrl: string; isPrimary: boolean; variantIdentifier: string | null }[];
  ingredients: string[];
  manufacturerProductCode: string | null;
  offers: NormalizedIngestionOffer[];
  productName: string;
  productSlug: string;
  productType: string;
  shortDescription: string | null;
  sourceMetadata: Record<string, unknown>;
  sourceUrl: string | null;
  speciesCodes: string[];
  variants: NormalizedIngestionVariant[];
  warnings: string[];
};

export type ValidationIssue = {
  code: string;
  field: string;
  message: string;
};

export type ValidationResult = {
  errors: ValidationIssue[];
  publishable: boolean;
  warnings: ValidationIssue[];
};

export type DuplicateCandidate = {
  brandName: string;
  defaultImageUrl: string | null;
  gtins: string[];
  id: string;
  manufacturerProductCode: string | null;
  name: string;
  offerExternalIds: { externalId: string; retailerName: string }[];
  productSlug: string;
  sourceExternalIds: { externalId: string; provider: string }[];
  sourceUrls: string[];
  variantSizes: string[];
};

export type DuplicateDetectionResult = {
  candidateProductId: string | null;
  matchType: DuplicateMatchType;
  proposedAction: ProposedAction;
  reasons: string[];
};

export type SourceTrustTier =
  | "internal_manual"
  | "manufacturer"
  | "trusted_distributor"
  | "structured_retailer"
  | "retailer_page"
  | "unverified_third_party";

export type BatchReviewSummary = {
  exactDuplicates: number;
  failedRecords: number;
  invalidRecords: number;
  possibleDuplicates: number;
  proposedCreates: number;
  proposedUpdates: number;
  publishedRecords: number;
  totalRecords: number;
  validRecords: number;
  validWithWarnings: number;
};
