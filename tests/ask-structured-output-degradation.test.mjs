import assert from "node:assert/strict";
import test from "node:test";
import { parseUnifiedResponse } from "../app/lib/ai/ask-reasoning.ts";

test("a useful answer survives invalid auxiliary structured fields", () => {
  const parsed = parseUnifiedResponse(JSON.stringify({
    answer: "Keep her routine steady and watch whether the pacing settles.",
    answerSections: [{ heading: 42, items: "bad" }],
    suggestedFollowUps: [42, {}, "What should I watch next?"],
    applicationActions: [{ kind: "corrupted_machine_kind" }],
    proposedHistoryUpdate: { shouldOffer: true, title: 9 },
    learnings: [{ not: "valid" }],
    careActions: [{ not: "valid" }],
    semanticEvents: [{ not: "valid" }],
    messageUnderstanding: "bad",
    intelligenceSafety: "bad",
  }), [], undefined, "She is pacing.");
  assert.match(parsed.answer, /routine steady/);
  assert.deepEqual(parsed.answerSections, []);
  assert.deepEqual(parsed.applicationActions, []);
  assert.deepEqual(parsed.learnings, []);
  assert.equal(parsed.proposedHistoryUpdate.shouldOffer, false);
});

test("missing or empty core answer remains answer-critical", () => {
  assert.throws(() => parseUnifiedResponse("{}", []), /invalid response/);
  assert.throws(() => parseUnifiedResponse('{"answer":"   "}', []), /empty answer/);
});
