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
  resolveProviderIndependentLossSubject,
  resolvePetLossContext,
} from "../app/lib/ai/pet-loss.ts";
import {
  derivePendingLifecycleAssertion,
  hasPendingReportedLifecycle,
  requiresLivingPet,
  resolveDurableLifecycleCorrection,
  resolvePendingLifecycleTurn,
} from "../app/lib/ai/pending-lifecycle.ts";
import { parseStoredApplicationActions, prepareFurviseApplicationActions } from "../app/lib/application-actions/index.ts";
import { enforceVerifiedStateClaims } from "../app/lib/application-actions/state-claims.ts";
import { buildVetBriefDraft } from "../app/lib/vet-brief/builder.ts";

const productionDeathMessage = "she ran outside and a dog came and bit her neck and she died";
const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
const reasoning = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
const intelligence = readFileSync(new URL("../app/lib/intelligence/run-intelligence.ts", import.meta.url), "utf8");
const orchestrator = readFileSync(new URL("../app/lib/ai/ask-orchestrator.ts", import.meta.url), "utf8");
const actionRoute = readFileSync(new URL("../app/api/ask/actions/[messageId]/route.ts", import.meta.url), "utf8");
const askPage = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");

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
    "Rocky passd away peacefully.",
    "She passed on today.",
    "The veterinarian euthanized Maple today.",
    "The veterinarian euthanised Maple today.",
    "We put her to sleep today.",
    "She didn't make it.",
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

test("provider-independent loss subject resolution is strict for names, species, pronouns, and outside animals", () => {
  const mani = { id: "pet-mani", name: "Mani", species: "cat", lifecycle_status: "active" };
  const coco = { id: "pet-coco", name: "Coco", species: "cat", lifecycle_status: "active" };
  const rex = { id: "pet-rex", name: "Rex", species: "dog", lifecycle_status: "active" };

  assert.deepEqual(resolveProviderIndependentLossSubject({ message: "my cat passed away", pets: [mani], selectedPetId: mani.id }), {
    kind: "resolved", petId: mani.id, petName: "Mani", lifecycleStatus: "active",
  });
  assert.deepEqual(resolveProviderIndependentLossSubject({ message: "Coco died", pets: [mani, coco], selectedPetId: mani.id }), {
    kind: "resolved", petId: coco.id, petName: "Coco", lifecycleStatus: "active",
  });
  assert.deepEqual(resolveProviderIndependentLossSubject({ message: "I meant Coco died, not Mani", pets: [mani, coco], selectedPetId: mani.id }), {
    kind: "resolved", petId: coco.id, petName: "Coco", lifecycleStatus: "active",
  });
  assert.equal(resolveProviderIndependentLossSubject({ message: "my cat died", pets: [mani, coco, rex], selectedPetId: mani.id }).kind, "clarification");
  assert.deepEqual(resolveProviderIndependentLossSubject({ message: "my other cat died", pets: [mani, coco, rex], selectedPetId: mani.id }), {
    kind: "resolved", petId: coco.id, petName: "Coco", lifecycleStatus: "active",
  });
  assert.deepEqual(resolveProviderIndependentLossSubject({ message: "she died today", pets: [mani], selectedPetId: mani.id }), {
    kind: "resolved", petId: mani.id, petName: "Mani", lifecycleStatus: "active",
  });
  assert.equal(resolveProviderIndependentLossSubject({ message: "she died today", pets: [mani, coco], selectedPetId: mani.id }).kind, "clarification");
  assert.deepEqual(resolveProviderIndependentLossSubject({
    message: "she died today", pets: [mani, coco], selectedPetId: mani.id,
    recentConversation: [{ role: "user", text: "Mani has been sleeping more" }],
  }), { kind: "resolved", petId: mani.id, petName: "Mani", lifecycleStatus: "active" });
  assert.equal(resolveProviderIndependentLossSubject({ message: "the stray cat died", pets: [mani], selectedPetId: mani.id }).kind, "external_subject");
});

test("uncertain loss evidence never enters provider-independent lifecycle handling", () => {
  const pets = [{ id: "pet-mani", name: "Mani", species: "cat", lifecycle_status: "active" }];
  for (const message of ["I think she died", "maybe she died", "is she dead?", "what if she died?"]) {
    assert.equal(resolveProviderIndependentLossSubject({ message, pets, selectedPetId: "pet-mani" }), null, message);
  }
});

test("a confirmed death builds one standalone history event for post-confirmation persistence", () => {
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

test("grief continuity is derived from persisted pending action state, not a follow-up phrase list", () => {
  const [pendingAction] = prepareFurviseApplicationActions({
    proposals: ensureConfirmedLossAction([], productionDeathMessage), petId: "pet-mani", petName: "Mani", requestId: "request-death",
  });
  const priorTurns = [
    { role: "user", text: "she was limping" },
    { role: "furvise", text: "Watch whether she bears weight." },
    { role: "user", text: productionDeathMessage },
    { role: "furvise", text: "I'm so sorry.", applicationActions: [{ ...pendingAction, sourceMessageId: "source-death" }] },
  ];
  for (const followUp of ["so what now", "I miss her", "what happened", "summarize her history", "keep her history", "tell me about our best day"]) {
    assert.equal(resolvePetLossContext({ message: followUp, recentConversation: priorTurns, lifecycleStatus: "active" }), "continuation", followUp);
  }
  assert.equal(resolvePetLossContext({ message: "so what now", recentConversation: [], lifecycleStatus: "deceased" }), "continuation");
  assert.equal(resolvePetLossContext({ message: "so what now", recentConversation: priorTurns.slice(0, 2), lifecycleStatus: "active" }), "none");
  assert.equal(hasPendingReportedLifecycle(priorTurns, "reported_deceased"), true);
});

test("pending death state catches living-care contradictions and explicit corrections deterministically", () => {
  const [action] = prepareFurviseApplicationActions({
    proposals: ensureConfirmedLossAction([], "Mani died"), petId: "pet-mani", petName: "Mani", requestId: "request-death",
  });
  const pets = [
    { id: "pet-mani", name: "Mani", species: "cat", lifecycle_status: "active" },
    { id: "pet-coco", name: "Coco", species: "cat", lifecycle_status: "active" },
  ];
  const assertion = derivePendingLifecycleAssertion({ turns: [{ role: "furvise", applicationActions: [{ ...action, sourceMessageId: "source-death" }] }], pets });
  assert.ok(assertion);
  for (const message of ["What should I feed my cat?", "Should I walk her?", "What toy should I buy her?", "She is playing now."]) {
    assert.equal(resolvePendingLifecycleTurn({ assertion, message, pets }).kind, "contradiction", message);
    assert.equal(requiresLivingPet(message), true, message);
  }
  for (const message of ["I was joking, she's alive.", "I made a mistake.", "She didn't die."]) {
    assert.equal(resolvePendingLifecycleTurn({ assertion, message, pets }).kind, "correction", message);
    assert.equal(resolveDurableLifecycleCorrection({ message, status: "active" }), null, message);
  }
  assert.deepEqual(resolvePendingLifecycleTurn({ assertion, message: "I meant Coco died, not Mani.", pets }), {
    kind: "reassigned_death", petId: "pet-coco", petName: "Coco",
  });
  assert.deepEqual(resolvePendingLifecycleTurn({ assertion, message: "I meant my other cat.", pets }), {
    kind: "alternate_pet", petId: "pet-coco", petName: "Coco",
  });
});

test("durable lifecycle truth alone controls whether a correction offers reactivation", () => {
  for (const message of ["I was joking, she's alive.", "I made a mistake.", "She didn't die."]) {
    assert.equal(resolveDurableLifecycleCorrection({ message, status: "active" }), null, message);
    assert.deepEqual(resolveDurableLifecycleCorrection({ message, status: "deceased" }), {
      kind: "reactivate", fromStatus: "deceased",
    }, message);
  }
  assert.deepEqual(resolveDurableLifecycleCorrection({ message: "I was wrong; keep the profile active.", status: "archived" }), {
    kind: "reactivate", fromStatus: "archived",
  });
  assert.equal(resolveDurableLifecycleCorrection({ message: "She is alive.", status: "archived" }), null);

  const activeProposal = prepareFurviseApplicationActions({
    proposals: [{
      kind: "pet.mark_active", explicitIntent: true, evidence: "I was joking, she is alive.",
      input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
    }],
    petId: "pet-mani", petName: "Mani", requestId: "request-correction", lifecycleStatus: "active",
  });
  assert.deepEqual(activeProposal, []);
  assert.equal(prepareFurviseApplicationActions({
    proposals: [{
      kind: "pet.mark_active", explicitIntent: true, evidence: "I was joking, she is alive.",
      input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
    }],
    petId: "pet-mani", petName: "Mani", requestId: "request-correction", lifecycleStatus: "deceased",
  })[0].kind, "pet.mark_active");
});

test("stored lifecycle action identity remains canonical and malformed machine IDs fail closed", () => {
  const [action] = prepareFurviseApplicationActions({
    proposals: ensureConfirmedLossAction([], "Mani died"), petId: "pet-mani", petName: "Mani", requestId: "request-death",
  });
  const response = buildAskConversationResponse({ title: "I'm sorry", summary: "Nothing has changed yet.", sections: [], safetyNote: null }, {
    applicationActions: [{ ...action, sourceMessageId: "source-death" }], interactionMode: "grief", suggestedQuestions: [],
  });
  assert.equal(response.applicationActions[0].kind, "pet.mark_deceased");
  const [legacy] = parseStoredApplicationActions([{ ...action, kind: "pet.markdeceased", sourceMessageId: "source-death" }]);
  assert.equal(legacy, undefined);
  assert.equal(derivePendingLifecycleAssertion({
    turns: [{ role: "furvise", applicationActions: [] }],
    pets: [{ id: "pet-mani", name: "Mani", lifecycle_status: "active" }],
  }), null);
});

test("the exact two-turn production reproduction becomes a persisted pending assertion and deterministic contradiction", () => {
  const pets = [{ id: "pet-mani", name: "Mani", species: "cat", lifecycle_status: "active" }];
  const [prepared] = prepareFurviseApplicationActions({
    proposals: ensureConfirmedLossAction([], "my cat died"),
    petId: "pet-mani",
    petName: "Mani",
    requestId: "025fc45a-0ca1-4237-b210-78619a8acc7e",
  });
  const persisted = parseStoredApplicationActions([{ ...prepared, sourceMessageId: "death-user-message" }]);
  const assertion = derivePendingLifecycleAssertion({
    turns: [
      { role: "user", text: "my cat died" },
      { role: "furvise", applicationActions: persisted },
    ],
    pets,
  });
  assert.equal(assertion.petId, "pet-mani");
  assert.equal(assertion.sourceMessageId, "death-user-message");
  assert.equal(assertion.action.status, "confirmation_required");
  assert.equal(resolvePendingLifecycleTurn({ assertion, message: "so what should i feed my cat", pets }).kind, "contradiction");
});

test("terminal action receipts clear pending state while failed preparation remains retryable after reload", () => {
  const failed = buildUnavailableConfirmedLossAction({ message: "Mani died", petId: "pet-mani", petName: "Mani", requestId: "request-death" });
  const pets = [{ id: "pet-mani", name: "Mani", species: "cat", lifecycle_status: "active" }];
  const pending = derivePendingLifecycleAssertion({ turns: [{ role: "furvise", applicationActions: [failed] }], pets });
  assert.equal(pending.action.status, "confirmation_required");
  assert.equal(pending.phase, "pending_confirmation");
  const afterCorrection = derivePendingLifecycleAssertion({
    turns: [
      { role: "furvise", applicationActions: [failed] },
      { role: "furvise", applicationActions: [{ ...failed, status: "cancelled" }] },
    ], pets,
  });
  assert.equal(afterCorrection, null);
  assert.equal(requiresLivingPet("What should I feed my cat?"), true);
});

test("pending archive assertions use the same persisted state model without death semantics", () => {
  const pets = [{ id: "pet-mani", name: "Mani", species: "cat", lifecycle_status: "active" }];
  const [archiveAction] = prepareFurviseApplicationActions({
    proposals: [{
      kind: "pet.archive",
      input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
      evidence: "Please archive Mani's profile.",
      explicitIntent: true,
    }],
    petId: "pet-mani",
    petName: "Mani",
    requestId: "request-archive",
  });
  const assertion = derivePendingLifecycleAssertion({
    turns: [{ role: "furvise", applicationActions: [{ ...archiveAction, sourceMessageId: "source-archive" }] }],
    pets,
  });
  assert.equal(assertion.kind, "reported_archived");
  assert.equal(resolvePendingLifecycleTurn({ assertion, message: "Actually, keep the profile active.", pets }).kind, "correction");
  assert.equal(resolvePendingLifecycleTurn({ assertion, message: "She is alive.", pets }).kind, "continuation");
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
  assert.match(route, /if \(unavailableLossAction\) preparedApplicationActions = \[\{ \.\.\.unavailableLossAction, sourceMessageId: preparedRequest\.userMessageId \}\]/);
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
  assert.match(route, /completed response replayed after canonical identity validation/);
  assert.match(route, /user message reused/);
  assert.match(route, /const persistedResponse = await persistAssistantAnswer/);
  assert.match(route, /finalizeAiAdmissionAfterPersistence/);
  assert.match(route, /if \(!response\.ok\)[\s\S]*failAiAdmission\([\s\S]*ASK_ANSWER_NOT_PERSISTED/);
  assert.match(route, /if \(creditReserved\) \{[\s\S]{0,260}safeReleaseAiCredit/);
  assert.match(route, /request_id: requestId/);
});

test("pending lifecycle deterministic paths run before provider admission and defer all death persistence", () => {
  const pendingBranch = route.indexOf("pendingLifecycleResolution.kind !== \"continuation\"");
  const rateAdmission = route.indexOf("requireRateLimitedRequest", pendingBranch);
  const providerAdmission = route.indexOf("admitAiOperation", pendingBranch);
  assert.ok(pendingBranch > 0 && pendingBranch < rateAdmission && pendingBranch < providerAdmission);
  assert.match(route, /deferHighImpactLifecyclePersistence = classifyCurrentPetLoss\(question\) === "confirmed_current"[\s\S]*pendingLifecycle\?\.kind === "reported_deceased"/);
  assert.match(route, /if \(!deferHighImpactLifecyclePersistence && intelligenceResult/);
  assert.match(route, /if \(!deferHighImpactLifecyclePersistence && phase3Runtime\)[\s\S]*persistAskV2Phase3LowRisk/);
  assert.match(route, /deterministicApplicationActions = \[pendingLifecycle\.action\]/);
  assert.match(route, /cancelledPendingLifecycleAction\(pendingLifecycle\.action\)/);
  assert.match(route, /resultMessage: "The unconfirmed lifecycle report was cleared\. The saved profile was not changed\."/);
  assert.match(route, /resolveDurableLifecycleCorrection\(\{/);
  assert.match(route, /lifecycleStatus: durableLifecycleStatus/);
  assert.doesNotMatch(route, /cancelPendingLifecycleActionReceipts/);
  assert.match(route, /durableLifecycleStatus !== "active" && requiresLivingPet\(question\)/);
  assert.match(route, /buildDurableLifecycleContradictionOrchestration/);
  const correctionStart = route.indexOf('pendingLifecycleResolution.kind === "correction"');
  const correctionEnd = route.indexOf('pendingLifecycleResolution.kind === "reassigned_death"', correctionStart);
  const correctionBranch = route.slice(correctionStart, correctionEnd);
  assert.match(correctionBranch, /cancelledPendingLifecycleAction/);
  assert.doesNotMatch(correctionBranch, /pet\.mark_active|executeFurviseApplicationAction|persistIntelligenceLearnings/);
  assert.doesNotMatch(readFileSync(new URL("../app/lib/ai/pet-loss.ts", import.meta.url), "utf8"), /lossContinuationPattern/);
});

test("owner-facing lifecycle copy avoids internal product terminology", () => {
  const planner = readFileSync(new URL("../app/lib/application-actions/planner.ts", import.meta.url), "utf8");
  const petLoss = readFileSync(new URL("../app/lib/ai/pet-loss.ts", import.meta.url), "utf8");
  assert.doesNotMatch(`${planner}\n${petLoss}`, /future-care experiences|active-care experiences/i);
  assert.match(buildGriefResponseFallback("Mani"), /history can stay/i);
});

test("correction cancellation survives reload and stale confirmation cannot execute", () => {
  assert.match(askPage, /return reconcileThreadApplicationActions\(messages\)/);
  assert.match(askPage, /terminal\.set\(action\.id, action\)/);
  assert.match(askPage, /terminal\.get\(action\.id\) \|\| action/);
  assert.match(actionRoute, /hasLaterDeathCorrection/);
  assert.match(actionRoute, /if \(superseded\.value\) return Response\.json\(\{ error: "That reported loss was corrected later in this conversation\." \}, \{ status: 409 \}\)/);
  assert.match(actionRoute, /target\?\.lifecycle_status \|\| "active"\) === "active"/);
  assert.match(actionRoute, /target\.lifecycle_status === "deceased" \|\| target\.lifecycle_status === "archived"/);
});

test("confirmed loss is persisted through a zero-provider, zero-credit branch before every AI gate", () => {
  const lossBranch = route.indexOf('else if (currentLoss === "confirmed_current")');
  const durableBranch = route.indexOf("else if (durableLifecycleResolution)", lossBranch);
  const providerBranch = route.indexOf("phase3Runtime = await runOptionalAskSubsystem", durableBranch);
  const lossSlice = route.slice(lossBranch, durableBranch);
  assert.ok(lossBranch > 0 && durableBranch > lossBranch && providerBranch > durableBranch);
  for (const forbidden of ["requireRateLimitedRequest", "admitAiOperation", "reserveAiCredit", "extractTurnSubjectFrame", "runFurviseIntelligence"]) {
    assert.doesNotMatch(lossSlice, new RegExp(forbidden), forbidden);
  }
  assert.match(lossSlice, /resolveProviderIndependentLossSubject/);
  assert.match(lossSlice, /buildConfirmedLossOrchestration/);
  assert.match(lossSlice, /ensureConfirmedLossAction/);
  assert.match(lossSlice, /sourceMessageId: preparedRequest\.userMessageId/);
  assert.match(lossSlice, /deferHighImpactLifecyclePersistence = true/);
  assert.match(route, /handledWithoutAi: orchestration\.handledWithoutAi/);
  assert.match(route, /if \(creditReserved\)[\s\S]*completeAiCredit/);
});

test("confirmation actions remain outside Ask credit accounting and never auto-delete a pet", () => {
  assert.doesNotMatch(actionRoute, /reserveAiCredit|completeAiCredit|runAdmittedAiOperation|admitAiOperation/);
  assert.match(actionRoute, /decision/);
  assert.match(actionRoute, /executeFurviseApplicationAction/);
  assert.match(actionRoute, /action\.sourceMessageId/);
  assert.match(actionRoute, /conversation\.pet_profile_id/);
  assert.match(actionRoute, /dog_profiles[\s\S]*resolveProviderIndependentLossSubject/);
  assert.match(actionRoute, /subject\.petId === action\.petId/);
  assert.match(actionRoute, /action\.input\.target === expectedTarget/);
  assert.match(actionRoute, /isAuthoritativeLifecycleAction/);
  assert.match(actionRoute, /classifyCurrentPetLoss\(sourceText\) === "confirmed_current"/);
  assert.match(actionRoute, /action\.safetyClass !== policy\.safetyClass/);
  assert.match(actionRoute, /normalizeEvidence\(sourceText\)\.includes\(normalizeEvidence\(action\.evidence\)\)/);
  assert.match(actionRoute, /hasLaterDeathCorrection/);
  assert.match(actionRoute, /findTerminalActionStateAcrossConversation/);
  assert.match(actionRoute, /persistActionStateAcrossConversation/);
  assert.match(actionRoute, /candidate\.id === input\.action\.id \? input\.action : candidate/);
  assert.doesNotMatch(reasoning, /automatically delete/i);
});

test("a confirmed lifecycle state makes Vet Brief retrospective after confirmation", () => {
  const draft = buildVetBriefDraft({
    profile: {
      id: "pet-mani", user_id: "user", name: "Mani", species: "cat", breed: null,
      age_value: 3, age_unit: "years", weight_value: null, weight_unit: null,
      current_food: null, main_concern: null, wellness_goal: null, avoid_ingredients: [],
      monthly_budget: null, lifecycle_status: "deceased", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-08-18T00:00:00Z",
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
