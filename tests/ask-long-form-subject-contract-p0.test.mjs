import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildAskConversationResponse,
  containsActionDependentCopy,
  parseAskConversationResponse,
} from "../app/lib/ask.mjs";
import { enforceVerifiedStateClaims } from "../app/lib/application-actions/state-claims.ts";
import { prepareFurviseApplicationActions } from "../app/lib/application-actions/planner.ts";
import { buildFurviseClarification } from "../app/lib/furvise-voice.ts";
import {
  resolveAskTurnSubject,
  resolveAuthoritativeTurnSubject,
  resolveDeterministicTurnSubject,
} from "../app/lib/intelligence/entities/resolve-turn-subject.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";

const mani = { id: "pet-mani", name: "Mani", species: "cat", sex: "female", age_value: 4, age_unit: "years" };
const coco = { id: "pet-coco", name: "Coco", species: "cat", sex: "male", age_value: 3, age_unit: "years" };
const luna = { id: "pet-luna", name: "Luna", species: "cat", sex: "female", age_value: 5, age_unit: "years" };
const baseAnswer = { title: "A steadier way to respond", summary: "Pause before petting and watch for early signs of overstimulation.", sections: [], safetyNote: null };

const productionRegression = "I need real advice. Lately she’s been super affectionate one minute and then bites me hard the next. She follows me around the house crying if I go into another room, but when I try to pet her she gets overstimulated really fast. I’m starting to feel frustrated and then I feel guilty about it. How do I handle this without making things worse?";

test("the production resolver stage deterministically keeps long owner-emotion input on the one compatible selected pet", async () => {
  let extractionCalls = 0;
  const decision = await resolveAskTurnSubject({
    extractFrame: async () => {
      extractionCalls += 1;
      throw new Error("subject extraction must not run");
    },
    message: productionRegression,
    ownerId: "owner-1",
    pets: [mani],
    recentConversation: [],
    selectedPetId: mani.id,
  });

  assert.equal(decision.resolution.petId, mani.id);
  assert.deepEqual(decision.resolution.petIds, [mani.id]);
  assert.equal(decision.resolution.requiresClarification, false);
  assert.equal(decision.usedProviderExtraction, false);
  assert.equal(extractionCalls, 0);

  let reasoningCalls = 0;
  let userMessageCount = 1;
  let assistantMessageCount = 0;
  let completedCredits = 0;
  if (!decision.resolution.requiresClarification) {
    reasoningCalls += 1;
    const response = buildAskConversationResponse(baseAnswer, { intent: "general_pet_question" });
    assert.equal(response.answerType, "direct_answer");
    assert.equal(response.applicationActions, undefined);
    assert.equal(containsActionDependentCopy(response.directAnswer), false);
    assistantMessageCount += 1;
    completedCredits += 1;
  }
  assert.deepEqual({ reasoningCalls, userMessageCount, assistantMessageCount, completedCredits }, {
    reasoningCalls: 1, userMessageCount: 1, assistantMessageCount: 1, completedCredits: 1,
  });
});

test("first-person emotion and several compatible pronouns do not create subject ambiguity", () => {
  for (const message of [
    "I’m getting frustrated because she keeps biting me.",
    "I love her but she gets overstimulated really fast.",
    "She follows me everywhere and I don’t know what to do.",
    "I’m worried I’m making her behavior worse.",
    "I feel guilty about it because she looks upset when I leave.",
  ]) {
    const result = resolveDeterministicTurnSubject({ message, pets: [mani], recentConversation: [], selectedPetId: mani.id });
    assert.equal(result?.petId, mani.id, message);
    assert.equal(result?.requiresClarification, false, message);
  }
});

test("multi-pet controls preserve selected, ambiguous, and outside-animal boundaries", () => {
  const differentSexes = resolveDeterministicTurnSubject({
    message: "She keeps biting me.", pets: [mani, coco], recentConversation: [], selectedPetId: mani.id,
  });
  assert.equal(differentSexes?.petId, mani.id);
  const differentSexesWithSituationalIt = resolveDeterministicTurnSubject({
    message: "I feel guilty about it because she keeps biting me.", pets: [mani, coco], recentConversation: [], selectedPetId: mani.id,
  });
  assert.equal(differentSexesWithSituationalIt?.petId, mani.id);

  const equallyRecent = [{ role: "user", text: "Mani and Luna were both restless last night." }];
  assert.equal(resolveDeterministicTurnSubject({
    message: "She keeps biting me.", pets: [mani, luna], recentConversation: equallyRecent, selectedPetId: mani.id,
  }), null);
  const ambiguous = resolveAuthoritativeTurnSubject({
    frame: pronounFrame("She keeps biting me.", "She"), message: "She keeps biting me.", ownerId: "owner-1",
    pets: [mani, luna], recentConversation: equallyRecent, selectedPetId: mani.id,
  });
  assert.equal(ambiguous.requiresClarification, true);
  assert.deepEqual(new Set(ambiguous.candidatePetIds), new Set([mani.id, luna.id]));

  const outsideFemale = [{ role: "user", text: "The outside female cat came back and sat by the door." }];
  const outsideResult = resolveDeterministicTurnSubject({
    message: "She keeps following me.", pets: [mani], recentConversation: outsideFemale, selectedPetId: mani.id,
  });
  assert.equal(outsideResult, null);
});

test("clarification and application-action response contracts cannot contradict their payload", () => {
  const phantom = buildAskConversationResponse({
    title: "Do you mean Mani?",
    summary: "I can help with that using the action below.",
    sections: [],
    safetyNote: null,
  }, {
    clarificationQuestion: "Who do you mean?",
    interactionMode: "action_confirmation",
  });
  assert.equal(phantom.answerType, "clarification");
  assert.equal(phantom.interactionMode, "normal");
  assert.equal(phantom.applicationActions, undefined);
  assert.equal(containsActionDependentCopy(phantom.summary), false);
  assert.equal(containsActionDependentCopy(phantom.directAnswer), false);

  const stored = parseAskConversationResponse({
    ...phantom,
    answerType: "direct_answer",
    interactionMode: "action_success",
    summary: "I can help with that using the action below.",
    directAnswer: "I can help with that using the action below.",
  });
  assert.equal(stored.answerType, "clarification");
  assert.equal(stored.interactionMode, "normal");
  assert.equal(containsActionDependentCopy(stored.summary), false);

  const [action] = prepareFurviseApplicationActions({
    petId: mani.id,
    petName: mani.name,
    requestId: "request-action-contract",
    proposals: [{
      kind: "navigation.open_pet_profile",
      explicitIntent: true,
      evidence: "Open Mani's profile",
      input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
    }],
  });
  const actionResponse = buildAskConversationResponse({
    title: "Open Mani's profile",
    summary: "Use the action below to open Mani's profile.",
    sections: [],
    safetyNote: null,
  }, { applicationActions: [action], interactionMode: "action_confirmation" });
  assert.equal(actionResponse.applicationActions.length, 1);
  assert.equal(actionResponse.interactionMode, "action_confirmation");
  assert.equal(containsActionDependentCopy(actionResponse.summary), true);
});

test("one-name clarification copy and empty verified-state fallback never imply a phantom action", () => {
  assert.equal(buildFurviseClarification(["Mani"]), "I want to make sure I follow the right pet or animal. Who do you mean?");
  assert.doesNotMatch(buildFurviseClarification(["Mani"]), /Do you mean Mani|action|below/i);
  assert.equal(enforceVerifiedStateClaims("I can help with that using the action below.", false), "I can help with that.");
});

test("the live Ask route uses the canonical resolver before reasoning and never reconstructs a one-name extraction fallback", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  const resolver = route.indexOf("await resolveAskTurnSubject");
  const reasoning = route.indexOf("await runFurviseIntelligence");
  assert.ok(resolver >= 0 && reasoning > resolver);
  assert.match(route, /liveContext\.eligiblePets\.length >= 2[\s\S]*buildSubjectClarificationOrchestration/);
  assert.doesNotMatch(route, /resolveDeterministicTurnSubject\s*\(/);
});

function pronounFrame(message, surface) {
  return {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION,
    frameLocalId: "frame-long-form-p0",
    discourseActs: [{ kind: "statement", confidence: 0.99 }],
    mentions: [{
      localId: "animal-1", surface, coarseType: "animal", confidence: 0.99,
      attributes: { species: null, lifeStage: null, ownership: "unknown" }, evidence: [{ surfaceText: surface }],
    }],
    references: [],
    claims: [{
      localId: "claim-1", kind: "assertion", subjectRef: "animal-1",
      predicate: { label: "behavior", definition: null, aliases: [], parentLabels: [], relatedLabels: [] },
      polarity: "affirmed", modality: "asserted",
      temporal: { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" },
      uncertainty: { confidence: 0.99, reasons: [] }, evidence: [{ surfaceText: message }],
      persistenceHint: "current_state", value: true, unit: null, durability: "temporary",
    }],
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
}
