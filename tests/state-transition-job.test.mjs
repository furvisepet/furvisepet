import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isDeepStrictEqual } from "node:util";
import { bindStateTransitionJob, stateTransitionProposal, readBoundStateTransitionJob, stateTransitionActionMatches } from "../app/lib/furvise-brain/state-transition-job.ts";
import { validateAskRequest, askRequestProviderSchema } from "../app/lib/intelligence/ask-request-contract.ts";
import { prepareStateTransitionTurn } from "../app/lib/intelligence/state-transition-turn.ts";
import { prepareBoundStateTransitionAction, prepareFurviseApplicationActions } from "../app/lib/application-actions/planner.ts";
import { parseStoredApplicationActions } from "../app/lib/application-actions/contracts.ts";
import { getFurviseActionPolicy } from "../app/lib/application-actions/policy.ts";
import { authorizeFurviseActionExecution } from "../app/lib/furvise-brain/action-organ.ts";
import { withoutLegacyConcernTransitions, buildGovernedAskExecutionPlan } from "../app/lib/intelligence/ask-execution-plan.ts";
import { persistPendingSuggestion } from "../app/lib/intelligence/persist-pending-suggestion.ts";
import { resolveSafetyState } from "../app/lib/intelligence/safety-state.ts";
const id=n=>"81200000-0000-4000-8000-"+String(n).padStart(12,"0");
const pet={id:id(1),user_id:id(2),name:"Subject",species:"dog"};
const text="The reported condition has changed.";
const target=(status="active")=>({ref:"opaque-reference",ownerId:pet.user_id,petId:pet.id,concernId:id(3),status,title:"Tracked condition"});
const context=(status="active")=>({owner:{userId:pet.user_id},pet,eligiblePets:[pet],currentMessage:text,
 currentTurn:{id:id(4),role:"user",text,createdAt:"2026-09-23T00:00:00Z"},conversationTurns:[],timeZone:"UTC",activeConcerns:[],recentlyResolvedConcerns:[],careEntries:[],activeEpisodes:[],monitoringEpisodes:[],currentState:null,concernReferences:[target(status)]});
const proposal=(toState="resolved")=>({domain:"care_concern",operation:"transition",targetRef:"opaque-reference",petName:pet.name,toState,authorizationQuote:text});
function request(p){return {version:"ask-request.v2",mode:"update",question:text,scope:"named",petNames:[pet.name],
 operation:"general",selection:"summary",quantity:null,topic:"",terms:[],from:null,to:null,episodeTopic:null,ordinal:null,
 frame:null,requirements:[],referenceTurnIds:[],stateTransitionJob:p};}
const bind=(p=proposal(),c=context())=>validateAskRequest(request(p),c).request.stateTransitionJob;
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ast=ts.createSourceFile("capabilities.ts",read("app/lib/application-actions/capabilities.ts"),ts.ScriptTarget.Latest,true);
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&["rebindCanonicalCapabilityAction","isExecutableSourceAction","bindTarget"].includes(n.name?.text)).map(n=>n.getText(ast)).join("\n");
const capability=vm.runInNewContext(ts.transpileModule(functions.replace(/^export /gm,""),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+
 "\n({rebindCanonicalCapabilityAction,bindTarget})",{bindStateTransitionJob,stateTransitionProposal,stateTransitionActionMatches,
 isDeepStrictEqual,getFurviseActionPolicy,UUID:/^[0-9a-f-]{36}$/});
for(const [from,to]of [["active","resolved"],["monitoring","resolved"],["reopened","resolved"],["resolved","reopened"]])
 test(from+" to "+to+" binds one exact owned concern through serialization and capability policy",async()=>{
 const c=context(from),job=bind(proposal(to),c),stored=JSON.parse(JSON.stringify(job));
 assert.deepEqual(readBoundStateTransitionJob(stored),job);
 assert.equal(job.petId,pet.id);assert.equal(job.ownerId,pet.user_id);assert.equal(job.concernId,id(3));
 assert.equal(job.fromState,from);assert.equal(job.toState,to);assert.equal(job.authorization.text,text);
 const prepared=prepareStateTransitionTurn(stored,c,"r"),action=prepared.action;
 assert.equal(prepared.orchestration.aiResult,null);assert.equal(action.authorizationScope,"owned_concern");
 assert.equal(action.kind,to==="resolved"?"care_state.resolve":"care_state.reopen");
 assert.deepEqual(parseStoredApplicationActions([JSON.parse(JSON.stringify(action))])[0],action);
 const rebound=capability.rebindCanonicalCapabilityAction(action,id(4),{text,createdAt:c.currentTurn.createdAt},pet.name,pet.user_id);
 assert.equal(rebound.explicitIntent,true);assert.deepEqual(rebound.stateTransitionJob,job);
 for(const mode of ["auto","confirm"])assert.equal(authorizeFurviseActionExecution({action,mode,capabilityId:id(5)}).mutation.kind,
  to==="resolved"?"resolve_care_state":"reopen_care_state");
 assert.equal(authorizeFurviseActionExecution({action,mode:"cancel",capabilityId:id(5)}).mutation.kind,"cancel_pending");
});
for(const [name,edit]of [
 ["wrong current status",c=>c.concernReferences[0].status="resolved"],
 ["foreign owner",c=>c.concernReferences[0].ownerId=id(99)],
 ["another pet",c=>c.concernReferences[0].petId=id(99)],
 ["missing target",c=>c.concernReferences=[]],
 ["ambiguous handle",c=>c.concernReferences.push({...c.concernReferences[0],concernId:id(99)})],
 ["assistant authorization",c=>c.currentTurn.role="furvise"],
 ["recovered source",c=>c.currentTurn.recoveredReceiptReference=true],
 ["different current source",c=>c.currentTurn.text="Different"],
])test("reject "+name,()=>{const c=context();edit(c);assert.throws(()=>bind(proposal(),c),/ASK_REQUEST_INVALID/);});
for(const [name,patch]of [["invented target",{targetRef:id(3)}],["missing handle",{targetRef:null}],
 ["forged quote",{authorizationQuote:"Not in source"}],["extra database ID",{concernId:id(3)}],
 ["invalid state",{toState:"active"}],["wrong subject label",{petName:"Other"}]])
 test("reject "+name,()=>assert.throws(()=>bind({...proposal(),...patch}),/ASK_REQUEST_INVALID/));
test("multiple candidates require an exact supplied target, never latest, severity or first",()=>{
 const c=context();c.concernReferences.push({...target(),ref:"second-reference",concernId:id(8),title:"Other"});
 assert.throws(()=>bind({...proposal(),targetRef:null},c),/state_transition/);
 assert.equal(bind({...proposal(),targetRef:"second-reference"},c).concernId,id(8));
 const noJob=validateAskRequest({...request(null),mode:"clarify",operation:"clarify"},c);
 assert.equal(noJob.request?.stateTransitionJob??null,null);
});
test("source and target snapshot tampering cannot survive rebinding",()=>{
 const job=bind(),c=context();
 for(const edit of [j=>j.ownerId=id(9),j=>j.petId=id(9),j=>j.concernId=id(9),
 j=>j.toState="reopened",j=>j.fromState="monitoring",j=>j.authorization.start++,j=>j.sourceMessageId=id(9)]){
  const altered=structuredClone(job);edit(altered);
  assert.throws(()=>prepareStateTransitionTurn(altered,c,"r"),/TRANSITION|ASK_REQUEST_INVALID/);
 }
 const repeated={...c,currentMessage:text+" "+text,currentTurn:{...c.currentTurn,text:text+" "+text}};
 assert.throws(()=>bind(proposal(),repeated),/ASK_REQUEST_INVALID/);
});
test("canonical action cannot be overridden or minted without its source-bound job",()=>{
 const job=bind(),action=prepareBoundStateTransitionAction(job,"r"),c=context();
 assert.deepEqual(prepareFurviseApplicationActions({proposals:[action,{...action,kind:"care_state.reopen"}],
 petId:pet.id,petName:pet.name,requestId:"r",sourceMessage:"Mark this concern resolved."}),[]);
 assert.doesNotMatch(readFileSync(new URL("../app/lib/application-actions/planner.ts",import.meta.url),"utf8"),/hasDeterministicUserMutationIntent/);
 for(const edit of [a=>a.stateTransitionJob=undefined,a=>a.kind="care_state.reopen",a=>a.petId=id(9),a=>a.input.detail="new facts",a=>a.explicitIntent=false]){
  const altered=structuredClone(action);edit(altered);
  assert.throws(()=>capability.rebindCanonicalCapabilityAction(altered,id(4),{text,createdAt:c.currentTurn.createdAt},pet.name,pet.user_id),/TRANSITION/);
 }
 assert.throws(()=>capability.rebindCanonicalCapabilityAction(action,id(4),{text:"Forged"},pet.name,pet.user_id),/ASK_REQUEST_INVALID/);
 assert.throws(()=>capability.rebindCanonicalCapabilityAction(action,id(4),{text},pet.name,id(9)),/TRANSITION/);
});
test("capability target lookup uses exact bound owner, pet, concern and stored status",async()=>{
 const job=bind(),action=prepareBoundStateTransitionAction(job,"r"),filters=[];
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},
 maybeSingle:async()=>({data:{id:job.concernId},error:null})};
 const db={from(name){assert.equal(name,"pet_concerns");return q;}};
 assert.equal(await capability.bindTarget(action,job.concernId,db,pet.user_id),job.concernId);
 assert.deepEqual(filters.map(x=>JSON.parse(JSON.stringify(x))),[["id",job.concernId],["user_id",pet.user_id],["pet_profile_id",pet.id],["status",[job.fromState]]]);
 assert.equal(await capability.bindTarget(action,id(9),db,pet.user_id),null);
 q.maybeSingle=async()=>({data:null,error:null});
 assert.equal(await capability.bindTarget(action,job.concernId,db,pet.user_id),null);
});
test("provider grammar enumerates supplied handles and rejects mixed authority",async()=>{
 const {default:Ajv}=await import("ajv"),c=context();
 const validate=new Ajv({allErrors:true}).compile(askRequestProviderSchema({},c));
 const base={removeJob:null,...request(proposal()),fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:null,writeJob:null,task:null,
 temporalScope:null,mutationIntent:null,recordSelection:null,profileFields:[],projection:null,evidenceNeeds:[],
 outputFormat:null,evidenceBasis:null,premiseQuotes:null,excludedPetNames:[]};
 assert.equal(validate({request:base}),true,JSON.stringify(validate.errors));
 assert.equal(validate({request:{...base,stateTransitionJob:{...proposal(),targetRef:"invented"}}}),false);
 for(const extra of [{fieldMutationJob:{}},{lifecyclePlan:{}},{frame:{}},{readTicket:{}},{appendJob:{}},{writeJob:{}},{mode:"mixed"}])
 assert.throws(()=>validateAskRequest({...base,...extra},c),/ASK_REQUEST_INVALID/);
});
test("safety, recurrence and semantic recovery remain diagnostic without a canonical job",async()=>{
 const concern={id:id(3),user_id:pet.user_id,pet_profile_id:pet.id,title:"Breathing",normalized_key:"breathing",
 status:"active",severity:"urgent",opened_at:"2026-08-01",updated_at:"2026-08-01",resolved_at:null};
 const c={...context(),activeConcerns:[concern],recentlyResolvedConcerns:[],activeEpisodes:[],monitoringEpisodes:[],careEntries:[],currentState:null};
 const safety=resolveSafetyState({...c,currentMessage:"Subject's breathing is back to normal."});
 assert.equal(safety.level,"recently_resolved");
 for(const action of ["resolve_concern","reopen_concern"]){
  const plan=buildGovernedAskExecutionPlan({sourceMessageId:id(4),petId:pet.id,learnings:[],
   careActions:[{action,relatedRecordId:concern.id}],semanticEvents:[{destinations:["episode_current_state"],
    event:{transition:"resolved",state:"resolved",references:{concernId:concern.id,episodeId:"episode"}}}]});
  assert.deepEqual(plan.careActions,[]);assert.deepEqual(plan.semanticEvents,[]);
 }
 const recurrence=resolveSafetyState({...c,currentMessage:"It started again today.",activeConcerns:[],recentlyResolvedConcerns:[{...concern,status:"resolved"}]});
 assert.equal(recurrence.concernMessageState,"recurrence");assert.equal(recurrence.level,"urgent");
 const blocked=await persistPendingSuggestion({suggestion:{type:"concern_resolution",concernId:concern.id,payload:{}},
 supabase:{from(){throw Error("NO_LEGACY_MUTATION");}}});
 assert.equal(blocked.suggestion,null);assert.equal(blocked.errorCode,"CANONICAL_SUGGESTION_REQUIRED");
});
test("one mocked Brain call chooses a supplied handle; deterministic preparation adds no provider",async()=>{
 const {interpretAskQuestion}=await import("../app/lib/intelligence/interpret-ask.ts");let calls=0;const c=context();
 const result=await interpretAskQuestion({context:c,model:"offline-fixture",client:{responses:{create:async r=>{
  calls++;const input=JSON.parse(r.input);assert.equal(input.concernTargets[0].targetRef,"opaque-reference");
  assert.equal(input.concernTargets[0].concernId,undefined);return {output_text:JSON.stringify({request:request(proposal())})};
 }}}});
 const prepared=prepareStateTransitionTurn(result.request.stateTransitionJob,c,"r");
 assert.equal(calls,1);assert.equal(prepared.orchestration.aiResult,null);
 assert.equal(prepared.action.stateTransitionJob.concernId,id(3));
});
test("legacy concern classifiers cannot construct execution targets after Brain",()=>{
 const run=read("app/lib/intelligence/run-intelligence.ts"),planner=read("app/lib/application-actions/planner.ts");
 assert.doesNotMatch(run,/buildClearResolutionAction|buildRecurrenceAction|buildSourceGroundedResolutionAction|deterministicStateAction/);
 const branches=planner.slice(planner.indexOf('case "care_state.resolve":'),planner.indexOf('default:',planner.indexOf('case "care_state.resolve":')));
 assert.doesNotMatch(branches,/\.test\(|RegExp|includes\(/);
 assert.match(run,/withoutLegacyConcernTransitions/);
 assert.ok(read("app/api/ask/route.ts").indexOf("prepareStateTransitionTurn(interpretation") <
 read("app/api/ask/route.ts").indexOf("const planningSource = liveContext.currentTurn"));
});
test("safety presentation remains independent from canonical target and transition",()=>{
 const c=context("resolved");c.currentMessage="Subject's breathing problem started again.";
 c.currentTurn={...c.currentTurn,text:c.currentMessage};
 c.recentlyResolvedConcerns=[{id:id(3),pet_profile_id:pet.id,normalized_key:"breathing",status:"resolved",
  title:"Breathing",severity:"urgent",opened_at:"2026-08-01",updated_at:"2026-08-01"}];
 const p={...proposal("reopened"),authorizationQuote:c.currentMessage},job=bind(p,c);
 const result=prepareStateTransitionTurn(job,c,"r");
 assert.equal(result.orchestration.safetyLevel,"urgent");
 assert.deepEqual(result.action.stateTransitionJob,job);
 assert.equal(result.action.stateTransitionJob.concernId,id(3));
});
test("durable transition source checks the exact owned target and legal current state",()=>{
 const sql=read("supabase/migrations/20260923072555_preserve_canonical_replace_body_fidelity.sql");
 const a=sql.indexOf("v.action_kind in ('care_state.resolve', 'care_state.reopen')"),b=sql.indexOf("elsif",a+100);
 const branch=sql.slice(a,sql.indexOf("Unsupported mutation kinds",a));
 assert.match(branch,/id=v\.target_id and user_id=v\.user_id and pet_profile_id=v\.pet_profile_id/);
 assert.match(branch,/status in \('active','monitoring','reopened'\)/);
 assert.match(branch,/status = 'resolved'|status='resolved'/);
 assert.match(branch,/if v_concern.id is null then/);
 assert.doesNotMatch(branch,/order by|limit 1/i);
 // This is a source contract check, not database execution.
});
test("planning supplies only owned concern handles and lookup failure supplies none",async()=>{
 const {buildFurvisePlanningContext}=await import("../app/lib/intelligence/planning-context.ts");
 const rows={dog_profiles:[pet],ask_conversations:[{id:id(7),user_id:pet.user_id,pet_profile_id:pet.id}],
 ask_conversation_messages:[{id:id(4),user_id:pet.user_id,conversation_id:id(7),role:"user",user_text:text,created_at:"2026-09-23T00:00:00Z"}],
 pet_concerns:[{id:id(3),user_id:pet.user_id,pet_profile_id:pet.id,title:"Tracked condition",status:"active"},
 {id:id(9),user_id:"foreign",pet_profile_id:pet.id,title:"Foreign",status:"active"}]};
 let fail=false;
 const db={from(table){let filters=[],single=false;const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},
 in(k,v){filters.push(r=>v.includes(r[k]));return q;},order(){return q;},limit(){return q;},
 maybeSingle(){single=true;return q;},then(resolve,reject){const data=rows[table].filter(r=>filters.every(f=>f(r)));
 return Promise.resolve({data:single?data[0]:data,error:fail&&table==="pet_concerns"?{code:"offline"}:null}).then(resolve,reject);}};return q;}};
 const args={supabase:db,userId:pet.user_id,petId:pet.id,conversationId:id(7),currentMessage:text,sourceMessageId:id(4),locale:"en"};
 const planned=await buildFurvisePlanningContext(args);
 assert.equal(planned.concernReferences.length,1);assert.equal(planned.concernReferences[0].concernId,id(3));
 assert.notEqual(planned.concernReferences[0].ref,id(3));assert.equal(planned.activeConcerns.length,1);
 assert.deepEqual(planned.careEntries,[]);
 fail=true;const unavailable=await buildFurvisePlanningContext(args);assert.deepEqual(unavailable.concernReferences,[]);
 assert.throws(()=>bindStateTransitionJob(proposal(),{source:unavailable.currentTurn,ownerId:pet.user_id,pets:[pet],references:[]}),/exact_target|state_transition/);
});
