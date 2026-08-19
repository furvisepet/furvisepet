import assert from "node:assert/strict";
import test from "node:test";
import { buildAskReliabilityBenchmark, measureAskReliabilityBenchmark } from "../app/lib/ai/ask-reliability-benchmark.ts";

test("permanent Ask benchmark contains at least 150 multi-turn scenarios", () => {
  const scenarios = buildAskReliabilityBenchmark();
  assert.ok(scenarios.length >= 150);
  assert.ok(scenarios.every((item) => item.turns.length >= 2));
  const categories = new Set(scenarios.flatMap((item) => item.categories));
  for (const required of ["simple", "complex", "slang", "typos", "multilingual", "multiple_pets", "outside_animal", "emergency", "quota", "grief", "history", "memory", "application_action", "retry", "refresh", "structured_output", "optional_failure"]) assert.ok(categories.has(required), required);
});

test("benchmark provider-call and reliability targets pass", () => {
  const metrics = measureAskReliabilityBenchmark();
  assert.equal(metrics.passRate, 1);
  assert.ok(metrics.averageProviderCalls <= 1);
  assert.ok(metrics.p95ProviderCalls <= 2);
  assert.ok(metrics.deterministicTurnPercentage > 0);
  assert.ok(metrics.clarificationRate < 0.02);
});
