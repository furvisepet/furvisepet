import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/migrations/20260808020000_reconcile_semantic_episode_topics_and_titles.sql", import.meta.url), "utf8");

test("equivalent semantic topic spellings resolve only one owned active episode", () => {
  assert.match(sql, /episode_row\.user_id = p_user_id/);
  assert.match(sql, /episode_row\.pet_profile_id = p_pet_id/);
  assert.match(sql, /episode_row\.status in \('active','monitoring'\)/);
  assert.match(sql, /semanticDomain/);
  assert.match(sql, /regexp_replace\(v_topic, '\[\^a-z0-9\]\+', '', 'g'\)/);
  assert.match(sql, /if v_candidate_count = 1[\s\S]*elsif v_candidate_count > 1[\s\S]*SEMANTIC_EVENT_EPISODE_AMBIGUOUS/);
  assert.doesNotMatch(sql, /found\s+(?:her|him|them)/i);
});

test("the wrapper retains all subject, evidence, chronology, transition, and confidence enforcement", () => {
  assert.match(sql, /auth\.uid\(\) is null[\s\S]*auth\.uid\(\) is distinct from p_user_id/);
  assert.match(sql, /persist_furvise_semantic_event_exact_20260807/);
  assert.match(sql, /inner RPC remains the authority for authentication, owned subject\/source,[\s\S]*evidence, confidence, transition validity, and chronology/i);
  assert.match(sql, /revoke all on function public\.persist_furvise_semantic_event_exact_20260807[^;]+authenticated/i);
  assert.match(sql, /grant execute on function public\.persist_furvise_semantic_event[^;]+authenticated/i);
});

test("runaway then found remains append-only, resolves the same episode, and leaves active state", () => {
  assert.match(sql, /p_source_message_id, v_event/);
  assert.match(sql, /v_result\.episode_id/);
  assert.match(sql, /state_row\.state #- array\['semanticStates', v_domain \|\| '_' \|\| v_topic\]/);
  assert.match(sql, /cardinality\(state_row\.active_episode_ids\) > 0 or cardinality\(state_row\.monitoring_episode_ids\) > 0/);
  assert.doesNotMatch(sql, /delete from public\.(pet_care_entries|pet_care_episodes|pet_current_state)/i);
});

test("History uses a validated presentation title and repairs exposed implementation labels", () => {
  assert.match(sql, /p_event->>'eventTitle'/);
  assert.match(sql, /set title = v_title/);
  assert.match(sql, /Started medication/);
  assert.match(sql, /Food changed/);
  assert.match(sql, /Missing pet incident/);
  assert.match(sql, /intelligence_source_type = 'ask_semantic_event'/);
  assert.match(sql, /lower\(btrim\(entry_row\.title\)\) = 'missingpet'/);
  assert.doesNotMatch(sql, /regexp_replace\(lower\(entry_row\.title\)[\s\S]*semanticTopic/);
});

test("migration DDL is safe to rerun", () => {
  assert.match(sql, /to_regprocedure\('public\.persist_furvise_semantic_event_exact_20260807/);
  assert.match(sql, /create or replace function public\.persist_furvise_semantic_event/);
});
