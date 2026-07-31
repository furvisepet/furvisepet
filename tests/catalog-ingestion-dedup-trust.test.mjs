import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { detectProductDuplicate } from "../app/lib/catalog-ingestion/deduplicate.ts";
import { stableContentHash } from "../app/lib/catalog-ingestion/hashing.ts";
import { normalizeIngestionProduct } from "../app/lib/catalog-ingestion/normalize.ts";
import {
  buildNonDestructiveProductPatch,
  canSourceWriteField,
  resolveSourceTrustTier,
} from "../app/lib/catalog-ingestion/trust-policy.ts";

const candidates = JSON.parse(readFileSync(new URL("./fixtures/catalog-ingestion/duplicate-candidates.json", import.meta.url), "utf8"));

function product(overrides = {}) {
  return normalizeIngestionProduct({
    brandName: "North Trail",
    categoryName: "Food",
    countryCodes: ["US"],
    externalId: "new-id",
    productName: "Adult Dog Food",
    rawPayload: {},
    speciesCodes: ["dog"],
    variants: [],
    ...overrides,
  });
}

test("duplicate detection finds exact GTIN and provider external IDs", () => {
  const gtin = detectProductDuplicate({ candidates, normalizedHash: "hash", product: product({ gtin: "0123456789012" }), provider: "other" });
  assert.equal(gtin.matchType, "exact");
  assert.equal(gtin.proposedAction, "update");
  assert.deepEqual(gtin.reasons, ["gtin"]);

  const external = detectProductDuplicate({ candidates, normalizedHash: "hash", product: product({ externalId: "csv-dog-1" }), provider: "fixture_provider" });
  assert.equal(external.matchType, "exact");
  assert.deepEqual(external.reasons, ["provider_external_id"]);
});

test("brand and name matches are held for review instead of auto-merged", () => {
  const result = detectProductDuplicate({ candidates, normalizedHash: "hash", product: product(), provider: "other" });
  assert.equal(result.matchType, "possible");
  assert.equal(result.proposedAction, "manual_review");
});

test("unchanged normalized hashes propose a no-op", () => {
  const result = detectProductDuplicate({ candidates: [], normalizedHash: "same", previousNormalizedHash: "same", product: product(), provider: "fixture" });
  assert.equal(result.matchType, "exact");
  assert.equal(result.proposedAction, "skip");
});

test("stable hashes ignore object key order but still detect content changes", () => {
  assert.equal(stableContentHash({ a: 1, b: 2 }), stableContentHash({ b: 2, a: 1 }));
  assert.notEqual(stableContentHash({ a: 1 }), stableContentHash({ a: 2 }));
});

test("source precedence is field-specific and updates are non-destructive", () => {
  assert.equal(resolveSourceTrustTier("internal_curated", "manual"), "internal_manual");
  assert.equal(resolveSourceTrustTier("brand", "manufacturer_feed"), "manufacturer");
  assert.equal(resolveSourceTrustTier("store", "retailer_feed"), "structured_retailer");
  assert.equal(canSourceWriteField("structured_retailer", "offer"), true);
  assert.equal(canSourceWriteField("structured_retailer", "label"), false);

  const incoming = product({ description: null, productName: "Retail Name" });
  const patch = buildNonDestructiveProductPatch(
    { description: "Rich manufacturer description", productName: "Official Name" },
    incoming,
    "structured_retailer",
  );
  assert.equal(patch.description, "Rich manufacturer description");
  assert.equal(patch.productName, "Official Name");
});
