import type { AuthorizedProviderContract } from "./authorized-provider-types.ts";
import type { AuthorizedFieldMapping } from "./field-mapping.ts";

const BASE_REFRESH_LIMITS = {
  maxAttempts: 3,
  maxFileBytes: 5 * 1024 * 1024,
  maxRecords: 100,
  minimumIntervalMinutes: 60,
  staleThresholdHours: 24,
  timeoutMs: 8_000,
} as const;

export const IMPACT_STYLE_PROVIDER_TEMPLATE: AuthorizedProviderContract = {
  agreementEffectiveDate: null,
  agreementStatus: "pending",
  agreementType: "affiliate_network",
  allowedCountries: ["CA"],
  allowedHosts: ["api.impact.com"],
  affiliateLinkPermission: false,
  attributionRequirements: [],
  catalogAccessStatus: "pending",
  credentialEnvironmentVariableNames: ["IMPACT_ACCOUNT_SID", "IMPACT_AUTH_TOKEN", "IMPACT_CATALOG_ID"],
  descriptionUsePermission: false,
  imageUsePermission: false,
  linkUsePermission: false,
  permittedContentTypes: ["product_names"],
  priceUsePermission: false,
  providerDisplayName: "Impact catalog template (not connected)",
  providerId: "impact_catalog_template",
  refreshLimits: { ...BASE_REFRESH_LIMITS },
  sourceTrustLevel: "unverified_third_party",
  sourceType: "api",
  supportedFileFormats: ["api", "json", "csv", "tsv"],
};

export const IMPACT_STYLE_FIELD_MAPPING: AuthorizedFieldMapping = {
  affiliateUrl: ["TrackingLink"],
  brand: ["Manufacturer"],
  category: ["Category"],
  currency: ["Currency"],
  description: ["Description"],
  externalProductId: ["CatalogItemId"],
  gtin: ["Gtin"],
  imageUrl: ["ImageUrl"],
  manufacturerCode: ["Mpn"],
  originalPrice: ["OriginalPrice"],
  price: ["CurrentPrice"],
  productName: ["Name"],
  productUrl: ["Url"],
  retailerName: ["CampaignName"],
  size: ["Size"],
  sku: ["Sku"],
  stockState: ["StockAvailability"],
  subcategory: ["SubCategory"],
};

export const GENERIC_AFFILIATE_CSV_TEMPLATE: AuthorizedProviderContract = {
  ...IMPACT_STYLE_PROVIDER_TEMPLATE,
  agreementType: "affiliate_network",
  credentialEnvironmentVariableNames: [],
  providerDisplayName: "Generic affiliate CSV template (not connected)",
  providerId: "generic_affiliate_csv_template",
  sourceType: "csv",
  supportedFileFormats: ["csv", "tsv"],
};

export const GENERIC_DISTRIBUTOR_CSV_TEMPLATE: AuthorizedProviderContract = {
  ...GENERIC_AFFILIATE_CSV_TEMPLATE,
  agreementType: "authorized_distributor",
  providerDisplayName: "Generic distributor CSV template (not connected)",
  providerId: "generic_distributor_csv_template",
  sourceTrustLevel: "trusted_distributor",
};
