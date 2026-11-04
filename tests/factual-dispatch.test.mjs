import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
registerHooks({resolve(s,c,next){return s==="server-only"?{url:"data:text/javascript,export {};",format:"module",shortCircuit:true}:next(s,c);}});
const {generateContextAwareAskResponse,buildAskContext,buildAskProviderRequest}=await import("../app/lib/ai/ask-reasoning.ts");
const {dependsOnStoredState,FACTUAL_UNAVAILABLE,FACTUAL_LIMITATION,factualLimitationFailure}=await import("../app/lib/intelligence/factual-dispatch.ts");
const {reviewHistoricalAnswer}=await import("../app/lib/intelligence/review-history-narrative.ts");
const {validateGeneratedAnswer}=await import("../app/lib/intelligence/validation/validate-answer.ts");
const {reviewTaskCompletion,conversationReviewProvenance}=await import("../app/lib/intelligence/review-task-completion.ts");
const {evidenceSource}=await import("../app/lib/intelligence/ask-evidence.ts");
let calls=0;
const noProvider={responses:{create:async()=>{calls++;throw Error("FACTUAL_PROVIDER_FORBIDDEN");}}};
const pet={id:"owned-a",user_id:"owner",name:"River",species:"dog",weight_value:87.41,weight_unit:"kg",updated_at:"2026-09-01T00:00:00Z"};
function fixture(patch={},question="A bounded request.") {
 const request={mode:"mixed",evidenceBasis:"saved_history",readTicket:null,profileFields:[],requirements:[],referenceTurnIds:[],evidenceNeeds:[],...patch};
 const evidence={version:"ask-evidence.v1",scope:{authorizedPetIds:[pet.id],requestText:question,status:"resolved",readOnlyRecall:false,requestKind:"ordinary"},
  petNames:{[pet.id]:pet.name},interpretation:{operation:"general",readOnly:false,petIds:[pet.id],request},
  sources:[evidenceSource(pet.id,"profile",[pet.id])],represented:[],losses:[],verifiedFacts:[],representation:"complete",
  completeness:{retrieval:"unknown",corrections:"unknown",extraction:"unknown",grouping:"unknown"}};
 const input={profiles:[pet],question,careEntries:[{id:"stored-row",user_id:"owner",pet_profile_id:pet.id,note:"Stored sentinel 632.19",occurred_at:"2020-04-03T00:00:00Z",created_at:"2020-04-03T00:00:00Z"}],
  memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],evidenceContract:evidence,client:noProvider};
 const context={pet,owner:{userId:"owner"},eligiblePets:[pet],askInterpretation:evidence.interpretation,currentMessage:question,memories:[],careEntries:input.careEntries};
 return {input,context,evidence};
}
async function finalized(f,r) {
 assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),true);
 const validate=x=>validateGeneratedAnswer(x,f.context,"routine",[pet.id]);
 const validation=validate(r);assert.equal(validation.valid,true,validation.errors.join());
 const v=await reviewTaskCompletion({validation,context:f.context,requestId:"offline-dispatch",validate,client:noProvider});
 assert.equal(v.valid,true,v.errors.join());return v;
}
for(const [name,patch] of [
 ["mixed history",{mode:"mixed",evidenceBasis:"saved_history"}],
 ["untyped profile fields",{mode:"read",evidenceBasis:"saved_profile",profileFields:[]}],
 ["mixed profile",{mode:"mixed",evidenceBasis:"saved_profile",profileFields:["weight"]}],
 ["missing residual receipt",{mode:"read",evidenceBasis:"stored"}],
 ["legacy arithmetic",{mode:"read",evidenceBasis:"saved_profile",projection:{quantity:"body_mass",order:"value_descending"}}],
])test(name+" cannot enter broad factual generation",async()=>{
 const f=fixture(patch);
 if(name==="missing residual receipt"){
  await assert.rejects(generateContextAwareAskResponse(f.input),/STORED_READ_RESULT_UNAVAILABLE_OR_CHANGED/);
  assert.equal(calls,0);
  assert.throws(()=>buildAskProviderRequest({evidenceContract:f.evidence}),/STORED_STATE_CANNOT_ENTER_LANGUAGE_GENERATION/);
  return;
 }
 const r=await generateContextAwareAskResponse(f.input);
 assert.equal(r.model,FACTUAL_UNAVAILABLE);assert.equal(factualLimitationFailure(r),null);
 const v=await finalized(f,r);assert.equal(v.assessment.outcome,"limited");
 assert.equal(v.response.answer.summary,FACTUAL_LIMITATION);assert.deepEqual(r.relevantContextIds,[]);
 assert.deepEqual(r.referencedRecords,[]);assert.deepEqual(r.applicationActions,[]);assert.deepEqual(r.semanticEvents,[]);
 assert.equal(calls,0);
 assert.throws(()=>buildAskProviderRequest({evidenceContract:f.evidence}),/STORED_STATE_CANNOT_ENTER_LANGUAGE_GENERATION/);
});
for(const [name,mutate] of [
 ["prose",r=>r.answer.summary+=" A stored value is 87.41 kg."],
 ["source",r=>r.relevantContextIds.push("profile:owned-a:weight")],
 ["action",r=>r.applicationActions.push({type:"pet.update_profile"})],
 ["absence",r=>r.answer.summary="No records exist."],
])test("generic limitation rejects "+name,async()=>{
 const f=fixture(),r=await generateContextAwareAskResponse(f.input);await finalized(f,r);mutate(r);
 assert.notEqual(factualLimitationFailure(r),null);
 assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),false);
 assert.equal(validateGeneratedAnswer(r,f.context,"routine",[pet.id]).valid,false);
 assert.equal(calls,0);
});
for(const format of ["prose","csv","json"])test("profile "+format+" terminates after deterministic finalization",async()=>{
 const f=fixture({mode:"read",evidenceBasis:"saved_profile",profileFields:["weight"],outputFormat:format});
 f.evidence.scope.readOnlyRecall=true;f.evidence.interpretation.readOnly=true;
 const r=await generateContextAwareAskResponse(f.input),v=await finalized(f,r);
 assert.equal(r.model,format==="prose"?"server-profile-field-labs":"server-profile-presentation-unavailable");
 assert.equal(v.assessment.outcome,format==="prose"?"complete":"limited");assert.equal(calls,0);
});
test("general payload excludes preloaded factual carriers and assistant assertions",()=>{
 const f=fixture({mode:"conversation",evidenceBasis:"general"},"A current USER premise 12.37.");
 f.evidence.interpretation.conversationOnly=true;
 f.input.dialogueContext=[{id:"assistant-turn",role:"assistant",text:"ASSISTANT_STORED_SENTINEL 404.99"},{id:"user-turn",role:"user",text:"USER_PREMISE_SENTINEL"}];f.evidence.interpretation.request.referenceTurnIds=["user-turn"];
 const built=buildAskContext(f.input,false),payload=JSON.parse(buildAskProviderRequest(built.promptContext).input);
 assert.equal(dependsOnStoredState(f.evidence),false);assert.deepEqual(built.records,[]);
 assert.match(payload.currentMessage,/12.37/);assert.doesNotMatch(JSON.stringify(payload),/87.41|632.19|404.99|ASSISTANT_STORED_SENTINEL/);
 for(const key of ["careEntries","contextRecords","memories","currentState","episodes","concerns","operationReceipts","evidenceContract"])assert.equal(payload[key],undefined,key);
 assert.deepEqual(payload.pets,[{id:pet.id,name:pet.name}]);assert.match(JSON.stringify(payload.userPremises),/USER_PREMISE_SENTINEL/);
});

for(const [name,basis,question,answer] of [
 ["general","general","How can a quiet routine help?","A predictable routine can help reduce stress."],
 ["fictional","supplied_context","In a fictional story River carries a blue bag. Describe it.","In the story, River carries a blue bag."],
 ["current USER observation","supplied_context","River weighs 5 kg. Is that healthy?","Five kilograms alone cannot establish whether the weight is healthy; body condition and veterinary guidance matter."],
])test(name+" still uses general language without preloaded facts",async()=>{
 const f=fixture({mode:"conversation",evidenceBasis:basis},question);f.evidence.interpretation.conversationOnly=true;
 const requests=[];f.input.client={responses:{create:async r=>{requests.push(r);return {output_text:JSON.stringify({answer,answerSections:[],historyNarrative:null,relevantContextIds:[],safetyLevel:"normal",responseMode:"conversational",semanticEvents:[]})};}}};
 const result=await generateContextAwareAskResponse(f.input);
 assert.equal(requests.length,1);assert.equal(result.answer.summary,answer);assert.deepEqual(result.relevantContextIds,[]);
 assert.doesNotMatch(requests[0].input,/87.41|632.19/);assert.match(requests[0].input,new RegExp(question.replace(/[.*+?^$()|[\]\\]/g,"\\$&")));
});
test("static dispatch has no legacy projection or factual repair provider",async()=>{
 const fs=await import("node:fs/promises");
 const generation=await fs.readFile(new URL("../app/lib/ai/ask-reasoning.ts",import.meta.url),"utf8");
 const review=await fs.readFile(new URL("../app/lib/intelligence/review-history-narrative.ts",import.meta.url),"utf8");
 const projection=await fs.readFile(new URL("../app/lib/intelligence/read-projection.ts",import.meta.url),"utf8");
 assert.doesNotMatch(generation,/deterministicReadProjection|server-read-projection|canonicalHistoricalRead/);
 assert.doesNotMatch(review,/repairRejectedRead|executeAdmittedProviderCall|new OpenAI|\.responses\.create/);
 assert.doesNotMatch(projection,/bodyMeasurement|deterministicReadProjection|currentMessage|historyQueryRelevance/);
});

test("current user assertion cannot replace an explicitly requested saved fact",async()=>{const f=fixture({mode:"read",evidenceBasis:"saved_profile",profileFields:["weight"]},"River weighs 5 kg. What does Furvise have saved?");f.evidence.scope.readOnlyRecall=true;f.evidence.interpretation.readOnly=true;const r=await generateContextAwareAskResponse(f.input);assert.equal(r.model,"server-profile-field-labs");assert.match(r.answer.summary,/87\.41 kg/);assert.doesNotMatch(r.answer.summary,/\b5 kg/);await finalized(f,r);assert.equal(calls,0);});

test("legacy history fallback metadata cannot publish recent context or reopen a provider",async()=>{
 const f=fixture();delete f.evidence.interpretation;
 f.evidence.historyFallback="unsupported_query_interpretation_recent_context_only";
 const r=await generateContextAwareAskResponse(f.input);
 assert.equal(r.model,FACTUAL_UNAVAILABLE);
 await finalized(f,r);
 assert.deepEqual(r.relevantContextIds,[]);assert.deepEqual(r.referencedRecords,[]);
 assert.doesNotMatch(JSON.stringify(r.answer),/632.19|87.41/);
 assert.equal(calls,0);
});
test("ordinary Ask cannot enter the separate Vet Brief legacy retrieval branch",async()=>{
 const {retrieveAskHistory}=await import("../app/lib/intelligence/history-retrieval.ts");
 let databaseCalls=0;
 const db={from(){databaseCalls++;throw Error("DATABASE_FORBIDDEN");}};
 await assert.rejects(retrieveAskHistory({feature:"ask",currentMessage:"Retrieve prior notes."},db,[pet.id],{plan:{}}),/vet_brief_read_scope_required/);
 assert.equal(databaseCalls,0);
});

test("conversation review provenance is scoped to source-free turns",()=>{
 const f=fixture({mode:"conversation",evidenceBasis:"general"});
 f.evidence.interpretation.conversationOnly=true;
 assert.deepEqual(conversationReviewProvenance(f.evidence),{savedRecordRetrieval:"not_performed_for_this_turn"});
 f.evidence.interpretation.request.evidenceBasis="saved_history";
 assert.equal(conversationReviewProvenance(f.evidence),undefined);
 f.evidence.interpretation.request.evidenceBasis="general";
 f.evidence.interpretation.conversationOnly=false;
 assert.equal(conversationReviewProvenance(f.evidence),undefined);
});
