import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAskScenarioSuite, scoreAskResponse } from "../app/lib/ai/ask-quality-evaluation.ts";
import { furviseVoiceV2Benchmarks, voiceV2AssessmentCriteria } from "./fixtures/furvise-voice-v2-benchmarks.mjs";

const scenarioKinds = [
  "routine-play", "routine-food", "routine-grooming", "unresolved-symptom-food", "resolved-symptom-food",
  "medication-new-symptom", "avoid-product", "contradictory-food", "missing-gender", "explicit-pronouns",
  "old-irrelevant-update", "multi-pet-isolation", "ambiguous-question", "direct-answer", "history-only-urgent",
  "history-important", "non-pet-question", "shopping-allowed", "shopping-suppressed", "recent-conversation",
  "current-food", "allergy", "care-goal", "treatment", "vet-visit", "weight", "stool", "behavior",
  "routine-change", "remembered-preference",
];

test("quality evaluation covers at least 30 varied scenarios and all requested dimensions", () => {
  const scenarios = scenarioKinds.map((id, index) => ({
    id,
    response: index === 3 || index === 14 ? "Mani's recent breathing change needs attention first. Contact a veterinarian now if it is still happening. Watch Mani's breathing while arranging care." : `For Mani, the relevant ${id} detail changes today's next step. Make one small change and watch how Mani responds.`,
    expectedContextTerms: ["Mani"],
    relevantContextExists: true,
    requiresSafetyPriority: index === 3 || index === 14,
    allowsUrgentEscalation: index === 3 || index === 14,
    petName: "Mani",
    explicitPronouns: null,
    unsupportedClaims: ["Mani has an infection"],
  }));
  const suite = evaluateAskScenarioSuite(scenarios);
  assert.equal(suite.results.length, 30);
  assert.ok(suite.average >= 0.95);
  const dimensions = Object.keys(suite.results[0].score).sort();
  assert.deepEqual(dimensions, ["actionability", "contextCorrectness", "correctPronounUsage", "directness", "entityContinuity", "genericChatbotResemblance", "naturalness", "personalization", "safety", "total", "uncertaintyPreservation", "usefulness", "verbosityAppropriateness"].sort());
});

test("evaluation catches unsupported pronouns, unnecessary escalation, generic phrasing, and lost uncertainty", () => {
  const score = scoreAskResponse({
    id: "bad", response: "Based on the information provided, she drank the water. Every pet is different, so contact a qualified professional.", explicitPronouns: null,
    allowsUrgentEscalation: false, unsupportedClaims: [], ownerUncertainty: true,
    relevantContextExists: true, expectedContextTerms: ["outside cat"],
  });
  assert.equal(score.correctPronounUsage, 0);
  assert.equal(score.safety, 0);
  assert.equal(score.naturalness, 0);
  assert.equal(score.uncertaintyPreservation, 0);
  assert.equal(score.personalization, 0);
  assert.equal(score.genericChatbotResemblance, 0);
});

test("Voice V2 benchmark suite covers all required depths and product, language, entity, uncertainty, and safety cases", () => {
  assert.equal(furviseVoiceV2Benchmarks.length, 10);
  assert.deepEqual(new Set(furviseVoiceV2Benchmarks.map((item) => item.depth)), new Set([1, 2, 3]));
  for (const id of ["simple-egg", "personalized-rocky-paws", "mani-outside-cat-follow-up", "uncertain-outside-water", "complex-mani", "irrelevant-memory", "genuine-clarification", "urgent-breathing", "language-continuity-french", "product-guidance"]) {
    assert.ok(furviseVoiceV2Benchmarks.some((item) => item.id === id), id);
  }
  assert.ok(furviseVoiceV2Benchmarks.every((item) => item.qualityFocus.length >= 3));
  assert.equal(voiceV2AssessmentCriteria.length, 10);
  assert.ok(furviseVoiceV2Benchmarks.every((item) => item.assessmentCriteria === voiceV2AssessmentCriteria));
});
