import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { deriveAskAttemptId } from "../app/lib/ai/ask-turn-model.ts";
import { deriveConversationTitle } from "../app/lib/ask-conversations.ts";
import { recoverOptionalQuery, recoverOptionalValue } from "../app/lib/intelligence/context-recovery.ts";
import {
  buildRecentSubjectState,
  resolveRecentPronoun,
} from "../app/lib/intelligence/entities/recent-subject-state.ts";
import {
  resolveAuthoritativeTurnSubject,
  resolveDeterministicTurnSubject,
} from "../app/lib/intelligence/entities/resolve-turn-subject.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";

const mani = { id: "pet-mani", name: "Mani", species: "cat", sex: "female", age_value: 4, age_unit: "years" };
const coco = { id: "pet-coco", name: "Coco", species: "cat", sex: "female", age_value: 3, age_unit: "years" };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("production pronoun sequence remains bound to Mani across every turn", () => {
  const messages = [
    "She’s been staring at the wall for like 10 minutes straight.",
    "Why does she only want attention when I’m busy?",
    "She just knocked my drink over on purpose.",
    "Is it normal that she sleeps on my head every night?",
  ];
  const recentConversation = [];
  for (const message of messages) {
    const resolution = resolveDeterministicTurnSubject({
      message,
      pets: [mani],
      recentConversation,
      selectedPetId: mani.id,
    });
    assert.equal(resolution?.petId, mani.id, message);
    assert.equal(resolution?.requiresClarification, false, message);
    recentConversation.push({ role: "user", text: message });
  }
});

test("outside male cat and selected female cat retain independent pronoun chains", () => {
  const turns = [{ role: "user", text: "The neighbor’s male cat came back. He is sitting outside." }];
  let state = buildRecentSubjectState({ pets: [mani], recentConversation: turns, selectedPetId: mani.id });
  assert.equal(resolveRecentPronoun(state, "he").entity?.kind, "external_animal");
  assert.equal(resolveRecentPronoun(state, "she").entity?.petId, mani.id);

  turns.push({ role: "user", text: "She is staring at him." });
  state = buildRecentSubjectState({ pets: [mani], recentConversation: turns, selectedPetId: mani.id });
  assert.equal(resolveRecentPronoun(state, "she").entity?.petId, mani.id);
  assert.equal(resolveRecentPronoun(state, "him").entity?.kind, "external_animal");

  turns.push({ role: "user", text: "He left." });
  state = buildRecentSubjectState({ pets: [mani], recentConversation: turns, selectedPetId: mani.id });
  assert.equal(resolveRecentPronoun(state, "he").entity?.kind, "external_animal");
  assert.equal(resolveRecentPronoun(state, "she").entity?.petId, mani.id);
});

test("recent explicit pet switches and explicit returns are authoritative", () => {
  const cocoTurns = [{ role: "user", text: "Coco is limping." }];
  let resolution = resolveDeterministicTurnSubject({
    message: "She is sleeping now.", pets: [mani, coco], recentConversation: cocoTurns, selectedPetId: mani.id,
  });
  assert.equal(resolution?.petId, coco.id);

  const explicitReturn = resolveDeterministicTurnSubject({
    message: "Mani is acting weird too.", pets: [mani, coco], recentConversation: cocoTurns, selectedPetId: mani.id,
  });
  assert.equal(explicitReturn?.petId, mani.id);
  resolution = resolveDeterministicTurnSubject({
    message: "She keeps pacing.",
    pets: [mani, coco],
    recentConversation: [...cocoTurns, { role: "user", text: "She is sleeping now." }, { role: "user", text: "Mani is acting weird too." }],
    selectedPetId: mani.id,
  });
  assert.equal(resolution?.petId, mani.id);
});

test("a same-turn object mention does not displace the explicit primary subject", () => {
  const state = buildRecentSubjectState({
    pets: [mani, coco],
    recentConversation: [{ role: "user", text: "Coco is limping while Mani watches." }],
    selectedPetId: mani.id,
  });
  assert.equal(resolveRecentPronoun(state, "she").entity?.petId, coco.id);
});

test("two equally recent compatible pets produce a bounded candidate clarification", () => {
  const message = "She is vomiting.";
  const resolution = resolveAuthoritativeTurnSubject({
    frame: pronounFrame(message, "She"),
    message,
    ownerId: "owner-1",
    pets: [mani, coco],
    recentConversation: [{ role: "user", text: "Mani and Coco are both in the bedroom." }],
    selectedPetId: mani.id,
  });
  assert.equal(resolution.status, "ambiguous");
  assert.equal(resolution.requiresClarification, true);
  assert.deepEqual(new Set(resolution.candidatePetIds), new Set([mani.id, coco.id]));
  const route = read("app/api/ask/route.ts");
  assert.match(route, /buildFurviseClarification\(candidateNames\)/);
});

test("clarification rows are advisory and independently understandable next turns resume", () => {
  const prior = [
    { role: "user", text: "She knocked something over." },
    { role: "furvise", text: "Which pet do you mean?" },
  ];
  const continuation = resolveDeterministicTurnSubject({
    message: "Is it normal that she sleeps there every night?", pets: [mani], recentConversation: prior, selectedPetId: mani.id,
  });
  assert.equal(continuation?.petId, mani.id);
  const explicit = resolveDeterministicTurnSubject({ message: "Mani.", pets: [mani, coco], recentConversation: prior, selectedPetId: mani.id });
  assert.equal(explicit?.petId, mani.id);
});

test("recent-subject state reconstructs deterministically after reload", () => {
  const turns = [
    { role: "user", text: "Coco is limping." },
    { role: "furvise", text: "Keep her activity gentle." },
    { role: "user", text: "She is sleeping now." },
  ];
  const before = buildRecentSubjectState({ pets: [mani, coco], recentConversation: turns, selectedPetId: mani.id });
  const after = buildRecentSubjectState({ pets: [mani, coco], recentConversation: structuredClone(turns), selectedPetId: mani.id });
  assert.deepEqual(after, before);
  assert.equal(resolveRecentPronoun(after, "she").entity?.petId, coco.id);
});

test("optional context failures recover while critical ownership queries remain fail-closed", async () => {
  const queryFailure = await recoverOptionalQuery("memories", Promise.resolve({ data: null, error: { code: "OPTIONAL_DOWN" } }), []);
  assert.equal(queryFailure.unavailable, true);
  assert.deepEqual(queryFailure.data, []);
  const thrownFailure = await recoverOptionalValue("semantic_state", Promise.reject(new Error("temporarily unavailable")), null);
  assert.equal(thrownFailure.unavailable, true);
  assert.equal(thrownFailure.data, null);

  const retrieval = read("app/lib/intelligence/retrieve-context.ts");
  assert.match(retrieval, /if \(profile\.error \|\| !profile\.data\).*PET_NOT_FOUND/);
  assert.match(retrieval, /if \(conversationId && \(conversation\.error \|\| !conversation\.data\)\).*CONVERSATION_NOT_FOUND/);
  assert.match(retrieval, /if \(eligiblePets\.error\).*CONTEXT_UNAVAILABLE/);
  assert.match(retrieval, /recoverOptionalQuery\("conversation_messages"/);
});

test("a released Ask attempt receives a new ledger UUID without changing message identity", () => {
  const requestId = "6463f405-6967-43fa-bd92-97265f1d4aea";
  const first = deriveAskAttemptId(requestId, "11111111-1111-4111-8111-111111111111");
  const second = deriveAskAttemptId(requestId, "22222222-2222-4222-8222-222222222222");
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, requestId);
  assert.notEqual(first, second);
  const route = read("app/api/ask/route.ts");
  assert.match(route, /const attemptId = deriveAskAttemptId\(logicalTurnId, idempotency\.operation\.ownerToken\)/);
  assert.match(route, /beginAskConversationTurn\(\{[\s\S]{0,300}requestId,/);
  assert.match(route, /completeAiCredit\(\{ feature: "ask", logicalRequestId: requestId, payloadHash, requestId: creditRequestId/);
});

test("provider aborts at the configured deadline are classified as timeouts", () => {
  const reasoning = read("app/lib/ai/ask-reasoning.ts");
  assert.match(reasoning, /timeoutTriggered = true;[\s\S]*controller\.abort\(\)/);
  assert.match(reasoning, /timeoutError\.name = "TimeoutError"/);
  assert.match(reasoning, /timeoutError\.code = "ABORT_ERR"/);
});

test("the production first message derives a standalone title without another provider call", () => {
  assert.equal(
    deriveConversationTitle("She’s been staring at the wall for like 10 minutes straight.", "Mani"),
    "Mani staring at the wall",
  );
  assert.doesNotMatch(read("app/lib/ask-conversations.ts"), /openai|provider|completion/i);
});

function pronounFrame(message, surface) {
  return {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION,
    frameLocalId: "frame_1",
    discourseActs: [{ kind: "statement", confidence: 0.99 }],
    mentions: [{
      localId: "animal_1", surface, coarseType: "animal", confidence: 0.99,
      attributes: { species: null, lifeStage: null, ownership: "unknown" },
      evidence: [{ surfaceText: surface }],
    }],
    references: [],
    claims: [{
      localId: "claim_1", kind: "assertion", subjectRef: "animal_1",
      predicate: { label: "vomiting", definition: null, aliases: [], parentLabels: [], relatedLabels: [] },
      polarity: "affirmed", modality: "asserted",
      temporal: { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" },
      uncertainty: { confidence: 0.99, reasons: [] }, evidence: [{ surfaceText: message }],
      persistenceHint: "current_state", value: true, unit: null, durability: "temporary",
    }],
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
}
