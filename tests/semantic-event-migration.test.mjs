import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/migrations/20260807010000_add_generic_semantic_event_persistence.sql", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../app/lib/intelligence/persist-learnings.ts", import.meta.url), "utf8");

test("semantic RPC is authenticated, ownership-bound, locked, and not publicly executable", () => {
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/i);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /pet_row\.id = p_pet_id and pet_row\.user_id = p_user_id/);
  assert.match(sql, /conversation_row\.pet_profile_id = p_pet_id/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /semantic-source:[^\n]+p_source_message_id/);
  assert.match(sql, /semantic-topic:[^\n]+v_key/);
  assert.match(sql, /revoke all on function public\.persist_furvise_semantic_event[^;]+from public, anon, service_role/i);
  assert.match(sql, /grant execute on function public\.persist_furvise_semantic_event[^;]+to authenticated/i);
});

test("the RPC rejects model references and resolves an active same-pet episode server-side", () => {
  assert.match(sql, /p_event \? 'references'/);
  assert.match(sql, /SEMANTIC_EVENT_MODEL_REFERENCE_FORBIDDEN/);
  assert.match(sql, /episode_row\.user_id = p_user_id and episode_row\.pet_profile_id = p_pet_id/);
  assert.match(sql, /episode_row\.normalized_key = v_key and episode_row\.status in \('active','monitoring'\)/);
  assert.match(sql, /SEMANTIC_EVENT_ACTIVE_EPISODE_REQUIRED/);
  assert.doesNotMatch(persistence, /p_episode_id|p_concern_id/);
});

test("accepted transitions append history, update episodes, and preserve topic-scoped current state", () => {
  assert.match(sql, /insert into public\.pet_care_entries/);
  assert.match(sql, /insert into public\.pet_care_episodes/);
  assert.match(sql, /update public\.pet_care_episodes/);
  assert.match(sql, /array\['semanticStates', v_key\]/);
  assert.match(sql, /source_event_ids = case when v_entry_id = any/);
  assert.match(sql, /jsonb_set\(v_state_json, '\{wellbeing\}', coalesce\(v_state_json->'wellbeing'/);
  assert.doesNotMatch(sql, /delete from public\.(pet_care_entries|pet_care_episodes|pet_current_state)/);
});

test("the generic RPC preserves the legacy concern RPC and enforces confidence floors", () => {
  assert.doesNotMatch(sql, /create or replace function public\.persist_furvise_care_event/);
  assert.match(sql, /v_transition in \('resolved','corrected'\) then 0\.95/);
  assert.match(sql, /SEMANTIC_EVENT_EPISODE_AMBIGUOUS/);
  assert.match(sql, /intelligence_source_message_id = p_source_message_id/);
  assert.match(sql, /v_state = 'resolved' and v_transition <> 'resolved'/);
});

test("trigger-created medical concerns are linked and only the server-resolved episode concern can close", () => {
  assert.match(sql, /concern_row\.source_care_entry_id = v_entry_id/);
  assert.match(sql, /episode_row\.id = v_episode\.id and episode_row\.user_id = p_user_id and episode_row\.pet_profile_id = p_pet_id/);
  assert.match(sql, /concern_row\.id = v_linked_concern_id[\s\S]*concern_row\.user_id = p_user_id and concern_row\.pet_profile_id = p_pet_id/);
  assert.match(sql, /status = 'resolved'[\s\S]*active_episode_id = null/);
  assert.match(sql, /update public\.pet_care_entries as entry_row set concern_id = v_linked_concern_id[\s\S]*where entry_row\.id = v_entry_id/);
});
