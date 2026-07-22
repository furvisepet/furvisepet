import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Shop cost controls use dedicated usage and cache tables with own-row RLS", () => {
  const migration = read("supabase/migrations/20260722000000_add_shop_search_usage_and_query_cache.sql");

  assert.match(migration, /create table if not exists public\.shop_search_usage/);
  assert.match(migration, /unique\(user_id, month_key\)/);
  assert.match(migration, /create table if not exists public\.shop_query_interpretations/);
  assert.match(migration, /interpretation_json jsonb not null/);
  assert.match(migration, /unique\(user_id, pet_id, query_hash, pet_context_hash, schema_version\)/);
  assert.match(migration, /alter table public\.shop_search_usage enable row level security/);
  assert.match(migration, /alter table public\.shop_query_interpretations enable row level security/);
  assert.match(migration, /using \(user_id = auth\.uid\(\)\)/);
  assert.match(migration, /with check \(user_id = auth\.uid\(\)\)/);
});

test("Shop cache helper keeps country out of the interpretation cache key", () => {
  const helper = read("app/lib/shop/query-interpretation-cache.ts");
  const keyFunction = helper.slice(helper.indexOf("export function hashShopInterpretationCacheKey"), helper.indexOf("export async function readCachedShopQueryInterpretation"));

  assert.match(helper, /normalizeShopQueryForCache/);
  assert.match(helper, /calculatePetContextHash/);
  assert.match(keyFunction, /normalizedQuery/);
  assert.match(keyFunction, /petContextHash/);
  assert.match(keyFunction, /schemaVersion/);
  assert.doesNotMatch(keyFunction, /country|productCountry|accountCountry/);
});
