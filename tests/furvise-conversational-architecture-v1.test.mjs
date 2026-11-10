import {readOnlySuccessRouteFixture as readOnlyRouteFixture} from "./helpers/ask-read-only-success-route.mjs";
import {POST as publicConfirmation,request as actionRequest,messageId as publicMessageId} from "./helpers/ask-read-only-action-routes.mjs";
import { fieldMutationActionMatches } from "../app/lib/furvise-brain/field-mutation-job.ts";
import { authorizeFurviseActionExecution } from "../app/lib/furvise-brain/action-organ.ts";
import assert from "node:assert/strict";
import { bindFieldMutationJob } from "../app/lib/furvise-brain/field-mutation-job.ts";
import { prepareBoundFieldMutationAction } from "../app/lib/application-actions/planner.ts";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAskConversationResponse, parseAskConversationResponse } from "../app/lib/ask.mjs";
import {
  FURVISE_ACTION_KINDS,
  containsUnverifiedStateClaim,
  enforceVerifiedStateClaims,
  getFurviseActionPolicy,
  getFurviseMemoryDefinition,
  parseModelApplicationActions,
  prepareFurviseApplicationActions,
  shouldAutoExecuteAction,
} from "../app/lib/application-actions/index.ts";
import { getAskPresentationMode, shouldShowSuggestedQuestions } from "../app/lib/ask-experience.ts";
import { orchestrateAskTurn } from "../app/lib/ai/ask-orchestrator.ts";
import { buildVetBriefDraft } from "../app/lib/vet-brief/builder.ts";

function boundOwnerAction(valueQuote, instructionQuote) {
  const job = bindFieldMutationJob({domain:"owner_preference",operation:"set_field",petName:null,
    field:"preferred_language",valueQuote,instructionQuote},
    {id:"message-user",role:"user",text:instructionQuote,createdAt:"2026-09-23T00:00:00Z"},[],"user-1");
  return prepareBoundFieldMutationAction(job,"Mani","request","pet-mani");
}
function boundProfileAction(petId, petName, valueQuote) {
  const text = "Set " + valueQuote + " as requested.";
  const job = bindFieldMutationJob({domain:"pet_profile",operation:"set_field",petName,field:"weight",instructionQuote:text,valueQuote},
    {id:"message-user",role:"user",text,createdAt:"2026-09-23T00:00:00Z"},
    [{id:petId,name:petName,user_id:"user-1"}],"user-1");
  return prepareBoundFieldMutationAction(job,petName,"request");
}
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const askRoute = read("app/api/ask/route.ts");
const actionRoute = read("app/api/ask/actions/[messageId]/route.ts");
const askPage = read("app/ask/page.tsx");
const reasoning = read("app/lib/ai/ask-reasoning.ts");

test("the typed action registry covers application domains with server-owned safety policy", () => {
  for (const kind of [
    "pet.read", "pet.update_profile", "pet.mark_deceased", "pet.mark_active", "pet.archive", "pet.delete_permanently",
    "memory.list", "memory.set_preference", "memory.forget_preference", "memory.edit_detail",
    "care_history.add", "care_history.edit", "care_history.remove", "care_history.query",
    "care_state.resolve", "care_state.reopen", "vet_brief.prepare", "navigation.open_pet_profile",
  ]) assert.ok(FURVISE_ACTION_KINDS.includes(kind), kind);
  assert.equal(getFurviseActionPolicy("navigation.open_pet_profile").safetyClass, "READ_ONLY");
  assert.equal(getFurviseActionPolicy("memory.set_preference").safetyClass, "LOW_RISK_REVERSIBLE");
  assert.equal(getFurviseActionPolicy("pet.mark_deceased").confirmationPolicy, "always");
  assert.equal(getFurviseActionPolicy("pet.delete_permanently").safetyClass, "DESTRUCTIVE");
});

test("model actions require grounded evidence and are rebound to the server-selected pet", () => {
  const source = "Change Mani's weight to 4.2 kg.";
  const proposals = parseModelApplicationActions([{
    kind: "pet.update_profile", explicitIntent: true, evidence: "Change Mani's weight to 4.2 kg",
    input: { field: "weight", value: "4.2 kg", title: null, detail: null, category: null, target: "selected" },
  }, {
    kind: "pet.delete_permanently", explicitIntent: true, evidence: "delete her",
    input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
  }], source);
  assert.equal(proposals.length, 1);
  const [action] = prepareFurviseApplicationActions({ proposals, petId: "pet-mani", petName: "Mani", requestId: "request-1", sourceMessage: source });
  assert.equal(action, undefined, "grounded model prose cannot create profile mutation authority");
  const canonical = boundProfileAction("pet-mani", "Mani", "4.2 kg");
  assert.equal(canonical.petId, "pet-mani");
  assert.equal(canonical.authorizationScope, "owned_pet");
  assert.equal(canonical.safetyClass, "LOW_RISK_REVERSIBLE");
  assert.equal(shouldAutoExecuteAction(canonical), false);
});

test("a model cannot manufacture explicit owner intent to auto-execute a mutation", () => {
  const [action] = prepareFurviseApplicationActions({
    petId: "pet-mani", petName: "Mani", requestId: "request-untrusted-intent",
    sourceMessage: "Mani weighs 4.2 kg",
    proposals: [{
      kind: "pet.update_profile", explicitIntent: true, evidence: "Mani weighs 4.2 kg",
      input: { field: "weight", value: "4.2 kg", title: null, detail: null, category: null, target: "selected" },
    }],
  });
  assert.equal(action, undefined);
});

test("uncertain death cannot produce a lifecycle mutation while confirmed death requires confirmation", () => {
  const input = (evidence, explicitIntent = true) => ({
    kind: "pet.mark_deceased", explicitIntent, evidence,
    input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
  });
  assert.equal(prepareFurviseApplicationActions({ proposals: [input("I think she may have died")], petId: "pet", petName: "Mani", requestId: "r" }).length, 0);
  const [confirmed] = prepareFurviseApplicationActions({ proposals: [input("Mani died today")], petId: "pet", petName: "Mani", requestId: "r" });
  assert.equal(confirmed.status, "confirmation_required");
  assert.equal(confirmed.confirmationPolicy, "always");
  assert.equal(confirmed.kind, "pet.mark_deceased");
});

test("authoritative mutation claims are removed unless an executor verified success", async t => {
  for (const claim of [
    "I saved that to her history.",
    "Okay, I'll treat the Hindi one as removed and keep English only.",
    "Her profile has been updated.",
  ]) {
    assert.equal(containsUnverifiedStateClaim(claim), true, claim);
    assert.equal(containsUnverifiedStateClaim(enforceVerifiedStateClaims(claim, false)), false, claim);
  }
  assert.equal(enforceVerifiedStateClaims("Her profile has been updated.", true), "Her profile has been updated.");
  assert.equal(enforceVerifiedStateClaims("That's the relevant part. If you want, I can help make a checklist.", false), "That's the relevant part.");
  assert.match(askRoute, /runReadOnlyAsk/);
  assert.doesNotMatch(askRoute, /executeActionCapability|executeFurviseApplicationAction/);
  t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",()=>{});
  const f=readOnlyRouteFixture({answer:"I deleted the note. The Moon is rocky.",replyType:"answer"});
  try{
    const response=await f.send("Delete the note and tell me one fact about the Moon."),body=await response.json();
    assert.equal(response.status,200,JSON.stringify(f.state.errors));assert.match(body.answer,/can’t make changes/);assert.match(body.answer,/Moon is rocky/);
    assert.doesNotMatch(body.answer,/I deleted the note/);assert.deepEqual(body.response.applicationActions,[]);
    assert.equal(body.dataChanged,false);assert.equal(body.turn.actionCount,0);assert.equal(body.creditsUsed,0);
    assert.equal(f.state.reads,0);assert.equal(f.state.calls,2);assert.deepEqual(f.admitted,f.wire);
    assert.equal(f.state.credit.status,"released");assert.ok(f.state.events.indexOf("assistant:terminal")<f.state.events.indexOf("credit:release"));
  }finally{await f.release();}
});

test("USER singleton memory is distinct from PET and ephemeral CONVERSATION state", () => {
  assert.deepEqual(getFurviseMemoryDefinition("preferred_language"), { scope: "USER", cardinality: "singleton", durable: true });
  assert.deepEqual(getFurviseMemoryDefinition("food_sensitivity"), { scope: "PET", cardinality: "multiple", durable: true });
  assert.deepEqual(getFurviseMemoryDefinition("current_turn_reference"), { scope: "CONVERSATION", cardinality: "multiple", durable: false });
  assert.match(reasoning, /singleton USER communication preferences/);
  assert.match(reasoning, /A newer singleton value replaces the older value/);
});

test("language replacement binds one owner field without a legacy memory executor",()=>{
 const action=boundOwnerAction("English","Forget Hindi and keep English");
 assert.equal(action.fieldMutationJob.domain,"owner_preference");
 assert.equal(action.fieldMutationJob.operation,"set_field");
 assert.equal(action.input.field,"preferred_language");assert.equal(action.input.value,"English");
 assert.equal(action.status,"proposed");assert.equal(action.resultMessage,null);
 assert.equal(fieldMutationActionMatches(action.fieldMutationJob,action,"user-1"),true);
 assert.throws(()=>authorizeFurviseActionExecution({action,capabilityId:"cap",mode:"auto"}),/AUTO_NOT_AUTHORIZED/);
});

test("unavailable durable preferences cannot claim success through another executor",()=>{
 const action=boundOwnerAction("French","Switch to French");
 assert.equal(action.resultMessage,null);
 assert.doesNotMatch(read("app/lib/application-actions/index.ts"),/executor\.ts/);
 const sql=read("supabase/migrations/20260923072555_preserve_canonical_replace_body_fidelity.sql");
 assert.doesNotMatch(sql,/v\.action_kind\s*(?:=|in)[^\n]*memory\.(?:set|forget)_preference/);
 assert.match(sql,/Unsupported mutation kinds never fall back/);
 assert.match(sql,/v_error := 'That action is not available yet\.'/);
});

test("application actions round-trip in the canonical Ask response", () => {
  const [action] = prepareFurviseApplicationActions({
    petId: "pet-mani", petName: "Mani", requestId: "request-nav",
    proposals: [{
      kind: "navigation.open_pet_profile", explicitIntent: true, evidence: "Take me to her profile",
      input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
    }],
  });
  const response = buildAskConversationResponse({ title: "Furvise", summary: "Here you go.", sections: [], safetyNote: null }, { applicationActions: [action] });
  const parsed = parseAskConversationResponse(response);
  assert.equal(parsed.applicationActions[0].kind, "navigation.open_pet_profile");
  assert.equal(parsed.applicationActions[0].href, "/pets/pet-mani");
  assert.equal(parsed.applicationActions[0].status, "proposed");
});

test("public confirmation remains unavailable after authentication without provider or database execution", async () => {
  const prior=globalThis.__readOnlyMutationAuth;let io=0;
  const db=new Proxy({}, {get(){io++;throw Error("disabled public confirmation cannot execute database IO");}});
  try{
    globalThis.__readOnlyMutationAuth={response:new Response(null,{status:401})};
    assert.equal((await publicConfirmation(actionRequest(),{params:Promise.resolve({messageId:publicMessageId})})).status,401);
    globalThis.__readOnlyMutationAuth={userId:"owned-user",supabase:db};
    for(const payload of [{actionId:publicMessageId,decision:"confirm"},{actionId:publicMessageId,decision:"cancel"},{actionId:publicMessageId,decision:"confirm",ownerId:"foreign",petId:"foreign",kind:"pet.delete_permanently"}]){
      const response=await publicConfirmation(actionRequest("POST",payload),{params:Promise.resolve({messageId:publicMessageId})});
      assert.equal(response.status,404);assert.match(response.headers.get("Cache-Control"),/private.*no-store/);
    }
    assert.equal(io,0);assert.doesNotMatch(actionRoute,/OPENAI|runAdmittedAiOperation|reserveAiCredit|completeAiCredit/);
  }finally{if(prior===undefined)delete globalThis.__readOnlyMutationAuth;else globalThis.__readOnlyMutationAuth=prior;}
});

test("canonical profile authority rejects a foreign owner and a substituted pet",()=>{
 const action=boundProfileAction("pet-other","Other","4.2 kg");
 assert.throws(()=>bindFieldMutationJob({domain:"pet_profile",operation:"set_field",petName:"Other",
  field:"weight",instructionQuote:"Set 4.2 kg as requested.",valueQuote:"4.2 kg"},
  {id:"message-user",role:"user",text:"Set 4.2 kg as requested.",createdAt:"2026-09-23T00:00:00Z"},
  [{id:"pet-other",name:"Other",user_id:"user-1"}],"foreign"),/ASK_REQUEST_INVALID/);
 assert.equal(fieldMutationActionMatches(action.fieldMutationJob,{...action,petId:"pet-mani"},"user-1"),false);
 assert.equal(action.resultMessage,null);
});

test("confirmation-required and destructive actions cannot execute before confirmation", async () => {
  for (const kind of ["pet.mark_deceased", "pet.archive"]) {
    const [action] = prepareFurviseApplicationActions({
      petId: "pet-mani", petName: "Mani", requestId: `request-${kind}`,
      proposals: [{
        kind, explicitIntent: true, evidence: kind === "pet.mark_deceased" ? "Mani died today" : kind === "pet.archive" ? "Archive Mani" : "Delete Mani",
        input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
      }],
    });
    assert.throws(()=>authorizeFurviseActionExecution({action,capabilityId:"cap",mode:"auto"}),/CONFIRMATION|AUTO_NOT_AUTHORIZED/);
    assert.equal(action.status,"confirmation_required",kind);
    assert.equal(action.resultMessage,null);
  }
});

test("permanent deletion needs a canonical REMOVE job and still cannot auto-execute",async()=>{
 const {fixture,id}=await import('./helpers/canonical-replace.mjs');
 const {validateAskRequest}=await import('../app/lib/intelligence/ask-request-contract.ts');
 const {resolveRemovePlan}=await import('../app/lib/furvise-brain/remove-job.ts');
 const {prepareBoundRemoveAction}=await import('../app/lib/application-actions/planner.ts');
 const f=fixture();f.pet.updated_at='2026-09-22T00:00:00Z';
 Object.assign(f.request,{writeJob:null,removeJob:{operation:'remove',domain:'pet_profile',target:'subject_profile',petName:f.pet.name,instructionQuote:f.source.text.trim()},selection:'summary',mutationIntent:null,requirements:[],frame:null});
 const job=validateAskRequest(f.request,f.context).request.removeJob;
 const action=prepareBoundRemoveAction(await resolveRemovePlan(job,f.db,id(1)),'request');
 assert.deepEqual(prepareFurviseApplicationActions({petId:f.pet.id,petName:f.pet.name,requestId:'r',sourceMessage:f.source.text,proposals:[{kind:'pet.delete_permanently',explicitIntent:true,evidence:f.source.text,input:{target:'selected'}}]}),[]);
 assert.equal(action.kind,'pet.delete_permanently');assert.equal(action.status,'confirmation_required');
 assert.equal(action.confirmationPolicy,'always');assert.equal(action.safetyClass,'DESTRUCTIVE');assert.equal(action.resultMessage,null);
 assert.throws(()=>authorizeFurviseActionExecution({action,capabilityId:'cap',mode:'auto'}),/CONFIRMATION|AUTO_NOT_AUTHORIZED/);
});

test("stale acknowledgement titles do not inherit legacy urgent presentation", async () => {
  const routine = concern({ severity: "routine", status: "monitoring" });
  const routineResult = await orchestrateAskTurn({ concerns: [routine], message: "ok", petName: "Mani", generate: async () => { throw new Error("should not generate"); } });
  assert.equal(routineResult.safetyLevel, "normal");
  assert.equal(routineResult.answer.title, "Furvise");
  assert.doesNotMatch(routineResult.answer.title, /Urgent care guidance/);

  const urgent = concern({ severity: "urgent", status: "active", normalized_key: "breathing", title: "Breathing trouble" });
  const urgentResult = await orchestrateAskTurn({ concerns: [urgent], message: "thanks", petName: "Mani", generate: async () => { throw new Error("should not generate"); } });
  assert.equal(urgentResult.safetyLevel, "urgent");
  assert.match(urgentResult.answer.title, /breathing still needs urgent attention/i);
});

test("grief is a distinct non-playful mode and suppresses generic suggestions", () => {
  const grief = { answerType: "direct_answer", sections: [], safetyNote: null, urgency: "routine", interactionMode: "grief" };
  assert.equal(getAskPresentationMode(grief, "so what now"), "grief");
  assert.equal(shouldShowSuggestedQuestions(grief, "so what now"), false);
  assert.match(reasoning, /responseMode=grief_support/);
  assert.match(askPage, /data-ui="furvise-assistant-identity"><BrandMark showName=\{false\} size=\{24\}/);
  assert.doesNotMatch(askPage, /nav-ask-v1\.webp/);
  assert.match(askPage, /messageVariant === "GRIEF" \|\| lifecycleStatus !== "active" \? \["copy"\]/);
});

test("deceased-pet summaries are retrospective and do not fabricate a future appointment", () => {
  const draft = buildVetBriefDraft({
    profile: profile({ lifecycle_status: "deceased", deceased_at: "2026-08-18T10:00:00Z" }),
    careEntries: [], memories: [], conversation: [{ role: "user", text: "Can you summarize everything that happened?" }],
    from: "2026-08-01", to: "2026-08-18",
  });
  assert.equal(draft.document.title, "Furvise Care History Summary");
  assert.equal(draft.document.reasonForVisit, "Retrospective care-history summary");
  assert.deepEqual(draft.document.questionsForVeterinarian, []);
  assert.doesNotMatch(JSON.stringify(draft.document), /next vet visit/i);
});

test("committed lifecycle migration defaults to active and retains profile history", () => {
  const migration = read("supabase/migrations/20260818084249_add_pet_profile_lifecycle_v1.sql");
  assert.match(migration, /lifecycle_status in \('active', 'deceased', 'archived'\)/);
  assert.match(migration, /lifecycle_status text not null default 'active'/);
  assert.match(migration, /retained profile state, not deletion/);
  assert.match(migration, /dog_profiles_lifecycle_timestamps_check/);
});

test("one canonical assistant surface uses restrained semantic accents and action cards", () => {
  assert.match(askPage, /data-ask-semantic/);
  assert.match(askPage, /bg-\[var\(--assistant-response-surface\)\]/);
  assert.match(askPage, /data-ui="furvise-application-actions"/);
  assert.match(askPage, /data-action-safety/);
  assert.match(askPage, /data-action-status="succeeded"/);
  assert.doesNotMatch(askPage, /presentation === "casual" \? "w-fit[\s\S]*assistant-response-strong/);
});

test("pet characterization and follow-up governance are evidence based", async t => {
  assert.match(reasoning, /Derive pet characterizations from supplied concrete observations/);
  assert.match(reasoning, /avoid generic flattering labels/);
  assert.match(reasoning, /Never write assistant offers beginning If you want, I can/);
  t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",()=>{});
  const f=readOnlyRouteFixture({answer:"That's the relevant part. If you want, I can help make a checklist.",replyType:"answer"});
  try{
    const response=await f.send("Explain the relevant part briefly."),body=await response.json();
    assert.equal(response.status,200,JSON.stringify(f.state.errors));assert.equal(body.answer,"That's the relevant part.");
    assert.doesNotMatch(body.answer,/If you want, I can/);assert.equal(body.dataChanged,false);
    assert.equal(f.state.reads,0);assert.equal(f.state.calls,2);assert.deepEqual(f.admitted,f.wire);
    assert.equal(body.creditsUsed,1);assert.equal(f.state.credit.status,"completed");
  }finally{await f.release();}
});

function concern(overrides = {}) {
  return {
    id: "concern-1", user_id: "user-1", pet_profile_id: "pet-mani", title: "Mirror scratching",
    normalized_key: "mirror_scratching", status: "monitoring", severity: "routine", source_care_entry_id: null,
    opened_at: "2026-08-18T00:00:00Z", updated_at: "2026-08-18T01:00:00Z", resolved_at: null, resolution_note: null,
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    id: "pet-mani", user_id: "user-1", name: "Mani", species: "cat", breed: null,
    age_value: 3, age_unit: "years", weight_value: 4.2, weight_unit: "kg", current_food: null,
    main_concern: null, wellness_goal: null, avoid_ingredients: [], monthly_budget: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-08-18T00:00:00Z", ...overrides,
  };
}
