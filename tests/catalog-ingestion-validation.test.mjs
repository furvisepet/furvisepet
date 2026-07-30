import assert from "node:assert/strict";
import test from "node:test";
import { mapSourceCategory } from "../app/lib/catalog-ingestion/category-mapping.ts";
import { normalizeIngestionProduct } from "../app/lib/catalog-ingestion/normalize.ts";
import { mapSpeciesCodes } from "../app/lib/catalog-ingestion/species-mapping.ts";
import { parseSizeText } from "../app/lib/catalog-ingestion/units.ts";
import { isDisplayableProductImageUrl, validateNormalizedProduct } from "../app/lib/catalog-ingestion/validate.ts";

function raw(overrides = {}) {
  return {
    brandName: "  north   trail ",
    categoryName: "Food",
    countryCodes: [" us "],
    directions: [],
    images: [],
    ingredients: [],
    offers: [],
    productName: " Adult   Dog Food ",
    productType: "dry_food",
    rawPayload: { source: true },
    speciesCodes: ["Dogs"],
    variants: [],
    warnings: [],
    ...overrides,
  };
}

test("normalization trims values, standardizes codes and slugs, and does not invent facts", () => {
  const product = normalizeIngestionProduct(raw());
  assert.equal(product.brandName, "North Trail");
  assert.equal(product.productName, "Adult Dog Food");
  assert.equal(product.productSlug, "north-trail-adult-dog-food");
  assert.deepEqual(product.speciesCodes, ["dog"]);
  assert.deepEqual(product.countryCodes, ["US"]);
  assert.deepEqual(product.ingredients, []);
});

test("missing optional details create warnings while required fields create errors", () => {
  const result = validateNormalizedProduct(normalizeIngestionProduct(raw()));
  assert.equal(result.publishable, true);
  assert.ok(result.warnings.some((issue) => issue.code === "missing_image"));
  assert.ok(result.warnings.some((issue) => issue.code === "missing_ingredients"));

  const invalid = validateNormalizedProduct(normalizeIngestionProduct(raw({ brandName: "", productName: "" })));
  assert.equal(invalid.publishable, false);
  assert.ok(invalid.errors.some((issue) => issue.code === "missing_brand"));
  assert.ok(invalid.errors.some((issue) => issue.code === "missing_product_name"));
});

test("species and category mappings are controlled and ambiguous values remain reviewable", () => {
  assert.deepEqual(mapSpeciesCodes(["canine", "feline"]).codes, ["dog", "cat"]);
  assert.equal(mapSourceCategory("Dog Shampoo", null).subcategorySlug, "shampoo");
  assert.equal(mapSourceCategory("Dry Adult Dog Food", null).subcategorySlug, "dry-food");
  const unmapped = validateNormalizedProduct(normalizeIngestionProduct(raw({ categoryName: "Mystery Shelf" })));
  assert.ok(unmapped.warnings.some((issue) => issue.code === "unmapped_category"));
});

test("country, currency, decimal price, and URL validation is strict", () => {
  const product = normalizeIngestionProduct(raw({
    countryCodes: ["ZZ"],
    offers: [{
      affiliateUrl: "data:text/plain,bad",
      availability: "unknown",
      countryCode: "ZZ",
      currencyCode: "NOPE",
      destinationUrl: "javascript:alert(1)",
      priceAmount: "-1.00",
      retailerName: "Store",
    }],
    sourceUrl: "file:///tmp/product",
  }));
  const result = validateNormalizedProduct(product);
  assert.ok(result.errors.some((issue) => issue.code === "invalid_country"));
  assert.ok(result.errors.some((issue) => issue.code === "invalid_currency"));
  assert.ok(result.errors.some((issue) => issue.code === "negative_price"));
  assert.ok(result.errors.filter((issue) => issue.code === "invalid_url").length >= 3);
});

test("valid prices remain decimal strings and duplicate variants are rejected", () => {
  const product = normalizeIngestionProduct(raw({
    offers: [{ countryCode: "CA", currencyCode: "cad", destinationUrl: "https://example.ca/item", priceAmount: "019.90", retailerName: "Store" }],
    variants: [{ name: "Small", sku: "ONE" }, { name: "Large", sku: "ONE" }],
  }));
  assert.equal(product.offers[0].priceAmount, "19.9");
  const result = validateNormalizedProduct(product);
  assert.ok(result.errors.some((issue) => issue.code === "duplicate_variant_identifier"));
});

test("size parsing preserves source text and only structures confident units", () => {
  assert.deepEqual(parseSizeText("12 x 375 g cans"), {
    originalSizeText: "12 x 375 g cans",
    packageQuantity: 12,
    sizeUnit: "g",
    sizeValue: "375",
  });
  assert.deepEqual(parseSizeText("family value pack"), {
    originalSizeText: "family value pack",
    packageQuantity: null,
    sizeUnit: null,
    sizeValue: null,
  });
});

test("display product images require HTTPS and reject placeholders and tracking pixels", () => {
  assert.equal(isDisplayableProductImageUrl("https://cdn.example.ca/products/item.jpg"), true);
  assert.equal(isDisplayableProductImageUrl("http://cdn.example.ca/products/item.jpg"), false);
  assert.equal(isDisplayableProductImageUrl("https://cdn.example.ca/placeholder.png"), false);
  assert.equal(isDisplayableProductImageUrl("https://cdn.example.ca/item.png?width=1"), false);
});
