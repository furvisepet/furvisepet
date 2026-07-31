import assert from "node:assert/strict";
import test from "node:test";
import { clampCatalogResultLimit } from "../app/lib/catalog/constants.ts";
import { catalogProductToLegacyProduct, mapCatalogProductRow } from "../app/lib/catalog/mappers.ts";
import { isCatalogProductSafeForContext } from "../app/lib/catalog/queries.ts";

function productRow(overrides = {}) {
  return {
    id: "product-1",
    name: "Shared Grooming Tool",
    slug: "shared-grooming-tool",
    short_description: "A grooming tool for routine coat care.",
    description: "Use gently and follow the package directions.",
    product_type: "brush",
    status: "active",
    default_image_url: "https://example.com/product.jpg",
    life_stage: "all",
    primary_protein: null,
    search_tags: ["coat", "brush"],
    concern_tags: ["grooming"],
    ingredient_list_complete: false,
    advisor_summary: "Useful for routine brushing.",
    category_rationale: "It matches grooming searches.",
    cautions: "Stop if the skin becomes irritated.",
    product_brands: { id: "brand-1", name: "Example Brand", slug: "example-brand" },
    product_categories: { id: "category-1", parent_id: null, name: "Grooming", slug: "grooming" },
    product_species: [
      { suitability_type: "intended", species: { id: "dog", code: "dog", name: "Dog" } },
      { suitability_type: "compatible", species: { id: "cat", code: "cat", name: "Cat" } },
    ],
    product_markets: [{ country_code: "US", status: "available", last_verified_at: "2026-07-23T00:00:00Z" }],
    product_variants: [
      { id: "variant-1", name: "Small", sku: "SMALL", gtin: null, size_value: "5.000", size_unit: "in", flavor: null, package_quantity: 1, is_default: true, is_active: true },
      { id: "variant-2", name: "Large", sku: "LARGE", gtin: null, size_value: "8.000", size_unit: "in", flavor: null, package_quantity: 1, is_default: false, is_active: true },
    ],
    product_images: [],
    product_ingredients: [],
    product_warnings: [{ id: "warning-1", variant_id: null, warning_type: "manufacturer", text: "Use gently." }],
    product_directions: [{ id: "direction-1", variant_id: null, direction_type: "manufacturer", text: "Brush with the coat." }],
    product_offers: [
      {
        id: "offer-1", variant_id: "variant-1", country_code: "US", destination_url: "https://store.example/item",
        affiliate_url: "https://affiliate.example/item", currency_code: "USD", price_amount: "19.90",
        original_price_amount: "24.00", availability_status: "in_stock", is_active: true,
        retailers: { id: "retailer-1", name: "Example Store", slug: "example-store" },
      },
      {
        id: "offer-2", variant_id: "variant-2", country_code: "US", destination_url: "https://other.example/item",
        affiliate_url: null, currency_code: "USD", price_amount: "21.10", original_price_amount: null,
        availability_status: "unknown", is_active: true,
        retailers: { id: "retailer-2", name: "Other Store", slug: "other-store" },
      },
      {
        id: "offer-inactive", variant_id: null, country_code: "US", destination_url: "https://inactive.example/item",
        affiliate_url: null, currency_code: "USD", price_amount: "1.00", original_price_amount: null,
        availability_status: "in_stock", is_active: false,
        retailers: { id: "retailer-3", name: "Inactive Store", slug: "inactive-store" },
      },
    ],
    ...overrides,
  };
}

test("one catalog product supports multiple species and variants", () => {
  const product = mapCatalogProductRow(productRow());
  assert.deepEqual(product.species.map((item) => item.code), ["dog", "cat"]);
  assert.equal(product.variants.length, 2);
});

test("species, country, and lifecycle checks exclude unsafe products", () => {
  const shared = mapCatalogProductRow(productRow());
  assert.equal(isCatalogProductSafeForContext(shared, "dog", "US"), true);
  assert.equal(isCatalogProductSafeForContext(shared, "cat", "US"), true);
  assert.equal(isCatalogProductSafeForContext(shared, "dog", "CA"), false);

  const dogOnly = mapCatalogProductRow(productRow({
    product_species: [{ suitability_type: "intended", species: { id: "dog", code: "dog", name: "Dog" } }],
  }));
  assert.equal(isCatalogProductSafeForContext(dogOnly, "cat", "US"), false);
  const discontinued = { ...shared, status: "discontinued" };
  assert.equal(isCatalogProductSafeForContext(discontinued, "dog", "US"), false);
});

test("offers retain decimal strings, support multiples, and prefer an active affiliate URL", () => {
  const product = mapCatalogProductRow(productRow());
  assert.equal(product.offers.length, 2);
  assert.equal(product.offers[0].priceAmount, "19.90");
  assert.equal(product.offers[0].publicUrl, "https://affiliate.example/item");
  assert.equal(product.offers[1].publicUrl, "https://other.example/item");
  assert.equal(product.offers.some((offer) => offer.id === "offer-inactive"), false);
});

test("the legacy product-card adapter supplies the existing required fields", () => {
  const product = catalogProductToLegacyProduct(mapCatalogProductRow(productRow()), "US");
  assert.equal(product.name, "Shared Grooming Tool");
  assert.deepEqual(product.species, ["dog", "cat"]);
  assert.deepEqual(product.availableCountries, ["US"]);
  assert.equal(product.productPageUrl, "https://affiliate.example/item");
  assert.equal(product.category, "grooming");
});

test("catalog limits are always bounded", () => {
  assert.equal(clampCatalogResultLimit(undefined), 24);
  assert.equal(clampCatalogResultLimit(0), 1);
  assert.equal(clampCatalogResultLimit(10_000), 60);
});
