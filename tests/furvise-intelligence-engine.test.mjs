import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { selectRelevantCareEntries } from "../app/lib/intelligence/build-context.ts";
import { evaluateCareActionPolicy, evaluateLearningPolicy } from "../app/lib/intelligence/memory-policy.ts";
import { allowsAcceptedRecoverySafetyReconciliation, allowsProposedRecoveryPresentation, resolveSafetyState } from "../app/lib/intelligence/safety-state.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/ask/route.ts");
const retrieval = read("app/lib/intelligence/retrieve-context.ts");
const runner = read("app/lib/intelligence/run-intelligence.ts");
const migration = read("supabase/migrations/20260728040000_add_furvise_intelligence_memory.sql");
const usageNotice = read("app/components/ask-usage-notice.tsx");

function profile() {
  return { id: "pet-1", user_id: "user-1", name: "Mani", species: "cat" };
}

function concern(overrides = {}) {
  return {
    id: "concern-1", user_id: "user-1", pet_profile_id: "pet-1", title: "Breathing difficulty",
    normalized_key: "breathing", status: "active", severity: "urgent", source_care_entry_id: "care-1",
    opened_at: "2026-07-27T10:00:00Z", resolved_at: null, resolution_note: null,
    created_at: "2026-07-27T10:00:00Z", updated_at: "2026-07-27T10:00:00Z", ...overrides,
  };
}

function context(message, overrides = {}) {
  return {
    feature: "ask", locale: "en-CA", currentMessage: message, currentTimestamp: "2026-07-28T12:00:00Z",
    conversationId: "conversation-1", pet: profile(), owner: { userId: "user-1", profile: null },
    careEntries: [], selectedCareEntries: [], activeConcerns: [], recentlyResolvedConcerns: [],
    legacyPetMemories: [], memories: [], productFeedback: [], conversationTurns: [], ...overrides,
  };
}

function understanding(overrides = {}) {
  return {
    primaryIntent: "update", secondaryIntents: [], userIsAskingQuestion: false,
    userIsProvidingUpdate: true, userIsCorrectingPriorInformation: false,
    userIsResolvingConcern: false, userIsProvidingPreference: false,
    userIsMakingSmallTalk: false, recoveryStatus: "none", recoveryConfidence: 1,
    recoveryEvidence: { outcome: "none", surfaceText: null, targetConcept: null, confidence: 1 }, requestedTopic: "care", referencedPet: "Mani",
    safetyRelevance: "none", needsClarification: false, canAnswerDirectly: true, ...overrides,
  };
}

test("public Ask binds server-owned context and rejects another pet's source before answer generation",async()=>{
 assert.match(route,/loadReadOnlyContext\(\s*supabase\s*,\s*userId\s*,\s*petId/);
 assert.match(route,/runReadOnlyAsk\(\{\s*ownerId:\s*userId,\s*selectedPetId:\s*petId,\s*question[,}]/);
 const data=read("app/lib/ask-read-only/data.ts");
 assert.match(data,/\.eq\("user_id",ownerId\)\.eq\("id",request\.pet\.id\)/);
 assert.match(data,/\.eq\("user_id",ownerId\)\.eq\("pet_profile_id",request\.pet\.id\)/);
 // Retained shared retrieval remains owner and pet scoped too.
 assert.match(retrieval,/from\("dog_profiles"\)[\s\S]*eq\("id", petId\)\.eq\("user_id", userId\)/);
 assert.match(retrieval,/from\("pet_care_entries"\)[\s\S]*eq\("pet_profile_id", petId\)\.eq\("user_id", userId\)/);
 assert.doesNotMatch(route,/body\?\.(?:profile|careEntries|memories)/);
 const {readOnlyFailureRouteFixture,note,selection,id}=await import("./helpers/ask-read-only-failure-route.mjs");
 const f=readOnlyFailureRouteFixture(async()=>selection,[{...note,petId:id(99)}]);
 const response=await f.send();assert.equal(response.status,503);
 assert.equal(f.state.calls,1);assert.equal(f.state.reads,1);assert.equal(f.state.credit.status,"released");
 assert.ok(f.state.errors.some(e=>String(e.error).includes("NOT_AUTHORIZED")));
});

test("live retrieval is bounded and includes profile, care, concern, memory, and conversation sources", () => {
  for (const source of ["dog_profiles", "pet_care_entries", "dog_memories", "furvise_memories", "ask_conversation_messages"]) {
    assert.match(retrieval + readFileSync(new URL("../app/lib/intelligence/memory-sources.ts", import.meta.url), "utf8"), new RegExp(`from\\(\"${source}\"\\)`));
  }
  assert.match(retrieval, /loadActiveConcerns/);
  assert.match(retrieval, /loadRecentlyResolvedConcerns/);
  assert.match(retrieval, /limit\(mode\.contextPolicy\.conversationLimit\)/);
  assert.match(retrieval, /limit\(mode\.contextPolicy\.careEntryLimit\)/);
});

test("relevance selection favors current safety evidence and topic matches", () => {
  const base = { user_id: "user-1", pet_profile_id: "pet-1", created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z" };
  const entries = [
    { ...base, id: "routine", category: "grooming", title: "Nail trim", note: "Trimmed nails", severity: null, occurred_at: "2026-07-28T10:00:00Z" },
    { ...base, id: "urgent", category: "symptom", title: "Breathing", note: "Trouble breathing", severity: "severe", occurred_at: "2026-07-20T10:00:00Z" },
    { ...base, id: "food", category: "food", title: "Food change", note: "Started salmon food", severity: null, occurred_at: "2026-07-27T10:00:00Z" },
  ];
  const ranked = selectRelevantCareEntries(entries, "Should I change Mani's salmon food?");
  assert.equal(ranked[0].id, "urgent");
  assert.ok(ranked.findIndex((entry) => entry.id === "food") < ranked.findIndex((entry) => entry.id === "routine"));
});

test("clear owner-reported improvement becomes recently resolved while vague improvement does not", () => {
  assert.equal(resolveSafetyState(context("Her breathing is back to normal after resting.", { activeConcerns: [concern()] })).level, "recently_resolved");
  assert.equal(resolveSafetyState(context("Maybe a little better.", { activeConcerns: [concern()] })).level, "urgent");
});

test("deterministic recovery safety is grounded to one authoritative concern topic", () => {
  const vomiting = concern({ id: "vomiting-1", title: "Vomiting", normalized_key: "vomiting", severity: "important" });
  const hiding = concern({ id: "hiding-1", title: "Hiding", normalized_key: "hiding", severity: "important" });
  const unrelated = resolveSafetyState(context("She stopped hiding yesterday.", { activeConcerns: [vomiting] }));
  assert.notEqual(unrelated.level, "recently_resolved");
  assert.equal(unrelated.concernMessageState, "unrelated");

  const matching = resolveSafetyState(context("He stopped vomiting after breakfast.", { activeConcerns: [vomiting] }));
  assert.equal(matching.level, "recently_resolved");

  const ambiguous = resolveSafetyState(context("She is doing well now.", { activeConcerns: [vomiting, hiding] }));
  assert.notEqual(ambiguous.level, "recently_resolved");
  assert.equal(ambiguous.concernMessageState, "unrelated");

  const mixedTopics = resolveSafetyState(context("Vomiting started again, but she stopped hiding.", { activeConcerns: [vomiting, hiding] }));
  assert.equal(mixedTopics.concernMessageState, "recurrence");
  assert.equal(mixedTopics.level, "urgent");
});

test("legacy suggestion prose cannot read or mutate an active concern before canonical authority",async()=>{
 const {assertLegacyProseRejected}=await import('./helpers/legacy-prose-boundary.mjs');
 await assertLegacyProseRejected({type:'concern_resolution',concernId:'foreign',payload:{resolution:'resolved'}});
 const continuation=read('app/lib/intelligence/canonical-suggestion-continuation.ts');
 assert.match(continuation,/suggestionMatchesCapability/);assert.match(continuation,/rebindCanonicalCapabilityAction/);
 assert.ok(continuation.indexOf('rebindCanonicalCapabilityAction(c.action_payload')<continuation.indexOf('return executeActionCapability'));
});

test("accepted recovery may reconcile stale prior urgency but never current-turn danger evidence", () => {
  const stalePriorUrgency = resolveSafetyState(context("Mani seems normal now", { activeConcerns: [concern()] }));
  const currentEmergency = resolveSafetyState(context("Mani seems normal now but cannot breathe", { activeConcerns: [concern()] }));
  assert.equal(stalePriorUrgency.level, "urgent");
  assert.equal(allowsAcceptedRecoverySafetyReconciliation(stalePriorUrgency), true);
  assert.equal(allowsAcceptedRecoverySafetyReconciliation(currentEmergency), false);
});

test("a high-confidence owned-concern recovery proposal affects presentation only when current danger is absent", () => {
  const stalePriorUrgency = resolveSafetyState(context("Mani seems normal now", { activeConcerns: [concern()] }));
  const currentEmergency = resolveSafetyState(context("Mani seems normal now but cannot breathe", { activeConcerns: [concern()] }));
  const proposal = {
    activeConcernIds: stalePriorUrgency.activeConcernIds,
    confidence: "high",
    resolvesConcernId: "concern-1",
    shouldOffer: true,
    userIsResolvingConcern: true,
  };
  assert.equal(allowsProposedRecoveryPresentation({ ...proposal, safety: stalePriorUrgency }), true);
  assert.equal(allowsProposedRecoveryPresentation({ ...proposal, safety: currentEmergency }), false);
  assert.equal(allowsProposedRecoveryPresentation({ ...proposal, resolvesConcernId: "other-concern", safety: stalePriorUrgency }), false);
  assert.equal(allowsProposedRecoveryPresentation({ ...proposal, confidence: "medium", safety: stalePriorUrgency }), false);
});

test("resolved concern history does not dominate an unrelated future question", () => {
  const state = resolveSafetyState(context("What food portions should I use?", {
    recentlyResolvedConcerns: [concern({ status: "resolved", resolved_at: "2026-07-28T08:00:00Z" })],
  }));
  assert.equal(state.level, "routine");
  assert.equal(state.shoppingSuppressed, false);
});

test("active semantic urgency is current state, while a resolved episode does not hijack later questions", () => {
  const active = { id: "missing", pet_profile_id: "pet-1", normalized_key: "safety_pet_missing", episode_type: "care_tracking", status: "active", severity: "urgent", sequence_number: 1, recurrence_of: null, started_at: "2026-07-28T08:00:00Z", last_event_at: "2026-07-28T08:00:00Z", resolved_at: null };
  assert.equal(resolveSafetyState(context("What should I do next?", { activeEpisodes: [active], monitoringEpisodes: [] })).level, "urgent");
  assert.equal(resolveSafetyState(context("What food portions should I use?", { activeEpisodes: [], monitoringEpisodes: [], recentlyResolvedEpisodes: [{ ...active, status: "resolved", resolved_at: "2026-07-28T09:00:00Z" }] })).level, "routine");
});

test("pet preferences remain diagnostic; owner singleton prose and filler are rejected", () => {
  const petPreference = { subjectType: "pet", subjectId: "pet-1", category: "food_preference", factKey: "preferred_flavor", factValue: "salmon", confidence: 0.96, importance: "medium", durability: "durable", action: "create", sourceExcerpt: "Mani prefers salmon" };
  const ownerPreference = { subjectType: "owner", subjectId: null, category: "retailer_preference", factKey: "preferred_retailer", factValue: "Costco", confidence: 0.93, importance: "medium", durability: "durable", action: "create", sourceExcerpt: "I usually shop at Costco" };
  const filler = { ...ownerPreference, factKey: "reply", factValue: "thanks", sourceExcerpt: "Thanks" };
  assert.equal(evaluateLearningPolicy([petPreference], "Mani prefers salmon", "pet-1").accepted.length, 1);
  assert.equal(evaluateLearningPolicy([ownerPreference], "I usually shop at Costco", "pet-1").accepted.length, 0);
  assert.equal(evaluateLearningPolicy([filler], "Thanks", "pet-1").accepted.length, 0);
});

test("automatic care events require explicit high-confidence user evidence", () => {
  const action = { action: "create_entry", category: "food", title: "Food changed", details: "Started salmon food today", severity: "routine", confidence: 0.95, relatedRecordId: null };
  assert.equal(evaluateCareActionPolicy({ actions: [action], currentMessage: "I started salmon food today", understanding: understanding(), safetyLevel: "routine", activeConcernIds: [] }).accepted.length, 1);
  assert.equal(evaluateCareActionPolicy({ actions: [{ ...action, confidence: 0.7 }], currentMessage: "I started salmon food today", understanding: understanding(), safetyLevel: "routine", activeConcernIds: [] }).accepted.length, 0);
});

test("concern resolution is accepted only for a current owned active concern", () => {
  const action = { action: "resolve_concern", category: "symptom", title: "Breathing normal", details: "Breathing is normal now", severity: "routine", confidence: 0.99, relatedRecordId: "concern-1" };
  const activeConcern = { id: "concern-1", user_id: "owner-1", pet_profile_id: "pet-1", title: "Breathing", normalized_key: "breathing", status: "active", severity: "important", source_care_entry_id: null, opened_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", resolved_at: null, resolution_note: null };
  const accepted = evaluateCareActionPolicy({ actions: [action], currentMessage: "Breathing is normal now", understanding: understanding({ userIsResolvingConcern: true }), safetyLevel: "recently_resolved", activeConcernIds: ["concern-1"], activeConcerns: [activeConcern], petId: "pet-1", petName: "Mani" });
  const rejected = evaluateCareActionPolicy({ actions: [action], currentMessage: "Breathing is normal now", understanding: understanding({ userIsResolvingConcern: true }), safetyLevel: "routine", activeConcernIds: [] });
  assert.equal(accepted.accepted.length, 1);
  assert.equal(rejected.accepted.length, 0);
});

test("one validated external model call supplies response, safety, learnings, and care actions", () => {
  assert.match(runner, /generateContextAwareAskResponse\(\{/);
  assert.doesNotMatch(runner, /planner/i);
  assert.match(runner, /reasoning\.learnings/);
  assert.match(runner, /reasoning\.careActions/);
});

test("memory conflicts supersede rather than delete and retries are deduplicated", () => {
  assert.match(migration, /set status = 'superseded', superseded_by = v_memory_id/);
  assert.doesNotMatch(migration, /delete from public\.furvise_memories/);
  assert.match(migration, /on conflict \(dedupe_key\) do nothing/);
  assert.match(migration, /pet_care_entries_intelligence_source_unique/);
});

test("the persistence RPC is transactional, ownership-scoped, and preserves the original concern entry", () => {
  assert.match(migration, /security definer[\s\S]*PET_NOT_OWNED[\s\S]*SOURCE_MESSAGE_NOT_OWNED/);
  assert.match(migration, /insert into public\.pet_care_entries[\s\S]*update public\.pet_concerns/);
  assert.doesNotMatch(migration, /delete from public\.pet_care_entries/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
});

test("public read-only answers use durable publication and keep normal credit counters hidden", () => {
  assert.doesNotMatch(route, /learning_persistence_failed|persistFurviseIntelligence/);
  assert.match(route,/buildReadOnlyPublication/);
  assert.match(route,/persistReadOnlyAnswer/);
  assert.doesNotMatch(route,/prepareAppendTurn|executeActionCapability/);
  assert.match(route, /completeAiCredit/);
  assert.match(usageNotice, /if \(usage\.remaining === 0\)/);
  assert.doesNotMatch(usageNotice, /credits? left this month/i);
});
