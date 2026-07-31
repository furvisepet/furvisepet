import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AuthorizedCatalogAdapter, isAllowedAuthorizedUrl, offerFreshness } from "../app/lib/catalog-ingestion/adapters/authorized-catalog-adapter.ts";
import { processIngestionInput } from "../app/lib/catalog-ingestion/pipeline.ts";
import { evaluatePublicationGate } from "../app/lib/catalog-ingestion/publication-gate.ts";
import { assessIngestionQuality } from "../app/lib/catalog-ingestion/quality.ts";
import { impactCredentialsFromEnvironment, fetchAuthorizedImpactCatalog } from "../app/lib/catalog-ingestion/providers/impact-readiness.ts";
import { resolvePrivatePath } from "../app/lib/catalog-ingestion/providers/manual-authorized-upload.ts";
import { resolveAuthorizedFieldMapping } from "../app/lib/catalog-ingestion/providers/field-mapping.ts";
import { GENERIC_AFFILIATE_CSV_TEMPLATE, GENERIC_DISTRIBUTOR_CSV_TEMPLATE, IMPACT_STYLE_PROVIDER_TEMPLATE } from "../app/lib/catalog-ingestion/providers/provider-templates.ts";
import { validateAuthorizedCatalogMetadata, validateProviderContract } from "../app/lib/catalog-ingestion/providers/provider-contract.ts";
import { PurinaCanadaManualAdapter } from "../app/lib/catalog-ingestion/adapters/purina-ca-manual-adapter.ts";

const fixtureUrl = new URL("fixtures/authorized-catalog-step-5a.json", import.meta.url);

const allContent = [
  "product_names", "descriptions", "images", "prices", "destination_links",
  "affiliate_links", "ingredients", "warnings", "directions",
];

function approvedContract(overrides = {}) {
  return {
    ...structuredClone(GENERIC_AFFILIATE_CSV_TEMPLATE),
    agreementEffectiveDate: "2026-07-20T00:00:00Z",
    agreementStatus: "approved",
    allowedHosts: ["merchant.example.test", "tracking.example.test", "cdn.example.test"],
    affiliateLinkPermission: true,
    catalogAccessStatus: "active",
    descriptionUsePermission: true,
    imageUsePermission: true,
    linkUsePermission: true,
    permittedContentTypes: [...allContent],
    priceUsePermission: true,
    providerDisplayName: "Synthetic Authorized Fixture",
    providerId: "synthetic_authorized_fixture",
    sourceType: "json",
    supportedFileFormats: ["json", "csv", "tsv"],
    ...overrides,
  };
}

function metadata(overrides = {}) {
  return {
    authorizationReference: "synthetic-authorization-reference",
    catalogId: "fixture-catalog-001",
    country: "CA",
    exportDate: "2026-07-24T12:00:00Z",
    fileFormat: "json",
    merchantOrBrand: "Example Test Merchant",
    permittedContentTypes: [...allContent],
    providerId: "synthetic_authorized_fixture",
    ...overrides,
  };
}

async function fixture() { return JSON.parse(await readFile(fixtureUrl, "utf8")); }

async function parsedFixture(contract = approvedContract(), authorization = metadata()) {
  const body = await readFile(fixtureUrl, "utf8");
  const adapter = new AuthorizedCatalogAdapter({ contract, metadata: authorization, now: new Date("2026-07-24T13:00:00Z") });
  return processIngestionInput({ adapter, input: { body } });
}

test("authorized provider templates are structural, pending, and credential-free", () => {
  for (const template of [IMPACT_STYLE_PROVIDER_TEMPLATE, GENERIC_AFFILIATE_CSV_TEMPLATE, GENERIC_DISTRIBUTOR_CSV_TEMPLATE]) {
    assert.equal(template.agreementStatus, "pending");
    assert.equal(template.catalogAccessStatus, "pending");
    assert.equal(validateProviderContract(template).valid, true);
  }
  assert.deepEqual(IMPACT_STYLE_PROVIDER_TEMPLATE.credentialEnvironmentVariableNames, ["IMPACT_ACCOUNT_SID", "IMPACT_AUTH_TOKEN", "IMPACT_CATALOG_ID"]);
  assert.equal(JSON.stringify(IMPACT_STYLE_PROVIDER_TEMPLATE).includes("AuthToken"), false);
});

test("synthetic fixture covers 12 products, variants, categories, one invalid row, and one exact batch duplicate", async () => {
  const source = await fixture();
  assert.equal(source.fixtureOnly, true);
  assert.equal(source.products.length, 12);
  assert.equal(source.products.every((product) => JSON.stringify(product).includes(".test") || product.scenario === "invalid_missing_name"), true);
  const result = await parsedFixture();
  assert.equal(result.records.length, 12);
  assert.equal(result.summary.invalidRecords, 1);
  assert.equal(result.summary.exactDuplicates, 1);
  assert.equal(result.records.find((record) => record.normalized.externalId === "fake-food-001").normalized.variants.length, 2);
  assert.deepEqual(new Set(result.records.map((record) => record.normalized.category.categorySlug).filter(Boolean)), new Set(["food", "grooming", "dental", "paw-care", "ear-care"]));
});

test("approved agreements retain eligible fields and pass the provider permission gate after review", async () => {
  const result = await parsedFixture();
  const record = result.records.find((item) => item.normalized.externalId === "fake-food-001");
  assert.equal(record.normalized.description, "Synthetic adult dog food fixture.");
  assert.equal(record.normalized.images.length, 1);
  assert.equal(record.normalized.offers[0].priceAmount, "24.99");
  assert.equal(record.normalized.offers[0].affiliateUrl, "https://tracking.example.test/click?item=fake-food-001&subid=fixture");
  assert.equal(record.normalized.sourceMetadata.sourceUseStatus, "permitted");
  const quality = assessIngestionQuality(record.normalized, record.duplicate, []);
  assert.equal(evaluatePublicationGate({ claims: [], duplicate: record.duplicate, product: record.normalized, quality, reviewerApproved: true }).allowed, true);
});

test("pending and expired agreements block publication", async () => {
  for (const status of ["pending", "expired"]) {
    const contract = approvedContract({ agreementStatus: status, agreementEffectiveDate: status === "pending" ? null : "2026-01-01T00:00:00Z" });
    const result = await parsedFixture(contract);
    const record = result.records.find((item) => item.normalized.externalId === "fake-ear-002");
    const gate = evaluatePublicationGate({ claims: [], duplicate: record.duplicate, product: record.normalized, quality: record.quality, reviewerApproved: true });
    assert.equal(gate.allowed, false);
    assert.ok(gate.reasons.some((reason) => reason.code === "provider_agreement_not_approved"));
  }
});

test("disallowed images and descriptions are omitted without altering raw payloads", async () => {
  const noImages = approvedContract({ imageUsePermission: false, permittedContentTypes: allContent.filter((value) => value !== "images") });
  const imageResult = await parsedFixture(noImages, metadata({ permittedContentTypes: allContent.filter((value) => value !== "images") }));
  const imageRecord = imageResult.records.find((item) => item.normalized.externalId === "fake-groom-001");
  assert.equal(imageRecord.normalized.images.length, 0);
  assert.match(imageRecord.parsed.product.rawPayload.image_url, /cdn\.example\.test/);

  const noDescriptions = approvedContract({ descriptionUsePermission: false, permittedContentTypes: allContent.filter((value) => value !== "descriptions") });
  const descriptionResult = await parsedFixture(noDescriptions, metadata({ permittedContentTypes: allContent.filter((value) => value !== "descriptions") }));
  const descriptionRecord = descriptionResult.records.find((item) => item.normalized.externalId === "fake-groom-002");
  assert.equal(descriptionRecord.normalized.description, null);
  assert.match(descriptionRecord.parsed.product.rawPayload.description, /must be omitted/);
});

test("country restrictions and authorization metadata are enforced", async () => {
  const contract = approvedContract();
  const denied = validateAuthorizedCatalogMetadata(contract, metadata({ country: "US" }));
  assert.equal(denied.valid, false);
  assert.ok(denied.issues.includes("country_not_authorized"));
  assert.equal(validateAuthorizedCatalogMetadata(contract, metadata()).valid, true);
  const result = await parsedFixture(contract, metadata({ country: "US" }));
  const record = result.records[0];
  const gate = evaluatePublicationGate({ claims: [], duplicate: record.duplicate, product: record.normalized, quality: record.quality, reviewerApproved: true });
  assert.equal(gate.allowed, false);
  assert.ok(gate.reasons.some((reason) => reason.code === "source_use_not_permitted" || reason.code === "provider_provenance_incomplete"));
});

test("field mapping is exact and ambiguous aliases require review", () => {
  const clear = resolveAuthorizedFieldMapping(["external_id", "product_name", "brand"], {
    externalProductId: ["external_id", "id"], productName: ["product_name", "title"], brand: ["brand"],
  });
  assert.equal(clear.issues.length, 0);
  assert.equal(clear.resolved.productName, "product_name");
  const ambiguous = resolveAuthorizedFieldMapping(["external_id", "product_name", "title", "brand"], {
    externalProductId: ["external_id"], productName: ["product_name", "title"], brand: ["brand"],
  });
  assert.ok(ambiguous.issues.some((issue) => issue.code === "ambiguous_mapping" && issue.field === "productName"));
});

test("authorized adapter accepts quoted affiliate TSV without provider-specific parsing", async () => {
  const contract = approvedContract({ sourceType: "third_party_feed", supportedFileFormats: ["tsv"] });
  const authorization = metadata({ fileFormat: "tsv" });
  const body = [
    "external_id\tproduct_name\tbrand\tcategory\tspecies\tcountry\tcurrency\tproduct_url\tretailer",
    "tsv-001\t\"Quoted\tTest Product\"\tTSV Test Brand\tDental\tdog\tCA\tCAD\thttps://merchant.example.test/products/tsv-001\tExample Test Merchant",
  ].join("\n");
  const adapter = new AuthorizedCatalogAdapter({ contract, metadata: authorization, now: new Date("2026-07-24T13:00:00Z") });
  const parsed = await adapter.parse({ body });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].product.productName, "Quoted\tTest Product");
  assert.equal(parsed[0].product.rawPayload.product_name, "Quoted\tTest Product");
});

test("affiliate links are preserved exactly and invalid tracking URLs are rejected", async () => {
  assert.equal(isAllowedAuthorizedUrl("https://tracking.example.test/click?a=1&b=two", ["tracking.example.test"]), true);
  assert.equal(isAllowedAuthorizedUrl("javascript:alert(1)", ["tracking.example.test"]), false);
  assert.equal(isAllowedAuthorizedUrl("https://evil.example.test/redirect", ["tracking.example.test"]), false);
  const source = await fixture();
  source.products[0].affiliate_url = "https://evil.example.test/redirect?to=merchant";
  const adapter = new AuthorizedCatalogAdapter({ contract: approvedContract(), metadata: metadata(), now: new Date("2026-07-24T13:00:00Z") });
  const result = await processIngestionInput({ adapter, input: { body: source } });
  const record = result.records[0];
  assert.equal(record.normalized.offers[0].affiliateUrl, null);
  assert.ok(record.quality.reasons.some((reason) => reason.code === "provider_url_rejected"));
});

test("stale offers retain links but omit price and current stock", async () => {
  assert.equal(offerFreshness({ lastCheckedAt: "2026-01-01T00:00:00Z", staleThresholdHours: 24 }, new Date("2026-07-24T13:00:00Z")), "stale");
  const result = await parsedFixture();
  const record = result.records.find((item) => item.normalized.externalId === "fake-paw-002");
  assert.equal(record.normalized.offers[0].freshnessStatus, "stale");
  assert.equal(record.normalized.offers[0].priceAmount, null);
  assert.equal(record.normalized.offers[0].availabilityStatus, "unknown");
  assert.match(record.normalized.offers[0].destinationUrl, /merchant\.example\.test/);
});

test("Impact access fails safely when credentials or authorization are absent", async () => {
  assert.throws(() => impactCredentialsFromEnvironment({}), /not configured/);
  let requested = false;
  await assert.rejects(() => fetchAuthorizedImpactCatalog({
    contract: IMPACT_STYLE_PROVIDER_TEMPLATE,
    fetchImpl: async () => { requested = true; throw new Error("must not run"); },
    metadata: {
      authorizationReference: "pending",
      catalogId: "1",
      country: "CA",
      exportDate: "2026-07-24",
      fileFormat: "api",
      merchantOrBrand: "Pending merchant",
      permittedContentTypes: ["product_names"],
      providerId: "impact_catalog_template",
    },
  }), /blocked until/);
  assert.equal(requested, false);
});

test("authorized Impact readiness verifies metadata and relationship and skips an unchanged feed", async () => {
  const saved = { sid: process.env.IMPACT_ACCOUNT_SID, token: process.env.IMPACT_AUTH_TOKEN, catalog: process.env.IMPACT_CATALOG_ID };
  process.env.IMPACT_ACCOUNT_SID = "IR-test-account";
  process.env.IMPACT_AUTH_TOKEN = "synthetic-test-token";
  process.env.IMPACT_CATALOG_ID = "123";
  try {
    const contract = {
      ...structuredClone(IMPACT_STYLE_PROVIDER_TEMPLATE),
      agreementEffectiveDate: "2026-07-20",
      agreementStatus: "approved",
      catalogAccessStatus: "active",
    };
    const authorization = {
      authorizationReference: "synthetic-impact-approval",
      catalogId: "123",
      country: "CA",
      exportDate: "2026-07-24",
      fileFormat: "api",
      merchantOrBrand: "Synthetic Impact Merchant",
      permittedContentTypes: ["product_names"],
      providerId: "impact_catalog_template",
    };
    const responses = (url) => {
      if (url.pathname.endsWith("/Catalogs/123")) return { Id: "123", CampaignId: "456", Currency: "CAD", ServiceAreas: ["Canada"], NumberOfItems: "1" };
      if (url.pathname.includes("/Contracts/Active")) return { Status: "ACTIVE" };
      return { Items: [{ CatalogItemId: "fake-impact-item", Name: "Synthetic Item" }] };
    };
    const fetchImpl = async (url) => new Response(JSON.stringify(responses(url)), { headers: { "content-type": "application/json" } });
    const first = await fetchAuthorizedImpactCatalog({ contract, fetchImpl, metadata: authorization });
    assert.equal(first.items.length, 1);
    const repeated = await fetchAuthorizedImpactCatalog({ contract, fetchImpl, metadata: authorization, previousContentHash: first.contentHash });
    assert.equal(repeated.unchanged, true);
    assert.deepEqual(repeated.items, []);
  } finally {
    restore("IMPACT_ACCOUNT_SID", saved.sid); restore("IMPACT_AUTH_TOKEN", saved.token); restore("IMPACT_CATALOG_ID", saved.catalog);
  }
});

test("private upload paths reject traversal and the private directory is ignored", async () => {
  assert.throws(() => resolvePrivatePath("../outside.csv"), /inside the private/);
  assert.match(resolvePrivatePath("approved/feed.csv"), /private[\\/]catalog-imports[\\/]approved[\\/]feed\.csv$/);
  const ignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(ignore, /\/private\/catalog-imports\//);
});

test("Purina remains blocked and public surfaces exclude contract metadata", async () => {
  const purinaCsv = await readFile(new URL("../data/product-providers/purina-ca-001/products.csv", import.meta.url), "utf8");
  const purina = await processIngestionInput({ adapter: new PurinaCanadaManualAdapter(), input: { body: purinaCsv } });
  assert.equal(purina.records.every((record) => record.quality.state === "blocked"), true);
  const queries = await readFile(new URL("../app/lib/catalog/queries.ts", import.meta.url), "utf8");
  const mapper = await readFile(new URL("../app/lib/catalog/mappers.ts", import.meta.url), "utf8");
  const publicSource = queries + mapper;
  assert.doesNotMatch(publicSource, /agreementStatus|authorizationReference|permissionSnapshot|providerContractRequired|sourceContentHash|freshness_status/);
  const results = await readFile(new URL("../app/results/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(results, /catalog-ingestion|provider agreement|affiliate catalog|product card/i);
  const ingestionMigration = await readFile(new URL("../supabase/migrations/20260723020000_add_product_ingestion_pipeline.sql", import.meta.url), "utf8");
  const grantMigration = await readFile(new URL("../supabase/migrations/20260723021000_reconcile_application_role_grants.sql", import.meta.url), "utf8");
  assert.match(ingestionMigration, /product_ingestion_records enable row level security/);
  assert.match(grantMigration, /revoke all privileges[\s\S]+product_ingestion_records[\s\S]+from anon, authenticated/);
});

test("freshness schema and publication logic keep stale prices out of public catalog selects", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260724010000_add_authorized_offer_freshness.sql", import.meta.url), "utf8");
  const publish = await readFile(new URL("../app/lib/catalog-ingestion/publish.ts", import.meta.url), "utf8");
  const queries = await readFile(new URL("../app/lib/catalog/queries.ts", import.meta.url), "utf8");
  assert.match(migration, /freshness_status[\s\S]+fresh[\s\S]+stale[\s\S]+unknown/);
  assert.match(publish, /const stale[\s\S]+nextPrice = stale \|\| !pricePermitted \? null/);
  assert.doesNotMatch(queries, /freshness_status|source_feed_version|source_content_hash|stale_after/);
});

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
