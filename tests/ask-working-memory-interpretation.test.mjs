import assert from "node:assert/strict";
import test from "node:test";

import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export {};", format: "module", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { interpretAskQuestion } = await import("../app/lib/intelligence/interpret-ask.ts");

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

test("immediate saved-note readback bypasses provider interpretation", async () => {
  let calls = 0;
  const saveTurn = {
    id: "save-turn",
    role: "user",
    text: "Pebble skipped breakfast. Save that for today.",
    createdAt: "2026-09-18T20:00:00.000Z",
    operationReceipt: { sourceMessageId: "save-turn", petId: "pebble", requestText: "Pebble skipped breakfast. Save that for today.", answerPersisted: true,
      records: [{ id: "row", note: "Pebble skipped breakfast.", occurredAt: "2026-09-18T20:00:00.000Z" }] },
  };
  const result = await interpretAskQuestion({
    context: { ...context, currentMessage: "What did I just save for Pebble?", conversationTurns: [saveTurn],
      currentTurn: { id: "current-read", role: "user", text: "What did I just save for Pebble?", createdAt: "2026-09-18T20:00:01.000Z" } },
    model: "test-model",
    client: { responses: { create: async () => { calls++; throw new Error("provider should not run"); } } },
  });
  assert.equal(calls, 0);
  assert.equal(result.readOnly, true);
  assert.equal(result.request.evidenceBasis, "saved_history");
  assert.deepEqual(result.request.referenceTurnIds, ["save-turn"]);
  assert.deepEqual(result.petIds, ["pebble"]);
});

test("saved-note shortcut refuses a different named pet", async () => {
  let calls = 0;
  const bramble = { id: "bramble", name: "Bramble", user_id: "owner", species: "cat" };
  const saveTurn = { id: "save-turn", role: "user", text: "Pebble skipped breakfast. Save that for today.", createdAt: "2026-09-18T20:00:00.000Z",
    operationReceipt: { sourceMessageId: "save-turn", petId: "pebble", requestText: "Pebble skipped breakfast. Save that for today.", answerPersisted: true,
      records: [{ id: "row", note: "Pebble skipped breakfast.", occurredAt: "2026-09-18T20:00:00.000Z" }] } };
  await assert.rejects(interpretAskQuestion({
    context: { ...context, eligiblePets: [...context.eligiblePets, bramble], currentMessage: "What did I just save for Bramble?", conversationTurns: [saveTurn],
      currentTurn: { id: "current-read", role: "user", text: "What did I just save for Bramble?", createdAt: "2026-09-18T20:00:01.000Z" } },
    model: "test-model",
    client: { responses: { create: async () => { calls++; throw new Error("expected provider path"); } } },
  }));
  assert.equal(calls, 1);
});

test("latest named saved-history weight bypasses provider interpretation",async()=>{
  let calls=0;
  const q="Look at Pebble's latest weight.";
  const result=await interpretAskQuestion({
    context:{...context,currentMessage:q,currentTurn:{id:"latest-weight",role:"user",text:q,createdAt:"2026-09-18T23:00:00.000Z"}},
    model:"test-model",client:{responses:{create:async()=>{calls++;throw new Error("provider should not run");}}},
  });
  assert.equal(calls,0);
  assert.equal(result.request.evidenceBasis,"saved_history");
  assert.equal(result.selection,"latest");
  assert.equal(result.topic,"weight");
  assert.deepEqual(result.petIds,["pebble"]);
});

test("since-event named history read reaches Brain instead of a phrase shortcut",async()=>{
  let calls=0;
  const q="Since Pebble's dental, what did I write about eating or food? Don't guess months I didn't log.";
  await assert.rejects(interpretAskQuestion({
    context:{...context,currentMessage:q,currentTurn:{id:"since-anchor",role:"user",text:q,createdAt:"2026-09-18T23:00:01.000Z"}},
    model:"test-model",client:{responses:{create:async()=>{calls++;throw new Error("expected provider path");}}},
  }));
  assert.equal(calls,1);
});

test("explicit profile weight does not use the saved-history latest-weight shortcut",async()=>{
  let calls=0;
  const q="What is Pebble's current profile weight?";
  await assert.rejects(interpretAskQuestion({
    context:{...context,currentMessage:q,currentTurn:{id:"profile-weight",role:"user",text:q,createdAt:"2026-09-18T23:00:02.000Z"}},
    model:"test-model",client:{responses:{create:async()=>{calls++;throw new Error("expected provider path");}}},
  }));
  assert.equal(calls,1);
});

test("completed mixed save last-two-weight companion bypasses provider interpretation",async()=>{
  let calls=0;
  const q="tell me Pebble's last two weights and whether this note includes a weight.";
  const result=await interpretAskQuestion({
    context:{...context,ownerNoteAlreadySaved:true,completedOwnerNote:{sourceMessageId:"save",petId:"pebble",entryIds:["row"],note:"Pebble ate less at lunch today."},
      currentMessage:q,currentTurn:{id:"mixed-read",role:"user",text:q,createdAt:"2026-09-18T23:10:00.000Z"}},
    model:"test-model",client:{responses:{create:async()=>{calls++;throw new Error("provider should not run");}}},
  });
  assert.equal(calls,0);
  assert.equal(result.request.evidenceBasis,"saved_history");
  assert.equal(result.selection,"latest");
  assert.equal(result.request.task,null);
  assert.deepEqual(result.petIds,["pebble"]);
});
