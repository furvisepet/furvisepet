import assert from "node:assert/strict";
import test from "node:test";
import { buildAskReliabilityBenchmark, evaluateAskSubjectBenchmark, measureAskReliabilityBenchmark } from "../app/lib/ai/ask-reliability-benchmark.ts";

test("permanent Ask benchmark contains at least 150 multi-turn scenarios", () => {
  const scenarios = buildAskReliabilityBenchmark();
  assert.ok(scenarios.length >= 150);
  assert.ok(scenarios.every((item) => item.turns.length >= 2));
  const categories = new Set(scenarios.flatMap((item) => item.categories));
  for (const required of ["simple", "complex", "slang", "typos", "multilingual", "multiple_pets", "outside_animal", "emergency", "quota", "grief", "history", "memory", "application_action", "retry", "refresh", "structured_output", "optional_failure"]) assert.ok(categories.has(required), required);
  assert.ok(categories.has("long_form_owner_emotion_with_clear_pet_pronouns"));
  assert.ok(categories.has("answer_economy"));
  assert.ok(categories.has("answer_economy_v1_1"));
  assert.ok(scenarios.length >= 180);
});

test("benchmark provider-call and reliability targets pass", () => {
  const metrics = measureAskReliabilityBenchmark();
  assert.equal(metrics.passRate, 1);
  assert.ok(metrics.averageProviderCalls <= 1);
  assert.ok(metrics.p95ProviderCalls <= 2);
  assert.ok(metrics.deterministicTurnPercentage > 0);
  assert.ok(metrics.clarificationRate < 0.02);
  assert.ok(metrics.subjectBehaviorProbes >= 7);
  assert.equal(evaluateAskSubjectBenchmark().passed, true);
});
