import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPersistenceNotices } from "../app/lib/ask-conversations.ts";
import { routePersistenceDestinations } from "../app/lib/intelligence/persistence-destination.ts";
import { reducePetState } from "../app/lib/intelligence/pet-state/reduce-events.ts";
import { resolveProductSafety } from "../app/lib/intelligence/product-safety.ts";

const petId = "75db72b1-64fe-476d-a62a-70f4f6aee7cd";
const proposedCare = { action: "create_entry", category: "general", title: "Update", details: "Owner update", severity: "routine", confidence: 0.99, relatedRecordId: null };

test("pet preference routes to pet memory only", () => {
  const result = routePersistenceDestinations({ message: "Maple refuses hard dental chews, but she likes softer ones.", petId, learnings: [], careActions: [proposedCare] });
  assert.equal(result.decisions[0].destination, "pet_memory");
  assert.equal(result.learnings[0].subjectType, "pet");
  assert.equal(result.learnings[0].subjectId, petId);
  assert.equal(result.careActions.length, 0);
});

test("multi-pet preference routing never synthesizes a selected-pet combined memory", () => {
  const miloId = "951316a7-545d-4cf7-ac2e-82196d4d3ac6";
  const maniId = "b9ab9905-2788-485c-b908-0ac0c5582792";
  const learnings = [
    { subjectType: "pet", subjectId: miloId, category: "preference", factKey: "food_preference_salmon", factValue: "salmon", confidence: 0.98, importance: "medium", durability: "ongoing", action: "create", sourceExcerpt: "Milo likes salmon" },
    { subjectType: "pet", subjectId: maniId, category: "preference", factKey: "food_preference_chicken", factValue: "chicken", confidence: 0.98, importance: "medium", durability: "ongoing", action: "create", sourceExcerpt: "Mani likes chicken" },
  ];
  const result = routePersistenceDestinations({
    message: "Milo likes salmon and Mani likes chicken.", petId,
    authorizedPetIds: [miloId, maniId], learnings, careActions: [proposedCare],
  });
  assert.deepEqual(result.learnings.map((learning) => learning.subjectId), [miloId, maniId]);
  assert.equal(result.learnings.some((learning) => learning.subjectId === petId), false);
  assert.deepEqual(result.careActions, []);
});

test("owner retailer and budget preferences route to owner memory only", () => {
  for (const message of ["I usually shop at Costco because it is close to me.", "I prefer products under $30 unless there is a much better option."]) {
    const result = routePersistenceDestinations({ message, petId, learnings: [], careActions: [proposedCare] });
    assert.equal(result.decisions[0].destination, "owner_memory");
    assert.equal(result.learnings[0].subjectType, "owner");
    assert.equal(result.learnings[0].subjectId, null);
    assert.equal(result.careActions.length, 0);
  }
});

test("unnamed medication creates no durable action or invented medication", () => {
  const result = routePersistenceDestinations({ message: "Maple took one tablet of a medication today.", petId, learnings: [], careActions: [{ ...proposedCare, category: "medication", title: "Took medication" }] });
  assert.equal(result.decisions[0].destination, "none");
  assert.equal(result.decisions[0].requiresConfirmation, true);
  assert.deepEqual(result.careActions, []);
  assert.deepEqual(result.learnings, []);
});

test("named medication start and completion create one medication episode lifecycle", () => {
  const start = routePersistenceDestinations({ message: "Maple started Apoquel today. It was prescribed by her veterinarian.", petId, learnings: [], careActions: [] });
  const finish = routePersistenceDestinations({ message: "Maple finished Apoquel today.", petId, learnings: [], careActions: [] });
  assert.deepEqual([start.careActions[0].episodeOperation, finish.careActions[0].episodeOperation], ["start", "complete"]);
  assert.equal(start.careActions[0].normalizedEpisodeKey, finish.careActions[0].normalizedEpisodeKey);
  assert.equal(start.careActions[0].title, "Started Apoquel");
  assert.equal(finish.careActions[0].title, "Stopped Apoquel");
  const event = (id, title, date, stateAction = "create_entry") => ({ id, title, note: title, category: "medication", occurred_at: date, created_at: date, state_action_type: stateAction, severity: null, intelligence_confidence: 0.99 });
  const afterStart = reducePetState([event("start", "Started Apoquel", "2026-07-28T01:00:00Z")], [], {}).state;
  assert.equal(afterStart.currentMedications?.[0].name, "Apoquel");
  const afterFinish = reducePetState([event("start", "Started Apoquel", "2026-07-28T01:00:00Z"), event("finish", "Finished Apoquel", "2026-07-28T02:00:00Z", "resolve_concern")], [], {}).state;
  assert.deepEqual(afterFinish.currentMedications, []);
});

test("unnamed medication lifecycle stays generic instead of inventing an administration verb", () => {
  const start = routePersistenceDestinations({ message: "I started giving Luna her medication today", petId, learnings: [], careActions: [] });
  const stop = routePersistenceDestinations({ message: "I stopped giving Luna her medication today", petId, learnings: [], careActions: [] });
  assert.deepEqual(start.careActions[0], {
    action: "create_entry", category: "medication", title: "Started medication", details: "I started giving Luna her medication today",
    severity: "routine", confidence: 0.99, relatedRecordId: null, episodeOperation: "start", normalizedEpisodeKey: "medication_unspecified",
  });
  assert.equal(stop.careActions[0].title, "Stopped medication");
  assert.equal(stop.careActions[0].episodeOperation, "complete");
  assert.equal(stop.careActions[0].normalizedEpisodeKey, "medication_unspecified");
  assert.doesNotMatch(JSON.stringify([start, stop]), /medication_giving|Started giving|Stopped giving/);
});

test("persistence notices require confirmed canonical IDs", () => {
  assert.deepEqual(getPersistenceNotices({ automaticSaveConfirmation: "Added to care history" }), []);
  assert.deepEqual(getPersistenceNotices({ carePersistence: { status: "skipped", careEntryIds: [], concernIds: [], errorCode: null, memoryIds: ["memory"] } }).map((item) => item.label), ["Remembered for future questions"]);
  assert.deepEqual(getPersistenceNotices({ carePersistence: { status: "persisted", careEntryIds: ["care"], concernIds: [], errorCode: null } }).map((item) => item.label), ["Added to care history"]);
  assert.deepEqual(getPersistenceNotices({ carePersistence: { status: "persisted", careEntryIds: ["care"], concernIds: [], errorCode: null, memoryIds: ["memory"], profileUpdated: true } }).map((item) => item.label), ["Added to care history", "Remembered for future questions", "Updated pet profile"]);
});

function context({ level = "monitoring", breathing = "normal", episodes = [], concerns = [], message = "Dental care" } = {}) {
  return {
    currentMessage: message, careEntries: [], selectedCareEntries: [], activeEpisodes: episodes, monitoringEpisodes: [],
    activeConcerns: concerns, recentlyResolvedConcerns: [],
    currentState: { state_version: 19, state: { breathing: { status: breathing, confidence: 1, lastObservedAt: "2026-07-28", sourceEventId: "event" }, wellbeing: { overall: level } }, source_event_ids: [] },
  };
}

test("Product shopping suppresses only urgent and emergency canonical safety", () => {
  assert.equal(resolveProductSafety(context({ message: "Maple cannot breathe" })).shoppingSuppressed, true);
  assert.equal(resolveProductSafety(context({ breathing: "abnormal" })).shoppingSuppressed, true);
  assert.equal(resolveProductSafety(context()).shoppingSuppressed, false);
  assert.equal(resolveProductSafety(context({ level: "normal" })).shoppingSuppressed, false);
});

test("food transition and historical urgent history do not suppress current shopping", () => {
  const food = { id: "food", episode_type: "food_transition", severity: "routine", status: "active" };
  const live = context({ episodes: [food] });
  live.careEntries = [{ id: "old", title: "Heavy breathing", note: "Heavy breathing", category: "symptom", severity: "severe", occurred_at: "2026-07-01", created_at: "2026-07-01", state_action_type: "create_entry" }, { id: "new", title: "Breathing returned to normal", note: "Breathing normal", category: "symptom", severity: null, occurred_at: "2026-07-02", created_at: "2026-07-02", state_action_type: "resolve_concern" }];
  const safety = resolveProductSafety(live);
  assert.equal(safety.shoppingSuppressed, false);
  assert.equal(safety.stateVersion, 19);
});

test("Products no longer consumes historical client safety and checks live safety before cache", () => {
  const page = readFileSync(new URL("../app/shop/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/shop/interpret-query/route.ts", import.meta.url), "utf8");
  const safety = readFileSync(new URL("../app/lib/intelligence/product-safety.ts", import.meta.url), "utf8");
  assert.doesNotMatch(page, /shouldHideShopProductsForUrgentCare/);
  assert.match(page, /cache: "no-store"/);
  assert.ok(route.indexOf("productSafety.shoppingSuppressed") < route.indexOf("cached?.source === \"ai\""));
  assert.match(safety, /stateVersion/);
});

test("repair is service-only, scoped, and preserves Apoquel chronology", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260728123000_fix_persistence_destinations_and_medication_state.sql", import.meta.url), "utf8");
  assert.match(sql, /p_dry_run boolean default true/);
  assert.match(sql, /SERVICE_ROLE_REQUIRED/);
  assert.match(sql, /retainedApoquelCareEntryIds/);
  assert.match(sql, /75db72b1-64fe-476d-a62a-70f4f6aee7cd/);
});
