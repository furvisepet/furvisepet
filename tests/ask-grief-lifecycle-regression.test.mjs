import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAskConversationResponse } from "../app/lib/ask.mjs";
import {
  buildObservationAssessmentFallback,
  isObservationalAssessmentQuestion,
  isUselessQuestionEcho,
} from "../app/lib/ai/conversation-intent.ts";
import {
  buildConfirmedLossCareAction,
  buildGriefResponseFallback,
  buildUnavailableConfirmedLossAction,
  classifyCurrentPetLoss,
  ensureConfirmedLossAction,
  resolvePetLossContext,
} from "../app/lib/ai/pet-loss.ts";
import { prepareFurviseApplicationActions } from "../app/lib/application-actions/index.ts";
import { enforceVerifiedStateClaims } from "../app/lib/application-actions/state-claims.ts";
import { buildVetBriefDraft } from "../app/lib/vet-brief/builder.ts";

const productionDeathMessage = "she ran outside and a dog came and bit her neck and she died";
const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
const reasoning = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
const intelligence = readFileSync(new URL("../app/lib/intelligence/run-intelligence.ts", import.meta.url), "utf8");
const orchestrator = readFileSync(new URL("../app/lib/ai/ask-orchestrator.ts", import.meta.url), "utf8");

test("the exact production traumatic-death report is a confirmed loss, not active emergency treatment", () => {
  assert.equal(classifyCurrentPetLoss(productionDeathMessage), "confirmed_current");
  assert.match(reasoning, /lossContext === "confirmed_current" \|\| lossContext === "continuation"/);
  assert.match(reasoning, /parsed\.responseMode = "grief_support"/);
  assert.match(reasoning, /parsed\.safetyLevel = "normal"/);
  assert.match(reasoning, /parsed\.shoppingSuppressed = true/);
  assert.match(route, /currentLoss === "confirmed_current" \? null : detectImmediateAskEmergency\(question\)/);
  assert.match(orchestrator, /aiResult\.responseMode === "grief_support"[\s\S]*\? null/);
});

test("confirmed loss variants are recognized while uncertainty, hypotheticals, missing status, and corrections are preserved", () => {
  for (const report of [
    "Coco died last night.",
    "Rocky passed away peacefully.",
    "The veterinarian euthanized Maple today.",
    "He was killed in an accident.",
  ]) assert.equal(classifyCurrentPetLoss(report), "confirmed_current", report);

  for (const report of [
    "I think she may have died.",
    "Maybe he is dead, but I am not sure.",
    "What if she died while she was missing?",
  ]) assert.equal(classifyCurrentPetLoss(report), "uncertain_current", report);

  for (const report of [
    "She is missing and I do not know where she is.",
    "Did she pass away?",
    "I thought she died, but she is alive.",
    "Actually, she is alive and doing well.",
  ]) assert.notEqual(classifyCurrentPetLoss(report), "confirmed_current", report);
});

test("a confirmed death deterministically creates one standalone owner-reported history event", () => {
  const action = buildConfirmedLossCareAction({ message: productionDeathMessage, petName: "Mani" });
  assert.ok(action);
  assert.equal(action.action, "create_entry");
  assert.equal(action.category, "general");
  assert.equal(action.severity, "moderate");
  assert.match(action.title, /^Mani died/i);
  assert.match(action.title, /dog attack/i);
  assert.match(action.details, /^Owner reported that Mani died/i);
  assert.match(action.details, /neck/i);
  assert.doesNotMatch(action.details, /veterinarian|diagnos/i);
  assert.match(intelligence, /confirmedLossCareAction \? \[confirmedLossCareAction\]/);
  assert.match(intelligence, /acceptedSemanticEvents = confirmedLossCareAction \? \[\]/);
});

test("natural death produces a coherent history entry without an invented cause", () => {
  const action = buildConfirmedLossCareAction({ message: "Nori passed away today.", petName: "Nori" });
  assert.equal(action.title, "Nori died");
  assert.equal(action.details, "Owner reported that Nori died.");
});

test("uncertain death cannot create death history or a lifecycle action", () => {
  const message = "I think she may have died, but I am not sure.";
  assert.equal(buildConfirmedLossCareAction({ message, petName: "Mani" }), null);
  assert.deepEqual(ensureConfirmedLossAction([], message), []);
  assert.equal(buildUnavailableConfirmedLossAction({ message, petId: "pet-mani", petName: "Mani", requestId: "request" }), null);
});

test("the lifecycle proposal is server-bound to the selected pet and always requires confirmation", () => {
  const proposals = ensureConfirmedLossAction([], productionDeathMessage);
  assert.equal(proposals.length, 1);
  const [action] = prepareFurviseApplicationActions({
    proposals,
    petId: "pet-mani",
    petName: "Mani",
    requestId: "request-death",
  });
  assert.equal(action.petId, "pet-mani");
  assert.equal(action.kind, "pet.mark_deceased");
  assert.equal(action.status, "confirmation_required");
  assert.equal(action.confirmationPolicy, "always");
  assert.equal(action.safetyClass, "CONFIRMATION_REQUIRED");
});

test("a death report cannot manufacture an unrelated or destructive model action", () => {
  const proposals = ensureConfirmedLossAction([{
    kind: "pet.delete_permanently",
    explicitIntent: false,
    evidence: "she died",
    input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
  }], productionDeathMessage, { exclusive: true });
  assert.deepEqual(proposals.map((proposal) => proposal.kind), ["pet.mark_deceased"]);
});

test("grief continuity survives normal, resolved, urgent, and casual preceding turns", () => {
  const priorTurns = [
    { role: "user", text: "she was limping" },
    { role: "furvise", text: "Watch whether she bears weight." },
    { role: "user", text: productionDeathMessage },
    { role: "furvise", text: "I'm so sorry." },
  ];
  for (const followUp of ["so what now", "I miss her", "what happened", "summarize her history", "delete her", "keep her history"]) {
    assert.equal(resolvePetLossContext({ message: followUp, recentConversation: priorTurns, lifecycleStatus: "active" }), "continuation", followUp);
  }
  assert.equal(resolvePetLossContext({ message: "delete Mani", recentConversation: priorTurns, lifecycleStatus: "active", petName: "Mani" }), "continuation");
  assert.equal(resolvePetLossContext({ message: "so what now", recentConversation: [], lifecycleStatus: "deceased" }), "continuation");
  assert.equal(resolvePetLossContext({ message: "so what now", recentConversation: priorTurns.slice(0, 2), lifecycleStatus: "active" }), "none");
});

test("an optional lifecycle-card preparation failure preserves a truthful non-success action state", () => {
  const action = buildUnavailableConfirmedLossAction({
    message: productionDeathMessage,
    petId: "pet-mani",
    petName: "Mani",
    requestId: "request-death",
  });
  assert.equal(action.status, "failed");
  assert.equal(action.resultMessage, null);
  assert.match(action.errorMessage, /could not be prepared/i);
  assert.match(route, /actionFailureClass: "optional"/);
  assert.match(route, /if \(unavailableLossAction\) preparedApplicationActions = \[unavailableLossAction\]/);
  const answerBuild = route.indexOf("const conversationResponse = buildAskConversationResponse");
  const actionFailureCatch = route.indexOf('"application_action_preparation"');
  assert.ok(actionFailureCatch >= 0 && actionFailureCatch < answerBuild);
});

test("offer-only model text cannot collapse a valid grief response into a serialization 503", () => {
  const governed = enforceVerifiedStateClaims("If you want, I can record that she passed away.", false);
  assert.ok(governed.length > 0);
  const griefFallback = buildGriefResponseFallback("Mani");
  const response = buildAskConversationResponse({ title: "Furvise", summary: griefFallback, sections: [], safetyNote: null }, {
    applicationActions: [buildUnavailableConfirmedLossAction({ message: productionDeathMessage, petId: "pet-mani", petName: "Mani", requestId: "request" })],
    interactionMode: "grief",
    suggestedQuestions: [],
  });
  assert.ok(response);
  assert.equal(response.interactionMode, "grief");
  assert.equal(response.suggestedQuestions, undefined);
  assert.match(response.directAnswer, /separate confirmation/i);
  assert.doesNotMatch(response.directAnswer, /has been saved|was deleted|has been marked/i);
});

test("observational assessment questions receive safe checking guidance instead of an echo", () => {
  const cases = [
    ["Is she putting any weight on it, or is she holding the leg up?", "Is Mani putting any weight on it, or is Mani holding the leg up?", /non-slip surface/i],
    ["How do I tell if she's dehydrated?", "How do I tell if Mani is dehydrated?", /gums/i],
    ["How can I tell if this is swelling?", "How can I tell if this is swelling?", /compare the area/i],
    ["Is she breathing too fast?", "Is Mani breathing too fast?", /30 seconds/i],
  ];
  for (const [question, echo, expected] of cases) {
    assert.equal(isObservationalAssessmentQuestion(question), true, question);
    assert.equal(isUselessQuestionEcho(question, echo, "Mani"), true, question);
    const fallback = buildObservationAssessmentFallback(question, "Mani");
    assert.match(fallback, expected);
    assert.notEqual(fallback, echo);
  }
});

test("non-echo answers and real clarification needs are not overwritten", () => {
  const question = "Is she putting any weight on it?";
  assert.equal(isUselessQuestionEcho(question, "Watch her walk on a non-slip surface and note whether the paw supports each step.", "Mani"), false);
  assert.equal(isUselessQuestionEcho("Which leg is injured?", "Do you mean the front or back leg?", "Mani"), false);
});

test("provider completion, credits, and idempotent replay are tied to durable assistant persistence", () => {
  assert.match(route, /operationType: "ask\.submit\.persisted_answer_v2"/);
  assert.match(route, /completed response replayed before operation claim/);
  assert.match(route, /user message reused/);
  assert.match(route, /const persistedResponse = await persistAssistantAnswer/);
  assert.match(route, /finalizeAiAdmissionAfterPersistence/);
  assert.match(route, /if \(!response\.ok\)[\s\S]*failAiAdmission\([\s\S]*ASK_ANSWER_NOT_PERSISTED/);
  assert.match(route, /if \(creditReserved\) await safeReleaseAiCredit/);
  assert.match(route, /request_id: requestId/);
});

test("confirmation actions remain outside Ask credit accounting and never auto-delete a pet", () => {
  const actionRoute = readFileSync(new URL("../app/api/ask/actions/[messageId]/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(actionRoute, /reserveAiCredit|completeAiCredit|runAdmittedAiOperation|admitAiOperation/);
  assert.match(actionRoute, /decision/);
  assert.match(actionRoute, /executeFurviseApplicationAction/);
  assert.doesNotMatch(reasoning, /automatically delete/i);
});

test("a confirmed recorded death makes Vet Brief retrospective before lifecycle confirmation", () => {
  const draft = buildVetBriefDraft({
    profile: {
      id: "pet-mani", user_id: "user", name: "Mani", species: "cat", breed: null,
      age_value: 3, age_unit: "years", weight_value: null, weight_unit: null,
      current_food: null, main_concern: null, wellness_goal: null, avoid_ingredients: [],
      monthly_budget: null, lifecycle_status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-08-18T00:00:00Z",
    },
    careEntries: [{
      id: "death-event", user_id: "user", pet_profile_id: "pet-mani", category: "general",
      title: "Mani died after a dog attack", note: "Owner reported that Mani died after being bitten on the neck by a dog.",
      severity: "moderate", occurred_at: "2026-08-18T10:00:00Z", created_at: "2026-08-18T10:00:01Z", updated_at: "2026-08-18T10:00:01Z",
    }],
    memories: [],
    from: "2026-08-01",
    to: "2026-08-18",
    generatedAt: "2026-08-18T12:00:00Z",
  });
  assert.equal(draft.document.title, "Furvise Care History Summary");
  assert.equal(draft.document.reasonForVisit, "Retrospective care-history summary");
  assert.deepEqual(draft.document.questionsForVeterinarian, []);
  assert.ok(draft.sourceEntryIds.includes("death-event"));
});
