import assert from "node:assert/strict";
import test from "node:test";

import { interpretAskQuestion } from "../app/lib/intelligence/interpret-ask.ts";

const source = {
  id: "user-story",
  role: "user",
  text: "Pebble rolled down the hill yesterday and it was hilarious.",
  createdAt: "2026-09-16T20:00:00.000Z",
};
const context = {
  owner: { userId: "owner" },
  eligiblePets: [{ id: "pebble", name: "Pebble", user_id: "owner", species: "cat" }],
  pet: { id: "pebble", name: "Pebble", user_id: "owner", species: "cat" },
  currentMessage: "so what u think",
  conversationTurns: [source, { id: "assistant", role: "furvise", text: "That sounds like quite a moment.", createdAt: "2026-09-16T20:00:01.000Z" }],
  currentTurn: { id: "current", role: "user", text: "so what u think", createdAt: "2026-09-16T20:00:02.000Z" },
  pendingTask: null,
  timeZone: "America/Vancouver",
};

test("casual working-memory follow-up is resolved before provider interpretation", async () => {
  let calls = 0;
  const result = await interpretAskQuestion({
    context,
    model: "test-model",
    client: { responses: { create: async () => { calls++; throw new Error("provider should not run"); } } },
  });
  assert.equal(calls, 0);
  assert.equal(result.conversationOnly, true);
  assert.equal(result.referenceQuestion, source.text);
  assert.deepEqual(result.request.referenceTurnIds, [source.id]);
  assert.equal(result.request.mode, "conversation");
  assert.deepEqual(result.petIds, []);
});

test("fresh history question still requires semantic interpretation", async () => {
  let calls = 0;
  await assert.rejects(interpretAskQuestion({
    context: { ...context, currentMessage: "what do you think about his weight history?" },
    model: "test-model",
    client: { responses: { create: async () => { calls++; throw new Error("expected provider path"); } } },
  }));
  assert.equal(calls, 1);
});
