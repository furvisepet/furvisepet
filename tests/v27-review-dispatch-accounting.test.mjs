import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,next) { return s === 'server-only'
  ? { url:'data:text/javascript,export {};', format:'module', shortCircuit:true } : next(s,c); } });
const { interpretAskQuestion } = await import('../app/lib/intelligence/interpret-ask.ts');
const { createAskEvidenceContract } = await import('../app/lib/intelligence/ask-evidence.ts');
const { generateContextAwareAskResponse } = await import('../app/lib/ai/ask-reasoning.ts');
const { validateGeneratedAnswer } = await import('../app/lib/intelligence/validation/validate-answer.ts');
const { reviewTaskCompletion } = await import('../app/lib/intelligence/review-task-completion.ts');

test('denied completion review emits no dispatched provider event after two admitted attempts', async () => {
 const question = 'What causes a reflection in a still pond?';
 const draft = 'A still water surface reflects some incoming light, which lets you see an image of nearby objects.';
 const pet = { id:'pet-scope', user_id:'owner', name:'Pet', species:'dog' };
 const context = { owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:question,
   currentTurn:{id:'turn-1',role:'user',text:question},conversationTurns:[],timeZone:'UTC',
   careEntries:[],selectedCareEntries:[],memories:[] };
 const proposal = {version:'ask-request.v2',mode:'conversation',scope:'none',operation:'general',
   selection:'summary',question,requirements:[],referenceTurnIds:[],petNames:[],excludedPetNames:[],
   quantity:null,topic:'weather',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,
   frame:null,evidenceBasis:'general',premiseQuotes:[],outputFormat:null,draftAnswer:draft};
 const {admitAiOperation}=await import("../app/lib/ai/usage-guard/admission.ts");
 const {MemoryAiGuardTestStore}=await import("../app/lib/ai/usage-guard/memory-test-store.ts");
 const {executeAdmittedResponsesRequest}=await import("../app/lib/ai/usage-guard/provider-call-budget.ts");
 const store=new MemoryAiGuardTestStore();
 const admission=await admitAiOperation({
  env:{NODE_ENV:"test",FURVISE_AI_DAILY_CALL_LIMIT:"20",FURVISE_AI_DAILY_COST_LIMIT_USD:"10",
   FURVISE_RATE_LIMIT_HASH_SECRET:"offline-fixture-integrity-key-for-testing-only"},
  store,feature:"ask",intendedModel:"gpt-5.4-mini",userId:"owner",requestId:"denied-review-fixture",
  payload:{question},now:new Date("2039-01-01T00:00:00Z")});
 const physical=[];
 const planner = { responses:{ create:async request => {
   physical.push('interpretation');
   assert.match(JSON.stringify(request.text.format.schema),/draftAnswer/);
   return {output_text:JSON.stringify(proposal),usage:{input_tokens:1,output_tokens:1}};
 } } };
 const interpretation=await admission.run(()=>interpretAskQuestion({context,model:'gpt-5.4-mini',client:planner}));
 assert.equal(interpretation.conversationOnly,true);
 assert.equal(interpretation.provisionalAnswer,draft);
 const planned={...context,askInterpretation:interpretation};
 const evidence=createAskEvidenceContract(planned,[]);
 const noGenerator={responses:{create:async()=>{physical.push('unexpected-generation');throw Error('GENERATION_CALL_FORBIDDEN');}}};
 const answer=await generateContextAwareAskResponse({
   question,requestId:'turn-1',locale:'en-CA',conversationOnly:true,
   provisionalAnswer:interpretation.provisionalAnswer,evidenceContract:evidence,
   profiles:[],careEntries:[],memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],client:noGenerator
 });
 const validate=x=>validateGeneratedAnswer(x,planned,'routine',[]);
 const validation=validate(answer);
 assert.equal(validation.valid,true,JSON.stringify(validation.errors));
 const events=[];
 try {
  await admission.run(()=>executeAdmittedResponsesRequest({
   purpose:"interpretation_repair",model:"gpt-5.4-mini",stage:"interpretation",maxOutputTokens:32,
   request:{model:"gpt-5.4-mini",max_output_tokens:32,input:"Offline repair-budget fixture"},
   invoke:async()=>{physical.push("repair");return {usage:{input_tokens:1,output_tokens:1}};}
  }));
  const reviewer={responses:{create:async()=>{physical.push("unexpected-review");throw Error("REVIEW_MUST_NOT_DISPATCH");}}};
  await assert.rejects(admission.run(()=>reviewTaskCompletion({
   validation,context:planned,requestId:"denied-review-fixture",validate,client:reviewer,
   onProviderEvent:event=>events.push(event)
  })),e=>e.reason==="provider_call_budget_exhausted");
  assert.deepEqual(physical,["interpretation","repair"]);
  assert.deepEqual(events.filter(event=>event.outcome==="started"),[]);
  assert.equal(store.getSnapshot("2039-01-01").calls,2);
 } finally {await admission.release();}
});
