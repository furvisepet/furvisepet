import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCatalogFirstShopProducts,
  ShopCatalogRequestError,
} from "../app/lib/shop/catalog-source.ts";
import { resolveProductProviderMode } from "../app/lib/product-providers.ts";

function product(overrides = {}) {
  return {
    active: true,
    availableCountries: ["CA"],
    category: "grooming",
    cautions: "Follow the label.",
    concernTags: ["grooming"],
    evidenceType: "catalog",
    excludedIngredients: [],
    id: "catalog-product-1",
    ingredientsVerified: false,
    lifeStage: "all",
    name: "Published Grooming Product",
    protein: "Not applicable",
    source: "curated",
    species: ["dog"],
    whyCategoryFits: "Grooming product.",
    whyItFits: "Published match.",
    ...overrides,
  };
}

const request = {
  petId: "00000000-0000-4000-8000-000000000001",
  productCountry: "CA",
  query: "grooming",
  token: "test-access-token",
};

test("published catalogue products are preferred without loading static fallback", async () => {
  let fallbackCalls = 0;
  const result = await loadCatalogFirstShopProducts({
    ...request,
    fallbackProducts() { fallbackCalls += 1; return [product({ evidenceType: "curated_static", id: "static-product" })]; },
    fetchImpl: async () => Response.json({ products: [product()] }),
  });
  assert.equal(result.source, "catalog");
  assert.deepEqual(result.products.map((item) => item.id), ["catalog-product-1"]);
  assert.equal(fallbackCalls, 0);
});

test("network and catalogue 5xx failures use an explicit static fallback", async () => {
  for (const fetchImpl of [
    async () => { throw new TypeError("network unavailable"); },
    async () => Response.json({ error: "Unavailable" }, { status: 503 }),
  ]) {
    const result = await loadCatalogFirstShopProducts({
      ...request,
      fallbackProducts: () => [product({ evidenceType: "curated_static", id: "static-ca" })],
      fetchImpl,
    });
    assert.equal(result.source, "static_fallback");
    assert.deepEqual(result.products.map((item) => item.id), ["static-ca"]);
  }
});

test("zero usable same-country catalogue records use regional static fallback", async () => {
  const result = await loadCatalogFirstShopProducts({
    ...request,
    fallbackProducts: () => [product({ evidenceType: "curated_static", id: "static-ca" })],
    fetchImpl: async () => Response.json({ products: [product({ availableCountries: ["US"] })] }),
  });
  assert.equal(result.source, "static_fallback");
  assert.deepEqual(result.products.map((item) => item.id), ["static-ca"]);
});

test("authentication and rate-limit failures are not hidden by fallback", async () => {
  for (const status of [401, 403, 429]) {
    let fallbackCalls = 0;
    await assert.rejects(
      loadCatalogFirstShopProducts({
        ...request,
        fallbackProducts() { fallbackCalls += 1; return []; },
        fetchImpl: async () => Response.json({ error: "Request denied." }, { status }),
      }),
      (error) => error instanceof ShopCatalogRequestError && error.status === status,
    );
    assert.equal(fallbackCalls, 0);
  }
});

test("provider configuration defaults production to catalog and cannot enable production mock data", () => {
  assert.equal(resolveProductProviderMode({ nodeEnv: "production", productProvider: null }), "catalog");
  assert.equal(resolveProductProviderMode({ nodeEnv: "production", productProvider: "mock" }), "catalog");
  assert.equal(resolveProductProviderMode({ nodeEnv: "production", nextPublicProductProvider: "mock", productProvider: null }), "catalog");
  assert.equal(resolveProductProviderMode({ nodeEnv: "development", nextPublicProductProvider: "catalog", productProvider: null }), "catalog");
});
