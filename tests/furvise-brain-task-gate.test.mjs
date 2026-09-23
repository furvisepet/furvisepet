import assert from "node:assert/strict";
import test from "node:test";

import {
  validateAskTask,
} from "../app/lib/intelligence/ask-task-continuation.ts";

const source = {
  id: "source",
  role: "user",
  text: "Pebble rolled down the hill yesterday.",
  createdAt: "2026-09-15T12:00:00Z",
};
const pet = { id: "pebble", name: "Pebble", user_id: "owner" };

test("legacy task input preserves authorization provenance but owns no execution", () => {
  const currentTurn = {
    ...source,
    id: "save-turn",
    text: "save that as a note",
  };
  const task = validateAskTask(
    { intent: "save", sourceTurnId: source.id, petName: "Pebble" },
    {
      currentMessage: currentTurn.text,
      currentTurn,
      conversationTurns: [source],
      owner: { userId: "owner" },
      eligiblePets: [pet],
    },
  );
  assert.equal(task.petId,"pebble");
  assert.equal(task.source.id,"source");
  assert.equal(task.authorization.kind,"record_care");
  assert.equal(task.authorization.source,"current_turn");
});

test("a subject-only clarification cannot create a task or reach the mutation gate", () => {
  assert.throws(() => validateAskTask(
    { intent: "save", sourceTurnId: source.id, petName: "Pebble" },
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
    { intent: "resume", sourceTurnId: null, petName: "Pebble" },
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
  assert.equal(task.authorization.source,"durable_capability");
  assert.throws(()=>validateAskTask({intent:"resume",sourceTurnId:null,petName:"Pebble"},{
    currentMessage:"Pebble",currentTurn:{...source,id:"clarify-turn",text:"Pebble"},
    conversationTurns:[source,request],pendingTask:{...pendingTask,authorizationMessageId:null},
    owner:{userId:"owner"},eligiblePets:[pet],
  }),/ASK_REQUEST_INVALID/);
});
