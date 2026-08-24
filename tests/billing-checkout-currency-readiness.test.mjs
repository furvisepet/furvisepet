import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260824074000_align_billing_checkout_currency_authority.sql");
const readinessFixture = read("supabase/tests/billing_checkout_currency_readiness.sql");

test("checkout currency readiness matches PostgreSQL empty search_path serialization", () => {
  assert.match(migration, /proc\.proconfig @> array\['search_path=""'\]::text\[\]/);
  assert.doesNotMatch(migration, /proc\.proconfig @> array\['search_path='\]::text\[\]/);
  assert.match(readinessFixture, /v_config @> array\['search_path=""'\]::text\[\]/);
});

test("currency-aware checkout claim remains a locked service boundary", () => {
  assert.match(migration, /create function public\.claim_billing_checkout_single_flight_v2\(/);
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /grant execute on function public\.claim_billing_checkout_single_flight_v2\(uuid,text,integer,text,text\)\s+to service_role/);
  assert.match(migration, /billing_checkout_currency_authority/);
});
