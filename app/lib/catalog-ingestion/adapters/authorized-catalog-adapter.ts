import { stableContentHash } from "../hashing.ts";
import { assertCollectionLimits, isRecord } from "../schemas.ts";
import type { ParsedIngestionRecord, ProductIngestionAdapter, ProductIngestionAdapterInput, RawIngestionProduct } from "../types";
import type { AuthorizedCatalogMetadata, AuthorizedProviderContract, OfferFreshnessState } from "../providers/authorized-provider-types.ts";
import { COMMON_AUTHORIZED_FIELD_MAPPING, mapAuthorizedCatalogRow, resolveAuthorizedFieldMapping, type AuthorizedFieldMapping } from "../providers/field-mapping.ts";
import { providerCanPublish, providerPermissionSnapshot, validateAuthorizedCatalogMetadata, validateProviderContract } from "../providers/provider-contract.ts";
import { parseDelimited } from "./csv-adapter.ts";

export class AuthorizedCatalogAdapter implements ProductIngestionAdapter {
  readonly provider: string;
  readonly sourceType;
  private readonly contract: AuthorizedProviderContract;
  private readonly mapping: AuthorizedFieldMapping;
  private readonly metadata: AuthorizedCatalogMetadata;
  private readonly now: Date;

  constructor(input: {
    contract: AuthorizedProviderContract;
    mapping?: AuthorizedFieldMapping;
    metadata: AuthorizedCatalogMetadata;
    now?: Date;
  }) {
    this.contract = structuredClone(input.contract);
    this.mapping = { ...COMMON_AUTHORIZED_FIELD_MAPPING, ...(input.mapping || {}) };
    this.metadata = structuredClone(input.metadata);
    this.now = input.now || new Date();
    this.provider = input.contract.providerId;
    this.sourceType = input.contract.sourceType;
  }

  async parse(input: ProductIngestionAdapterInput): Promise<ParsedIngestionRecord[]> {
    const contractCheck = validateProviderContract(this.contract);
    const metadataCheck = validateAuthorizedCatalogMetadata(this.contract, this.metadata);
    const rows = parseRows(input.body, this.metadata.fileFormat, this.contract.refreshLimits.maxFileBytes);
    if (rows.length > this.contract.refreshLimits.maxRecords) throw new Error("Authorized catalog exceeds the provider record limit.");
    const sourceFields = unique(rows.flatMap((row) => Object.keys(row)));
    const mapping = resolveAuthorizedFieldMapping(sourceFields, this.mapping);
    return rows.map((row, index) => {
      const raw = mapAuthorizedCatalogRow(row, mapping.resolved, {
        country: this.metadata.country,
        retailerName: this.metadata.merchantOrBrand,
      });
      applyPermissions(raw, this.contract, this.metadata, this.now, mapping.issues);
      raw.sourceMetadata = {
        ...raw.sourceMetadata,
        agreementValidationIssues: contractCheck.issues,
        authorizationValidationIssues: metadataCheck.issues,
        canadaEvidence: this.metadata.country === "CA" && this.contract.allowedCountries.includes("CA") ? "authorized_catalog_country" : null,
        fieldMappingIssues: mapping.issues,
        permissionSnapshot: providerPermissionSnapshot(this.contract, this.metadata),
        providerContractRequired: true,
        sourceContentHash: stableContentHash(row),
        sourceUseStatus: providerCanPublish(this.contract, this.metadata) ? "permitted" : "unresolved",
      };
      assertCollectionLimits(raw);
      return { product: raw, rowNumber: index + 1 };
    });
  }
}

export function isAllowedAuthorizedUrl(value: string | null | undefined, allowedHosts: string[], maxLength = 4096) {
  if (!value || value.length > maxLength) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.includes(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function offerFreshness(input: {
  fetchedAt?: string | null;
  lastCheckedAt?: string | null;
  sourceExportDate?: string | null;
  staleThresholdHours: number;
}, now = new Date()): OfferFreshnessState {
  const timestamp = [input.lastCheckedAt, input.fetchedAt, input.sourceExportDate]
    .map((value) => value ? Date.parse(value) : Number.NaN)
    .find((value) => Number.isFinite(value));
  if (timestamp === undefined) return "unknown";
  return now.getTime() - timestamp > input.staleThresholdHours * 60 * 60 * 1000 ? "stale" : "fresh";
}

function applyPermissions(
  product: RawIngestionProduct,
  contract: AuthorizedProviderContract,
  metadata: AuthorizedCatalogMetadata,
  now: Date,
  mappingIssues: { code: string; field: string }[],
) {
  const permitted = new Set(metadata.permittedContentTypes.filter((value) => contract.permittedContentTypes.includes(value)));
  if (!contract.descriptionUsePermission || !permitted.has("descriptions")) product.description = null;
  if (!contract.imageUsePermission || !permitted.has("images")) product.images = [];
  if (!permitted.has("ingredients")) product.ingredients = [];
  if (!permitted.has("warnings")) product.warnings = [];
  if (!permitted.has("directions")) product.directions = [];
  if (!contract.linkUsePermission || !permitted.has("destination_links")) product.sourceUrl = null;
  const urlIssues: string[] = [];
  if (product.sourceUrl && !isAllowedAuthorizedUrl(product.sourceUrl, contract.allowedHosts)) {
    product.sourceUrl = null;
    urlIssues.push("destination_url_not_allowed");
  }
  product.images = (product.images || []).filter((image) => {
    const allowed = isAllowedAuthorizedUrl(image.imageUrl, contract.allowedHosts);
    if (!allowed) urlIssues.push("image_url_not_allowed");
    return allowed;
  });
  product.offers = (product.offers || []).flatMap((offer) => {
    const destinationAllowed = contract.linkUsePermission
      && permitted.has("destination_links")
      && isAllowedAuthorizedUrl(offer.destinationUrl, contract.allowedHosts);
    if (!destinationAllowed) {
      if (offer.destinationUrl) urlIssues.push("destination_url_not_allowed");
      return [];
    }
    const affiliateAllowed = contract.affiliateLinkPermission
      && permitted.has("affiliate_links")
      && (!offer.affiliateUrl || isAllowedAuthorizedUrl(offer.affiliateUrl, contract.allowedHosts));
    if (!affiliateAllowed && offer.affiliateUrl) urlIssues.push("affiliate_url_not_allowed");
    const freshness = offerFreshness({
      fetchedAt: offer.fetchedAt,
      lastCheckedAt: offer.lastCheckedAt,
      sourceExportDate: metadata.exportDate,
      staleThresholdHours: contract.refreshLimits.staleThresholdHours,
    }, now);
    const priceAllowed = contract.priceUsePermission && permitted.has("prices") && freshness === "fresh";
    return [{
      ...offer,
      affiliateUrl: affiliateAllowed ? offer.affiliateUrl : null,
      availability: freshness === "fresh" ? offer.availability : "unknown",
      freshnessStatus: freshness,
      originalPriceAmount: priceAllowed ? offer.originalPriceAmount : null,
      priceAmount: priceAllowed ? offer.priceAmount : null,
      sourceContentHash: stableContentHash(product.rawPayload),
      sourceExportDate: metadata.exportDate,
      staleThresholdHours: contract.refreshLimits.staleThresholdHours,
    }];
  });
  product.sourceMetadata = { fieldMappingIssues: mappingIssues, urlIssues };
}

function parseRows(body: ProductIngestionAdapterInput["body"], format: AuthorizedCatalogMetadata["fileFormat"], maxBytes: number) {
  if (format === "api" || format === "json") return jsonRows(body, maxBytes);
  if (typeof body !== "string" && !(body instanceof Uint8Array)) throw new Error("Authorized delimited catalog must be UTF-8 text.");
  const text = typeof body === "string" ? body.replace(/^\uFEFF/, "") : new TextDecoder("utf-8", { fatal: true }).decode(body).replace(/^\uFEFF/, "");
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("Authorized catalog exceeds the provider file-size limit.");
  const cells = parseDelimited(text, format === "tsv" ? "\t" : ",");
  if (!cells.length) throw new Error("Authorized catalog is empty.");
  const headers = cells[0].map((value) => value.trim());
  if (headers.some((value) => !value) || new Set(headers).size !== headers.length) throw new Error("Authorized catalog headers are blank or duplicated.");
  return cells.slice(1).filter((row) => row.some((value) => value.trim())).map((row, index) => {
    if (row.length > headers.length) throw new Error(`Authorized catalog row ${index + 2} contains extra fields.`);
    return Object.fromEntries(headers.map((header, cell) => [header, row[cell] ?? ""]));
  });
}

function jsonRows(body: ProductIngestionAdapterInput["body"], maxBytes: number): Record<string, unknown>[] {
  let parsed = body;
  if (typeof body === "string" || body instanceof Uint8Array) {
    const text = typeof body === "string" ? body : new TextDecoder("utf-8", { fatal: true }).decode(body);
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("Authorized catalog exceeds the provider file-size limit.");
    try { parsed = JSON.parse(text); } catch { throw new Error("Authorized catalog JSON is malformed."); }
  }
  const values = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.products) ? parsed.products : null;
  if (!values || values.some((value) => !isRecord(value))) throw new Error("Authorized catalog JSON must contain product objects.");
  return values.map((value) => structuredClone(value as Record<string, unknown>));
}

function unique<T>(values: T[]) { return [...new Set(values)]; }
