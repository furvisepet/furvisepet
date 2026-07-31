import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260723010000_add_unified_product_catalog.sql", import.meta.url),
  "utf8",
);

const tables = [
  "species", "product_brands", "product_categories", "products", "product_species", "product_markets",
  "product_variants", "product_images", "ingredients", "product_ingredients", "product_warnings",
  "product_directions", "retailers", "product_offers", "product_sources",
];

test("the unified catalog migration creates every normalized catalog table", () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\s*\\(`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.doesNotMatch(migration, /dogs_products|cats_products/);
});

test("catalog lifecycle, market, money, and relationship constraints are explicit", () => {
  assert.match(migration, /status in \('draft', 'active', 'inactive', 'discontinued', 'rejected'\)/);
  assert.match(migration, /status in \('available', 'unavailable', 'unknown', 'discontinued'\)/);
  assert.match(migration, /availability_status in \('in_stock', 'out_of_stock', 'preorder', 'unknown'\)/);
  assert.match(migration, /price_amount numeric\(12, 2\)/);
  assert.match(migration, /primary key \(product_id, species_id\)/);
  assert.match(migration, /unique\(product_id, country_code\)/);
  assert.match(migration, /unique index if not exists product_variants_one_default_key/);
  assert.match(migration, /unique index if not exists product_images_one_product_primary_key/);
});

test("catalog writes are not granted to public clients", () => {
  assert.doesNotMatch(migration, /create policy[^;]+catalog[^;]+for (insert|update|delete)/is);
  assert.match(migration, /product_sources intentionally has no client-readable or client-writable policy/);
  assert.match(migration, /grant execute on function public\.search_catalog_product_ids[^;]+to authenticated/);
});

test("frequent catalog query indexes and the hard result cap are present", () => {
  for (const index of [
    "products_brand_id_idx", "products_category_id_idx", "products_status_active_idx",
    "product_species_species_product_idx", "product_markets_country_status_product_idx",
    "product_variants_product_id_idx", "product_offers_product_id_idx", "product_offers_retailer_id_idx",
    "product_offers_country_availability_idx", "product_images_product_position_idx",
    "product_ingredients_product_position_idx", "product_sources_provider_external_idx",
  ]) assert.match(migration, new RegExp(index));
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 24\), 1\), 100\)/);
});
