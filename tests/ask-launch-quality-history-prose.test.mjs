import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  countAskVisibleProseSanityDefects,
  normalizeAskVisibleProseSanity,
} from "../app/lib/ai/ask-answer-economy.ts";
import { orchestrateAskTurn } from "../app/lib/ai/ask-orchestrator.ts";
import {
  buildBehavioralHistoryReviewSet,
  measureBehavioralHistoryReview,
} from "../app/lib/ai/ask-answer-economy-benchmark.ts";
import {
  evaluateCareHistorySaveWorthiness,
  resolveAutomaticCareHistoryPresentation,
} from "../app/lib/intelligence/care-history-policy.ts";
import { validateGeneratedAnswer } from "../app/lib/intelligence/validation/validate-answer.ts";

const routineBiting = "She keeps biting me when I pet her for more than a minute. What should I do?";
const emotionalBiting = "I love her but lately she keeps following me around and then biting when I pet her. I'm getting frustrated and feel guilty about being annoyed. How should I handle it?";
const complexCare = "Over the last week she's been eating less, drinking more, hiding more, and has vomited twice. We also switched her food and changed her feeding schedule. What should I track, what can I do now, and when should I call the vet?";
const malformedComplexOpening = "Over the last week, she's eating less, drinking more, hiding more, and vomiting twice are worth a vet call soon, especially because we changed her food and feeding schedule.";

test("routine petting tolerance is not elevated by model history interest or transition metadata", () => {
  const decision = evaluateCareHistorySaveWorthiness({
    domain: "behavior",
    title: "Petting intolerance",
    details: "The model recommends tracking petting tolerance.",
    sourceMessage: routineBiting,
    transition: "started",
  });
  assert.deepEqual(decision, { eligible: false, reason: "insufficient_longitudinal_value", explicitOverride: false });
});

test("behavioral history requires owner-reported longitudinal, pain, clinical, or tracking value", () => {
  const cases = [
    ["This started three days ago and she suddenly seems painful when I touch her back.", {}, true],
    ["She's always done this.", {}, false],
    ["It's getting worse every week.", { hasTrackedEpisode: true, transition: "worsened" }, true],
    ["She has been hiding for the past few days.", {}, true],
    ["He left, but she is still pacing.", {}, true],
    [complexCare, {}, true],
  ];
  for (const [sourceMessage, overrides, eligible] of cases) {
    assert.equal(evaluateCareHistorySaveWorthiness({
      domain: "behavior",
      title: "Provider proposal",
      details: "Provider-authored explanation",
      sourceMessage,
      transition: "changed",
      ...overrides,
    }).eligible, eligible, sourceMessage);
  }
});

test("B, C, D, and follow-up history decisions match the production-shape contract", () => {
  const cases = [
    ["B", routineBiting, false],
    ["C", emotionalBiting, false],
    ["D", complexCare, true],
    ["follow-up", "She mostly does it while I'm working at my desk.", false],
  ];
  for (const [label, sourceMessage, eligible] of cases) {
    assert.equal(evaluateCareHistorySaveWorthiness({
      domain: label === "D" ? "health" : "behavior",
      title: "Model suggestion",
      details: "A detailed provider answer should not decide history value.",
      sourceMessage,
      transition: "started",
    }).eligible, eligible, label);
  }
});

test("the production orchestrator suppresses a model-proposed B card and retains meaningful D history", async () => {
  const b = await orchestrateAskTurn({
    concerns: [],
    generate: async () => reasoning({ title: "Petting tolerance", summary: "Keep petting brief and stop at her early signals.", sections: [], safetyNote: null }),
    generationInput: {},
    message: routineBiting,
    petName: "Mani",
  });
  assert.equal(b.suggestion, null);

  const d = await orchestrateAskTurn({
    concerns: [],
    generate: async () => reasoning({ title: "Several changes need attention", summary: "Call the vet and track these changes.", sections: [], safetyNote: null }),
    generationInput: {},
    message: complexCare,
    petName: "Mani",
  });
  assert.equal(d.suggestion?.type, "history");
});

test("optional automatic or suggestion persistence failure does not surface a broken history state", () => {
  const failedAutomatic = { status: "failed", careEntryIds: [], concernIds: [], errorCode: "SEMANTIC_EVENT_INVALID", currentSafetyState: null, alreadyPersisted: false };
  const hidden = resolveAutomaticCareHistoryPresentation({ confirmedPersistence: failedAutomatic, hasSavedSuggestion: false });
  assert.deepEqual(hidden, { status: "skipped", careEntryIds: [], concernIds: [], errorCode: null, currentSafetyState: null, alreadyPersisted: false, memoryIds: [] });

  const reviewAvailable = resolveAutomaticCareHistoryPresentation({ confirmedPersistence: failedAutomatic, hasSavedSuggestion: true });
  assert.equal(reviewAvailable.status, "suggested");
  assert.equal(reviewAvailable.errorCode, null);

  const persisted = { status: "persisted", careEntryIds: ["care-entry"], concernIds: [], errorCode: null, currentSafetyState: "routine", alreadyPersisted: false };
  assert.equal(resolveAutomaticCareHistoryPresentation({ confirmedPersistence: persisted, hasSavedSuggestion: false }), persisted);
});

test("exact Test D opening receives a narrow deterministic grammar repair", () => {
  const answer = { summary: malformedComplexOpening, sections: [], safetyNote: null };
  assert.equal(countAskVisibleProseSanityDefects(answer), 1);
  const normalized = normalizeAskVisibleProseSanity(answer);
  assert.equal(countAskVisibleProseSanityDefects(normalized), 0);
  assert.equal(normalized.summary, "The combination of eating less, drinking more, hiding more, and vomiting twice over the last week is worth a vet call soon, especially because we changed her food and feeding schedule.");
});

test("final validator repairs visible grammar without touching clinical meaning or machine data", () => {
  const result = validateGeneratedAnswer(reasoning({
    title: "Several changes need attention",
    summary: malformedComplexOpening,
    sections: [
      { heading: "Track", items: ["Record appetite, water intake, vomiting, litter use, and energy."] },
      { heading: "Call sooner", items: ["Call urgently if she cannot keep water down or becomes weak."] },
    ],
    safetyNote: null,
  }), context(complexCare), "caution", ["pet"]);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.ok(result.repairs.includes("repaired_visible_prose_syntax"));
  assert.match(result.response.answer.summary, /^The combination of eating less/);
  assert.match(result.response.answer.summary, /vet call soon/);
  assert.match(JSON.stringify(result.response.answer), /cannot keep water down/);
  assert.deepEqual(result.response.applicationActions, [{ id: "action:pet-update-profile:opaque", kind: "pet.update_profile" }]);
});

test("visible prose sanity remains quality-degradable and never requests provider repair", () => {
  const result = validateGeneratedAnswer(reasoning({
    title: "Answer",
    summary: "Keep her comfortable and and call the vet if she becomes weak.",
    sections: [],
    safetyNote: null,
  }), context("She seems unwell."), "caution", ["pet"]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.response.answer.summary, "Keep her comfortable and call the vet if she becomes weak.");

  const validator = readFileSync(new URL("../app/lib/intelligence/validation/validate-answer.ts", import.meta.url), "utf8");
  const reasoningSource = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
  assert.match(validator, /qualityWarnings\.push\("visible_prose_sanity_remaining"\)/);
  assert.doesNotMatch(validator, /errors\.push\("visible_prose/);
  assert.doesNotMatch(reasoningSource, /visible_prose_sanity|repaired_visible_prose_syntax/);
});

test("targeted behavioral-history review has no routine false positives", () => {
  const cases = buildBehavioralHistoryReviewSet();
  const result = measureBehavioralHistoryReview(cases);
  assert.ok(cases.length >= 20);
  assert.equal(result.passed, result.cases);
  assert.equal(result.routineBehaviorFalsePositiveRate, 0);
  assert.equal(result.lowValueSuggestionRate, 0);
  assert.equal(result.trueMeaningfulSuggestionRate, 1);
  assert.ok(result.beforeRoutineBehaviorFalsePositiveRate > result.routineBehaviorFalsePositiveRate);
  assert.ok(result.afterSuggestionRate < result.beforeSuggestionRate);
});

test("route keeps optional care failures out of the public failed-card state", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  assert.match(route, /resolveAutomaticCareHistoryPresentation/);
  assert.doesNotMatch(route, /suggestionFailure\s*\?/);
  assert.match(route, /intelligencePersistence\?\.carePersistence\.status !== "failed"/);
});

function reasoning(answer) {
  return {
    answer,
    userIntent: "question",
    relevantContextIds: [],
    referencedRecords: [],
    safetyLevel: "monitor",
    shoppingSuppressed: false,
    suggestedFollowUps: [],
    proposedHistoryUpdate: { shouldOffer: true, category: "symptom", title: "Care changes", details: "Track these changes.", severity: "moderate", resolvesConcernId: null },
    responseMode: "practical_guidance",
    model: "test",
    messageUnderstanding: {},
    intelligenceSafety: { level: "caution", reason: "Several changes", requiresImmediateAction: false, shoppingSuppressed: false },
    learnings: [],
    careActions: [],
    semanticEvents: [],
    intelligenceMetadata: { confidence: "high", usedPetContext: true, usedCareHistory: false, usedMemories: false },
    applicationActions: [{ id: "action:pet-update-profile:opaque", kind: "pet.update_profile" }],
  };
}

function context(currentMessage) {
  return {
    currentMessage,
    pet: { id: "pet", name: "Mani", sex: "female", species: "cat" },
    eligiblePets: [{ id: "pet", name: "Mani", sex: "female", species: "cat" }],
    memories: [],
    careEntries: [],
  };
}
