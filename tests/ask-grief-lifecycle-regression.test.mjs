import {assertPublicMutationDenied} from "./helpers/ask-public-mutation-boundary.mjs";
import {readOnlySuccessRouteFixture} from "./helpers/ask-read-only-success-route.mjs";
import {lifecycleUnitAuthority} from './helpers/lifecycle-unit-authority.mjs';
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
} from "../app/lib/ai/pending-lifecycle.ts";
import { parseStoredApplicationActions, prepareFurviseApplicationActions } from "../app/lib/application-actions/index.ts";
import { enforceVerifiedStateClaims } from "../app/lib/application-actions/state-claims.ts";
import { buildVetBriefDraft } from "../app/lib/vet-brief/builder.ts";

import { bindLifecyclePlan } from "../app/lib/furvise-brain/lifecycle-plan.ts";
import { prepareBoundLifecycleAction } from "../app/lib/application-actions/planner.ts";
import { continueLifecyclePlan, lifecyclePlanOrchestration } from "../app/lib/intelligence/lifecycle-turn.ts";
const lifecycleTurn = readFileSync(new URL("../app/lib/intelligence/lifecycle-turn.ts", import.meta.url), "utf8");
function typedLifecycle(message, { toState = "deceased", status = "active", target = "Mani", actions = [], cancel = false } = {}) {
  const pet = { id: "pet-mani", name: "Mani", user_id: "owner", lifecycle_status: status };
  const context = { owner: { userId: "owner" }, eligiblePets: [pet], currentMessage: message,
    currentTurn: { id: "source-current", role: "user", text: message },
    lifecycleActionState: { ownerId: "owner", complete: true, actions } };
  const selector=lifecycleUnitAuthority(context);
  const plan = bindLifecyclePlan({ pendingDisposition: cancel ? selector : "keep",
    transition: toState ? { targetPetName: target, toState } : null, requiredSubjectState: null,
    authorizationQuote: message }, context);
  return { context, plan, action: prepareBoundLifecycleAction(plan, "request") };
}
const productionDeathMessage = "she ran outside and a dog came and bit her neck and she died";
const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
const reasoning = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
const intelligence = readFileSync(new URL("../app/lib/intelligence/run-intelligence.ts", import.meta.url), "utf8");
const orchestrator = readFileSync(new URL("../app/lib/ai/ask-orchestrator.ts", import.meta.url), "utf8");
const actionRoute = readFileSync(new URL("../app/api/ask/actions/[messageId]/route.ts", import.meta.url), "utf8");

test("typed loss publication preserves grief and emergency presentation boundaries", async () => {
  const {action}=typedLifecycle(productionDeathMessage);
  assert.equal(action.kind,"pet.mark_deceased");
  assert.equal(action.confirmationPolicy,"always");
  assert.match(reasoning,/parsed\.responseMode = "grief_support"/);
  assert.match(reasoning,/parsed\.shoppingSuppressed = true/);
  assert.match(route,/currentLoss === "confirmed_current" \? null : detectImmediateAskEmergency\(question\)/);
  const readOnlyCore=readFileSync(new URL('../app/lib/ask-read-only/core.mjs',import.meta.url),'utf8');
 assert.match(readOnlyCore,/Medical guidance must acknowledge uncertainty, avoid diagnosis/);
  assert.match(orchestrator,/aiResult\.responseMode !== "grief_support"/);
  assert.match(orchestrator,/let suggestion = !allowsHistorySuggestions[\s\S]*\? null/);

 const f=readOnlySuccessRouteFixture({answer:"I'm sorry for your loss.",replyType:'answer'});
 try{const response=await f.send(productionDeathMessage),body=await response.json();assert.equal(response.status,200,JSON.stringify(f.state.errors));assert.equal(body.response.summary,"I'm sorry for your loss.");assert.equal(f.state.calls,2);assert.equal(f.state.reads,0);assert.deepEqual(body.response.applicationActions,[]);assert.equal(body.dataChanged,false);}finally{await f.release();}
});

test("typed loss proposals preserve uncertainty and hypothetical safety without granting mutation", () => {
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
  ]) assert.equal(typedLifecycle(report).action.kind, "pet.mark_deceased", report);

  for (const report of [
    "I think she may have died.",
    "Maybe he is dead, but I am not sure.",
    "What if she died while she was missing?",
  ]) {
    assert.notEqual(classifyCurrentPetLoss(report), "confirmed_current", report);
    assert.deepEqual(ensureConfirmedLossAction([], report), []);
    assert.equal(buildConfirmedLossCareAction({message: report, petName: "Mani"}), null);
  }

  for (const report of [
    "She is missing and I do not know where she is.",
    "Did she pass away?",
    "I thought she died, but she is alive.",
    "Actually, she is alive and doing well.",
  ]) assert.notEqual(classifyCurrentPetLoss(report), "confirmed_current", report);
});

test("typed lifecycle subjects are owned and unique; wording cannot choose another subject", () => {
  for(const message of ["The report concerns another animal.", "Please apply the correction.", "She passed away."]){
    const {action}=typedLifecycle(message);
    assert.equal(action.petId,"pet-mani");
    assert.equal(action.kind,"pet.mark_deceased");
  }
  assert.throws(()=>typedLifecycle("Please apply the change.",{target:"Foreign"}),/lifecycle_plan/);
  assert.doesNotMatch(route,/resolveProviderIndependentLossSubject/);
});

test("uncertain loss evidence never enters provider-independent lifecycle handling", () => {
  const pets = [{ id: "pet-mani", name: "Mani", species: "cat", lifecycle_status: "active" }];
  for (const message of ["I think she died", "maybe she died", "is she dead?", "what if she died?"]) {
    assert.equal(resolveProviderIndependentLossSubject({ message, pets, selectedPetId: "pet-mani" }), null, message);
  }
});

test("a lifecycle proposal cannot manufacture an extra history fact from raw wording", () => {
  const {action}=typedLifecycle(productionDeathMessage);
  assert.equal(action.kind,"pet.mark_deceased");
  assert.equal(action.input.detail,null);
  assert.equal(action.status,"confirmation_required");
  assert.doesNotMatch(intelligence,/buildConfirmedLossCareAction|confirmedLossCareAction/);
  assert.doesNotMatch(reasoning,/ensureConfirmedLossAction/);
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

test("the typed lifecycle proposal is server-bound and always requires confirmation", () => {
  const {action}=typedLifecycle(productionDeathMessage);
  assert.equal(action.petId,"pet-mani");
  assert.equal(action.kind,"pet.mark_deceased");
  assert.equal(action.status,"confirmation_required");
  assert.equal(action.confirmationPolicy,"always");
  assert.equal(action.safetyClass,"CONFIRMATION_REQUIRED");
  assert.equal(action.explicitIntent,false);
});

test("a lifecycle plan cannot manufacture unrelated or destructive model actions", async () => {
  const {action,context}=typedLifecycle(productionDeathMessage);
  assert.equal(action.kind,"pet.mark_deceased");
  assert.throws(()=>bindLifecyclePlan({pendingDisposition:"keep",transition:{targetPetName:"Mani",toState:"deleted"},
    requiredSubjectState:null,authorizationQuote:productionDeathMessage},context),/lifecycle_plan/);
  assert.doesNotMatch(route,/prepareBoundLifecycleAction|continueLifecyclePlan/);

 await assertPublicMutationDenied('Archive Cedar.','I archived Cedar.');
});

test("grief continuity is derived from persisted pending action state, not a follow-up phrase list", () => {
  const {action: pendingAction}=typedLifecycle(productionDeathMessage);
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

test("pending lifecycle state is diagnostic; only a typed plan may cancel or reassign",async()=>{
 const {action}=typedLifecycle("An earlier report.");
 const pending={...action,id:"00000000-0000-4000-8000-000000000001"};
 const {context,plan}=typedLifecycle("This is the authorized correction.",{toState:null,cancel:true,actions:[pending]});
 assert.equal(plan.pendingAction.petId,"pet-mani");
 const result=await continueLifecyclePlan({plan,context,requestId:"r",cancel:async input=>{
  assert.equal(input.capabilityId,pending.id);return {action:{...pending,status:"cancelled"}};
 }});
 assert.equal(result.kind,"cancelled");assert.equal(result.actions.length,1);
 assert.equal(result.actions[0].petId,"pet-mani");
 assert.doesNotMatch(readFileSync(new URL("../app/lib/ai/pending-lifecycle.ts",import.meta.url),"utf8"),
 /resolvePendingLifecycleTurn|resolveDurableLifecycleCorrection|requiresLivingPet/);
});

test("durable lifecycle truth alone controls whether a correction offers reactivation", () => {
 for(const status of ["active","deceased","archived"]){
  const {action,plan}=typedLifecycle("Apply the requested transition.",{toState:"active",status});
  assert.equal(plan.transition.fromState,status);assert.equal(plan.transition.toState,"active");
  if(status==="active")assert.equal(action,null);
  else { assert.equal(action.kind,"pet.mark_active");assert.equal(action.confirmationPolicy,"always"); }
 }
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
});

test("terminal and failed action states never become pending lifecycle assertions after reload", () => {
  const failed = buildUnavailableConfirmedLossAction({ message: "Mani died", petId: "pet-mani", petName: "Mani", requestId: "request-death" });
  const pets = [{ id: "pet-mani", name: "Mani", species: "cat", lifecycle_status: "active" }];
  const pending = derivePendingLifecycleAssertion({ turns: [{ role: "furvise", applicationActions: [failed] }], pets });
  assert.equal(pending, null);
  assert.equal(hasPendingReportedLifecycle([{ role: "furvise", applicationActions: [failed] }], "reported_deceased"), false);
  const afterCorrection = derivePendingLifecycleAssertion({
    turns: [
      { role: "furvise", applicationActions: [failed] },
      { role: "furvise", applicationActions: [{ ...failed, status: "cancelled" }] },
    ], pets,
  });
  assert.equal(afterCorrection, null);
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
});

test("unavailable lifecycle cancellation cannot claim success or prepare another transition", async () => {
  const {action}=typedLifecycle("The earlier report.");
  const pending={...action,id:"00000000-0000-4000-8000-000000000001"};
  const {context,plan}=typedLifecycle("Cancel that pending action.",{toState:null,cancel:true,actions:[pending]});
  const result=await continueLifecyclePlan({context,plan,requestId:"request",cancel:async()=>null});
  assert.equal(result.kind,"cancellation_unavailable");
  assert.deepEqual(result.actions,[]);
  assert.match(lifecyclePlanOrchestration(result).answer.summary,/No new lifecycle transition/);
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

test("provider completion, credits, and idempotent replay are tied to durable assistant persistence", async () => {
  assert.match(route, /operationType: "ask\.submit\.persisted_answer_v2"/);
  assert.match(route, /completed response replayed after canonical identity validation/);
  assert.match(route, /user message reused/);
  assert.match(route,/const result=await persistReadOnlyAnswer/);
  assert.match(route, /finalizeAiAdmissionAfterPersistence/);
  const { createAskAdmissionSettlement } = await import('../app/lib/ai/ask-admission-settlement.ts');
  const calls = [];
  const admission = { complete: async () => calls.push('complete'), fail: async error => calls.push(error.message) };
  const settlement = createAskAdmissionSettlement(() => {});
  for (const [status, outcome] of [[503, 'complete'], [200, 'limited'], [200, 'complete']]) {
    await settlement.finalizeAiAdmissionAfterPersistence({ admission, alreadyFinalized: false,
      requestId: 'fixture', response: new Response(null, { status }), assessment: { outcome } });
  }
  assert.deepEqual(calls, ['ASK_ANSWER_NOT_PERSISTED', 'ASK_ANSWER_LIMITED', 'complete']);
  assert.match(route,/if\s*\(creditReserved\)\s*\{[\s\S]{0,260}safeReleaseAiCredit/);
  assert.match(route, /completeAskConversationTurn\(\{[\s\S]{0,500}requestId,/);

 const f=readOnlySuccessRouteFixture({answer:'Two plus three is five.',replyType:'answer'});
 try{const response=await f.send("What's 2+3?"),body=await response.json();assert.equal(response.status,200,JSON.stringify(f.state.errors));assert.equal(body.success,true);assert.equal(f.state.calls,2);assert.equal(f.state.credit.status,'completed');assert.equal(f.state.events.filter(e=>e==='credit:complete').length,1);assert.ok(f.state.events.indexOf('assistant:terminal')<f.state.events.indexOf('credit:complete'));assert.equal(f.state.persistedAnswer.response_data.turn.finalStage,'COMPLETED');}finally{await f.release();}
});

test("public Ask cannot persist extracted death claims; private lifecycle authority remains bound", async()=>{
 assert.match(route,/runReadOnlyAsk\(/);assert.doesNotMatch(route,/continueLifecyclePlan|resolvePendingLifecycleTurn|resolveDurableLifecycleCorrection|requiresLivingPet/);
 assert.doesNotMatch(route,/await persistIntelligenceLearnings\(/);
 assert.match(lifecycleTurn,/plan.requiredSubjectState/);assert.match(lifecycleTurn,/result.action.status !== "cancelled"/);
 await assertPublicMutationDenied('Set Cedar to deceased.','I marked Cedar as deceased.');
});

test("owner-facing lifecycle copy avoids internal product terminology", () => {
  const planner = readFileSync(new URL("../app/lib/application-actions/planner.ts", import.meta.url), "utf8");
  const petLoss = readFileSync(new URL("../app/lib/ai/pet-loss.ts", import.meta.url), "utf8");
  assert.doesNotMatch(`${planner}\n${petLoss}`, /future-care experiences|active-care experiences/i);
  assert.match(buildGriefResponseFallback("Mani"), /history can stay/i);
});

test("public correction cancellation is denied while private receipts remain source bound", async () => {
  const capabilities=readFileSync(new URL("../app/lib/application-actions/capabilities.ts",import.meta.url),"utf8");
  assert.doesNotMatch(route,/cancelActionCapability/);
  assert.match(lifecycleTurn,/correctionSourceMessageId: plan.authorization.sourceMessageId/);
  assert.match(lifecycleTurn,/rebindLifecyclePlan/);
  assert.match(capabilities,/mode: "cancel"/);
  assert.match(capabilities,/p_correction_source_message_id/);
  assert.match(actionRoute,/getAuthenticatedApiContext/);assert.match(actionRoute,/status:\s*404/);assert.doesNotMatch(actionRoute,/executeActionCapability/);

 await assertPublicMutationDenied('Cancel the pending correction.','I cancelled the pending correction.');
});

test("a stellar lifecycle question stays general conversation without a pet planner or private reads", async()=>{
 const f=readOnlySuccessRouteFixture({answer:'Stars form from gas clouds, fuse lighter elements, and eventually leave remnants.',replyType:'answer'});
 try{const response=await f.send('What does the lifecycle of a star look like?'),body=await response.json();assert.equal(response.status,200,JSON.stringify(f.state.errors));assert.equal(body.success,true);assert.equal(f.state.calls,2);assert.equal(f.state.reads,0);assert.deepEqual(f.wire,f.admitted);assert.deepEqual(f.wire[0].tools.map(t=>t.name).sort(),['read_pet_profile','search_saved_records']);assert.deepEqual(body.response.applicationActions,[]);assert.equal(body.dataChanged,false);assert.ok(!JSON.stringify(f.wire).includes('ask-semantic-slots'));}finally{await f.release();}
});

test("public confirmation stays closed and private locking, service-role and confirmation guards remain", () => {
  assert.doesNotMatch(actionRoute, /reserveAiCredit|completeAiCredit|runAdmittedAiOperation|admitAiOperation/);
  assert.match(actionRoute,/getAuthenticatedApiContext/);
  assert.match(actionRoute,/status:\s*404/);
  assert.doesNotMatch(actionRoute,/executeActionCapability|\.rpc\(|\.from\(/);
  const migration = readFileSync(new URL("../supabase/migrations/20260820070956_server_authored_ask_action_capabilities.sql", import.meta.url), "utf8");
  assert.match(migration, /for update/);
  assert.match(migration, /status <> 'pending'/);
  assert.match(migration, /confirmation_policy <> 'always'/);
  assert.match(migration, /SERVICE_ROLE_REQUIRED/);
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
