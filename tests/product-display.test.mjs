import assert from "node:assert/strict";
import test from "node:test";
import {
  formatProductResultCount,
  getProductDifferentiator,
} from "../app/lib/shop/product-display.ts";
import { staticRealProducts } from "../app/lib/products/static-products.ts";

const wetFood = staticRealProducts.find((product) => product.subcategory === "wet_food");
const dryFood = staticRealProducts.find(
  (product) => product.id === "purina-pro-plan-sensitive-skin-stomach-salmon-rice-dry",
);

test("product result count uses careful match pluralization", () => {
  assert.equal(formatProductResultCount(1), "Found 1 careful match");
  assert.equal(formatProductResultCount(2), "Found 2 careful matches");
});

test("product cards keep useful deterministic format differentiators", () => {
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

test("product display copy avoids restricted claims and em dashes", () => {
  const displayText = staticRealProducts.map(getProductDifferentiator).join(" ");
  assert.doesNotMatch(
    displayText,
    /\bguaranteed\b|\bsafe\b|\bbest\b|vet-approved|treatment|\bcure\b|\u2014/i,
  );
});
