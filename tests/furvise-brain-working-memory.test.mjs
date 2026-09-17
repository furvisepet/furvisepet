import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkingMemoryFollowup } from "../app/lib/furvise-brain/working-memory.ts";

const turns = [
  { id: "u1", role: "user", text: "Pebble rolled down the hill yesterday and it was hilarious." },
  { id: "a1", role: "furvise", text: "That sounds like quite a moment." },
];

for (const message of ["so what u think", "what do you think?", "thoughts?", "was that funny?", "what about that?"]) {
  test(`short conversational follow-up anchors to the last user statement: ${message}`, () => {
    const result = resolveWorkingMemoryFollowup(message, turns);
    assert.equal(result?.sourceTurnId, "u1");
    assert.equal(result?.sourceText, turns[0].text);
  });
}

test("assistant wording is never selected as the factual working-memory source", () => {
  const result = resolveWorkingMemoryFollowup("what do you think?", [
    { id: "a1", role: "furvise", text: "Atlas had a seizure yesterday." },
  ]);
  assert.equal(result, null);
});

for (const message of [
  "compare his history",
  "what do you think about his weight history?",
  "did you save that?",
  "delete that note",
  "when was his last vet visit?",
]) {
  test(`fresh data/action request is not collapsed into casual working memory: ${message}`, () => {
    assert.equal(resolveWorkingMemoryFollowup(message, turns), null);
  });
}
