import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260804000000_harden_tenant_pet_link_ownership.sql";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read(migrationPath);

test("forward migration hardens resulting pet ownership on all three affected tables", () => {
  for (const code of [
    "EXISTING_MEMORY_PET_OWNER_MISMATCH",
    "EXISTING_EPISODE_PET_OWNER_MISMATCH",
    "EXISTING_STATE_PET_OWNER_MISMATCH",
  ]) assert.match(migration, new RegExp(code));
  for (const policy of [
    "furvise_memories_insert_own",
    "furvise_memories_update_own",
    "Users can insert their care episodes",
    "Users can update their care episodes",
    "Users can insert their pet state",
    "Users can update their pet state",
  ]) assert.match(migration, new RegExp(`drop policy if exists "${policy}"[\\s\\S]*create policy "${policy}"`));

  for (const table of ["furvise_memories", "pet_care_episodes", "pet_current_state"]) {
    assert.match(migration, new RegExp(`create policy[\\s\\S]*on public\\.${table}[\\s\\S]*auth\\.uid\\(\\)`));
  }
  assert.equal((migration.match(/exists \(\s*select 1 from public\.dog_profiles as pet_row/g) || []).length >= 7, true);
});

test("nullable memory links are explicit and ownership columns are immutable", () => {
  assert.match(migration, /subject_type = 'owner' and pet_id is null/);
  assert.match(migration, /subject_type = 'pet'[\s\S]*pet_id is not null/);
  assert.match(migration, /new\.user_id is distinct from old\.user_id[\s\S]*ROW_OWNER_IMMUTABLE/);
  assert.match(migration, /revoke update on table public\.furvise_memories from authenticated/);
  const memoryUpdateGrant = migration.slice(migration.indexOf("grant update ("), migration.indexOf(") on public.furvise_memories"));
  assert.doesNotMatch(memoryUpdateGrant, /\buser_id\b|\bid\b|\bcreated_at\b/);
  assert.match(memoryUpdateGrant, /\bpet_id\b/);
});

test("secondary links in affected rows cannot cross tenants", () => {
  for (const code of [
    "MEMORY_SUPERSESSION_OWNER_MISMATCH",
    "EPISODE_RECURRENCE_OWNER_MISMATCH",
    "EPISODE_CONCERN_OWNER_MISMATCH",
    "PET_STATE_EPISODE_OWNER_MISMATCH",
    "PET_STATE_SOURCE_OWNER_MISMATCH",
  ]) assert.match(migration, new RegExp(code));
  for (const fn of [
    "enforce_furvise_memory_tenant_links",
    "enforce_pet_care_episode_tenant_links",
    "enforce_pet_current_state_tenant_links",
  ]) assert.match(migration, new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated`));
  assert.equal((migration.match(/before insert or update on public\./g) || []).length, 3);
});

test("generated episode and state updates stay service-only while reads remain available", () => {
  assert.match(migration, /revoke update on table public\.pet_care_episodes, public\.pet_current_state from authenticated/);
  assert.match(migration, /grant select on table public\.pet_care_episodes, public\.pet_current_state to authenticated/);
  assert.match(migration, /grant all privileges on table[\s\S]*public\.furvise_memories,[\s\S]*public\.pet_care_episodes,[\s\S]*public\.pet_current_state[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /drop policy if exists "Users can (?:select|delete) their care episodes"/);
  assert.doesNotMatch(migration, /drop policy if exists "furvise_memories_(?:select|delete)_own"/);
});

test("hostile SQL covers cross-tenant insert, reassignment, owner mutation, nullability, reads, deletes, and service repairs", () => {
  const sql = read("supabase/tests/tenant_link_ownership_integrity.sql");
  for (const evidence of [
    "cross-tenant memory insert succeeded",
    "cross-tenant memory pet update succeeded",
    "memory ownership update succeeded",
    "pet memory accepted a null pet link",
    "owner memory accepted a non-null pet link",
    "cross-tenant episode insert succeeded",
    "cross-tenant state insert succeeded",
    "cross-tenant episode pet update succeeded",
    "cross-tenant state pet update succeeded",
    "cross-tenant memory read succeeded",
    "cross-tenant episode read succeeded",
    "cross-tenant state read succeeded",
    "existing owned-memory delete behavior failed",
    "service-role maintenance RPC privilege was lost",
  ]) assert.match(sql, new RegExp(evidence));
  assert.match(sql, /update public\.furvise_memories[\s\S]*31000000-0000-4000-8000-000000000012/);
  assert.match(sql, /set local role service_role/);
  assert.match(sql, /backfill_pet_care_episodes/);
  assert.match(sql, /recompute_pet_current_state/);
});

test("current application writes remain on owner-validating RPC and trigger paths", () => {
  const persistence = read("app/lib/intelligence/persist-learnings.ts");
  const episodes = read("supabase/migrations/20260728080000_add_pet_care_episodes.sql");
  const state = read("supabase/migrations/20260728090000_add_pet_current_state.sql");
  assert.match(persistence, /rpc\("persist_furvise_intelligence"/);
  assert.match(persistence, /rpc\("persist_furvise_server_care_event"/);
  assert.match(persistence, /createCanonicalCareAuthorityClient/);
  assert.match(episodes, /create trigger pet_care_entries_assign_episode/);
  assert.match(state, /create trigger pet_care_entries_apply_current_state/);
  assert.doesNotMatch(migration, /create or replace function public\.(?:persist_furvise_intelligence|persist_furvise_care_event|assign_pet_care_episode|apply_care_event_to_pet_state)/);
});

test("the separately scoped Shop cache retains a reportable pet-link gap", () => {
  const shop = read("supabase/migrations/20260722001000_ensure_shop_search_usage_and_query_cache.sql");
  assert.match(shop, /create policy "Users can update their Shop query interpretations"[\s\S]*with check \(user_id = auth\.uid\(\)\)/);
  assert.doesNotMatch(shop.slice(shop.indexOf('create policy "Users can update their Shop query interpretations"')), /dog_profiles[\s\S]*pet_id/);
  assert.doesNotMatch(migration, /shop_query_interpretations/);
});
