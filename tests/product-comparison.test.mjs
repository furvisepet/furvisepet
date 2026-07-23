import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildProductComparisons,
  formatProductResultCount,
  getProductDifferentiator,
} from "../app/lib/shop/product-comparison.ts";
import { staticRealProducts } from "../app/lib/products/static-products.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const wetFood = staticRealProducts.find((product) => product.subcategory === "wet_food");
const dryFood = staticRealProducts.find(
  (product) => product.id === "purina-pro-plan-sensitive-skin-stomach-salmon-rice-dry",
);

test("product result count uses careful match pluralization", () => {
  assert.equal(formatProductResultCount(1), "Found 1 careful match");
  assert.equal(formatProductResultCount(2), "Found 2 careful matches");
});

test("wet and dry food cards use deterministic compact differentiators", () => {
  assert.ok(wetFood);
  assert.ok(dryFood);
  assert.equal(
    getProductDifferentiator(wetFood),
    "Wet food option. Softer texture with more moisture.",
  );
  assert.equal(
    getProductDifferentiator(dryFood),
    "Dry food option. Easier storage with crunchy texture.",
  );
});

test("comparison contains only the visible products supplied by search", () => {
  assert.ok(wetFood);
  assert.ok(dryFood);
  const visibleProducts = [wetFood, dryFood];
  const comparison = buildProductComparisons(visibleProducts);

  assert.deepEqual(comparison.map((item) => item.id), visibleProducts.map((product) => product.id));
  assert.equal(comparison.length, 2);
  assert.match(comparison[0].keyDifference, /Softer texture with more moisture/);
  assert.match(comparison[1].keyDifference, /Crunchy texture with easier storage/);
});

test("deterministic comparison copy avoids restricted claims and em dashes", () => {
  const comparisonText = JSON.stringify(buildProductComparisons(staticRealProducts));
  assert.doesNotMatch(comparisonText, /\bbest\b|\bsafe\b|treatment|\bcure\b|\u2014/i);
});

test("Products compare control is result-scoped, closed initially, and mobile-contained", () => {
  const page = read("app/shop/page.tsx");
  const shopResults = page.slice(page.indexOf("function ShopResults"), page.indexOf("function ProductCard"));
  const comparisonPanel = page.slice(
    page.indexOf("function ProductComparisonPanel"),
    page.indexOf("function ProductFitExplanationPanel"),
  );

  assert.match(shopResults, /const \[compareOpen, setCompareOpen\] = useState\(false\)/);
  assert.match(shopResults, /formatProductResultCount\(products\.length\)/);
  assert.match(shopResults, /products\.length >= 2 \? \(/);
  assert.match(shopResults, /Compare these/);
  assert.match(shopResults, /onClick=\{\(\) => setCompareOpen\(\(current\) => !current\)\}/);
  assert.match(shopResults, /compareOpen && products\.length >= 2 \? \(/);
  assert.match(shopResults, /showDifferentiator=\{products\.length >= 2\}/);
  assert.match(comparisonPanel, /buildProductComparisons\(products\)/);
  assert.match(comparisonPanel, /comparisonItems\.map\(\(item\)/);
  assert.match(comparisonPanel, /min-w-0 overflow-x-hidden rounded-lg/);
  assert.match(comparisonPanel, /grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3/);
  assert.match(comparisonPanel, /break-words/);
});

test("per-product actions remain independent and Results remains product-free", () => {
  const page = read("app/shop/page.tsx");
  const results = read("app/results/page.tsx");
  const productCard = page.slice(page.indexOf("function ProductCard"), page.indexOf("function ProductComparisonPanel"));

  assert.match(productCard, /const \[openPanel, setOpenPanel\] = useState<"why" \| "ask" \| null>\(null\)/);
  assert.match(productCard, /setOpenPanel\("why"\)/);
  assert.match(productCard, /setOpenPanel\("ask"\)/);
  assert.match(productCard, /Why this product\?/);
  assert.match(productCard, /Ask product question/);
  assert.doesNotMatch(results, /ProductCard|Compare these|View product|Why this product\?/i);
});
