import { isSafeHttpUrl, validateNormalizedProduct } from "./validate.ts";
import { isAllowedAuthorizedUrl } from "./adapters/authorized-catalog-adapter.ts";
import { sourceUse } from "./quality.ts";
import type { AuthorizedContentType, ProviderPermissionSnapshot } from "./providers/authorized-provider-types.ts";
import type { ClaimFlag, DuplicateDetectionResult, NormalizedIngestionProduct, PublicationGateResult, QualityAssessment } from "./types";

export function evaluatePublicationGate({ claims, duplicate, product, quality, reviewerApproved }: {
  claims: ClaimFlag[];
  duplicate: DuplicateDetectionResult;
  product: NormalizedIngestionProduct;
  quality: QualityAssessment;
  reviewerApproved: boolean;
}): PublicationGateResult {
  const reasons: PublicationGateResult["reasons"] = [];
  const validation = validateNormalizedProduct(product);
  if (!validation.publishable) add("blocking_validation", "Blocking validation errors remain.");
  if (sourceUse(product) !== "permitted") add("source_use_not_permitted", "Source use has not been confirmed as permitted.");
  validateAuthorizedProviderPermission(product, add);
  if (!(product.gtin || product.manufacturerProductCode || product.externalId || product.sourceUrl)) add("insufficient_identity", "Product identity is insufficient.");
  if (!product.speciesCodes.includes("dog")) add("species_not_approved", "Dog suitability is not approved.");
  if (!product.countryCodes.includes("CA") || !product.sourceMetadata.canadaEvidence) add("canada_evidence_missing", "Canadian market evidence is missing.");
  if (!product.category.categorySlug) add("category_unmapped", "Category mapping is unresolved.");
  if (duplicate.proposedAction === "manual_review") add("duplicate_unresolved", "Duplicate action is unresolved.");
  if (claims.some((claim) => claim.reviewStatus !== "reviewed" || claim.publishDecision === "pending")) add("claim_review_pending", "Required claim review is incomplete.");
  if (claims.some((claim) => claim.publishDecision === "exclude")) add("excluded_claim_still_present", "A claim marked for exclusion must be removed with an audited override.");
  if (product.sourceUrl && !isSafeHttpUrl(product.sourceUrl)) add("invalid_public_url", "The source URL is invalid.");
  if (product.offers.some((offer) => !isSafeHttpUrl(offer.destinationUrl) || (offer.affiliateUrl && !isSafeHttpUrl(offer.affiliateUrl)))) add("invalid_public_url", "An offer URL is invalid.");
  if (quality.state === "blocked" || quality.state === "manual_review") add("quality_gate_failed", "The quality assessment is not publishable.");
  if (!reviewerApproved) add("reviewer_approval_missing", "Reviewer approval is required.");
  return { allowed: reasons.length === 0, reasons };

  function add(code: string, message: string) { reasons.push({ code, message }); }
}

function validateAuthorizedProviderPermission(product: NormalizedIngestionProduct, add: (code: string, message: string) => void) {
  if (product.sourceMetadata.providerContractRequired !== true) return;
  const snapshot = permissionSnapshot(product.sourceMetadata.permissionSnapshot);
  if (!snapshot) {
    add("provider_provenance_incomplete", "Authorized provider provenance is incomplete.");
    return;
  }
  if (snapshot.agreementStatus !== "approved") add("provider_agreement_not_approved", "Provider agreement status is not approved.");
  if (snapshot.catalogAccessStatus !== "active") add("provider_catalog_access_inactive", "Provider catalog access is not active.");
  if (!snapshot.provenanceComplete || !snapshot.authorizationReference || !snapshot.providerId) add("provider_provenance_incomplete", "Authorized provider provenance is incomplete.");
  if (product.countryCodes.some((country) => !snapshot.allowedCountries.includes(country))) add("provider_country_not_allowed", "The requested country is not authorized by the provider agreement.");
  const permitted = new Set(snapshot.permittedContentTypes);
  for (const [present, contentType, code] of [
    [Boolean(product.productName), "product_names", "provider_product_name_not_permitted"],
    [Boolean(product.description || product.shortDescription), "descriptions", "provider_description_not_permitted"],
    [product.images.length > 0, "images", "provider_image_not_permitted"],
    [product.offers.some((offer) => offer.priceAmount !== null || offer.originalPriceAmount !== null), "prices", "provider_price_not_permitted"],
    [product.offers.length > 0, "destination_links", "provider_link_not_permitted"],
    [product.offers.some((offer) => Boolean(offer.affiliateUrl)), "affiliate_links", "provider_affiliate_link_not_permitted"],
    [product.ingredients.length > 0, "ingredients", "provider_ingredients_not_permitted"],
    [product.warnings.length > 0, "warnings", "provider_warnings_not_permitted"],
    [product.directions.length > 0, "directions", "provider_directions_not_permitted"],
  ] as [boolean, AuthorizedContentType, string][]) {
    if (present && !permitted.has(contentType)) add(code, `Provider permission does not include ${contentType}.`);
  }
  for (const offer of product.offers) {
    if (!isAllowedAuthorizedUrl(offer.destinationUrl, snapshot.allowedHosts) || (offer.affiliateUrl && !isAllowedAuthorizedUrl(offer.affiliateUrl, snapshot.allowedHosts))) {
      add("provider_link_not_allowed", "An offer URL is outside the provider allowlist.");
      break;
    }
    if (offer.freshnessStatus === "stale" && (offer.priceAmount !== null || offer.originalPriceAmount !== null)) add("stale_price_present", "Stale prices cannot be published as current.");
  }
}

function permissionSnapshot(value: unknown): ProviderPermissionSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<ProviderPermissionSnapshot>;
  if (!Array.isArray(snapshot.allowedCountries) || !Array.isArray(snapshot.allowedHosts) || !Array.isArray(snapshot.permittedContentTypes)) return null;
  return snapshot as ProviderPermissionSnapshot;
}
