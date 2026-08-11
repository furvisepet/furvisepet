import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260811120000_add_history_lifecycle_dismissal.sql");
const databaseVerification = read("supabase/tests/history_lifecycle_dismissal.sql");
const route = read("app/api/care-entries/[id]/route.ts");
const workspace = read("app/components/care-log-workspace.tsx");
const retrieval = read("app/lib/intelligence/retrieve-context.ts");
const concernLoader = read("app/lib/ai/context-builder.ts");
const episodeReducer = read("app/lib/intelligence/episodes/reduce-episode-state.ts");
const documentation = read("docs/information-removal-semantics.md");

test("History Delete always uses the governed lifecycle dismissal contract", () => {
  assert.match(migration, /status in \('active', 'monitoring', 'resolved', 'dismissed'/);
  assert.match(migration, /dismissal_reason = 'user_removed'/);
  assert.match(migration, /create or replace function public\.remove_my_care_entry/);
  assert.match(migration, /v_user uuid := auth\.uid\(\)/);
  assert.match(migration, /where id = p_entry_id and user_id = v_user for update/);
  assert.doesNotMatch(migration, /delete from public\.pet_care_entries/);
  assert.doesNotMatch(migration, /delete from public\.pet_care_episode_events/);
});

test("dismissal is non-clinical, preserves provenance, and cleans current projections", () => {
  const removal = migration.slice(migration.indexOf("create or replace function public.remove_my_care_entry"));
  assert.match(removal, /status = 'dismissed'/);
  assert.match(removal, /resolved_at = null/);
  assert.match(removal, /active_episode_ids = array_remove/);
  assert.match(removal, /monitoring_episode_ids = array_remove/);
  assert.match(migration, /sanitize_dismissed_pet_current_state/);
  assert.match(migration, /semanticStates/);
  assert.match(migration, /currentMedications/);
  assert.doesNotMatch(removal, /insert into public\.pet_care_entries/);
  assert.doesNotMatch(removal, /state_action_type[^\n]*resolve_concern/);
});

test("API has one direct Delete contract with no lifecycle-impact choices", () => {
  assert.doesNotMatch(route, /export async function GET/);
  assert.doesNotMatch(route, /get_my_care_entry_removal_impact|activeConcernExists|lifecycleStillActive|activeEpisodeId|stopTrackingIssue/);
  assert.match(route, /remove_my_care_entry/);
  assert.match(route, /p_stop_tracking: true/);
  assert.match(route, /operationType: "care\.remove_history"/);
  assert.match(route, /Response\.json\(\{ removedFromHistory: true \}\)/);
});

test("History UI offers one Delete action and explains that Furvise stops using the event", () => {
  assert.doesNotMatch(workspace, /getCareEntryRemovalImpact|removalImpact|Remove from History only|Stop tracking this issue too/);
  assert.match(workspace, /Delete this History event\?/);
  assert.match(workspace, /Furvise will stop remembering, tracking, and using this event/);
  assert.match(workspace, /Internal audit links may be retained/);
  assert.match(workspace, /Deleted\. Furvise will no longer use this event\./);
  assert.match(workspace, /Cancel/);
});

test("Ask active and recently-resolved retrieval cannot classify dismissal as recovery", () => {
  assert.match(retrieval, /\.is\("deleted_at", null\)/);
  assert.match(retrieval, /\.in\("status", \["active", "monitoring", "resolved"\]\)/);
  assert.doesNotMatch(retrieval, /\.in\("status", \[[^\]]*"dismissed"/);
  assert.match(concernLoader, /\.in\("status", \["active", "reopened"\]\)/);
  assert.match(concernLoader, /\.eq\("status", "resolved"\)/);
  assert.doesNotMatch(concernLoader, /"dismissed"/);
  assert.match(episodeReducer, /current === "dismissed"/);
  assert.match(retrieval, /suppressedSourceMessageIds/);
  assert.match(retrieval, /responseReferencesCareEntry/);
  assert.match(retrieval, /memory\.source_type === "ask_message"/);
});

test("database verification covers tombstone, dismissal, isolation, provenance, and idempotency", () => {
  for (const evidence of [
    "inactive historical entry was not tombstoned",
    "episode was not non-clinically dismissed",
    "canonical concern was not dismissed",
    "dismissed lifecycle remained in current state",
    "episode provenance was removed",
    "History deletion fabricated clinical resolution History",
    "cross-user dismissal succeeded",
    "dismissal crossed into another owned pet",
    "monitoring lifecycle was not dismissed by History deletion",
    "repeated dismissal was not idempotent",
  ]) assert.match(databaseVerification, new RegExp(evidence));
  assert.match(databaseVerification, /rollback;/);
});

test("memory forgetting and future privacy erasure remain explicitly separate", () => {
  assert.match(documentation, /changes only the lifecycle of the selected pet or owner memory/);
  assert.match(documentation, /does not remove or alter History, episodes, concerns, current state, or conversations/);
  for (const scope of ["History content", "episode membership", "current-state", "concerns", "pet and owner memories", "conversation content", "context_used"]) {
    assert.match(documentation, new RegExp(scope));
  }
  assert.match(documentation, /not implemented/);
  assert.match(documentation, /Delete means Furvise stops remembering, tracking, and using the selected History event/);
});
