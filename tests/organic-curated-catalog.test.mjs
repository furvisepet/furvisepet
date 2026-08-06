import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { OrganicCuratedProductAdapter } from "../app/lib/catalog-ingestion/providers/organic-curated.ts";
import { normalizeIngestionProduct } from "../app/lib/catalog-ingestion/normalize.ts";
import { assessIngestionQuality } from "../app/lib/catalog-ingestion/quality.ts";
import { evaluatePublicationGate } from "../app/lib/catalog-ingestion/publication-gate.ts";
import { attachOrganicProductDestinations, resolveOrganicProductDestinations } from "../app/lib/catalog/organic-destinations.ts";

const contract = {
  allowedCountries: ["CA", "US"],
  allowedHosts: ["manufacturer.example"],
  permittedFields: ["product_names", "factual_identifiers", "furvise_summaries", "destination_links", "images", "ingredients", "warnings", "directions"],
  providerDisplayName: "Furvise organic review",
  providerId: "furvise_organic_curated",
};

async function product(overrides = {}) {
  const input = {
    brandName: "Example Brand",
    categoryName: "Food",
    countryCodes: ["CA"],
    ingredients: ["Chicken", "Rice"],
    productName: "Complete Recipe",
    productType: "dry food",
    sourceMetadata: {
      ingredientsComplete: true,
      permissionReference: "review-2026-001",
      permittedFields: ["product_names", "factual_identifiers", "destination_links", "ingredients"],
      sourceUseStatus: "permitted",
      verificationDate: "2026-08-01T00:00:00.000Z",
    },
    sourceUrl: "https://manufacturer.example/products/complete-recipe",
    speciesCodes: ["dog"],
    ...overrides,
  };
  const [parsed] = await new OrganicCuratedProductAdapter(contract).parse({ body: [input] });
  return normalizeIngestionProduct(parsed.product);
}

function gate(normalized) {
  const duplicate = { candidateProductId: null, matchType: "none", proposedAction: "create", reasons: [] };
  const quality = assessIngestionQuality(normalized, duplicate, []);
  return { quality, result: evaluatePublicationGate({ claims: [], duplicate, product: normalized, quality, reviewerApproved: true }) };
}

test("complete non-affiliate organic ingestibles can publish without price or an offer", async () => {
  const normalized = await product();
  const { quality, result } = gate(normalized);
  assert.equal(normalized.offers.length, 0);
  assert.notEqual(quality.state, "blocked");
  assert.equal(result.allowed, true);
});

test("organic affiliate URLs and unqualified commerce assertions are rejected", async () => {
  const normalized = await product({
    offers: [{ affiliateUrl: "https://manufacturer.example/affiliate/item", availability: "in_stock", countryCode: "CA", currencyCode: "CAD", destinationUrl: "https://manufacturer.example/products/item", priceAmount: "19.99", retailerName: "Manufacturer" }],
    sourceMetadata: {
      ingredientsComplete: true,
      permissionReference: "review-2026-001",
      permittedFields: ["product_names", "factual_identifiers", "destination_links", "ingredients"],
      sourceUseStatus: "permitted",
      verificationDate: "2026-08-01T00:00:00.000Z",
    },
  });
  const codes = gate(normalized).result.reasons.map((reason) => reason.code);
  assert.ok(codes.includes("organic_affiliate_forbidden"));
  assert.ok(codes.includes("organic_price_not_authorized"));
  assert.ok(codes.includes("organic_availability_not_authorized"));
});

test("images remain optional and cannot publish without record-level image permission", async () => {
  const normalized = await product({ images: [{ imageUrl: "https://manufacturer.example/images/item.png", isPrimary: true }] });
  assert.ok(gate(normalized).result.reasons.some((reason) => reason.code === "organic_image_not_permitted"));
  const withoutImage = await product();
  assert.equal(gate(withoutImage).result.allowed, true);
});

test("incomplete ingestibles stay blocked while accessories may omit ingredients", async () => {
  const incomplete = await product({ ingredients: [], sourceMetadata: {
    ingredientsComplete: false, permissionReference: "review-2026-001", permittedFields: ["product_names", "factual_identifiers", "destination_links"], sourceUseStatus: "permitted", verificationDate: "2026-08-01",
  } });
  assert.ok(gate(incomplete).result.reasons.some((reason) => reason.code === "complete_ingredients_required"));

  const accessory = await product({ categoryName: "Brushes", ingredients: [], productName: "Grooming Brush", productType: "dog brush accessory", sourceMetadata: {
    permissionReference: "review-2026-002", permittedFields: ["product_names", "factual_identifiers", "destination_links"], sourceUseStatus: "permitted", verificationDate: "2026-08-01",
  } });
  assert.equal(gate(accessory).result.allowed, true);
});

test("ingredient-sensitive topicals require ingredients and applicable cautions", async () => {
  const topical = await product({ categoryName: "Shampoo", ingredients: [], productName: "Sensitive Shampoo", productType: "topical shampoo", sourceMetadata: {
    ingredientSensitiveMatching: true, ingredientsComplete: false, permissionReference: "review-2026-004", permittedFields: ["product_names", "factual_identifiers", "destination_links"], sourceUseStatus: "permitted", verificationDate: "2026-08-01", warningsApplicable: true,
  }, warnings: [] });
  const codes = gate(topical).result.reasons.map((reason) => reason.code);
  assert.ok(codes.includes("topical_ingredients_required"));
  assert.ok(codes.includes("topical_warnings_required"));
});

test("unresolved source permission remains blocked and permission snapshots are preserved", async () => {
  const normalized = await product({ sourceMetadata: {
    ingredientsComplete: true, permissionReference: "review-2026-003", permittedFields: ["product_names", "factual_identifiers", "destination_links", "ingredients"], sourceUseStatus: "unresolved", verificationDate: "2026-08-01",
  } });
  assert.equal(normalized.sourceMetadata.permissionSnapshot.sourceUseStatus, "unresolved");
  assert.ok(gate(normalized).result.reasons.some((reason) => reason.code === "source_use_not_permitted"));
});

test("organic UI uses a neutral missing-image placeholder and commission-neutral language", async () => {
  const page = await readFile(new URL("../app/shop/page.tsx", import.meta.url), "utf8");
  assert.match(page, /data-product-image-placeholder="furvise-neutral"/);
  assert.match(page, /Recommendations are selected for fit\. Furvise may not earn a commission/);
  assert.match(page, />\s*View product\s*</);
  assert.doesNotMatch(page, /live price|lowest price|best deal/i);
  const productCard = page.slice(page.indexOf("function ProductCard"), page.indexOf("function ProductFitExplanationPanel"));
  assert.doesNotMatch(productCard, /availabilityStatus|in stock/i);
});

test("shop ranking has no affiliate or monetization signal", async () => {
  const search = await readFile(new URL("../app/lib/shop/product-search.ts", import.meta.url), "utf8");
  const ranking = search.slice(search.indexOf("const sourcePriority"), search.indexOf("export function filterAndRankShopProducts"));
  assert.doesNotMatch(ranking, /affiliate|commission|monetiz|price/i);
});

test("only permission-approved organic source destinations are released to the authenticated route", async () => {
  const rows = [
    { product_id: "approved", validated_destination_url: "https://manufacturer.example/item", raw_payload: { private: "must-not-pass" } },
    { product_id: "not-requested", validated_destination_url: "https://manufacturer.example/no" },
  ];
  let rpcName = "";
  let rpcArgs = null;
  const client = { async rpc(name, args) { rpcName = name; rpcArgs = args; return { data: rows, error: null }; } };
  const destinations = await resolveOrganicProductDestinations(client, { countryCode: "CA", productIds: ["approved"], speciesCode: "dog" });
  assert.deepEqual([...destinations], [["approved", "https://manufacturer.example/item"]]);
  assert.equal(rpcName, "resolve_organic_product_destinations");
  assert.deepEqual(rpcArgs, { p_country_code: "CA", p_product_ids: ["approved"], p_species_code: "dog" });
  const attached = attachOrganicProductDestinations([{ id: "approved", productPageUrl: undefined }], destinations);
  assert.equal(attached[0].productPageUrl, "https://manufacturer.example/item");
  assert.doesNotMatch(JSON.stringify(attached), /raw_payload|permissionReference|must-not-pass/);
});
