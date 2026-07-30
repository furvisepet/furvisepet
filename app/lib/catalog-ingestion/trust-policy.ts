import type { NormalizedIngestionProduct, SourceTrustTier } from "./types";

export const SOURCE_TRUST_ORDER: readonly SourceTrustTier[] = [
  "internal_manual",
  "manufacturer",
  "trusted_distributor",
  "structured_retailer",
  "retailer_page",
  "unverified_third_party",
] as const;

const PRODUCT_AUTHORITY = new Set<SourceTrustTier>(["internal_manual", "manufacturer"]);
const LABEL_AUTHORITY = new Set<SourceTrustTier>(["internal_manual", "manufacturer"]);
const OFFER_AUTHORITY = new Set<SourceTrustTier>(SOURCE_TRUST_ORDER);

export function resolveSourceTrustTier(provider: string, sourceType: string): SourceTrustTier {
  if (provider === "internal_curated" || sourceType === "manual") return "internal_manual";
  if (sourceType === "manufacturer_page" || sourceType === "manufacturer_feed") return "manufacturer";
  if (sourceType === "distributor_feed") return "trusted_distributor";
  if (sourceType === "retailer_feed") return "structured_retailer";
  if (sourceType === "retailer_page") return "retailer_page";
  return "unverified_third_party";
}

export function canSourceWriteField(
  tier: SourceTrustTier,
  field: "official_product" | "label" | "offer" | "classification",
) {
  if (field === "offer") return OFFER_AUTHORITY.has(tier);
  if (field === "label") return LABEL_AUTHORITY.has(tier);
  if (field === "classification") return tier === "internal_manual" || tier === "manufacturer" || tier === "trusted_distributor";
  return PRODUCT_AUTHORITY.has(tier);
}

export function mergeNonDestructive<T>(existing: T | null | undefined, incoming: T | null | undefined, mayOverwrite: boolean) {
  if (incoming === null || incoming === undefined || incoming === "") return existing ?? null;
  if (existing === null || existing === undefined || existing === "") return incoming;
  return mayOverwrite ? incoming : existing;
}

export function buildNonDestructiveProductPatch(
  existing: Partial<NormalizedIngestionProduct>,
  incoming: NormalizedIngestionProduct,
  tier: SourceTrustTier,
) {
  const official = canSourceWriteField(tier, "official_product");
  const classification = canSourceWriteField(tier, "classification");
  return {
    brandName: mergeNonDestructive(existing.brandName, incoming.brandName, official),
    category: mergeNonDestructive(existing.category, incoming.category, classification),
    description: mergeNonDestructive(existing.description, incoming.description, official),
    productName: mergeNonDestructive(existing.productName, incoming.productName, official),
    productType: mergeNonDestructive(existing.productType, incoming.productType, classification),
    shortDescription: mergeNonDestructive(existing.shortDescription, incoming.shortDescription, official),
  };
}
