import { JsonProductIngestionAdapter } from "../adapters/json-adapter.ts";
import { isRecord } from "../schemas.ts";
import type { ParsedIngestionRecord, ProductIngestionAdapterInput, SourceUseStatus } from "../types";

export const ORGANIC_CURATED_MODE = "organic_curated" as const;
export const ORGANIC_PERMITTED_FIELDS = [
  "product_names", "factual_identifiers", "furvise_summaries", "copied_descriptions",
  "destination_links", "images", "ingredients", "warnings", "directions",
] as const;

export type OrganicPermittedField = (typeof ORGANIC_PERMITTED_FIELDS)[number];

export type OrganicCuratedContract = {
  allowedCountries: ("CA" | "US")[];
  allowedHosts: string[];
  permittedFields: OrganicPermittedField[];
  providerDisplayName: string;
  providerId: string;
};

export type OrganicPermissionSnapshot = {
  affiliateLinkPermission: false;
  allowedCountries: ("CA" | "US")[];
  allowedHosts: string[];
  ingestionMode: typeof ORGANIC_CURATED_MODE;
  permissionReference: string;
  permittedFields: OrganicPermittedField[];
  providerDisplayName: string;
  providerId: string;
  provenanceComplete: boolean;
  sourceUseStatus: SourceUseStatus;
  verifiedAt: string;
};

export class OrganicCuratedProductAdapter {
  readonly provider: string;
  readonly sourceType = "manual" as const;
  private readonly json: JsonProductIngestionAdapter;
  private readonly contract: OrganicCuratedContract;

  constructor(contract: OrganicCuratedContract) {
    this.contract = validateOrganicContract(contract);
    this.provider = this.contract.providerId;
    this.json = new JsonProductIngestionAdapter(this.provider);
  }

  async parse(input: ProductIngestionAdapterInput): Promise<ParsedIngestionRecord[]> {
    const records = await this.json.parse(input);
    return records.map((record) => {
      const metadata = record.product.sourceMetadata ?? {};
      const sourceUseStatus = status(metadata.sourceUseStatus);
      const verifiedAt = date(metadata.verificationDate);
      const permissionReference = text(metadata.permissionReference);
      const requested = permittedFields(metadata.permittedFields);
      const allowed = requested.filter((field) => this.contract.permittedFields.includes(field));
      const snapshot: OrganicPermissionSnapshot = {
        affiliateLinkPermission: false,
        allowedCountries: [...this.contract.allowedCountries],
        allowedHosts: [...this.contract.allowedHosts],
        ingestionMode: ORGANIC_CURATED_MODE,
        permissionReference,
        permittedFields: allowed,
        providerDisplayName: this.contract.providerDisplayName,
        providerId: this.contract.providerId,
        provenanceComplete: Boolean(verifiedAt && permissionReference && requested.length > 0 && requested.length === allowed.length && requested.length === declaredFieldCount(metadata.permittedFields)),
        sourceUseStatus,
        verifiedAt,
      };
      return {
        ...record,
        product: {
          ...record.product,
          sourceMetadata: {
            ...metadata,
            ingestionMode: ORGANIC_CURATED_MODE,
            permissionSnapshot: snapshot,
            sourceUseStatus,
            verificationDate: verifiedAt,
          },
        },
      };
    });
  }
}

export function isOrganicCuratedProduct(product: { sourceMetadata: Record<string, unknown> }) {
  return product.sourceMetadata.ingestionMode === ORGANIC_CURATED_MODE;
}

export function organicPermissionSnapshot(value: unknown): OrganicPermissionSnapshot | null {
  if (!isRecord(value) || value.ingestionMode !== ORGANIC_CURATED_MODE || value.affiliateLinkPermission !== false) return null;
  if (!Array.isArray(value.allowedCountries) || !Array.isArray(value.allowedHosts) || !Array.isArray(value.permittedFields)) return null;
  return value as OrganicPermissionSnapshot;
}

function validateOrganicContract(value: OrganicCuratedContract): OrganicCuratedContract {
  if (!value || !text(value.providerId) || !text(value.providerDisplayName)) throw new Error("Organic provider identity is required.");
  if (!value.allowedCountries.length || value.allowedCountries.some((country) => country !== "CA" && country !== "US")) throw new Error("Organic providers support only CA and US.");
  if (!value.allowedHosts.length || value.allowedHosts.some((host) => !validHost(host))) throw new Error("Organic provider hosts must be exact hostnames.");
  if (!value.permittedFields.length || value.permittedFields.some((field) => !ORGANIC_PERMITTED_FIELDS.includes(field))) throw new Error("Organic provider field permissions are invalid.");
  return {
    ...structuredClone(value),
    allowedCountries: [...new Set(value.allowedCountries)],
    allowedHosts: [...new Set(value.allowedHosts.map((host) => host.toLowerCase()))],
    permittedFields: [...new Set(value.permittedFields)],
  };
}

function permittedFields(value: unknown): OrganicPermittedField[] {
  return Array.isArray(value) ? value.filter((field): field is OrganicPermittedField => typeof field === "string" && ORGANIC_PERMITTED_FIELDS.includes(field as OrganicPermittedField)) : [];
}
function declaredFieldCount(value: unknown) { return Array.isArray(value) ? value.length : 0; }
function status(value: unknown): SourceUseStatus { return value === "permitted" || value === "restricted" ? value : "unresolved"; }
function date(value: unknown) { const result = text(value); return result && Number.isFinite(Date.parse(result)) ? new Date(result).toISOString() : ""; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function validHost(value: string) { return /^[a-z0-9.-]+$/i.test(value) && !value.includes("/") && !value.startsWith(".") && !value.endsWith("."); }
