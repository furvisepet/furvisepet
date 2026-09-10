import assert from "node:assert/strict";
import test from "node:test";
import { furviseVoiceV2Benchmarks, voiceV2AssessmentCriteria } from "./fixtures/furvise-voice-v2-benchmarks.mjs";

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
