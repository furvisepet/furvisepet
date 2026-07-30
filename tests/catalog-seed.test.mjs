import assert from "node:assert/strict";
import test from "node:test";
import { buildCuratedCatalogSeedPlan } from "../app/lib/catalog/seed.ts";
import { staticRealProducts } from "../app/lib/products/static-products.ts";

test("all current curated products are included in a deterministic seed plan", () => {
  const first = buildCuratedCatalogSeedPlan();
  const second = buildCuratedCatalogSeedPlan();
  assert.equal(first.products.length, staticRealProducts.length);
  assert.deepEqual(second, first);
  assert.deepEqual(
    new Set(first.products.map((item) => item.product.name)),
    new Set(staticRealProducts.map((product) => product.name)),
  );
});

test("seed identities prevent repeated products, brands, and retailers", () => {
  const plan = buildCuratedCatalogSeedPlan();
  assert.equal(new Set(plan.products.map((item) => item.productSlug)).size, plan.products.length);
  assert.equal(new Set(plan.brands.map((item) => item.slug)).size, plan.brands.length);
  assert.equal(new Set(plan.retailers.map((item) => item.slug)).size, plan.retailers.length);
});

test("curated country and species relationships are preserved", () => {
  const plan = buildCuratedCatalogSeedPlan();
  for (const item of plan.products) {
    assert.deepEqual(item.product.species, staticRealProducts.find((product) => product.id === item.product.id)?.species);
    assert.deepEqual(item.product.availableCountries, staticRealProducts.find((product) => product.id === item.product.id)?.availableCountries);
  }
});
