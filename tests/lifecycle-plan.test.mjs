import {stagedOperation,sourceFixtureDb} from './helpers/staged-operation-fixture.mjs';
import {lifecycleUnitAuthority} from './helpers/lifecycle-unit-authority.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
registerHooks({ resolve(s,c,next) { return s==="server-only"
  ? {url:"data:text/javascript,export {};",format:"module",shortCircuit:true}:next(s,c); } });
globalThis.fetch=async()=>{throw Error("OFFLINE_ONLY");};
const {bindLifecyclePlan}=await import("../app/lib/furvise-brain/lifecycle-plan.ts");
const {validateAskRequest,askRequestProviderSchema}=await import("../app/lib/intelligence/ask-request-contract.ts");
const {continueLifecyclePlan,rebindLifecyclePlan,lifecyclePlanOrchestration}=await import("../app/lib/intelligence/lifecycle-turn.ts");
const {prepareBoundLifecycleAction}=await import("../app/lib/application-actions/planner.ts");
const {getFurviseActionPolicy}=await import("../app/lib/application-actions/policy.ts");
const {authorizeFurviseActionExecution}=await import("../app/lib/furvise-brain/action-organ.ts");
const {interpretAskQuestion}=await import("../app/lib/intelligence/interpret-ask.ts");
const actionId="00000000-0000-4000-8000-000000000001";
const pets=["Alpha","Beta"].map((name,i)=>({id:"pet-"+i,user_id:"owner",name,species:"dog",lifecycle_status:"active"}));
function pending(kind="pet.mark_deceased",petId=pets[0].id,id=actionId){
 return {id,petId,kind,...getFurviseActionPolicy(kind),status:"confirmation_required",explicitIntent:false,
  input:{field:null,value:null,title:null,detail:null,category:null,target:"specified"},
  evidence:"earlier source",sourceMessageId:"prior",label:"Review",description:"Review",href:null,resultMessage:null,errorMessage:null};
}
function context({actions=[],status="active",message="Apply the requested change."}={}){
 const owned=structuredClone(pets);owned[0].lifecycle_status=status;
 const ctx={owner:{userId:"owner"},pet:owned[0],eligiblePets:owned,currentMessage:message,
  currentTurn:{id:"current-user",role:"user",text:message},conversationTurns:[],timeZone:"UTC",
  lifecycleActionState:{ownerId:"owner",complete:true,actions}};
 lifecycleUnitAuthority(ctx);return ctx;
}
const proposal=(ctx,{cancel=false,to=null,target="Alpha",required=null}={})=>({
 pendingDisposition:cancel?{petNames:null,quote:ctx.currentMessage}:"keep",transition:to?{targetPetName:target,toState:to}:null,
 requiredSubjectState:required,authorizationQuote:ctx.currentMessage});
const request=(ctx,lifecyclePlan)=>({version:"ask-request.v2",mode:"update",question:ctx.currentMessage,
 requirements:[],referenceTurnIds:[],scope:"named",petNames:["Alpha"],operation:"general",selection:"summary",
 quantity:null,topic:"",terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,lifecyclePlan});
async function run(ctx,p,receiptStatus="cancelled"){
 const interpreted=validateAskRequest(request(ctx,p),ctx),plan=interpreted.request.lifecyclePlan,events=[];
 const result=await continueLifecyclePlan({plan,context:ctx,requestId:"request",cancel:async input=>{
  events.push(input);assert.equal(input.userId,"owner");assert.equal(input.capabilityId,actionId);
  return {action:{...ctx.lifecycleActionState.actions[0],status:receiptStatus}};
 }});
 return {plan,result,events,interpreted};
}
for(const kind of ["pet.mark_deceased","pet.archive"])test("pending "+kind+" cancellation requires a real receipt and creates no transition",async()=>{
 const ctx=context({actions:[pending(kind)]}),before=JSON.stringify(ctx),r=await run(ctx,proposal(ctx,{cancel:true}));
 assert.equal(r.result.kind,"cancelled");assert.equal(r.events.length,1);assert.equal(r.result.actions.length,1);
 assert.equal(r.result.actions[0].status,"cancelled");assert.equal(r.plan.transition,null);assert.equal(JSON.stringify(ctx),before);
 assert.doesNotMatch(lifecyclePlanOrchestration(r.result).answer.summary,/marked.*active|passed away/);
});
test("reassignment cancels only the old capability before preparing the owned new transition",async()=>{
 const ctx=context({actions:[pending()]}),r=await run(ctx,proposal(ctx,{cancel:true,to:"deceased",target:"Beta"}));
 assert.equal(r.result.kind,"transition");assert.equal(r.events.length,1);
 assert.deepEqual(r.result.actions.map(a=>[a.petId,a.status]),[["pet-0","cancelled"],["pet-1","confirmation_required"]]);
 const action=r.result.actions[1];assert.equal(action.kind,"pet.mark_deceased");
 assert.throws(()=>authorizeFurviseActionExecution({action,capabilityId:"cap",mode:"auto"}),/AUTO_NOT_AUTHORIZED/);
 const confirmed=authorizeFurviseActionExecution({action,capabilityId:"cap",mode:"confirm"});
 assert.equal(confirmed.mutation.kind,"mark_deceased");assert.equal(confirmed.mutation.confirmationSatisfied,true);
});
for(const status of ["deceased","archived"])test("saved "+status+" can propose active only through a typed confirmed transition",async()=>{
 const ctx=context({status}),r=await run(ctx,proposal(ctx,{to:"active"}));
 assert.equal(r.plan.transition.fromState,status);assert.equal(r.result.actions[0].kind,"pet.mark_active");
 assert.equal(r.result.actions[0].petId,"pet-0");assert.equal(r.result.actions[0].confirmationPolicy,"always");
 assert.equal(r.result.actions[0].status,"confirmation_required");assert.equal(r.events.length,0);
});
for(const state of ["deceased","archived"])test("new "+state+" transition remains a confirmation-required proposal",async()=>{
 const ctx=context(),r=await run(ctx,proposal(ctx,{to:state}));
 assert.equal(r.result.actions[0].kind,state==="deceased"?"pet.mark_deceased":"pet.archive");
 assert.equal(r.result.actions[0].explicitIntent,false);assert.equal(r.result.actions[0].confirmationPolicy,"always");
 assert.equal(ctx.pet.lifecycle_status,"active");assert.equal(r.events.length,0);
});
test("foreign and ambiguous transition targets cannot bind",()=>{
 const ctx=context();assert.throws(()=>bindLifecyclePlan(proposal(ctx,{to:"deceased",target:"Foreign"}),ctx),/lifecycle_plan/);
 ctx.eligiblePets.push({...pets[1],name:"Alpha"});
 assert.throws(()=>bindLifecyclePlan(proposal(ctx,{to:"deceased"}),ctx),/lifecycle_plan/);
});
test("null plan leaves a pending action unchanged and continues normal execution",async()=>{
 const ctx=context({actions:[pending()]}),before=JSON.stringify(ctx);
 assert.equal(bindLifecyclePlan(null,ctx),null);
 assert.equal(await continueLifecyclePlan({plan:null,context:ctx,requestId:"r",cancel:async()=>{throw Error("MUST_NOT_CANCEL");}}),null);
 assert.equal(JSON.stringify(ctx),before);
});
for(const status of ["deceased","archived","active"])test("typed active requirement respects "+status+" without restoring",async()=>{
 const ctx=context({status}),p=proposal(ctx,{required:"active"});
 const plan=bindLifecyclePlan(p,ctx,["pet-0"]);
 const outcome=await continueLifecyclePlan({plan,context:ctx,requestId:"r",cancel:async()=>{throw Error("NO_CANCEL");}});
 if(status==="active")assert.equal(outcome,null);
 else {assert.equal(outcome.kind,"state_conflict");assert.deepEqual(outcome.actions,[]);}
 assert.equal(prepareBoundLifecycleAction(plan,"r"),null);
});
test("assistant and prior user spans never authorize a new lifecycle operation",()=>{
 const ctx=context(),p=proposal(ctx,{to:"deceased"});
 assert.throws(()=>bindLifecyclePlan(p,{...ctx,currentTurn:{...ctx.currentTurn,role:"furvise"}}),/current_user|lifecycle_plan/);
 assert.throws(()=>bindLifecyclePlan({...p,authorizationQuote:"prior message"},ctx),/append_span/);
 assert.throws(()=>bindLifecyclePlan(p,{...ctx,currentTurn:{...ctx.currentTurn,text:"different"}}),/lifecycle_plan/);
 assert.throws(()=>bindLifecyclePlan({...p,actionId},ctx),/lifecycle_plan/);
});
test("pending cancellation refuses missing, ambiguous, foreign, stale or incomplete server state",()=>{
 for(const mutate of [
  c=>c.lifecycleActionState.actions=[],
  c=>c.lifecycleActionState.actions.push(pending("pet.archive","pet-1","00000000-0000-4000-8000-000000000002")),
  c=>c.lifecycleActionState.ownerId="foreign",
  c=>c.lifecycleActionState.actions[0].petId="foreign",
  c=>c.lifecycleActionState.actions[0].status="succeeded",
  c=>c.lifecycleActionState.complete=false,
  c=>c.lifecycleActionState.actions[0].confirmationPolicy="none",
 ]){
  const ctx=context({actions:[pending()]});mutate(ctx);
  assert.throws(()=>bindLifecyclePlan(proposal(ctx,{cancel:true}),ctx),/lifecycle_plan/);
 }
});
test("failed or already-completed cancellation cannot prepare reassignment",async()=>{
 for(const status of ["failed","succeeded"]){
  const ctx=context({actions:[pending()]}),r=await run(ctx,proposal(ctx,{cancel:true,to:"deceased",target:"Beta"}),status);
  assert.equal(r.result.kind,"cancellation_unavailable");
  assert.equal(r.result.actions.some(a=>a.petId==="pet-1"),false);
 }
});
test("a mismatched cancellation receipt is rejected",async()=>{
 const ctx=context({actions:[pending()]}),plan=bindLifecyclePlan(proposal(ctx,{cancel:true}),ctx);
 await assert.rejects(continueLifecyclePlan({plan,context:ctx,requestId:"r",cancel:async()=>({
  action:{...pending(),petId:"pet-1",status:"cancelled"}})}),/RECEIPT_MISMATCH/);
});
test("canonical lifecycle meaning survives serialization and refuses changed authority",()=>{
 const ctx=context({actions:[pending()]}),p=proposal(ctx,{cancel:true,to:"deceased",target:"Beta"});
 const plan=bindLifecyclePlan(p,ctx),stored=JSON.parse(JSON.stringify(plan));
 assert.deepEqual(rebindLifecyclePlan(stored,ctx),plan);
 const tampered=structuredClone(stored);tampered.transition.petId="pet-0";
 assert.throws(()=>rebindLifecyclePlan(tampered,ctx),/SNAPSHOT_CHANGED/);
 const changed=structuredClone(ctx);changed.eligiblePets[1].lifecycle_status="archived";
 assert.throws(()=>rebindLifecyclePlan(stored,changed),error=>error.message==="ASK_REQUEST_INVALID:lifecycle_plan"&&error.cause?.field==="originating_authority");
});
test("Binder preserves typed intent with arbitrary wording and no semantic regex",()=>{
 for(const message of ["Apply the requested change.","Veuillez appliquer la correction.","按已说明的方式更正。"]){
  const ctx=context({message}),p=proposal(ctx,{to:"active"}),before=JSON.stringify(p);
  const r=validateAskRequest(request(ctx,p),ctx);
  assert.equal(r.request.lifecyclePlan.transition.toState,"active");
  assert.equal(r.request.lifecyclePlan.authorization.text,message);
  assert.equal(JSON.stringify(p),before);
 }
});
test("lifecycle mutation cannot share authority with an unrelated job or read",()=>{
 const ctx=context(),p=request(ctx,proposal(ctx,{to:"deceased"}));
 for(const change of [{readTicket:{}},{appendJob:{}},{writeJob:{}},{task:{}},{frame:{}},{requirements:["another fact"]},{mode:"mixed"}])
  assert.throws(()=>validateAskRequest({...p,...change},ctx),/lifecycle_mixed/);
});
test("provider sees no preloaded pending capability and lifecycle state is hydrated under its permit",async()=>{
 const ctx=context({actions:[pending()]}),p=request(ctx,proposal(ctx,{to:"deceased"}));
 const db=sourceFixtureDb(ctx,{from(table){assert.equal(table,"dog_profiles");const filters=[];const q={
  select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},
  then(resolve,reject){return Promise.resolve({data:ctx.eligiblePets.filter(r=>filters.every(f=>f(r))),error:null}).then(resolve,reject)}
 };return q;}});
 const run=await stagedOperation({context:ctx,purpose:"lifecycle",request:p,db,initial:(input,wire)=>{
  assert.equal(input.lifecycleState?.pending,undefined);assert.equal(wire.input.includes(actionId),false);
 }});
 assert.equal(run.calls,1);assert.equal(run.result.request.lifecyclePlan.pendingAction,null);
 assert.equal(run.result.request.lifecyclePlan.transition.petId,pets[0].id);assert.equal(run.result.request.lifecyclePlan.transition.toState,"deceased");
});
test("provider lifecycle variant excludes unrelated mutation and read jobs",()=>{
 const schema=askRequestProviderSchema({}),variants=schema.properties.request.anyOf;
 const lifecycle=variants.find(s=>s.properties.lifecyclePlan?.type==="object");
 assert.ok(lifecycle);for(const field of ["appendJob","writeJob","readTicket","frame","task"])assert.deepEqual(lifecycle.properties[field],{type:"null"});
 const encoded=JSON.stringify(lifecycle.properties.lifecyclePlan);
 for(const key of ['"petId"','"actionId"','"capabilityId"'])assert.equal(encoded.includes(key),false);
});
test("ordinary Ask route consumes typed lifecycle outcomes without a wording-based dispatch",()=>{
 const route=readFileSync(new URL("../app/api/ask/route.ts",import.meta.url),"utf8");
 assert.match(route,/continueLifecyclePlan\(\{ plan: interpretation\.request\?\.lifecyclePlan/);
 for(const name of ["resolvePendingLifecycleTurn","resolveDurableLifecycleCorrection","requiresLivingPet","reportsDeath","resolveProviderIndependentLossSubject","ensureConfirmedLossAction"])
  assert.equal(route.includes(name),false,name);
 assert.ok(route.indexOf("continueLifecyclePlan({")<route.indexOf('const replaceJob = interpretation.request?.writeJob'));
 assert.match(route,/cancel: cancelActionCapability/);
});

test("full Binder preserves an active-subject requirement even for advice without a factual read",async()=>{
 const ctx=context({status:"deceased"}),p={...request(ctx,proposal(ctx,{required:"active"})),
  mode:"conversation",evidenceBasis:"general",scope:"named",petNames:["Alpha"]};
 const interpreted=validateAskRequest(p,ctx),plan=interpreted.request.lifecyclePlan;
 assert.deepEqual(plan.subjects,[{petId:"pet-0",petName:"Alpha",state:"deceased"}]);
 assert.equal(plan.transition,null);assert.equal(interpreted.request.readTicket,undefined);
 const outcome=await continueLifecyclePlan({plan,context:ctx,requestId:"r",cancel:async()=>{throw Error("NO_CANCEL");}});
 assert.equal(outcome.kind,"state_conflict");assert.deepEqual(outcome.actions,[]);
});
test("full Binder keeps profile authority separate from an active-state requirement",()=>{
 const ctx=context({status:"archived"}),p={...request(ctx,proposal(ctx,{required:"active"})),mode:"read",
  evidenceBasis:"saved_profile",profileFields:["name"],operation:"recall"};
 const result=validateAskRequest(p,ctx);
 assert.equal(result.request.evidenceBasis,"saved_profile");
 assert.deepEqual(result.request.profileFields,["name"]);
 assert.equal(result.request.lifecyclePlan.subjects[0].state,"archived");
 assert.equal(result.request.lifecyclePlan.transition,null);
});
