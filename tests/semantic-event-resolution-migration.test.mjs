import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const titleSql = readFileSync(new URL("../supabase/migrations/20260808020000_reconcile_semantic_episode_topics_and_titles.sql", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/migrations/20260808030000_rank_semantic_episode_reconciliation.sql", import.meta.url), "utf8");

test("a unique exact semantic topic outranks compact spelling candidates", () => {
  assert.match(sql, /episode_row\.user_id = p_user_id/);
  assert.match(sql, /episode_row\.pet_profile_id = p_pet_id/);
  assert.match(sql, /episode_row\.status in \('active','monitoring'\)/);
  assert.match(sql, /semanticDomain/);
  assert.match(sql, /then 2 else 1[\s\S]*match_rank/);
  assert.match(sql, /if v_top_count > 1[\s\S]*SEMANTIC_EVENT_EPISODE_AMBIGUOUS[\s\S]*elsif v_top_count = 1/);
  assert.doesNotMatch(sql, /found\s+(?:her|him|them)/i);
});

test("only an ownership-scoped duplicate opening is retired", () => {
  assert.match(sql, /episode_row\.source_type = 'semantic_event'/);
  assert.match(sql, /episode_row\.linked_concern_id is null/);
  assert.match(sql, /episode_row\.started_at = v_candidate_started_at/);
  assert.match(sql, /selected_entry\.occurred_at = duplicate_entry\.occurred_at/);
  assert.match(sql, /lower\(btrim\(selected_entry\.note\)\) = lower\(btrim\(duplicate_entry\.note\)\)/);
  assert.match(sql, /duplicate_entry\.care_event_metadata->>'semanticTransition' = 'started'/);
  assert.match(sql, /set status = 'superseded'/);
  assert.match(sql, /episode_row\.id = any\(v_orphan_episode_ids\)/);
});

test("the wrapper retains all subject, evidence, chronology, transition, and confidence enforcement", () => {
  assert.match(sql, /auth\.uid\(\) is null[\s\S]*auth\.uid\(\) is distinct from p_user_id/);
  assert.match(sql, /persist_furvise_semantic_event_exact_20260807/);
  assert.match(sql, /exact RPC remains authoritative for source ownership, evidence,[\s\S]*confidence, subject, transition, chronology, idempotency, and persistence/i);
  assert.match(sql, /revoke all on function public\.persist_furvise_semantic_event_exact_20260807[^;]+authenticated/i);
  assert.match(sql, /grant execute on function public\.persist_furvise_semantic_event[^;]+authenticated/i);
});

test("runaway then found remains append-only, resolves the same episode, and leaves active state", () => {
  assert.match(sql, /p_source_message_id, v_event/);
  assert.match(sql, /v_result\.episode_id/);
  assert.match(sql, /#- array\['semanticStates', v_domain \|\| '_' \|\| v_topic\]/);
  assert.match(sql, /foreach v_cleanup_key in array v_orphan_keys/);
  assert.match(sql, /cardinality\(state_row\.active_episode_ids\) > 0 or cardinality\(state_row\.monitoring_episode_ids\) > 0/);
  assert.doesNotMatch(sql, /delete from public\.(pet_care_entries|pet_care_episodes|pet_current_state)/i);
});

test("History uses a validated presentation title and repairs exposed implementation labels", () => {
  assert.match(sql, /p_event->>'eventTitle'/);
  assert.match(sql, /set title = v_title/);
  assert.match(sql, /Started medication/);
  assert.match(titleSql, /Food changed/);
  assert.match(titleSql, /Missing pet incident/);
  assert.match(titleSql, /intelligence_source_type = 'ask_semantic_event'/);
  assert.match(titleSql, /lower\(btrim\(entry_row\.title\)\) = 'missingpet'/);
  assert.doesNotMatch(titleSql, /regexp_replace\(lower\(entry_row\.title\)[\s\S]*semanticTopic/);
});

test("migration DDL is safe to rerun", () => {
  assert.match(sql, /to_regprocedure\('public\.persist_furvise_semantic_event_exact_20260807/);
  assert.match(sql, /create or replace function public\.persist_furvise_semantic_event/);
});
