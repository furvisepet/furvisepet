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
        last_checked_at: "2026-07-23T12:00:00Z",
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

test("organic offers use destination URLs without promoting unverified affiliate URLs", () => {
  const product = mapCatalogProductRow(productRow());
  assert.equal(product.offers.length, 2);
  assert.equal(product.offers[0].priceAmount, "19.90");
  assert.equal(product.offers[0].affiliateUrl, "https://affiliate.example/item");
  assert.equal(product.offers[0].publicUrl, "https://store.example/item");
  assert.equal(product.offers[1].publicUrl, "https://other.example/item");
  assert.equal(product.offers.some((offer) => offer.id === "offer-inactive"), false);
});

test("products without affiliate URLs remain eligible for organic shopping links", () => {
  const row = productRow({
    product_offers: [{
      id: "organic-only", variant_id: null, country_code: "US", destination_url: "https://organic.example/item",
      affiliate_url: null, currency_code: "USD", price_amount: "18.00", original_price_amount: null,
      availability_status: "in_stock", is_active: true, last_checked_at: "2026-07-23T12:00:00Z",
      retailers: { id: "organic-retailer", name: "Organic Store", slug: "organic-store" },
    }],
  });
  const product = catalogProductToLegacyProduct(mapCatalogProductRow(row), "US");
  assert.equal(product.active, true);
  assert.equal(product.productPageUrl, "https://organic.example/item");
  assert.equal(product.affiliateUrl, undefined);
});

test("affiliate presence has no effect on deterministic offer ordering", () => {
  const common = {
    availability_status: "in_stock", country_code: "US", currency_code: "USD", is_active: true,
    last_checked_at: "2026-07-23T12:00:00Z", original_price_amount: null, price_amount: "20.00", variant_id: null,
  };
  const row = productRow({
    product_offers: [
      { ...common, id: "affiliate-b", destination_url: "https://b.example/item", affiliate_url: "https://affiliate.example/b", retailers: { id: "b", name: "B Store", slug: "b-store" } },
      { ...common, id: "organic-a", destination_url: "https://a.example/item", affiliate_url: null, retailers: { id: "a", name: "A Store", slug: "a-store" } },
    ],
  });
  const product = catalogProductToLegacyProduct(mapCatalogProductRow(row), "US");
  assert.equal(product.retailer, "A Store");
  assert.equal(product.productPageUrl, "https://a.example/item");
});

test("the legacy product-card adapter supplies the existing required fields", () => {
  const product = catalogProductToLegacyProduct(mapCatalogProductRow(productRow()), "US");
  assert.equal(product.name, "Shared Grooming Tool");
  assert.deepEqual(product.species, ["dog", "cat"]);
  assert.deepEqual(product.availableCountries, ["US"]);
  assert.equal(product.productPageUrl, "https://store.example/item");
  assert.equal(product.affiliateUrl, undefined);
  assert.equal(product.price, 19.9);
  assert.equal(product.priceVerifiedAt, "2026-07-23T12:00:00Z");
  assert.equal(product.availabilityStatus, "in_stock");
  assert.equal(product.category, "grooming");
});

test("legacy mapping keeps CA and US markets and offers isolated", () => {
  const base = productRow();
  const row = productRow({
    product_markets: [
      { country_code: "CA", status: "available", last_verified_at: "2026-07-23T00:00:00Z" },
      { country_code: "US", status: "available", last_verified_at: "2026-07-23T00:00:00Z" },
    ],
    product_offers: [
      ...base.product_offers,
      {
        id: "offer-ca", variant_id: null, country_code: "CA", destination_url: "https://store.example.ca/item",
        affiliate_url: "https://affiliate.example.ca/item", currency_code: "CAD", price_amount: "22.50",
        original_price_amount: null, availability_status: "in_stock", is_active: true,
        last_checked_at: "2026-07-23T12:00:00Z",
        retailers: { id: "retailer-ca", name: "Canada Store", slug: "canada-store" },
      },
    ],
  });
  const detail = mapCatalogProductRow(row);
  const ca = catalogProductToLegacyProduct(detail, "CA");
  const us = catalogProductToLegacyProduct(detail, "US");
  assert.deepEqual(ca.availableCountries, ["CA"]);
  assert.equal(ca.productPageUrl, "https://store.example.ca/item");
  assert.equal(ca.currency, "CAD");
  assert.deepEqual(us.availableCountries, ["US"]);
  assert.equal(us.productPageUrl, "https://store.example/item");
  assert.equal(us.currency, "USD");
});

test("offer priority prefers stock and then same-currency lowest price", () => {
  const base = productRow();
  const common = {
    affiliate_url: null, country_code: "US", currency_code: "USD", is_active: true,
    last_checked_at: "2026-07-23T12:00:00Z", original_price_amount: null, variant_id: null,
  };
  const detail = mapCatalogProductRow(productRow({
    product_offers: [
      { ...common, id: "out-cheap", destination_url: "https://store.example/cheap", price_amount: "1.00", availability_status: "out_of_stock", retailers: { id: "r1", name: "A Store", slug: "a-store" } },
      { ...common, id: "in-expensive", destination_url: "https://store.example/in", price_amount: "25.00", availability_status: "in_stock", retailers: { id: "r2", name: "B Store", slug: "b-store" } },
      { ...common, id: "in-lower", destination_url: "https://store.example/lower", price_amount: "20.00", availability_status: "in_stock", retailers: { id: "r3", name: "C Store", slug: "c-store" } },
    ],
    product_markets: base.product_markets,
  }));
  const mapped = catalogProductToLegacyProduct(detail, "US");
  assert.equal(mapped.productPageUrl, "https://store.example/lower");
  assert.equal(mapped.availabilityStatus, "in_stock");
  assert.equal(mapped.price, 20);
});

test("primary offers are deterministic and never manufacture price or stock", () => {
  const withoutPrice = productRow({
    product_offers: [{
      id: "offer-out", variant_id: null, country_code: "US", destination_url: "https://store.example/out",
      affiliate_url: null, currency_code: "USD", price_amount: null, original_price_amount: null,
      availability_status: "out_of_stock", is_active: true, last_checked_at: "2026-07-23T12:00:00Z",
      retailers: { id: "retailer-out", name: "Out Store", slug: "out-store" },
    }],
  });
  const mapped = catalogProductToLegacyProduct(mapCatalogProductRow(withoutPrice), "US");
  assert.equal(mapped.price, undefined);
  assert.equal(mapped.priceVerifiedAt, undefined);
  assert.equal(mapped.availabilityStatus, "out_of_stock");
});

test("catalog limits are always bounded", () => {
  assert.equal(clampCatalogResultLimit(undefined), 24);
  assert.equal(clampCatalogResultLimit(0), 1);
  assert.equal(clampCatalogResultLimit(10_000), 60);
});
