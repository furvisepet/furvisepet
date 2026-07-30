import type { IngestionSourceType, SourceTrustTier } from "../types";

export type ProviderAgreementStatus = "pending" | "approved" | "suspended" | "expired" | "rejected";
export type CatalogAccessStatus = "pending" | "active" | "suspended" | "revoked";
export type AuthorizedCatalogFormat = "csv" | "tsv" | "json" | "api";
export type AuthorizedContentType =
  | "product_names"
  | "descriptions"
  | "images"
  | "prices"
  | "destination_links"
  | "affiliate_links"
  | "ingredients"
  | "warnings"
  | "directions";

export type AuthorizedProviderContract = {
  agreementEffectiveDate: string | null;
  agreementStatus: ProviderAgreementStatus;
  agreementType: "affiliate_network" | "authorized_distributor" | "authorized_retailer";
  allowedCountries: string[];
  allowedHosts: string[];
  affiliateLinkPermission: boolean;
  attributionRequirements: string[];
  catalogAccessStatus: CatalogAccessStatus;
  credentialEnvironmentVariableNames: string[];
  descriptionUsePermission: boolean;
  imageUsePermission: boolean;
  linkUsePermission: boolean;
  permittedContentTypes: AuthorizedContentType[];
  priceUsePermission: boolean;
  providerDisplayName: string;
  providerId: string;
  refreshLimits: {
    maxAttempts: number;
    maxFileBytes: number;
    maxRecords: number;
    minimumIntervalMinutes: number;
    staleThresholdHours: number;
    timeoutMs: number;
  };
  sourceTrustLevel: SourceTrustTier;
  sourceType: IngestionSourceType;
  supportedFileFormats: AuthorizedCatalogFormat[];
};

export type AuthorizedCatalogMetadata = {
  authorizationReference: string;
  catalogId: string | null;
  country: string;
  exportDate: string;
  fileFormat: AuthorizedCatalogFormat;
  merchantOrBrand: string;
  permittedContentTypes: AuthorizedContentType[];
  providerId: string;
};

export type OfferFreshnessState = "fresh" | "stale" | "unknown";

export type ProviderPermissionSnapshot = {
  agreementEffectiveDate: string | null;
  agreementStatus: ProviderAgreementStatus;
  agreementType: AuthorizedProviderContract["agreementType"];
  allowedCountries: string[];
  allowedHosts: string[];
  affiliateLinkPermission: boolean;
  attributionRequirements: string[];
  authorizationReference: string;
  catalogAccessStatus: CatalogAccessStatus;
  catalogId: string | null;
  descriptionUsePermission: boolean;
  exportDate: string;
  fileFormat: AuthorizedCatalogFormat;
  imageUsePermission: boolean;
  linkUsePermission: boolean;
  merchantOrBrand: string;
  permittedContentTypes: AuthorizedContentType[];
  priceUsePermission: boolean;
  providerContractRequired: true;
  providerDisplayName: string;
  providerId: string;
  provenanceComplete: boolean;
};
