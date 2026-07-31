import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) { return readFileSync(new URL(path, import.meta.url), "utf8"); }

test("Products uses the bounded catalog endpoint without changing product-card markup", () => {
  const page = source("../app/shop/page.tsx");
  assert.match(page, /fetch\("\/api\/shop\/catalog"/);
  assert.match(page, /searchShopProducts\(\{/);
  assert.doesNotMatch(page, /searchStaticRealShopProducts/);
  assert.match(page, /<ProductCard/);
});

test("product explanation and question routes use the shared catalog adapter", () => {
  for (const path of [
    "../app/api/shop/explain-product-fit/route.ts",
    "../app/api/shop/product-question/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /loadShopCatalogProductById/);
    assert.doesNotMatch(route, /staticRealProducts/);
  }
});

test("the static catalog is isolated to an explicitly temporary error fallback", () => {
  const compatibility = source("../app/lib/catalog/compatibility.ts");
  assert.match(compatibility, /Temporary adapter|temporary curated fallback/i);
  assert.match(compatibility, /catch \(error\)/);
  assert.match(compatibility, /staticRealProducts/);
});

test("Results remains product-free", () => {
  const results = source("../app/results/page.tsx");
  assert.doesNotMatch(results, /ProductCard|staticRealProducts|loadShopCatalogProducts|\/api\/shop\/catalog/);
});
