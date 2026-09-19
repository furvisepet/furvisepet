import assert from "node:assert/strict";
import test from "node:test";

import {
  taskMutationParameters,
  validateAskTask,
} from "../app/lib/intelligence/ask-task-continuation.ts";

const source = {
  id: "source",
  role: "user",
  text: "Pebble rolled down the hill yesterday.",
  createdAt: "2026-09-15T12:00:00Z",
};
const pet = { id: "pebble", name: "Pebble", user_id: "owner" };

test("current-turn save crosses the canonical Furvise mutation gate", () => {
  const currentTurn = {
    ...source,
    id: "save-turn",
    text: "save that as a note",
  };
  const task = validateAskTask(
    { intent: "save", sourceTurnId: source.id, petName: "Pebble", noteQuote: source.text },
    {
      currentMessage: currentTurn.text,
      currentTurn,
      conversationTurns: [source],
      owner: { userId: "owner" },
      eligiblePets: [pet],
    },
  );
  const params = taskMutationParameters(task, {
    userId: "owner",
    conversationId: "conversation",
    currentMessageId: currentTurn.id,
    timeZone: "UTC",
  });
  assert.equal(params.p_pet_id, "pebble");
  assert.equal(params.p_message_id, "save-turn");
});

test("a subject-only clarification cannot create a task or reach the mutation gate", () => {
  assert.throws(() => validateAskTask(
    { intent: "save", sourceTurnId: source.id, petName: "Pebble", noteQuote: source.text },
    {
      currentMessage: "I mean Pebble",
      currentTurn: { ...source, id: "clarify-turn", text: "I mean Pebble" },
      conversationTurns: [source],
      owner: { userId: "owner" },
      eligiblePets: [pet],
    },
  ), /ASK_REQUEST_INVALID:task/);
});

test("durable continuation needs the exact earlier authorization turn id", () => {
  const request = { ...source, id: "permission", text: "save that as a note" };
  const pendingTask = {
    id: "task",
    revision: 1,
    kind: "owner_note",
    status: "awaiting_subject",
    source,
    request,
    authorizationMessageId: request.id,
  };
  const task = validateAskTask(
    { intent: "resume", sourceTurnId: null, petName: "Pebble", noteQuote: source.text },
    {
      currentMessage: "Pebble",
      currentTurn: { ...source, id: "clarify-turn", text: "Pebble" },
      conversationTurns: [source, request],
      pendingTask,
      owner: { userId: "owner" },
      eligiblePets: [pet],
    },
  );
  assert.equal(task.authorizationTurnId, "permission");
  assert.doesNotThrow(() => taskMutationParameters(task, {
    userId: "owner",
    conversationId: "conversation",
    currentMessageId: "clarify-turn",
  }));

  assert.throws(() => taskMutationParameters({ ...task, authorizationTurnId: null }, {
    userId: "owner",
    conversationId: "conversation",
    currentMessageId: "clarify-turn",
  }), /FURVISE_MUTATION_NOT_AUTHORIZED/);
});
