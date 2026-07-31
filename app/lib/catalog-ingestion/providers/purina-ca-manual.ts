import type { SourceTrustTier } from "../types";

export const PURINA_CA_MANUAL_PROVIDER = {
  availabilityMappings: {
    available_in_canada: "unknown",
    not_supplied: "unknown",
  },
  batchLimits: {
    maxFileBytes: 512 * 1024,
    maxRecords: 100,
  },
  categoryMappings: {
    "dental chews": { category: "Dental", subcategory: null },
    "dry dog food": { category: "Food", subcategory: "Dry Food" },
    "wet dog food": { category: "Food", subcategory: "Wet Food" },
  },
  currency: "CAD",
  defaultCountry: "CA",
  imageUse: "not_permitted_without_separate_authorization",
  providerId: "purina_ca_official_manual",
  requestLimits: {
    maxAttempts: 3,
    maxResponseBytes: 512 * 1024,
    timeoutMs: 8_000,
  },
  sourceType: "manual" as const,
  speciesMappings: { canine: "dog", dog: "dog", dogs: "dog" },
  supportedHostnames: ["purina.ca", "www.purina.ca"],
  trustLevel: "internal_manual" as SourceTrustTier,
  unitMappings: {
    count: "count",
    g: "g",
    kg: "kg",
  },
} as const;

export const PURINA_CA_MANUAL_REQUIRED_HEADERS = [
  "external_id",
  "brand",
  "product_name",
  "product_type",
  "category",
  "subcategory",
  "species",
  "countries",
  "source_url",
  "source_reviewed_at",
  "source_use_status",
  "canada_evidence",
  "images_display_status",
  "price_authoritative",
  "availability_authoritative",
  "notes",
] as const;

