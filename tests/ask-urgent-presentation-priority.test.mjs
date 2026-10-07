import assert from "node:assert/strict";
import test from "node:test";
import {
  getAskMessageVariant,
  getAskPresentationMode,
  shouldShowSuggestedQuestions,
} from "../app/lib/ask-experience.ts";

function response(overrides = {}) {
  return {
    answerType: "urgent_guidance",
    urgency: "urgent",
    interactionMode: "normal",
    sections: [],
    safetyNote: "Contact an emergency veterinarian now.",
    summary: "Exact approved answer.",
    evidenceContract: { answerSourceIds: ["owned-source"], scope: { authorizedPetIds: ["cedar"] } },
    applicationActions: [],
    ...overrides,
  };
}

for (const [label, message, interactionMode] of [
  ["mixed grief and emergency", "I'm devastated and Cedar can't breathe.", "normal"],
  ["negated distress", "I'm not devastated or panicking, but Cedar collapsed.", "normal"],
  ["negated loss", "Cedar has not died. I am devastated and need help now.", "normal"],
  ["grief interaction conflict", "Please help Cedar now.", "grief"],
  ["grief interaction and wording", "I'm heartbroken and terrified.", "grief"],
  ["neutral wording", "Please help.", "normal"],
]) {
  test("explicit urgent status outranks " + label, () => {
    const value = response({ interactionMode });
    const before = structuredClone(value);
    assert.equal(getAskPresentationMode(value, message), "serious");
    assert.equal(getAskMessageVariant(value, message), "URGENT");
    assert.equal(shouldShowSuggestedQuestions(value, message), false);
    assert.deepEqual(value, before, "presentation preserves the approved answer and authority");
  });
}

for (const urgency of ["routine", "monitor", "resolved"]) {
  for (const [message, interactionMode] of [
    ["Cedar died yesterday. I'm devastated and can't stop crying.", "normal"],
    ["I miss him and feel heartbroken.", "normal"],
    ["What happens next?", "grief"],
  ]) {
    test(urgency + " bereavement remains grief: " + message, () => {
      const value = response({ answerType: "direct_answer", urgency, interactionMode, safetyNote: null });
      const before = structuredClone(value);
      assert.equal(getAskPresentationMode(value, message), "grief");
      assert.equal(getAskMessageVariant(value, message), "GRIEF");
      assert.equal(shouldShowSuggestedQuestions(value, message), false);
      assert.deepEqual(value, before);
    });
  }
}
