import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260808010000_repair_care_state_sources_and_ask_reconciliation.sql");
const ownership = read("supabase/migrations/20260804000000_harden_tenant_pet_link_ownership.sql");
const askRoute = read("app/api/ask/route.ts");

test("repair removes only missing same-tenant source IDs and validates its result", () => {
  assert.match(migration, /array_agg\(linked\.source_event_id order by linked\.ordinality\)/);
  assert.match(migration, /filter \(where entry_row\.id is not null\)/);
  assert.match(migration, /entry_row\.user_id = state_row\.user_id/);
  assert.match(migration, /entry_row\.pet_profile_id = state_row\.pet_profile_id/);
  assert.match(migration, /repaired\.dangling_count > 0/);
  assert.match(migration, /get diagnostics v_rows_repaired = row_count/);
  assert.match(migration, /PET_STATE_SOURCE_REPAIR_INCOMPLETE/);
  assert.match(migration, /dangling_before=%, rows_repaired=%, dangling_after=%/);
  assert.doesNotMatch(migration, /delete from public\.pet_care_entries|delete from public\.pet_current_state/);
});

test("care-entry deletion prunes only the deleted source while preserving order and state", () => {
  assert.match(migration, /create trigger pet_care_entries_prune_current_state_after_delete[\s\S]*after delete on public\.pet_care_entries/);
  assert.match(migration, /where linked\.source_event_id <> old\.id[\s\S]*order by linked\.ordinality/);
  assert.match(migration, /state_row\.pet_profile_id = old\.pet_profile_id[\s\S]*state_row\.user_id = old\.user_id/);
  const pruneFunction = migration.slice(migration.indexOf("create or replace function public.prune_deleted_care_event_from_pet_state"), migration.indexOf("revoke all on function public.prune_deleted_care_event_from_pet_state"));
  assert.doesNotMatch(pruneFunction, /set state\s*=|active_episode_ids\s*=|monitoring_episode_ids\s*=/);
});

test("trusted care writes self-heal stale sources but strict tenant validation remains", () => {
  assert.match(migration, /from unnest\(coalesce\(v_previous\.source_event_ids/);
  assert.match(migration, /entry_row\.user_id = new\.user_id[\s\S]*entry_row\.pet_profile_id = new\.pet_profile_id/);
  assert.match(migration, /v_sources := array_append\(v_sources, new\.id\)/);
  assert.match(migration, /source_event_ids = excluded\.source_event_ids/);
  assert.doesNotMatch(migration, /create or replace function public\.enforce_pet_current_state_tenant_links/);
  assert.match(ownership, /PET_STATE_EPISODE_OWNER_MISMATCH/);
  assert.match(ownership, /PET_STATE_SOURCE_OWNER_MISMATCH/);
});

test("Ask reconciliation update is assistant-only, owner-bound, and column-limited", () => {
  assert.match(migration, /create policy "ask_conversation_messages_update_own_reconciliation"/);
  assert.match(migration, /for update[\s\S]*user_id = auth\.uid\(\)[\s\S]*role = 'furvise'/);
  assert.match(migration, /conversation_row\.id = ask_conversation_messages\.conversation_id[\s\S]*conversation_row\.user_id = auth\.uid\(\)/);
  assert.match(migration, /revoke update on table public\.ask_conversation_messages from authenticated/);
  assert.match(migration, /grant update \(care_persistence, response_data\) on public\.ask_conversation_messages to authenticated/);
  assert.doesNotMatch(migration, /grant update on public\.ask_conversation_messages/);
});

test("Ask writes and replay reads the reconciled persistence fields", () => {
  assert.match(askRoute, /update\(\{ care_persistence: carePersistence, response_data: canonicalResponse \}\)/);
  assert.match(askRoute, /select\("id, conversation_id, request_id, role, sequence_number, user_text, response_data, save_metadata, context_used, care_persistence"\)/);
  assert.match(askRoute, /existingRequest\?\.assistantMessage\?\.response_data/);
});
