import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deduplicateLegacyRetriedMessages, getPersistenceNotices } from "../app/lib/ask-conversations.ts";
import { resolveRecoverySubject } from "../app/lib/intelligence/episodes/resolve-recovery-subject.ts";
import { classifyCareEvent } from "../app/lib/intelligence/concern-chronology.ts";
import { classifyActiveConcernMessage } from "../app/lib/ai/turn-classifier.ts";
import { reducePetState } from "../app/lib/intelligence/pet-state/reduce-events.ts";

const failed = { id: "failed", request_id: "request-a", role: "user", user_text: "Same update", created_at: "2026-07-28T00:00:00Z" };
const retried = { id: "canonical", request_id: "request-b", role: "user", user_text: "Same update", created_at: "2026-07-28T00:05:00Z" };
const answer = { id: "answer", request_id: "request-b", role: "furvise", user_text: null, created_at: "2026-07-28T00:05:02Z" };

test("legacy failed retry renders one canonical user message", () => {
  assert.deepEqual(deduplicateLegacyRetriedMessages([failed, retried, answer]).map((item) => item.id), ["canonical", "answer"]);
});

test("two intentional identical successful messages remain distinct", () => {
  const firstAnswer = { ...answer, id: "answer-a", request_id: "request-a" };
  assert.equal(deduplicateLegacyRetriedMessages([failed, firstAnswer, retried, answer]).filter((item) => item.role === "user").length, 2);
});

test("one care entry produces one persistence confirmation across legacy metadata", () => {
  const notices = getPersistenceNotices({
    automaticSaveConfirmation: "Added to care history",
    carePersistence: { status: "persisted", careEntryIds: ["entry-1"], concernIds: [], errorCode: null },
    suggestion: { id: "suggestion", type: "history", title: "Save", details: null, status: "saved", careEntryId: "entry-1", applyStatus: "applied" },
  });
  assert.deepEqual(notices.map((item) => item.label), ["Added to care history"]);
});

test("two distinct care entries produce one summarized notice", () => {
  assert.equal(getPersistenceNotices({ carePersistence: { status: "persisted", careEntryIds: ["a", "b", "a"], concernIds: [], errorCode: null } })[0].label, "Added 2 updates to care history");
});

const episode = (overrides = {}) => ({ id: "ear-episode", pet_profile_id: "pet", normalized_key: "symptom", episode_type: "symptom", title: "Ear scratching returned", status: "active", sequence_number: 2, recurrence_of: "ear-1", started_at: "2026-07-28", last_event_at: "2026-07-28", resolved_at: null, ...overrides });
const concern = (overrides = {}) => ({ id: "routine", user_id: "user", pet_profile_id: "pet", title: "Routine changed", normalized_key: "routine_changed", status: "active", severity: "routine", source_care_entry_id: null, opened_at: "2026-07-28", updated_at: "2026-07-28", resolved_at: null, resolution_note: null, ...overrides });

test("ear recovery matches the ear episode and not a routine concern", () => {
  const result = resolveRecoverySubject({ message: "Maple has stopped scratching and is resting normally now.", activeEpisodes: [episode(), episode({ id: "routine-episode", episode_type: "behavior_change", normalized_key: "routine_changed", title: "Routine changed" })], activeConcerns: [concern()] });
  assert.equal(result.episodeId, "ear-episode");
  assert.equal(result.concernId, null);
  assert.equal(result.title, "Ear scratching returned to normal");
});

test("breathing recovery retains deterministic title", () => {
  const result = resolveRecoverySubject({ message: "Her breathing is normal", activeEpisodes: [episode({ id: "breathing", normalized_key: "breathing", title: "Heavy breathing" })], activeConcerns: [concern({ id: "breathing-concern", normalized_key: "breathing", title: "Breathing difficulty" })] });
  assert.equal(result.title, "Breathing returned to normal");
  assert.equal(result.concernId, "breathing-concern");
});

test("unknown recovery uses a neutral title without resolving an unrelated episode", () => {
  const result = resolveRecoverySubject({ message: "Everything seems better now", activeEpisodes: [episode({ episode_type: "food_transition", title: "Started a new food" })], activeConcerns: [concern()] });
  assert.deepEqual({ concernId: result.concernId, episodeId: result.episodeId, title: result.title }, { concernId: null, episodeId: null, title: "Symptom improved" });
});

test("explicit no-recurrence recovery resolves the matching vomiting concern and no unrelated concern", () => {
  const vomitingEpisode = episode({ id: "vomiting-episode", normalized_key: "vomiting", title: "Vomiting" });
  const vomitingConcern = concern({ id: "vomiting-concern", normalized_key: "vomiting", title: "Vomiting" });
  const crateConcern = concern({ id: "crate-concern", normalized_key: "sleeping_arrangement", title: "Crate routine" });
  const message = "Milo hasn't vomited again and seems normal now.";
  assert.equal(classifyActiveConcernMessage(message, true), "resolved");
  const result = resolveRecoverySubject({
    message, activeEpisodes: [vomitingEpisode], activeConcerns: [vomitingConcern, crateConcern],
  });
  assert.equal(result.episodeId, vomitingEpisode.id);
  assert.equal(result.concernId, vomitingConcern.id);
  assert.notEqual(result.concernId, crateConcern.id);
});

test("terminal recovery classification is conservative for weak or recurring symptoms", () => {
  for (const message of ["He seems a little better.", "Maybe he's okay.", "He only vomited once more.", "He hasn't improved again."]) {
    assert.notEqual(classifyActiveConcernMessage(message, true), "resolved");
  }
  for (const message of ["He stopped vomiting and is acting normal.", "No more vomiting since this morning."]) {
    assert.equal(classifyActiveConcernMessage(message, true), "resolved");
  }
});

test("resolved care action takes precedence over a non-terminal semantic event during persistence", () => {
  const source = readFileSync(new URL("../app/lib/intelligence/persist-learnings.ts", import.meta.url), "utf8");
  const resolutionIndex = source.indexOf("const resolutionAction");
  const persistenceIndex = source.indexOf("const carePersistence", resolutionIndex);
  assert.ok(resolutionIndex >= 0 && persistenceIndex > resolutionIndex);
  assert.match(source.slice(persistenceIndex, source.indexOf("const persistenceRows", persistenceIndex)), /resolutionAction[\s\S]*persistCanonicalCareAction[\s\S]*semanticEvent/);
});

test("history classifies urgent, recovery, and recurrence proportionally", () => {
  const entry = (title, severity = null, state_action_type = null) => ({ title, note: title, severity, state_action_type, occurred_at: "2026-07-28", created_at: "2026-07-28" });
  assert.equal(classifyCareEvent(entry("Heavy breathing after exercise", "severe")), "urgent");
  assert.equal(classifyCareEvent(entry("Breathing returned to normal", null, "resolve_concern")), "recovery");
  assert.equal(classifyCareEvent(entry("Ear scratching returned")), "recurrence");
});

test("migration keeps positive observations and food transitions out of concern creation", () => {
  const prior = readFileSync(new URL("../supabase/migrations/20260728060000_idempotent_state_suggestions.sql", import.meta.url), "utf8");
  const repair = readFileSync(new URL("../supabase/migrations/20260728120000_fix_ask_retry_episode_consistency.sql", import.meta.url), "utf8");
  assert.match(prior, /new\.category = 'symptom' and new\.severity in \('moderate', 'severe'\)/);
  assert.doesNotMatch(prior, /new\.category in \('food', 'behavior'\)/);
  assert.match(repair, /source_entry\.category = 'food'/);
  assert.match(repair, /more playful\|playful today/);
});

test("an active food transition does not make wellbeing urgent", () => {
  const result = reducePetState([], [episode({ episode_type: "food_transition", normalized_key: "food", title: "Started food" })], { breathing: { status: "normal", confidence: 1, lastObservedAt: "2026-07-28", sourceEventId: "breathing" } });
  assert.equal(result.state.wellbeing?.overall, "monitoring");
  assert.equal(result.activeEpisodeIds.length, 1);
});

test("History applies distinct event-state surfaces", () => {
  const source = readFileSync(new URL("../app/components/care-timeline.tsx", import.meta.url), "utf8");
  assert.match(source, /pw-danger-surface/);
  assert.match(source, /pw-warning-surface/);
  assert.match(source, /surface-supportive/);
  assert.match(source, /data-care-state/);
});
