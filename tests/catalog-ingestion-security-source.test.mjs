import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260723020000_add_product_ingestion_pipeline.sql", import.meta.url), "utf8");
const publish = readFileSync(new URL("../app/lib/catalog-ingestion/publish.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../app/lib/catalog-ingestion/admin-client.ts", import.meta.url), "utf8");

test("staging tables preserve raw input and append-only audit history", () => {
  for (const table of ["product_ingestion_batches", "product_ingestion_records", "product_ingestion_events"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /raw_payload is immutable/);
  assert.match(migration, /product ingestion events are append-only/);
  assert.match(migration, /validation_errors jsonb/);
  assert.match(migration, /validation_warnings jsonb/);
});

test("normal users cannot read or write ingestion data", () => {
  assert.doesNotMatch(migration, /create policy[\s\S]+product_ingestion_(batches|records|events)/i);
  assert.match(migration, /No client policies are intentionally defined/);
  assert.match(migration, /grant execute[\s\S]+to service_role/);
  assert.match(client, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(client, /typeof window !== "undefined"/);
  assert.doesNotMatch(readFileSync(new URL("../app/shop/page.tsx", import.meta.url), "utf8"), /product_ingestion|normalized_payload|duplicate_match_type/);
});

test("publication creates provenance, reuses product IDs, and uses idempotent conflict keys", () => {
  assert.match(publish, /product_sources/);
  assert.match(publish, /source_id: sourceId/g);
  assert.match(publish, /existingProductId = record\.proposed_action === "update"/);
  assert.match(publish, /product_species[\s\S]+product_id,species_id/);
  assert.match(publish, /product_markets[\s\S]+product_id,country_code/);
  assert.match(publish, /product_offers[\s\S]+product_id,variant_id,retailer_id,country_code/);
});

test("batch counters distinguish partial success and Results remains product-free", () => {
  assert.match(migration, /count\(\*\) filter \(where status = 'published'\)/);
  assert.match(migration, /count\(\*\) filter \(where status = 'invalid'\)/);
  const results = readFileSync(new URL("../app/results/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(results, /product_ingestion|ProductCard|loadShopCatalogProducts/);
});
