import assert from "node:assert/strict";
import test from "node:test";
import {exercise,clock} from "../scripts/audits/helpers/lifetime-harness.mjs";
import {pets} from "../scripts/audits/fixtures/ask-lifetime-history.mjs";

test("a current emergency retains actionable guidance when a typed saved-profile read cannot publish",async t=>{
 clock(t);
 const question="Milo collapsed and cannot breathe. What weight is saved in Milo's profile?";
 let providerCalls=0,generated;
 const forbidden=async()=>{providerCalls++;throw Error("STORED_FACTUAL_PROVIDER_FORBIDDEN");};
 try {
  const run=await exercise(question,{
   fixturePets:pets.map(p=>p.id==="milo"?{...p,weight_value:27.8,weight_unit:"kg"}:p),
   interpretationProposal:{version:"ask-request.v2",mode:"read",question,requirements:[],referenceTurnIds:[],
    evidenceBasis:"saved_profile",scope:"named",petNames:["Milo"],operation:"recall",selection:"summary",
    quantity:null,topic:"profile",terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,
    outputFormat:"prose",profileFields:["weight"],evidenceNeeds:[],readTicket:null,projection:null},
   providerResponse:forbidden,reviewProviderResponse:forbidden,taskReviewProviderResponse:forbidden,
   expectedProviderCalls:0,expectedReviewCalls:0,afterGeneration:r=>{generated=r;},
  });
  assert.equal(run.result.safety.currentMessageEmergency,true);
  assert.equal(run.result.reasoning.safetyLevel,"urgent");
  assert.equal(run.result.answerValidation.valid,true);
  assert.match(JSON.stringify(run.result.reasoning.answer),/emergency veterinarian|emergency vet|urgent veterinary/i);
  assert.deepEqual(run.result.reasoning.relevantContextIds,[]);
  assert.deepEqual(run.result.acceptedCareActions,[]);
 } finally {
  assert.equal(providerCalls,0);
  if(generated){
   assert.equal(generated.evidenceContract.interpretation.request.evidenceBasis,"saved_profile");
   assert.deepEqual(generated.evidenceContract.interpretation.request.profileFields,["weight"]);
   assert.deepEqual(generated.relevantContextIds,[]);
  }
 }
});

const {resolveSafetyState}=await import("../app/lib/intelligence/safety-state.ts");
const {generateContextAwareAskResponse}=await import("../app/lib/ai/ask-reasoning.ts");
const {finalizeAskAnswer}=await import("../app/lib/intelligence/finalize-ask-answer.ts");
const {buildGovernedAskExecutionPlan}=await import("../app/lib/intelligence/ask-execution-plan.ts");
const {validateGeneratedAnswer}=await import("../app/lib/intelligence/validation/validate-answer.ts");
const {reviewTaskCompletion}=await import("../app/lib/intelligence/review-task-completion.ts");
const {readReviewedHistoryAnswer}=await import("../app/lib/intelligence/history-review-state.ts");
const {storedEmergencyApplies,storedEmergencyPublicationFailure,STORED_EMERGENCY}=await import("../app/lib/intelligence/stored-emergency-publication.ts");
const {bindTypedReadTicket}=await import("../app/lib/furvise-brain/typed-read-ticket.ts");
const {bindStoredRead}=await import("../app/lib/furvise-brain/stored-read.ts");
const {executeStoredRead}=await import("../app/lib/furvise-brain/stored-read-organ.ts");
const {bindStoredReadEvidence}=await import("../app/lib/intelligence/stored-read-publication.ts");
const pet={id:"00000000-0000-4000-8000-000000000002",user_id:"00000000-0000-4000-8000-000000000001",name:"River",species:"dog",weight_value:87.41,weight_unit:"kg"};
const emergency="River collapsed and cannot breathe. Show the requested saved information.";
let boundaryCalls=0;
const forbiddenClient={responses:{create:async()=>{boundaryCalls++;throw Error("EMERGENCY_PROVIDER_FORBIDDEN");}}};
async function setup(basis="saved_profile",question=emergency){
 const request={mode:"read",evidenceBasis:basis,requirements:[],referenceTurnIds:[],profileFields:basis==="saved_profile"?["weight"]:[],evidenceNeeds:[],readTicket:null,quantity:null,outputFormat:"prose"};
 if(basis==="saved_history")request.readTicket=bindTypedReadTicket({operation:"read",temporal:{from:null,to:null,anchor:null},predicates:[],selection:{groupBy:["subject"],union:[{orderBy:[{field:"event_at",direction:"desc"}],take:{count:1,per:"group"}}]},outputs:{completeness:"sufficient",ordering:"desc",limit:null}},[pet.id]);
 if(basis==="stored")request.storedRead=bindStoredRead({operation:"read",domain:"memory",scope:"subjects",reference:null,projection:"records"},{ownerId:pet.user_id,subjectIds:[pet.id],references:[]});
 const evidence={version:"ask-evidence.v1",scope:{authorizedPetIds:[pet.id],requestText:question,status:"resolved",readOnlyRecall:true,requestKind:"ordinary"},
 petNames:{[pet.id]:pet.name},interpretation:{operation:"recall",readOnly:true,petIds:[pet.id],request},sources:[],represented:[],losses:[],verifiedFacts:[],representation:"complete",completeness:{retrieval:"unknown",corrections:"unknown",extraction:"unknown",grouping:"unknown"}};
 const context={activeConcerns:[],recentlyResolvedConcerns:[],activeEpisodes:[],monitoringEpisodes:[],currentState:null,pet,owner:{userId:pet.user_id},eligiblePets:[pet],askInterpretation:evidence.interpretation,currentMessage:question,memories:[],careEntries:[]};
 if(basis==="stored"){
  const db={from(table){assert.equal(table,"furvise_memories");const chain={then:resolve=>Promise.resolve({data:[],error:null,count:0}).then(resolve)};
   for(const method of ["select","eq","is","in","order","limit"])chain[method]=()=>chain;return chain;}};
  const receipt=await executeStoredRead(request.storedRead,{ownerId:pet.user_id,ownedPetIds:[pet.id],db});
  assert.equal(receipt.status,"complete_empty");bindStoredReadEvidence(evidence,receipt);
 }
 const response=await generateContextAwareAskResponse({profiles:[pet],question,careEntries:[],memories:[],recentUpdates:[],productFeedback:[],conversationTurns:[],evidenceContract:evidence,client:forbiddenClient});
 response.intelligenceSafety={level:"emergency",reason:"current emergency",requiresImmediateAction:true,shoppingSuppressed:true};
 const plan=()=>buildGovernedAskExecutionPlan({sourceMessageId:"source",petId:pet.id,careActions:[],semanticEvents:[],learnings:[]});
 return {context,response,plan,safety:resolveSafetyState(context)};
}
function sourceFree(r){
 assert.equal(r.model,STORED_EMERGENCY);
 assert.deepEqual(r.relevantContextIds,[]);assert.deepEqual(r.referencedRecords,[]);
 for(const key of ["applicationActions","careActions","semanticEvents","learnings"])assert.deepEqual(r[key],[],key);
 for(const key of ["labsList","profileFieldLabs","historyNarrative","historicalResult","historySynthesis"])assert.equal(r[key],undefined,key);
 assert.equal(r.evidenceContract.answerSourceIds,undefined);assert.equal(r.evidenceContract.answerContent,undefined);
 assert.equal(r.proposedHistoryUpdate.shouldOffer,false);assert.equal(r.shoppingSuppressed,true);
 assert.equal(r.intelligenceSafety.requiresImmediateAction,true);assert.equal(r.safetyLevel,"urgent");
 assert.doesNotMatch(JSON.stringify(r.answer),/87\.41/);
 assert.equal(readReviewedHistoryAnswer(r),null);
}
for(const basis of ["saved_profile","saved_history","stored"])test(basis+" emergency finalization is source-free, limited and terminal",async()=>{
 const f=await setup(basis);
 const before=structuredClone(f.response.evidenceContract.interpretation.request);
 const result=await finalizeAskAnswer({reasoning:f.response,safety:f.safety,context:f.context,requestId:"offline",authoritativePetIds:[pet.id],executionPlan:f.plan()});
 assert.equal(result.validation.valid,true);assert.equal(result.validation.assessment.outcome,"limited");
 assert.equal(result.validation.assessment.checks.taskCompletion,"failed");assert.equal(result.suppressWrites,true);
 sourceFree(f.response);assert.deepEqual(f.response.evidenceContract.interpretation.request,before);
 assert.equal(storedEmergencyPublicationFailure(f.response,f.context,[pet.id],f.safety),null);assert.equal(boundaryCalls,0);
});
for(const [name,change] of [
 ["foreign scope",r=>r.evidenceContract.scope.authorizedPetIds.push("foreign")],
 ["foreign stored subject",r=>r.evidenceContract.interpretation.request.storedRead.subjectIds.push("foreign")],
 ["executable action",r=>r.applicationActions.push({type:"pet.delete_permanently"})],
 ["malformed actions",r=>r.careActions={}],
 ["forged write authority",r=>r.evidenceContract.interpretation.request.writeJob={operation:"append"}],
])test("emergency does not launder "+name,async()=>{
 const f=await setup("stored");change(f.response);
 await assert.rejects(finalizeAskAnswer({reasoning:f.response,safety:f.safety,context:f.context,requestId:"offline",authoritativePetIds:[pet.id],executionPlan:f.plan()}),/emergency_publication/);
 assert.equal(boundaryCalls,0);
});
for(const [name,change] of [
 ["prose",r=>r.answer.summary+=" Saved weight is 87.41 kg."],
 ["source",r=>r.relevantContextIds.push("profile-source")],
 ["record",r=>r.referencedRecords.push({id:"stored-source"})],
 ["action",r=>r.applicationActions.push({type:"pet.update_profile"})],
 ["narrative",r=>r.historyNarrative={text:"Stored fact"}],
])test("terminal emergency rejects tampered "+name,async()=>{
 const f=await setup();const validate=r=>validateGeneratedAnswer(r,f.context,"emergency",[pet.id],f.safety);
 const validation=validate(f.response);assert.equal(validation.valid,true);change(validation.response);
 const reviewed=await reviewTaskCompletion({validation,resolvedSafety:f.safety,context:f.context,requestId:"offline",validate,client:forbiddenClient});
 assert.equal(reviewed.valid,false);assert.equal(boundaryCalls,0);
});
test("pending write cannot enter emergency finalization",async()=>{
 const f=await setup();
 const plan=buildGovernedAskExecutionPlan({sourceMessageId:"source",petId:pet.id,careActions:[{action:"append",severity:"routine"}],semanticEvents:[],learnings:[]});
 await assert.rejects(finalizeAskAnswer({reasoning:f.response,safety:f.safety,context:f.context,requestId:"offline",authoritativePetIds:[pet.id],executionPlan:plan}),/ASK_EMERGENCY_EXECUTION_PLAN_REJECTED/);
});
for(const [name,message] of [
 ["historical","Last year River collapsed and could not breathe. What is saved?"],
 ["hypothetical","What if River collapses and cannot breathe?"],
 ["quoted",'The article says "collapsed and cannot breathe". What is saved?'],
 ["resolved","River collapsed last year but recovered fully. What is saved?"],
 ["prior turn","What weight is saved for River?"],
])test(name+" wording does not grant the current emergency terminal contract",async()=>{
 const f=await setup("saved_profile",message);
 assert.equal(storedEmergencyApplies(f.response.evidenceContract,f.safety),false);
 assert.notEqual(storedEmergencyPublicationFailure(f.response,f.context,[pet.id],f.safety),null);
});


for(const [name,message,patch] of [
 ["hypothetical","What if River collapses and cannot breathe?",{}],
 ["quoted","The article says "+String.fromCharCode(34)+"River collapsed and cannot breathe."+String.fromCharCode(34),{}],
 ["historical","River collapsed last year.",{}],
 ["stored urgent unrelated","What weight is saved for River?",{currentState:{state:{breathing:{status:"abnormal"}}}}],
])test("canonical "+name+" keeps the ordinary stored finalization path",async()=>{
 const f=await setup("saved_profile",message);
 Object.assign(f.context,patch);f.safety=resolveSafetyState(f.context);
 assert.equal(f.safety.currentMessageEmergency,false);
 if(name==="stored urgent unrelated")assert.equal(f.safety.level,"urgent");
 assert.equal(storedEmergencyApplies(f.response.evidenceContract,f.safety),false);
 const before=f.response.model;
 const final=await finalizeAskAnswer({reasoning:f.response,safety:f.safety,context:f.context,requestId:"offline",authoritativePetIds:[pet.id],executionPlan:f.plan()});
 assert.equal(final.validation.valid,true);assert.equal(f.response.model,before);
 assert.notEqual(f.response.model,STORED_EMERGENCY);assert.equal(boundaryCalls,0);
});
test("uncertain canonical current report is terminal without downstream text interpretation",async()=>{
 const f=await setup("saved_profile","I think River cannot breathe right now.");
 assert.equal(f.safety.currentMessageEmergency,true);
 // Applicability and guidance already have canonical authority; changing presentation context cannot reclassify them.
 f.context.currentMessage="What if River cannot breathe?";
 const final=await finalizeAskAnswer({reasoning:f.response,safety:f.safety,context:f.context,requestId:"offline",authoritativePetIds:[pet.id],executionPlan:f.plan()});
 assert.equal(final.validation.valid,true);sourceFree(f.response);
 assert.equal(final.validation.assessment.checks.taskCompletion,"failed");
 assert.equal(final.validation.assessment.outcome,"limited");assert.equal(boundaryCalls,0);
});
for(const tags of [[],["unknown"],null,["collapse","collapse"]])test("inconsistent canonical tags fail closed: "+JSON.stringify(tags),async()=>{
 const f=await setup();f.safety={...f.safety,currentMessageEmergencyTags:tags};
 await assert.rejects(finalizeAskAnswer({reasoning:f.response,safety:f.safety,context:f.context,requestId:"offline",authoritativePetIds:[pet.id],executionPlan:f.plan()}),/emergency_safety_inconsistent/);
 assert.equal(boundaryCalls,0);
});
test("missing resolved safety cannot authorize an emergency marker or task-review bypass",async()=>{
 const f=await setup();
 const validation=validateGeneratedAnswer(f.response,f.context,"emergency",[pet.id],f.safety);
 assert.equal(validation.valid,true);
 const reviewed=await reviewTaskCompletion({validation,context:f.context,requestId:"offline",validate:r=>validateGeneratedAnswer(r,f.context,"emergency",[pet.id]),client:forbiddenClient});
 assert.equal(reviewed.valid,false);assert.equal(boundaryCalls,0);
});
for(const [name,patch] of [
 ["learnings",{learnings:[{subjectType:"pet",subjectId:pet.id,factKey:"anything"}]}],
 ["semantic events",{semanticEvents:[{event:{subject:{id:pet.id},transition:null,state:null,references:{}},destinations:["care_event"]}]}],
])test("canonical emergency rejects governed pending "+name,async()=>{
 const f=await setup();
 const plan=buildGovernedAskExecutionPlan({sourceMessageId:"source",petId:pet.id,careActions:[],semanticEvents:[],learnings:[],...patch});
 await assert.rejects(finalizeAskAnswer({reasoning:f.response,safety:f.safety,context:f.context,requestId:"offline",authoritativePetIds:[pet.id],executionPlan:plan}),/ASK_EMERGENCY_EXECUTION_PLAN_REJECTED/);
});
test("proposed history update cannot be laundered by emergency",async()=>{
 const f=await setup();f.response.proposedHistoryUpdate.shouldOffer=true;
 await assert.rejects(finalizeAskAnswer({reasoning:f.response,safety:f.safety,context:f.context,requestId:"offline",authoritativePetIds:[pet.id],executionPlan:f.plan()}),/emergency_publication_has_write/);
});
test("prior factual presentation carriers are removed from the original published response",async()=>{
 const f=await setup("saved_profile","What is saved for River?");
 assert.equal(f.response.model,"server-profile-field-labs");assert.ok(f.response.profileFieldLabs);
 f.context.currentMessage=emergency;f.safety=resolveSafetyState(f.context);
 const result=await finalizeAskAnswer({reasoning:f.response,safety:f.safety,context:f.context,requestId:"offline",authoritativePetIds:[pet.id],executionPlan:f.plan()});
 sourceFree(f.response);assert.equal(result.suppressWrites,true);
});
test("stored emergency helper cannot parse language or infer eligibility from safety level",async()=>{
 const fs=await import("node:fs/promises");
 const helper=await fs.readFile(new URL("../app/lib/intelligence/stored-emergency-publication.ts",import.meta.url),"utf8");
 assert.doesNotMatch(helper,/detectImmediateAskEmergency|detectAskConcernTags|safetyTemporalScope|context.currentMessage/);
 const runner=await fs.readFile(new URL("../app/lib/intelligence/run-intelligence.ts",import.meta.url),"utf8");
 assert.equal((runner.match(/resolveSafetyState\(context\)/g)||[]).length,1);
 assert.match(runner,/finalizeAskAnswer\(\{\s*reasoning, safety,/);
});
