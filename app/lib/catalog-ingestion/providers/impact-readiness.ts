import { stableContentHash } from "../hashing.ts";
import { safeProviderFetch } from "../safe-provider-fetch.ts";
import type { AuthorizedProviderContract } from "./authorized-provider-types.ts";
import { providerCanPublish } from "./provider-contract.ts";

const IMPACT_HOST = "api.impact.com";
const CONTENT_TYPES = ["application/json"];

export type ImpactCredentials = { accountSid: string; authToken: string; catalogId: string };

export function impactCredentialsFromEnvironment(environment: NodeJS.ProcessEnv = process.env): ImpactCredentials {
  const accountSid = environment.IMPACT_ACCOUNT_SID?.trim() || "";
  const authToken = environment.IMPACT_AUTH_TOKEN?.trim() || "";
  const catalogId = environment.IMPACT_CATALOG_ID?.trim() || "";
  if (!accountSid || !authToken || !catalogId) throw new Error("Impact catalog access is not configured.");
  if (!/^[A-Za-z0-9-]+$/.test(accountSid) || !/^[A-Za-z0-9-]+$/.test(catalogId)) throw new Error("Impact catalog identifiers are invalid.");
  return { accountSid, authToken, catalogId };
}

export async function fetchAuthorizedImpactCatalog(input: {
  contract: AuthorizedProviderContract;
  fetchImpl?: typeof fetch;
  metadata: Parameters<typeof providerCanPublish>[1];
  previousContentHash?: string | null;
}) {
  if (input.contract.providerId !== "impact_catalog_template") throw new Error("Impact readiness requires the isolated Impact provider configuration.");
  if (!providerCanPublish(input.contract, input.metadata)) throw new Error("Impact catalog fetch is blocked until the agreement is approved and catalog access is active.");
  const credentials = impactCredentialsFromEnvironment();
  const authorization = `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64")}`;
  const request = (url: string) => safeProviderFetch(url, {
    allowedContentTypes: CONTENT_TYPES,
    allowedHostnames: [IMPACT_HOST],
    fetchImpl: input.fetchImpl,
    headers: { Authorization: authorization },
    maxAttempts: input.contract.refreshLimits.maxAttempts,
    maxResponseBytes: input.contract.refreshLimits.maxFileBytes,
    maxRetryAfterMs: 2_000,
    timeoutMs: input.contract.refreshLimits.timeoutMs,
  });
  const base = `https://${IMPACT_HOST}/Mediapartners/${credentials.accountSid}`;
  const catalogResponse = await request(`${base}/Catalogs/${credentials.catalogId}`);
  const catalog = parseObject(catalogResponse.bytes, "catalog metadata");
  if (String(catalog.Id || "") !== credentials.catalogId) throw new Error("Impact returned unexpected catalog metadata.");
  const serviceAreas = Array.isArray(catalog.ServiceAreas) ? catalog.ServiceAreas.map(String) : [];
  if (input.metadata.country === "CA" && !serviceAreas.some((value) => /^(CA|Canada)$/i.test(value))) throw new Error("Impact catalog metadata does not confirm Canadian service.");
  const campaignId = String(catalog.CampaignId || "");
  if (!/^[A-Za-z0-9-]+$/.test(campaignId)) throw new Error("Impact catalog metadata is missing a campaign relationship.");
  const contractResponse = await request(`${base}/Campaigns/${campaignId}/Contracts/Active?summary=true`);
  const relationship = parseObject(contractResponse.bytes, "active relationship");
  if (String(relationship.Status || "").toUpperCase() !== "ACTIVE") throw new Error("Impact merchant relationship is not active.");
  const pageSize = Math.min(input.contract.refreshLimits.maxRecords, 200);
  const itemsResponse = await request(`${base}/Catalogs/${credentials.catalogId}/Items?PageSize=${pageSize}`);
  const payload = parseObject(itemsResponse.bytes, "catalog items");
  const items = Array.isArray(payload.Items) ? payload.Items : Array.isArray(payload.items) ? payload.items : [];
  if (items.length > pageSize) throw new Error("Impact catalog response exceeded the controlled item limit.");
  const contentHash = stableContentHash(items);
  return {
    catalog: {
      campaignId,
      currency: typeof catalog.Currency === "string" ? catalog.Currency : null,
      dateLastUpdated: typeof catalog.DateLastUpdated === "string" ? catalog.DateLastUpdated : null,
      id: credentials.catalogId,
      numberOfItems: Number(catalog.NumberOfItems) || null,
      serviceAreas,
    },
    contentHash,
    items: contentHash === input.previousContentHash ? [] : items,
    unchanged: contentHash === input.previousContentHash,
  };
}

function parseObject(bytes: Uint8Array, label: string): Record<string, unknown> {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error(`Impact ${label} response is invalid.`);
  }
}
