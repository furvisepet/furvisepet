import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifyCareEvent, deriveConcernChronology } from "../app/lib/intelligence/concern-chronology.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260728070000_canonical_care_event_chronology.sql");
const askRoute = read("app/api/ask/route.ts");
const askPage = read("app/ask/page.tsx");
const persistence = read("app/lib/intelligence/persist-learnings.ts");
const safety = read("app/lib/intelligence/safety-state.ts");
const intelligence = read("app/lib/intelligence/run-intelligence.ts");
const history = read("app/components/care-timeline.tsx");
const supabase = read("app/lib/supabase.ts");

const concern = { id: "concern-1", user_id: "user-1", pet_profile_id: "pet-1", title: "Breathing", normalized_key: "breathing", status: "resolved", severity: "urgent", source_care_entry_id: null, opened_at: "2026-07-28T01:00:00Z", updated_at: "2026-07-28T04:00:00Z", resolved_at: "2026-07-28T04:00:00Z", resolution_note: "normal" };
const entry = (id, at, state_action_type, title, severity = null) => ({ id, user_id: "user-1", pet_profile_id: "pet-1", category: "symptom", title, note: title, severity, occurred_at: at, created_at: at, updated_at: at, concern_id: "concern-1", state_action_type });
const occurred = entry("occurred", "2026-07-28T01:00:00Z", "create_entry", "Breathing deeply", "severe");
const recovered = entry("recovered", "2026-07-28T02:00:00Z", "resolve_concern", "Breathing returned to normal");
const recurred = entry("recurred", "2026-07-28T03:00:00Z", "reopen_concern", "Breathing concern recurred", "severe");
const recoveredAgain = entry("recovered-again", "2026-07-28T04:00:00Z", "resolve_concern", "Breathing returned to normal");

test("explicit recovery is persisted as one canonical symptom event", () => {
  assert.match(migration, /'Breathing returned to normal'/);
  assert.match(migration, /intelligence_source_message_id/);
  assert.match(migration, /state_action_type/);
});

test("UI confirmation requires a persisted status and a concrete entry id", () => {
  assert.match(askPage, /carePersistence\?\.status === "persisted" && Boolean\(payload\.carePersistence\.careEntryIds\.length\)/);
  assert.match(askRoute, /carePersistence\.status === "persisted" && carePersistence\.careEntryIds\.length > 0/);
});

test("persistence failure cannot show Added to care history", () => {
  assert.match(askPage, /carePersistence\?\.status === "failed"/);
  assert.match(persistence, /status: "failed", careEntryIds: \[\]/);
});

test("a repeated save request reuses the previous source entry", () => {
  assert.match(askRoute, /findExistingCareEventForSaveRequest/);
  assert.match(askRoute, /alreadyPersisted: true/);
  assert.match(askRoute, /improvement is already in/);
});

test("recurrence is a distinct chronological event", () => {
  assert.equal(classifyCareEvent(recurred), "recurrence");
  assert.equal(classifyCareEvent({ ...recurred, note: "The problem recurred after a prior resolved episode." }), "recurrence");
  assert.match(migration, /'Breathing concern recurred'/);
});

test("recurrence reopens the stateful concern episode", () => {
  assert.match(migration, /status = 'reopened'/);
  assert.match(migration, /episode_sequence = greatest/);
  assert.match(intelligence, /action: "reopen_concern"/);
});

test("later recovery resolves the active recurrence", () => {
  assert.equal(deriveConcernChronology([occurred, recovered, recurred, recoveredAgain], [concern]).state, "recently_resolved");
  assert.match(migration, /status = 'resolved'/);
});

test("the original event and first recovery remain in chronology", () => {
  const events = [occurred, recovered, recurred, recoveredAgain];
  assert.equal(events[0].id, "occurred");
  assert.equal(events[1].id, "recovered");
  assert.doesNotMatch(migration, /delete from public\.pet_care_entries/);
});

test("second recurrence and recovery remain distinct", () => {
  assert.notEqual(recurred.id, recoveredAgain.id);
  assert.match(migration, /pet_care_entries_concern_episode_resolution_unique/);
});

test("safety follows urgent resolution recurrence resolution chronology", () => {
  assert.equal(deriveConcernChronology([occurred], [concern]).state, "urgent");
  assert.equal(deriveConcernChronology([occurred, recovered], [concern]).state, "recently_resolved");
  assert.equal(deriveConcernChronology([occurred, recovered, recurred], [concern]).state, "urgent");
  assert.equal(deriveConcernChronology([occurred, recovered, recurred, recoveredAgain], [concern]).state, "recently_resolved");
});

test("historical urgent events do not permanently force urgent state", () => {
  assert.equal(deriveConcernChronology([occurred, recoveredAgain], [concern]).state, "recently_resolved");
  assert.match(safety, /deriveConcernChronology/);
});

test("complete event chronology remains available to profile summaries", () => {
  assert.match(read("app/lib/intelligence/retrieve-context.ts"), /careEntries: longitudinalCareEntries/);
  assert.match(read("app/lib/intelligence/retrieve-context.ts"), /isLongitudinalCareHistoryEntry/);
  assert.match(read("app/lib/intelligence/build-context.ts"), /sort\(\(left, right\) => right\.score - left\.score \|\| eventTime\(right\.entry\) - eventTime\(left\.entry\)\)/);
});

test("History displays automatic recovery entries", () => {
  assert.match(supabase, /from\("pet_care_entries"\)[\s\S]*order\("occurred_at"/);
  assert.doesNotMatch(supabase, /intelligence_source_type.*neq/);
  assert.match(history, /data-care-state/);
});

test("History displays recurrence entries", () => {
  assert.match(history, /eventType === "recurrence"/);
  assert.equal(classifyCareEvent(recurred), "recurrence");
});

test("History presents recovery and recurrence proportionally", () => {
  assert.match(history, /pw-success-border/);
  assert.match(history, /pw-warning-border/);
});

test("automatic events enforce ownership and existing RLS", () => {
  assert.match(migration, /v_auth_user_id <> p_user_id/);
  assert.match(migration, /SOURCE_MESSAGE_NOT_OWNED/);
  assert.match(read("supabase/migrations/20260623000000_create_pet_care_entries.sql"), /Users can select their care entries/);
});

test("the same source message cannot create duplicate care events", () => {
  assert.match(migration, /on conflict \(user_id, intelligence_source_message_id\)/);
  assert.match(migration, /already_persisted/);
});

test("deterministic already-saved confirmation spends no AI credit", () => {
  const confirmation = askRoute.indexOf("confirmedExistingCarePersistence ?");
  const orchestrator = askRoute.indexOf("await orchestrateAskTurn", confirmation);
  assert.ok(confirmation > -1 && orchestrator > confirmation);
  assert.match(askRoute, /handledWithoutAi: true/);
});

test("resolved chronology permits unrelated grooming answers", () => {
  assert.equal(deriveConcernChronology([occurred, recoveredAgain], [concern]).state, "recently_resolved");
  assert.doesNotMatch(safety, /historical.*permanent/i);
});

test("compatibility repair trusts explicit user messages and structured urgency only", () => {
  assert.match(migration, /repair_furvise_recovery_events/);
  assert.match(migration, /user_message\.user_text ~\*/);
  assert.match(migration, /assistant_message\.response_data->>'urgency' = 'resolved'/);
  assert.doesNotMatch(migration, /assistant_message\.response_data->>'directAnswer'/);
});

test("carePersistence metadata is stored with conversation messages", () => {
  assert.match(migration, /add column if not exists care_persistence jsonb/);
  assert.match(askRoute, /care_persistence: carePersistence/);
});
