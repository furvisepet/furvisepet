import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("pet profile baseline creates the historical prerequisite without absorbing later changes", () => {
  const baseline = read("supabase/migrations/20260622000000_create_pet_profile_baseline.sql");

  assert.match(baseline, /create table if not exists public\.dog_profiles/);
  assert.match(baseline, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(baseline, /name text not null/);
  assert.match(baseline, /avoid_ingredients text\[\] default '\{\}'/);
  assert.match(baseline, /alter table public\.dog_profiles enable row level security/);
  assert.match(baseline, /create index if not exists dog_profiles_user_id_idx/);
  assert.doesNotMatch(baseline, /\bspecies text\b/);
  assert.doesNotMatch(baseline, /\bwellness_goal text\b/);
  assert.doesNotMatch(baseline, /drop table|truncate table|alter column .* type/i);
});

test("role grant reconciliation keeps anonymous, catalog, and ingestion access least-privileged", () => {
  const grants = read("supabase/migrations/20260723021000_reconcile_application_role_grants.sql");

  assert.match(grants, /revoke all privileges[\s\S]+from anon, authenticated/);
  assert.match(grants, /grant select, insert, update, delete[\s\S]+public\.dog_profiles[\s\S]+to authenticated/);
  assert.match(grants, /grant select on table[\s\S]+public\.products[\s\S]+to authenticated/);
  assert.doesNotMatch(grants, /grant (?:all privileges|insert|update|delete)[\s\S]+public\.product_ingestion_(?:batches|records|events)[\s\S]+to authenticated/i);
  assert.match(grants, /public\.product_ingestion_batches[\s\S]+public\.product_ingestion_records[\s\S]+public\.product_ingestion_events[\s\S]+to service_role/);
});
