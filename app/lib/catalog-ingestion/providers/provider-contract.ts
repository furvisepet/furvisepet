import type {
  AuthorizedCatalogMetadata,
  AuthorizedContentType,
  AuthorizedProviderContract,
  ProviderPermissionSnapshot,
} from "./authorized-provider-types.ts";

const CONTENT_TYPES = new Set<AuthorizedContentType>([
  "product_names", "descriptions", "images", "prices", "destination_links",
  "affiliate_links", "ingredients", "warnings", "directions",
]);

export function validateProviderContract(contract: AuthorizedProviderContract) {
  const issues: string[] = [];
  if (!identifier(contract.providerId)) issues.push("provider_id_invalid");
  if (!contract.providerDisplayName.trim()) issues.push("provider_display_name_missing");
  if (contract.agreementStatus === "approved" && !validDate(contract.agreementEffectiveDate)) issues.push("agreement_effective_date_missing");
  if (!contract.allowedCountries.length || contract.allowedCountries.some((value) => !/^[A-Z]{2}$/.test(value))) issues.push("allowed_countries_invalid");
  if (!contract.allowedHosts.length || contract.allowedHosts.some((value) => !hostname(value))) issues.push("allowed_hosts_invalid");
  if (!contract.supportedFileFormats.length) issues.push("supported_formats_missing");
  if (!contract.permittedContentTypes.includes("product_names")) issues.push("product_names_not_permitted");
  if (contract.permittedContentTypes.some((value) => !CONTENT_TYPES.has(value))) issues.push("content_type_invalid");
  if (contract.credentialEnvironmentVariableNames.some((value) => !/^[A-Z][A-Z0-9_]+$/.test(value) || value.startsWith("NEXT_PUBLIC_"))) issues.push("credential_environment_name_invalid");
  if (contract.refreshLimits.maxAttempts < 1 || contract.refreshLimits.maxAttempts > 5) issues.push("refresh_attempt_limit_invalid");
  if (contract.refreshLimits.maxFileBytes < 1 || contract.refreshLimits.maxRecords < 1 || contract.refreshLimits.timeoutMs < 1) issues.push("refresh_limits_invalid");
  permissionConsistency(contract, issues);
  return { valid: issues.length === 0, issues };
}

export function validateAuthorizedCatalogMetadata(contract: AuthorizedProviderContract, metadata: AuthorizedCatalogMetadata) {
  const issues: string[] = [];
  if (metadata.providerId !== contract.providerId) issues.push("provider_id_mismatch");
  if (!metadata.authorizationReference.trim()) issues.push("authorization_reference_missing");
  if (!metadata.merchantOrBrand.trim()) issues.push("merchant_or_brand_missing");
  if (!validDate(metadata.exportDate)) issues.push("export_date_invalid");
  if (!/^[A-Z]{2}$/.test(metadata.country) || !contract.allowedCountries.includes(metadata.country)) issues.push("country_not_authorized");
  if (!contract.supportedFileFormats.includes(metadata.fileFormat)) issues.push("file_format_not_authorized");
  if (!metadata.permittedContentTypes.length || metadata.permittedContentTypes.some((value) => !contract.permittedContentTypes.includes(value))) issues.push("content_types_not_authorized");
  if (contract.agreementStatus !== "approved") issues.push("provider_agreement_not_approved");
  if (contract.catalogAccessStatus !== "active") issues.push("catalog_access_not_active");
  return { valid: issues.length === 0, issues };
}

export function providerPermissionSnapshot(contract: AuthorizedProviderContract, metadata: AuthorizedCatalogMetadata): ProviderPermissionSnapshot {
  const contractValidation = validateProviderContract(contract);
  const metadataValidation = validateAuthorizedCatalogMetadata(contract, metadata);
  return {
    agreementEffectiveDate: contract.agreementEffectiveDate,
    agreementStatus: contract.agreementStatus,
    agreementType: contract.agreementType,
    allowedCountries: [...contract.allowedCountries],
    allowedHosts: [...contract.allowedHosts],
    affiliateLinkPermission: contract.affiliateLinkPermission,
    attributionRequirements: [...contract.attributionRequirements],
    authorizationReference: metadata.authorizationReference,
    catalogAccessStatus: contract.catalogAccessStatus,
    catalogId: metadata.catalogId,
    descriptionUsePermission: contract.descriptionUsePermission,
    exportDate: metadata.exportDate,
    fileFormat: metadata.fileFormat,
    imageUsePermission: contract.imageUsePermission,
    linkUsePermission: contract.linkUsePermission,
    merchantOrBrand: metadata.merchantOrBrand,
    permittedContentTypes: metadata.permittedContentTypes.filter((value) => contract.permittedContentTypes.includes(value)),
    priceUsePermission: contract.priceUsePermission,
    providerContractRequired: true,
    providerDisplayName: contract.providerDisplayName,
    providerId: contract.providerId,
    provenanceComplete: contractValidation.valid && metadataValidation.valid,
  };
}

export function providerCanPublish(contract: AuthorizedProviderContract, metadata: AuthorizedCatalogMetadata) {
  return validateProviderContract(contract).valid && validateAuthorizedCatalogMetadata(contract, metadata).valid;
}

function permissionConsistency(contract: AuthorizedProviderContract, issues: string[]) {
  for (const [allowed, contentType, code] of [
    [contract.imageUsePermission, "images", "image_permission_inconsistent"],
    [contract.descriptionUsePermission, "descriptions", "description_permission_inconsistent"],
    [contract.priceUsePermission, "prices", "price_permission_inconsistent"],
    [contract.linkUsePermission, "destination_links", "link_permission_inconsistent"],
    [contract.affiliateLinkPermission, "affiliate_links", "affiliate_permission_inconsistent"],
  ] as const) {
    if (contract.permittedContentTypes.includes(contentType) !== allowed) issues.push(code);
  }
}

function validDate(value: string | null) { return Boolean(value && !Number.isNaN(Date.parse(value))); }
function identifier(value: string) { return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value); }
function hostname(value: string) {
  try { return new URL(`https://${value}`).hostname === value && !value.includes("/"); } catch { return false; }
}
