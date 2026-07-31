import type { ClaimFlag, DuplicateDetectionResult, NormalizedIngestionProduct, QualityAssessment, QualityReason, SourceUseStatus } from "./types";

export function assessIngestionQuality(product: NormalizedIngestionProduct, duplicate: DuplicateDetectionResult, claims: ClaimFlag[]): QualityAssessment {
  const reasons: QualityReason[] = [];
  const sourceUseStatus = sourceUse(product);
  if (sourceUseStatus !== "permitted") add("source", "source_use_not_permitted", "Source-use permission is restricted or unresolved.", true);
  if (!(product.externalId || product.gtin || product.manufacturerProductCode || product.sourceUrl)) add("identity", "insufficient_identity", "No stable identity signal is available.", true);
  if (!product.sourceUrl) add("source", "missing_source_url", "An inspectable source URL is required.", true);
  if (product.speciesCodes.length !== 1 || product.speciesCodes[0] !== "dog") add("species", "species_not_certain", "Dog suitability is not explicit and singular.", true);
  if (!product.countryCodes.includes("CA") || !product.sourceMetadata.canadaEvidence) add("country", "canada_evidence_missing", "Canadian market evidence is missing.", true);
  if (!product.category.categorySlug) add("category", "category_unmapped", "The source category is not mapped.", true);
  if (!product.images.length) add("image", "image_unavailable", "No display-permitted image is available.", false);
  if (!product.description && !product.shortDescription) add("description", "description_unavailable", "No reusable product description is available.", false);
  if (!product.ingredients.length) add("ingredients", "ingredients_unavailable", "The full ingredient list is unavailable.", false);
  if (!product.warnings.length) add("warnings", "warnings_unavailable", "Manufacturer warning text is unavailable.", false);
  if (!product.offers.length) add("offer", "offer_unavailable", "No current Canadian retailer offer is available.", false);
  if (duplicate.proposedAction === "manual_review") add("duplicate", "duplicate_needs_review", "A possible duplicate needs a reviewer decision.", true);
  if (claims.some((claim) => claim.reviewStatus !== "reviewed" || claim.publishDecision === "pending")) add("claims", "claims_need_review", "One or more source claims need review.", true);
  const mappingIssues = Array.isArray(product.sourceMetadata.fieldMappingIssues) ? product.sourceMetadata.fieldMappingIssues : [];
  const authorizationIssues = Array.isArray(product.sourceMetadata.authorizationValidationIssues) ? product.sourceMetadata.authorizationValidationIssues : [];
  const urlIssues = Array.isArray(product.sourceMetadata.urlIssues) ? product.sourceMetadata.urlIssues : [];
  if (mappingIssues.length) add("source", "field_mapping_needs_review", "One or more source fields are missing or ambiguous.", true);
  if (authorizationIssues.length) add("source", "provider_authorization_incomplete", "Provider authorization metadata is incomplete.", true);
  if (urlIssues.length) add("offer", "provider_url_rejected", "One or more provider URLs were rejected by the allowlist.", true);
  const state = reasons.some((reason) => reason.blocking && reason.code !== "duplicate_needs_review" && reason.code !== "claims_need_review")
    ? "blocked"
    : reasons.some((reason) => reason.code === "duplicate_needs_review" || reason.code === "claims_need_review" || reason.code === "field_mapping_needs_review")
      ? "manual_review"
      : reasons.length
        ? "publishable_with_gaps"
        : "publishable";
  return { assessedAt: new Date().toISOString(), reasons, state };

  function add(dimension: QualityReason["dimension"], code: string, message: string, blocking: boolean) {
    reasons.push({ blocking, code, dimension, message });
  }
}

export function sourceUse(product: NormalizedIngestionProduct): SourceUseStatus {
  const value = product.sourceMetadata.sourceUseStatus;
  return value === "permitted" || value === "restricted" || value === "unresolved" ? value : "unresolved";
}
