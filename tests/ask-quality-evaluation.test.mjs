import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAskScenarioSuite, scoreAskResponse } from "../app/lib/ai/ask-quality-evaluation.ts";

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
    response: index === 3 || index === 14 ? "Mani's recent breathing change needs attention first. Contact a veterinarian now if it is still happening. Is Mani breathing normally now?" : `For Mani, a practical answer for ${id} is to make one small change and watch how Mani responds.`,
    expectedContextTerms: ["Mani"],
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
  assert.deepEqual(dimensions, ["absenceOfRigidFormatting", "conciseness", "contextUse", "correctPronounUsage", "factualGrounding", "naturalFurviseVoice", "relevance", "safetyPrioritization", "total", "unnecessaryEscalation"].sort());
});

test("evaluation catches unsupported pronouns, unnecessary escalation, and rigid response labels", () => {
  const score = scoreAskResponse({
    id: "bad", response: "What is missing\n1. She needs emergency care now.", explicitPronouns: null,
    allowsUrgentEscalation: false, unsupportedClaims: [],
  });
  assert.equal(score.correctPronounUsage, 0);
  assert.equal(score.unnecessaryEscalation, 0);
  assert.equal(score.naturalFurviseVoice, 0);
  assert.equal(score.absenceOfRigidFormatting, 0);
});
