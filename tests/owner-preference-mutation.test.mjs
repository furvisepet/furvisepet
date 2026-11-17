import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { bindFieldMutationJob, fieldMutationJobProposal, fieldMutationActionMatches, readBoundFieldMutationJob } from "../app/lib/furvise-brain/field-mutation-job.ts";
import { prepareFieldMutationTurn } from "../app/lib/intelligence/field-mutation-turn.ts";
import { prepareBoundFieldMutationAction, prepareFurviseApplicationActions } from "../app/lib/application-actions/planner.ts";
import { parseStoredApplicationActions } from "../app/lib/application-actions/contracts.ts";
import { authorizeFurviseActionExecution } from "../app/lib/furvise-brain/action-organ.ts";
import { validateAskRequest, askRequestProviderSchema } from "../app/lib/intelligence/ask-request-contract.ts";
import { prepareAskMemoryAuthorityLearnings } from "../app/lib/intelligence/persist-learnings.ts";
import { prepareTypedMemoryCandidate } from "../app/lib/intelligence/memory-integrity.ts";
const pet={id:"pet",name:"Subject",user_id:"owner",species:"dog"};
const context=text=>({owner:{userId:"owner"},pet,eligiblePets:[pet],currentMessage:text,
 currentTurn:{id:"source",role:"user",text,createdAt:"2026-09-23T00:00:00Z"},conversationTurns:[],timeZone:"UTC"});
function proposal(field="preferred_language",valueQuote="French",operation="set_field") {
 return {domain:"owner_preference",operation,petName:null,field,valueQuote,
 instructionQuote:operation==="set_field" ? "Requested value: "+valueQuote+"." : "Apply the requested removal."};
}
function request(p){return {version:"ask-request.v2",mode:"update",question:p.instructionQuote,scope:"none",petNames:[],
 operation:"general",selection:"summary",quantity:null,topic:"",terms:[],from:null,to:null,episodeTopic:null,ordinal:null,
 frame:null,requirements:[],referenceTurnIds:[],fieldMutationJob:p};}
const bind=p=>validateAskRequest(request(p),context(p.instructionQuote)).request.fieldMutationJob;
const actionFor=p=>prepareFieldMutationTurn(bind(p),context(p.instructionQuote),"request").action;
for(const [field,value]of [["preferred_language","French"],["preferred_units","metric"],["communication_style","brief and direct"]])
 for(const operation of ["set_field","clear_field"])test(operation+" binds owner singleton "+field,async()=>{
  const p=proposal(field,operation==="set_field"?value:null,operation),job=bind(p),c=context(p.instructionQuote);
  assert.equal(job.ownerId,"owner");assert.equal(job.petId,undefined);assert.equal(job.field,field);
  assert.equal(job.instruction.text,p.instructionQuote);assert.equal(job.sourceMessageId,"source");
  assert.equal(job.valueSource?.text??null,p.valueQuote);assert.equal(job.value?.value??null,p.valueQuote);
  const persisted=JSON.parse(JSON.stringify(job));assert.deepEqual(readBoundFieldMutationJob(persisted),job);
  assert.deepEqual(bindFieldMutationJob(fieldMutationJobProposal(persisted,"ignored"),c.currentTurn,[],"owner"),job);
  const action=prepareFieldMutationTurn(persisted,c,"request").action;
  assert.equal(action.kind,operation==="set_field"?"memory.set_preference":"memory.forget_preference");
  assert.equal(action.authorizationScope,"owned_user");assert.equal(action.explicitIntent,false);
  assert.equal(action.input.field,field);assert.equal(action.input.value,p.valueQuote);
  assert.deepEqual(parseStoredApplicationActions([JSON.parse(JSON.stringify(action))])[0],action);
  assert.equal(fieldMutationActionMatches(job,action,"owner"),true);
  assert.equal(fieldMutationActionMatches(job,action,"foreign"),false);
  assert.throws(()=>authorizeFurviseActionExecution({action,capabilityId:"cap",mode:"auto"}),/AUTO_NOT_AUTHORIZED/);
  assert.equal(authorizeFurviseActionExecution({action,capabilityId:"cap",mode:"confirm"}).mutation.kind,
   operation==="set_field"?"set_preference":"forget_preference");
  assert.equal(action.status,"proposed");
  assert.equal(action.resultMessage,null,"binding cannot claim execution");
 });
for(const [name,edit]of [
 ["forged value",p=>p.valueQuote="unquoted"],["missing value",p=>p.valueQuote=null],
 ["unsupported field",p=>p.field="preferred_retailer"],["budget field",p=>p.field="monthly_pet_supply_budget"],
 ["pet scope",p=>p.petName="Subject"],["minted owner ID",p=>p.ownerId="foreign"],
 ["clear with value",p=>p.operation="clear_field"],["two operations",p=>p.operation=["set_field","clear_field"]],
 ["two fields",p=>p.field=["preferred_language","preferred_units"]]
])test("binding rejects "+name,()=>{const p=proposal();edit(p);assert.throws(()=>bind(p),/ASK_REQUEST_INVALID/);});
for(const [field,value]of [["preferred_language","active"],["preferred_language","{bad:true}"],
 ["preferred_language","11111111-1111-4111-8111-111111111111"],["preferred_units","not a unit system"],
 ["communication_style","I have diabetes"],["communication_style","deceased"],["communication_style","x".repeat(101)]])
 test("domain policy rejects "+field+"="+value,()=>assert.throws(()=>bind(proposal(field,value)),/ASK_REQUEST_INVALID/));
test("assistant, prior, repeated and uncontained spans cannot authorize a field operation",()=>{
 const p=proposal(),c=context(p.instructionQuote);
 for(const currentTurn of [{...c.currentTurn,role:"furvise"},{...c.currentTurn,recoveredReceiptReference:true},
 {...c.currentTurn,text:"A different user turn"}])
 assert.throws(()=>validateAskRequest(request(p),{...c,currentTurn}),/ASK_REQUEST_INVALID/);
 assert.throws(()=>bind({...p,instructionQuote:"Requested"}),/ASK_REQUEST_INVALID/);
 const text=p.instructionQuote+" French";assert.throws(()=>validateAskRequest(request(p),context(text)),/ASK_REQUEST_INVALID/);
});
test("canonical owner, field, value, operation and span survive transport without widening",()=>{
 const p=proposal(),job=bind(p),c=context(p.instructionQuote),action=actionFor(p);
 for(const mutate of [j=>j.ownerId="foreign",j=>j.field="preferred_units",j=>j.operation="clear_field",
 j=>j.value.value="English",j=>j.valueSource.start++,j=>j.sourceMessageId="other"]){
  const changed=structuredClone(job);mutate(changed);
  assert.throws(()=>prepareFieldMutationTurn(changed,c,"request"),/SOURCE_CHANGED|ASK_REQUEST_INVALID/);
 }
 for(const mutate of [a=>a.input.field="preferred_units",a=>a.input.value="English",
 a=>a.kind="memory.forget_preference",a=>a.explicitIntent=true,a=>a.sourceMessageId="other"]){
  const changed=structuredClone(action);mutate(changed);assert.deepEqual(parseStoredApplicationActions([changed]),[]);
 }
});
test("model set/forget proposals cannot compete with canonical replacement or distinct fields",()=>{
 const first=actionFor(proposal()),second=actionFor(proposal("preferred_units","metric"));
 assert.notEqual(first.fieldMutationJob.field,second.fieldMutationJob.field);
 const actions=[first,{...first,kind:"memory.forget_preference",input:{...first.input,value:null}},second];
 assert.deepEqual(prepareFurviseApplicationActions({proposals:actions,petId:"pet",petName:"Subject",
 requestId:"r",sourceMessage:"Set French then forget English."}),[]);
 assert.doesNotMatch(readFileSync(new URL("../app/lib/application-actions/planner.ts",import.meta.url),"utf8"),/hasDeterministicUserMutationIntent/);
 assert.doesNotMatch(readFileSync(new URL("../app/lib/application-actions/planner.ts",import.meta.url),"utf8"),/hasDeterministicUserMutationIntent/);
 assert.equal(first.kind,"memory.set_preference");
 assert.throws(()=>validateAskRequest({...request(proposal()),fieldMutationJob:actions.map(a=>a.fieldMutationJob)},context("x")),/ASK_REQUEST_INVALID/);
});
test("ordinary Ask learnings cannot restore owner mutation authority from explicit-looking prose",()=>{
 const learning={subjectType:"owner",subjectId:null,category:"communication_preference",factKey:"preferred_language",
 factValue:"French",sourceExcerpt:"Answer in French.",confidence:1,importance:"high",durability:"durable",action:"update"};
 assert.deepEqual(prepareAskMemoryAuthorityLearnings({authorizedPetIds:["pet"],currentMessage:learning.sourceExcerpt,learnings:[learning]}),[]);
 assert.equal(prepareTypedMemoryCandidate(learning,learning.sourceExcerpt,["pet"]).accepted,false);
 const certified=prepareTypedMemoryCandidate(learning,learning.sourceExcerpt,[],{explicitPreferenceIntent:true});
 assert.equal(certified.accepted,true);
 for(const patch of [{subjectType:"pet",subjectId:"pet"},{category:"medical_condition"},
 {factValue:"deceased"},{factValue:"{bad:true}"}])
 assert.equal(prepareTypedMemoryCandidate({...learning,...patch},learning.sourceExcerpt,["pet"],{explicitPreferenceIntent:true}).accepted,false);
});
test("provider field grammar excludes cross-domain fields and incompatible set/clear containers",async()=>{
 const {default:Ajv}=await import("ajv"),schema=askRequestProviderSchema({});
 const validate=new Ajv({allErrors:true}).compile(schema);
 const p=proposal(),base={calculatePlan:null,storedRead:null,removeJob:null,...request(p),stateTransitionJob:null,lifecyclePlan:null,appendJob:null,readTicket:null,writeJob:null,task:null,
 temporalScope:null,mutationIntent:null,recordSelection:null,profileFields:[],projection:null,evidenceNeeds:[],
 outputFormat:null,evidenceBasis:null,premiseQuotes:null,excludedPetNames:[]};
 assert.equal(validate({request:base}),true,JSON.stringify(validate.errors));
 for(const fieldMutationJob of [{...p,petName:"Subject"},{...p,field:"weight"},{...p,operation:"clear_field"},
 {...p,domain:"pet_profile"},{...p,field:"preferred_retailer"}])
 assert.equal(validate({request:{...base,fieldMutationJob}}),false);
 assert.equal(validate({request:{...base,fieldMutationJob:proposal("preferred_units",null,"clear_field")}}),true);
});
test("canonical preference operations remain exact while the durable executor is unavailable",()=>{
 for(const p of [proposal("preferred_language","French"),proposal("preferred_language",null,"clear_field")]){
  const action=actionFor(p);
  assert.equal(action.fieldMutationJob.operation,p.operation);
  assert.equal(action.input.field,p.field);assert.equal(action.input.value,p.valueQuote);
  assert.equal(action.status,"proposed");assert.equal(action.resultMessage,null);
 }
 const sql=readFileSync(new URL("../supabase/migrations/20260923072555_preserve_canonical_replace_body_fidelity.sql",import.meta.url),"utf8");
 assert.doesNotMatch(sql,/v\.action_kind\s*(?:=|in)[^\n]*memory\.(?:set|forget)_preference/);
 assert.match(sql,/Unsupported mutation kinds never fall back/);
 assert.match(sql,/v_error := 'That action is not available yet\.'/);
});
test("raw preference parsers are absent and canonical route stops before factual generation",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 assert.doesNotMatch(read("app/lib/application-actions/planner.ts"),/exactPreferenceSetCommand|exactPreferenceForgetCommand/);
 assert.doesNotMatch(read("app/lib/intelligence/memory-integrity.ts"),/hasExplicitPreferenceIntent/);
 const route=read("app/api/ask/route.ts");
 assert.ok(route.indexOf("prepareFieldMutationTurn(interpretation.request.fieldMutationJob")<route.indexOf("const planningSource = liveContext.currentTurn"));
 assert.match(route,/!\["pet.update_profile", "memory.set_preference", "memory.forget_preference"/);
});
test("one interpreter binds an owner field without using a pet as the semantic subject",async()=>{
 const {interpretAskQuestion}=await import("../app/lib/intelligence/interpret-ask.ts");
 const p=proposal("preferred_units","imperial"),c=context(p.instructionQuote);let calls=0;
 const interpreted=await interpretAskQuestion({context:c,model:"gpt-5.4-mini",client:{responses:{create:async()=>{
  assert.equal(++calls,1);return {output_text:JSON.stringify({request:request(p)})};
 }}}});
 assert.equal(calls,1);assert.deepEqual(interpreted.petIds,[]);
 assert.equal(interpreted.request.fieldMutationJob.ownerId,"owner");
 const outcome=prepareFieldMutationTurn(interpreted.request.fieldMutationJob,c,"request");
 assert.equal(outcome.orchestration.aiResult,null);assert.equal(outcome.action.authorizationScope,"owned_user");
 assert.equal(outcome.action.fieldMutationJob.petId,undefined);
});
test("foreign ownership and changed source cannot prepare a preference capability",()=>{
 const job=actionFor(proposal()).fieldMutationJob,c=context(proposal().instructionQuote);
 for(const changed of [{...c,owner:{userId:"foreign"}},{...c,currentTurn:{...c.currentTurn,id:"other"}},
 {...c,currentMessage:"Different",currentTurn:{...c.currentTurn,text:"Different"}}])
  assert.throws(()=>prepareFieldMutationTurn(job,changed,"r"),/FIELD|PROFILE_MUTATION_SOURCE_CHANGED|ASK_REQUEST_INVALID/);
});
