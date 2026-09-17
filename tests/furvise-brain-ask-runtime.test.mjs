import assert from "node:assert/strict";
import test from "node:test";

import { assertAskBrainScope, buildAskBrainTurn } from "../app/lib/furvise-brain/ask-runtime.ts";

const pets = [
  { id: "pebble", name: "Pebble", user_id: "owner" },
  { id: "mochi", name: "Mochi", user_id: "owner" },
  { id: "alien", name: "Alien", user_id: "someone-else" },
];

function context(overrides = {}) {
  return {
    owner: { userId: "owner" },
    eligiblePets: pets,
    pet: pets[0],
    askInterpretation: {
      request: {
        version: "ask-request.v2",
        mode: "read",
        operation: "recall",
        mutationIntent: null,
        task: null,
        evidenceBasis: "saved_history",
        question: "Compare Pebble and Mochi history",
        from: null,
        to: null,
        referenceTurnIds: [],
      },
      readPetIds: ["pebble", "mochi"],
      conversationOnly: false,
    },
    ...overrides,
  };
}

test("brain keeps discourse subject separate from memory read scope", () => {
  const turn = buildAskBrainTurn({
    context: context(),
    logicalTurnId: "turn",
    authoritativePetIds: ["pebble"],
  });
  assert.deepEqual(turn.subject.petIds, ["pebble"]);
  assert.deepEqual(turn.memoryPetIds, ["pebble", "mochi"]);
  assert.equal(turn.memoryNeed, "targeted");
  assert.equal(turn.mutation.allowed, false);
  assert.doesNotThrow(() => assertAskBrainScope({
    turn,
    authoritativePetIds: ["pebble"],
    readPetIds: ["pebble", "mochi"],
  }));
});

test("conversation-only turn has no pet memory authority", () => {
  const value = context({
    askInterpretation: {
      ...context().askInterpretation,
      conversationOnly: true,
      readPetIds: [],
      request: {
        ...context().askInterpretation.request,
        mode: "conversation",
        operation: "general",
        evidenceBasis: "general",
        question: "write me a poem",
      },
    },
  });
  const turn = buildAskBrainTurn({ context: value, logicalTurnId: "turn", authoritativePetIds: [] });
  assert.equal(turn.subject.kind, "other");
  assert.deepEqual(turn.subject.petIds, []);
  assert.deepEqual(turn.memoryPetIds, []);
  assert.equal(turn.memoryNeed, "working");
});

test("brain rejects non-owned subject and memory scopes", () => {
  assert.throws(() => buildAskBrainTurn({
    context: context(),
    logicalTurnId: "turn",
    authoritativePetIds: ["alien"],
  }), /FURVISE_SUBJECT_SCOPE_NOT_AUTHORIZED/);

  const badMemory = context({
    askInterpretation: { ...context().askInterpretation, readPetIds: ["alien"] },
  });
  assert.throws(() => buildAskBrainTurn({
    context: badMemory,
    logicalTurnId: "turn",
    authoritativePetIds: ["pebble"],
  }), /FURVISE_MEMORY_SCOPE_NOT_AUTHORIZED/);
});

test("legacy scope drift is detected before generation", () => {
  const turn = buildAskBrainTurn({ context: context(), logicalTurnId: "turn", authoritativePetIds: ["pebble"] });
  assert.throws(() => assertAskBrainScope({
    turn,
    authoritativePetIds: ["mochi"],
    readPetIds: ["pebble", "mochi"],
  }), /FURVISE_SUBJECT_AUTHORITY_DRIFT/);
  assert.throws(() => assertAskBrainScope({
    turn,
    authoritativePetIds: ["pebble"],
    readPetIds: ["pebble"],
  }), /FURVISE_MEMORY_AUTHORITY_DRIFT/);
});
