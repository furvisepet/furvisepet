import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260810230000_add_lifecycle_integrity_foundation.sql", import.meta.url), "utf8");
const careRoute = readFileSync(new URL("../app/api/care-entries/[id]/route.ts", import.meta.url), "utf8");
const contextSources = [
  "../app/lib/ai/context-builder.ts",
  "../app/lib/intelligence/retrieve-context.ts",
  "../app/lib/pet-memory.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

test("episode membership is relational, tenant-safe, role-aware, and authoritative", () => {
  assert.match(migration, /create table if not exists public\.pet_care_episode_events/);
  assert.match(migration, /foreign key \(episode_id, user_id, pet_profile_id\)[\s\S]*on delete cascade/);
  assert.match(migration, /foreign key \(care_entry_id, user_id, pet_profile_id\)[\s\S]*on delete cascade/);
  for (const role of ["opening", "continuation", "worsening", "improvement", "resolution", "recurrence", "correction", "unknown_legacy"]) {
    assert.match(migration, new RegExp(`'${role}'`));
  }
  assert.match(migration, /summary = \(coalesce\(summary[\s\S]*'eventCount', v_count[\s\S]*'sourceRecordIds', v_ids/);
  assert.match(migration, /revoke all on public\.pet_care_episode_events from public, anon, authenticated/);
});

test("resolution without an observed opening has explicit provenance and no fabricated start", () => {
  assert.match(migration, /resolution_without_observed_opening/);
  assert.match(migration, /when v_count > 0 and v_latest_role = 'resolution' then null/);
  assert.match(migration, /RESOLUTION_ONLY_WITHOUT_PROVENANCE/);
});

test("ordinary History deletion is an idempotent owner-scoped tombstone", () => {
  assert.match(migration, /create or replace function public\.tombstone_my_care_entry/);
  assert.match(migration, /v_user uuid := auth\.uid\(\)/);
  assert.match(migration, /where id = p_entry_id and user_id = v_user for update/);
  assert.match(migration, /revoke delete on public\.pet_care_entries from authenticated/);
  assert.match(careRoute, /rpc\("remove_my_care_entry"/);
  assert.doesNotMatch(careRoute, /from\("pet_care_entries"\)\.delete\(\)/);
  for (const source of contextSources) assert.match(source, /\.is\("deleted_at", null\)/);
});

test("concern identity uses canonical episode identity instead of display titles", () => {
  assert.match(migration, /canonical_concept_key/);
  assert.match(migration, /lifecycle_episode_id/);
  assert.match(migration, /pet_concerns_one_live_per_canonical_episode_idx/);
  const canonicalizer = migration.slice(migration.indexOf("reconcile_canonical_concern_for_entry"));
  assert.doesNotMatch(canonicalizer.slice(0, canonicalizer.indexOf("tombstone_my_care_entry")), /new\.title/);
  assert.match(migration, /Only an explicit episode\/entry relationship proves legacy concern identity/);
});

test("repair and diagnostics are service-only, rebuildable, and conservative", () => {
  assert.match(migration, /create or replace function public\.rebuild_pet_care_episode/);
  assert.match(migration, /create or replace function public\.rebuild_pet_lifecycle_projections/);
  assert.match(migration, /create or replace function public\.run_furvise_lifecycle_integrity_audit/);
  for (const code of [
    "DANGLING_EPISODE_MEMBERSHIP", "SUMMARY_MEMBERSHIP_COUNT_MISMATCH", "CARE_ENTRY_MISSING_MEMBERSHIP",
    "NESTED_STATE_INVALID_SOURCE", "MULTIPLE_LIVE_CONCERNS_FOR_CANONICAL_LIFECYCLE",
    "RESOLUTION_ONLY_WITHOUT_PROVENANCE", "ORPHANED_PROVENANCE_REFERENCE",
  ]) assert.match(migration, new RegExp(code));
  assert.match(migration, /grant execute on function public\.run_furvise_lifecycle_integrity_audit\(\) to service_role/);
  assert.match(migration, /revoke all on function public\.run_furvise_lifecycle_integrity_audit\(\) from public, anon, authenticated/);
  assert.doesNotMatch(migration, /delete from public\.pet_care_entries/);
});
