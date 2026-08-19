import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeSuggestedQuestion } from "../app/lib/ask.mjs";
import { classifyAiGuardOperationalEvent } from "../app/lib/ai/usage-guard/classification.ts";
import { MemoryAiGuardTestStore } from "../app/lib/ai/usage-guard/memory-test-store.ts";
import {
  buildExplicitCareHistoryAction,
  evaluateCareHistorySaveWorthiness,
  findEquivalentRecentCareEntry,
  isLongitudinalCareHistoryEntry,
  prepareGovernedCareHistoryAction,
  prepareGovernedCareHistoryEvent,
} from "../app/lib/intelligence/care-history-policy.ts";
import { resolveDeterministicTurnSubject } from "../app/lib/intelligence/entities/resolve-turn-subject.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/ask/route.ts");
const page = read("app/ask/page.tsx");

test("the production casual pronoun continuation resolves to Mani without the failing subject-frame call", () => {
  const pets = [{ id: "mani", name: "Mani", species: "cat", age_value: 3, age_unit: "years" }];
  const result = resolveDeterministicTurnSubject({
    message: "yeah she is dumb af",
    pets,
    recentConversation: [{ role: "user", text: "so my cat went outside and literally started chasing butterflies" }],
    selectedPetId: "mani",
  });
  assert.equal(result?.petId, "mani");
  assert.equal(result?.requiresClarification, false);
  assert.match(route, /const contextualSelectedPet = resolveDeterministicTurnSubject/);
  assert.match(route, /if \(!contextualSelectedPet\)[\s\S]*extractTurnSubjectFrame/);
});

test("mixed outside-cat and selected-pet pronouns still require full entity resolution", () => {
  const result = resolveDeterministicTurnSubject({
    message: "He finally left but she is still pacing.",
    pets: [{ id: "mani", name: "Mani", species: "cat", age_value: 3, age_unit: "years" }],
    recentConversation: [{ role: "user", text: "The male cat is outside and Mani is pacing." }],
    selectedPetId: "mani",
  });
  assert.equal(result, null);
});

test("subject-frame invalid output emits a sanitized validation reason instead of disappearing", () => {
  const extractor = read("app/lib/intelligence/semantic-frame/extract-turn-subject.ts");
  assert.match(extractor, /validateProposedSemanticFrame/);
  assert.match(extractor, /validationDetails: validationReason/);
  assert.match(extractor, /outcome: "failed"/);
  assert.match(extractor, /antecedentRefs may contain only mention local IDs that exist in this current frame/);
  assert.doesNotMatch(extractor.slice(extractor.indexOf("validationDetails")), /currentMessage|recentUserDiscourse/);
});

test("daily call and cost ceilings are independent and retain distinct operational codes", async () => {
  const base = { callId: "op:a", callLimit: 1, costLimitMicrodollars: 10_000, day: "2026-08-18", feature: "ask", maximumOperationCalls: 3, operationCallTtlSeconds: 3600, operationId: "op", reservedCostMicrodollars: 1_000, ttlSeconds: 3600 };
  const callStore = new MemoryAiGuardTestStore();
  assert.equal((await callStore.reserveCall(base)).allowed, true);
  const callDenied = await callStore.reserveCall({ ...base, callId: "other:a", operationId: "other" });
  assert.equal(callDenied.reason, "daily_call_limit");
  const costStore = new MemoryAiGuardTestStore();
  const costDenied = await costStore.reserveCall({ ...base, callLimit: 10, costLimitMicrodollars: 999 });
  assert.equal(costDenied.reason, "daily_cost_limit");
  assert.equal(classifyAiGuardOperationalEvent({ denialReason: callDenied.reason }), "ai_daily_cap_reached");
  assert.equal(classifyAiGuardOperationalEvent({ denialReason: costDenied.reason }), "ai_daily_cap_reached");
  assert.equal(classifyAiGuardOperationalEvent({ denialReason: "operation_failed", safeErrorClass: "AskPipelineError" }), null);
  assert.match(read("app/lib/ai/usage-guard/logging.ts"), /errorCode: input\.denialReason \|\| input\.safeErrorClass/);
  assert.match(read("app/lib/ai/usage-guard/admission.ts"), /denialReason: "daily_guard_store_unavailable"/);
});

test("global admission happens before user-credit reservation and cap rejection records no completed Ask", () => {
  const admission = route.indexOf("aiAdmission = await admitAiOperation");
  const reservation = route.indexOf("reserveAiCredit", admission);
  assert.ok(admission > -1 && reservation > admission);
  assert.match(route, /if \(error instanceof AiAdmissionError\)[\s\S]*askFailure\("AI_UNAVAILABLE"/);
  assert.doesNotMatch(route.slice(route.indexOf("if (error instanceof AiAdmissionError)"), route.indexOf("if (error instanceof AiCreditLimitError)")), /completeAiCredit/);
  assert.match(read("app/lib/ai/usage-guard/admission.ts"), /provider call denied[\s\S]*dailyCallCount[\s\S]*dailyCostMicrodollars[\s\S]*denialReason/);
});

test("Care History V2 rejects conversational noise and generic questions but keeps longitudinal change", () => {
  const cases = [
    ["so my cat went outside and literally started chasing butterflies", false],
    ["yeah she is dumb af", false],
    ["Can cats eat a tiny piece of plain cooked egg?", false],
    ["He finally left but she is still pacing.", true],
  ];
  for (const [sourceMessage, eligible] of cases) {
    assert.equal(evaluateCareHistorySaveWorthiness({ domain: "behavior", title: sourceMessage, details: sourceMessage, sourceMessage, transition: "observed" }).eligible, eligible, sourceMessage);
  }
  assert.equal(evaluateCareHistorySaveWorthiness({
    domain: "behavior",
    title: "Mani became more interested in going outside",
    details: "and seems more interested in getting outside",
    sourceMessage: "Mani is still pacing and seems more interested in getting outside.",
    transition: "observed",
  }).eligible, false);
});

test("owner uncertainty remains explicit and persisted entries are standalone", () => {
  const prepared = prepareGovernedCareHistoryEvent(governedEvent({
    domain: "nutrition",
    topic: "outdoor_water_exposure",
    eventTitle: "Mani drank outside water",
    sourceExcerpt: "I think she drank some water I left outside yesterday, but I’m not completely sure.",
  }));
  assert.match(prepared.event.eventTitle, /Possible outdoor water exposure for Mani/);
  assert.match(prepared.event.sourceExcerpt, /^Owner was uncertain whether Mani drank some water the owner had left outside yesterday\./);
  assert.doesNotMatch(prepared.event.sourceExcerpt, /^and\b/i);
  assert.notEqual(normalize(prepared.event.eventTitle), normalize(prepared.event.sourceExcerpt));
  assert.deepEqual(prepareGovernedCareHistoryEvent(prepared), prepared);
  const action = prepareGovernedCareHistoryAction({
    action: { action: "create_entry", category: "nutrition", title: "drank outside water", details: "and drank some water left outside", severity: "routine", confidence: 0.95, relatedRecordId: null },
    petName: "Mani",
    sourceMessage: "I think she drank some water I left outside, but I'm not completely sure.",
  });
  assert.equal(action.title, "Possible Mani drank outside water");
  assert.equal(action.details, "Owner was uncertain whether Mani drank some water left outside.");
  assert.doesNotMatch(action.details, /Owner was uncertain whether (?:and|but)\b/i);
});

test("recent equivalent events deduplicate unless state or severity meaningfully changes", () => {
  const entries = [careEntry("existing", "Mani continued pacing", "Owner reported that Mani was still pacing after the outside cat left.")];
  const duplicate = findEquivalentRecentCareEntry({ title: "Mani pacing continued", details: "Owner reported that Mani continued pacing after the outside cat left.", transition: "continued", entries, now: new Date("2026-08-18T12:00:00Z") });
  assert.equal(duplicate?.id, "existing");
  assert.equal(findEquivalentRecentCareEntry({ title: "Mani pacing worsened", details: "Pacing is more frequent.", transition: "worsened", entries, now: new Date("2026-08-18T12:00:00Z") }), null);
});

test("an explicit save command overrides the normal low-value threshold", () => {
  const action = buildExplicitCareHistoryAction({
    currentMessage: "add this to Mani's history",
    conversationTurns: [{ role: "user", text: "so my cat went outside and literally started chasing butterflies" }],
    pet: { name: "Mani" },
  });
  assert.equal(action?.action, "create_entry");
  assert.match(action?.details || "", /^Owner explicitly asked to save this note about Mani:/);
  assert.equal(evaluateCareHistorySaveWorthiness({ domain: "behavior", sourceMessage: "save this", title: "Butterflies", details: "chased butterflies" }).eligible, true);
});

test("Vet Brief and Ask context filters exclude known conversational history noise", () => {
  assert.equal(isLongitudinalCareHistoryEntry(careEntry("butterfly", "Mani chased butterflies outside", "went outside and literally started chasing butterflies")), false);
  assert.equal(isLongitudinalCareHistoryEntry(careEntry("pacing", "Mani continued pacing", "Owner reported that Mani was still pacing after the outside cat left.")), true);
  assert.match(read("app/lib/vet-brief/builder.ts"), /filter\(isLongitudinalCareHistoryEntry\)/);
  assert.match(read("app/lib/intelligence/retrieve-context.ts"), /longitudinalCareEntries/);
});

test("assistant-offer follow-ups normalize to draftable owner-perspective questions", () => {
  assert.equal(normalizeSuggestedQuestion("If you want, I can turn this into a simple vet-visit checklist for Mani."), "Can you turn this into a simple vet-visit checklist for Mani?");
  assert.equal(normalizeSuggestedQuestion("If there’s a specific symptom you’re worried about, I can tell you exactly what to note for it."), "Can you tell me exactly what to note for it?");
  assert.equal(normalizeSuggestedQuestion("I can also help you make a one-page timeline from the last few days."), "Can you help me make a one-page timeline from the last few days?");
  for (const value of ["If you want, I can...", "I can also...", "Would you like me to..."]) assert.doesNotMatch(normalizeSuggestedQuestion(value), /^(?:If you want|I can|Would you like me)/i);
});

test("empty Ask and mobile conversation presentation stay compact and clear of navigation", () => {
  assert.match(page, /What's up with \$\{petName\}\?/);
  assert.match(page, /Ask about \$\{petName\}'s care, behavior, food, routines, or what happened today/);
  assert.equal((read("app/ask/page.tsx").match(/^\s+".*",$/gm) || []).filter((line) => /changed recently|keep an eye|prepare for/.test(line)).length, 3);
  assert.doesNotMatch(page, /Ask about something funny|Nothing is sent until you press Ask/);
  assert.match(page, /data-mobile-conversation-clearance="nav-and-composer"/);
  assert.match(page, /sm:min-h-\[66vh\]/);
  assert.doesNotMatch(page, /(?<!sm:)min-h-\[66vh\]/);
  assert.match(read("app/globals.css"), /\.app-sticky-composer[\s\S]*--mobile-nav-expanded-height[\s\S]*--mobile-nav-safe-area/);
  assert.match(page, /max-w-full[^"]*sm:max-w-3xl/);
  assert.match(page, /\[overflow-wrap:anywhere\]/);
});

function governedEvent(overrides = {}) {
  return {
    destination: "care_event",
    destinations: ["care_event"],
    event: {
      subject: { type: "pet", name: "Mani", id: "mani" },
      domain: "behavior",
      topic: "pacing",
      normalizedTopic: "pacing",
      eventTitle: "Mani continued pacing",
      transition: "observed",
      state: "monitoring",
      temporal: { occurredAt: null, explicitTime: "yesterday" },
      importance: "important",
      confidence: 0.9,
      sourceExcerpt: "She is still pacing.",
      references: { priorEventIds: [], episodeId: null, concernId: null },
      ...overrides,
    },
  };
}

function careEntry(id, title, note) {
  return { id, user_id: "user", pet_profile_id: "mani", category: "behavior", title, note, severity: "mild", occurred_at: "2026-08-18T08:00:00Z", created_at: "2026-08-18T08:00:00Z", updated_at: "2026-08-18T08:00:00Z" };
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
