import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PurinaCanadaManualAdapter } from "../app/lib/catalog-ingestion/adapters/purina-ca-manual-adapter.ts";
import { detectClaimFlags } from "../app/lib/catalog-ingestion/claims.ts";
import { normalizeIngestionProduct } from "../app/lib/catalog-ingestion/normalize.ts";
import { processIngestionInput } from "../app/lib/catalog-ingestion/pipeline.ts";
import { evaluatePublicationGate } from "../app/lib/catalog-ingestion/publication-gate.ts";
import { PURINA_CA_MANUAL_PROVIDER } from "../app/lib/catalog-ingestion/providers/purina-ca-manual.ts";
import { assessIngestionQuality } from "../app/lib/catalog-ingestion/quality.ts";
import { safeProviderFetch } from "../app/lib/catalog-ingestion/safe-provider-fetch.ts";
import { isDisplayableProductImageUrl, validateNormalizedProduct } from "../app/lib/catalog-ingestion/validate.ts";

const csvPath = new URL("../data/product-providers/purina-ca-001/products.csv", import.meta.url);
const migrationPath = new URL("../supabase/migrations/20260723030000_add_provider_quality_review_gate.sql", import.meta.url);

async function loadProvider() {
  const body = await readFile(csvPath, "utf8");
  return processIngestionInput({ adapter: new PurinaCanadaManualAdapter(), input: { body, filename: "products.csv" } });
}

test("provider 001 parses the controlled official Canada batch and preserves every raw row", async () => {
  const result = await loadProvider();
  assert.equal(result.records.length, 49);
  assert.equal(result.summary.invalidRecords, 0);
  assert.equal(result.records.every((record) => record.parsed.product.rawPayload.source_url === record.normalized.sourceUrl), true);
  assert.equal(result.records.every((record) => record.normalized.countryCodes.join() === "CA"), true);
  assert.equal(result.records.every((record) => record.normalized.speciesCodes.join() === "dog"), true);
  assert.deepEqual(new Set(result.records.map((record) => record.normalized.category.categorySlug)), new Set(["food", "dental"]));
  assert.equal(result.records.filter((record) => record.quality.state === "blocked").length, 49);
  assert.equal(result.records.flatMap((record) => record.claims).length, 2);
});

test("provider 001 rejects malformed headers, unapproved hosts, and ambiguous markets", async () => {
  const body = await readFile(csvPath, "utf8");
  const adapter = new PurinaCanadaManualAdapter();
  await assert.rejects(() => adapter.parse({ body: body.replace("external_id,", "id,"), filename: "bad.csv" }), /headers must exactly match/);
  await assert.rejects(() => adapter.parse({ body: body.replace("https://www.purina.ca/", "https://example.com/"), filename: "bad.csv" }), /allowlisted/);
  await assert.rejects(() => adapter.parse({ body: body.replace(",dog,CA,", ",dog,US,"), filename: "bad.csv" }), /scoped only to Canada/);
});

test("provider configuration is isolated and conservative", () => {
  assert.equal(PURINA_CA_MANUAL_PROVIDER.providerId, "purina_ca_official_manual");
  assert.deepEqual(PURINA_CA_MANUAL_PROVIDER.supportedHostnames, ["purina.ca", "www.purina.ca"]);
  assert.equal(PURINA_CA_MANUAL_PROVIDER.defaultCountry, "CA");
  assert.equal(PURINA_CA_MANUAL_PROVIDER.speciesMappings.canine, "dog");
  assert.equal(PURINA_CA_MANUAL_PROVIDER.categoryMappings["dental chews"].category, "Dental");
  assert.equal(PURINA_CA_MANUAL_PROVIDER.currency, "CAD");
  assert.equal(PURINA_CA_MANUAL_PROVIDER.batchLimits.maxRecords, 100);
  assert.equal("credential" in PURINA_CA_MANUAL_PROVIDER, false);
});

test("safe provider access validates host, content type, response size, and bounded retries", async () => {
  const options = {
    allowedContentTypes: ["text/csv"],
    allowedHostnames: ["feed.example.ca"],
    maxAttempts: 3,
    maxResponseBytes: 32,
    timeoutMs: 50,
  };
  await assert.rejects(() => safeProviderFetch("https://evil.example/file.csv", { ...options, fetchImpl: fetch }), /not allowlisted/);
  await assert.rejects(() => safeProviderFetch("https://feed.example.ca/file.csv", {
    ...options,
    fetchImpl: async () => new Response("{}", { headers: { "content-type": "application/json" } }),
  }), (error) => /content type/.test(String(error.cause)));
  await assert.rejects(() => safeProviderFetch("https://feed.example.ca/file.csv", {
    ...options,
    fetchImpl: async () => new Response("x".repeat(33), { headers: { "content-type": "text/csv" } }),
  }), (error) => /too large/.test(String(error.cause)));
  let attempts = 0;
  const fetched = await safeProviderFetch("https://feed.example.ca/file.csv", {
    ...options,
    fetchImpl: async () => {
      attempts += 1;
      return attempts < 3
        ? new Response("retry", { status: 503 })
        : new Response("ok", { headers: { "content-type": "text/csv" } });
    },
  });
  assert.equal(attempts, 3);
  assert.equal(new TextDecoder().decode(fetched.bytes), "ok");
});

test("safe provider access times out without logging request credentials", async () => {
  const fetchImpl = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  await assert.rejects(() => safeProviderFetch("https://feed.example.ca/file.csv?token=secret", {
    allowedContentTypes: ["text/csv"],
    allowedHostnames: ["feed.example.ca"],
    fetchImpl,
    maxAttempts: 1,
    maxResponseBytes: 32,
    timeoutMs: 1,
  }), (error) => !String(error).includes("token=secret") && /failed after 1 attempt/.test(String(error)));
});

test("image, label wording, money, and claim handling preserve facts without invention", () => {
  assert.equal(isDisplayableProductImageUrl("https://cdn.example.ca/product.jpg"), true);
  assert.equal(isDisplayableProductImageUrl("http://cdn.example.ca/product.jpg"), false);
  assert.equal(isDisplayableProductImageUrl("https://cdn.example.ca/placeholder.png"), false);
  const product = normalizeIngestionProduct({
    brandName: "Care Brand",
    categoryName: "Food",
    countryCodes: ["CA"],
    description: "Clinically proven to treat plaque.",
    directions: ["Give exactly one chew daily."],
    images: [
      { imageUrl: "https://cdn.example.ca/product.jpg", isPrimary: true },
      { imageUrl: "https://cdn.example.ca/product.jpg", isPrimary: true },
    ],
    ingredients: ["Chicken", "Rice flour"],
    offers: [{ countryCode: "CA", currencyCode: "CAD", destinationUrl: "https://store.example.ca/item", priceAmount: "19.90", retailerName: "Store" }],
    productName: "Dental Chews",
    rawPayload: { original: true },
    sourceMetadata: { canadaEvidence: "authorized_ca_offer", sourceUseStatus: "permitted" },
    sourceUrl: "https://manufacturer.example.ca/item",
    speciesCodes: ["dog"],
    warnings: ["Not for puppies under six months."],
  });
  assert.deepEqual(product.ingredients, ["Chicken", "Rice flour"]);
  assert.deepEqual(product.directions, ["Give exactly one chew daily."]);
  assert.deepEqual(product.warnings, ["Not for puppies under six months."]);
  assert.equal(product.offers[0].priceAmount, "19.9");
  assert.deepEqual(detectClaimFlags(product).map((claim) => claim.claimType).sort(), ["clinically_proven", "treat"]);
  const validation = validateNormalizedProduct(product);
  assert.ok(validation.errors.some((issue) => issue.code === "duplicate_product_image"));
  assert.ok(validation.errors.some((issue) => issue.code === "multiple_primary_images"));
});

test("quality and publication gates require permission, Canada evidence, claims review, and human approval", async () => {
  const { records } = await loadProvider();
  const blocked = records[0];
  const blockedGate = evaluatePublicationGate({
    claims: blocked.claims,
    duplicate: blocked.duplicate,
    product: blocked.normalized,
    quality: blocked.quality,
    reviewerApproved: true,
  });
  assert.equal(blockedGate.allowed, false);
  assert.ok(blockedGate.reasons.some((reason) => reason.code === "source_use_not_permitted"));

  const permitted = structuredClone(blocked.normalized);
  permitted.sourceMetadata.sourceUseStatus = "permitted";
  const quality = assessIngestionQuality(permitted, blocked.duplicate, []);
  assert.equal(quality.state, "blocked");
  assert.ok(quality.reasons.some((reason) => reason.code === "complete_ingredients_required"));
  assert.equal(evaluatePublicationGate({ claims: [], duplicate: blocked.duplicate, product: permitted, quality, reviewerApproved: false }).allowed, false);
  assert.equal(evaluatePublicationGate({ claims: [], duplicate: blocked.duplicate, product: permitted, quality, reviewerApproved: true }).allowed, false);
});

test("repeated imports are hash-idempotent and source failure cannot remove live products", async () => {
  const first = await loadProvider();
  const previousHashes = new Map(first.records.map((record) => [record.normalized.externalId, record.normalizedHash]));
  const body = await readFile(csvPath, "utf8");
  const second = await processIngestionInput({ adapter: new PurinaCanadaManualAdapter(), input: { body }, previousHashes });
  assert.equal(second.records.every((record) => record.duplicate.matchType === "exact"), true);
  assert.equal(second.records.every((record) => record.duplicate.proposedAction === "skip"), true);
  const adapterSource = await readFile(new URL("../app/lib/catalog-ingestion/adapters/purina-ca-manual-adapter.ts", import.meta.url), "utf8");
  const cliSource = await readFile(new URL("../scripts/catalog-ingestion.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(adapterSource, /\.delete\s*\(/);
  assert.doesNotMatch(cliSource, /\.delete\s*\(/);
});

test("review overrides are append-only and ingestion internals remain server-only", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /old_value jsonb[\s\S]+new_value jsonb[\s\S]+actor text[\s\S]+reason text[\s\S]+created_at timestamptz/);
  assert.match(migration, /product_ingestion_overrides_are_append_only[\s\S]+before update or delete/);
  assert.match(migration, /revoke all privileges[\s\S]+from anon, authenticated/);
  const publicQueries = await readFile(new URL("../app/lib/catalog/queries.ts", import.meta.url), "utf8");
  assert.doesNotMatch(publicQueries, /raw_payload|quality_state|claim_flags|reviewer_note|source_use_status/);
  const results = await readFile(new URL("../app/results/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(results, /product_ingestion|provider_manifest|quality_state|raw_payload/);
});
