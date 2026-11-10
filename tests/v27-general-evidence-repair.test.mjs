import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAskInterpretationRequest,interpretAskQuestion} from '../app/lib/intelligence/interpret-ask.ts';
import {admitAiOperation} from '../app/lib/ai/usage-guard/admission.ts';
import {MemoryAiGuardTestStore} from '../app/lib/ai/usage-guard/memory-test-store.ts';
import {directFixturePlan} from './helpers/recursive-wire-fixture.mjs';
const env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'10',FURVISE_RATE_LIMIT_HASH_SECRET:'fixture-secret-0123456789012345678901234567890123456789'};
const usage={input_tokens:100,output_tokens:30};
const pet={id:'pet',user_id:'owner',name:'Maple',species:'dog'};
function context(text,prior=[]){const turn={id:'current',role:'user',text,createdAt:'2026-09-20T12:00:00Z'};return {owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:text,currentTurn:turn,conversationTurns:[...prior,turn],conversationId:'conversation',timeZone:'UTC'};}
function request(text,patch={}){return {draftAnswer:'An offline model draft.',calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:null,writeJob:null,task:null,temporalScope:null,mutationIntent:null,recordSelection:null,profileFields:[],projection:null,version:'ask-request.v2',mode:'conversation',question:text,requirements:[],evidenceNeeds:[],outputFormat:null,evidenceBasis:'general',premiseQuotes:[],excludedPetNames:[],referenceTurnIds:[],scope:'none',petNames:[],operation:'general',selection:'summary',quantity:null,topic:'general',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,...patch};}
async function run(text, responses, prior=[]){
 const ctx=context(text,prior),prepared=prepareAskInterpretationRequest(ctx,'gpt-5.4-mini'),plan=directFixturePlan(prepared.transport);
 const good=plan.encode({request:request(text)});
 const store=new MemoryAiGuardTestStore(),admission=await admitAiOperation({env,store,feature:'ask',intendedModel:'gpt-5.4-mini',userId:'owner',requestId:'general-'+Math.random(),payload:{case:text},now:new Date('2039-01-01T00:00:00Z')});
 let calls=0;const sent=[];
 try { const result=await admission.run(()=>interpretAskQuestion({context:ctx,model:'gpt-5.4-mini',client:{responses:{create:async req=>{sent.push(req);const value=responses[calls++](structuredClone(good),plan);return {status:'completed',output_text:JSON.stringify(value),usage};}}}}));return {result,calls,sent,plan};}
 catch(error){return {error,calls,sent,plan};}
 finally{await admission.release();}
}
const bad=w=>{w.request.evidenceContext.evidenceBasis='supplied_context';w.request.evidenceContext.premiseQuotes=[];return w};
test('empty supplied premise triggers existing bounded transport repair and validates a general response',async()=>{
 const x=await run('Which planet has prominent rings?',[bad,w=>w]);
 assert.equal(x.calls,2);assert.ifError(x.error);assert.equal(x.result.request.evidenceBasis,'general');assert.equal(x.result.conversationOnly,true);assert.match(x.sent[1].input,/transportRepair/);
});
test('valid casual follow-up stays conversation with one call',async()=>{
 const prior=[{id:'prior',role:'user',text:'I had a long walk today.',createdAt:'2026-09-20T11:00:00Z'}];
 const x=await run('What do you think?',[w=>w],prior);assert.ifError(x.error);assert.equal(x.calls,1);assert.equal(x.result.conversationOnly,true);
});
test('repeated invalid output never reaches a validated response or third call',async()=>{
 const x=await run('Why is the sky blue?',[bad,bad]);assert.ok(x.error);assert.equal(x.calls,2);assert.equal(x.result,undefined);
});
test('malformed envelope cannot become a conversation answer',async()=>{
 const x=await run('Explain tides.',[w=>({...w,format:'wrong'})]);assert.ok(x.error);assert.ok(x.calls<=2);assert.equal(x.result,undefined);
});

test('genuine current user scenario retains its supplied premise',async()=>{
 const text='Suppose a fictional dog has blue fur. Describe the dog.';
 const x=await run(text,[(w,p)=>p.encode({request:request(text,{evidenceBasis:'supplied_context',premiseQuotes:['a fictional dog has blue fur']})})]);
 assert.ifError(x.error);assert.equal(x.calls,1);assert.equal(x.result.request.evidenceBasis,'supplied_context');assert.equal(x.result.conversationOnly,true);
});
test('genuine prior user premise remains attributed to user text',async()=>{
 const text='What do you think of that fictional setting?';
 const prior=[{id:'prior',role:'user',text:'Imagine a town floating above the sea.',createdAt:'2026-09-20T11:00:00Z'}];
 const x=await run(text,[(w,p)=>p.encode({request:request(text,{evidenceBasis:'supplied_context',premiseQuotes:['a town floating above the sea'],referenceTurnIds:['prior']})})],prior);
 assert.ifError(x.error);assert.equal(x.result.request.evidenceBasis,'supplied_context');assert.equal(x.calls,1);
});
test('assistant-only invented premise cannot gain user authority',async()=>{
 const text='Please continue.';
 const prior=[{id:'prior',role:'assistant',text:'The moon is made of cheese.',createdAt:'2026-09-20T11:00:00Z'}];
 const x=await run(text,[(w,p)=>p.encode({request:request(text,{evidenceBasis:'supplied_context',premiseQuotes:['The moon is made of cheese.']})})],prior);
 assert.ok(x.error);assert.equal(x.result,undefined);assert.ok(x.calls<=2);
});
test('mixed mutation and empty supplied premise cannot be normalized into conversation',async()=>{
 const x=await run('Save this and explain it.',[w=>{w.request.evidenceContext.mode='mixed';w.request.evidenceContext.evidenceBasis='supplied_context';w.request.evidenceContext.premiseQuotes=[];return w},w=>{w.request.evidenceContext.mode='mixed';w.request.evidenceContext.evidenceBasis='supplied_context';w.request.evidenceContext.premiseQuotes=[];return w}]);
 assert.ok(x.error);assert.equal(x.result,undefined);assert.ok(x.calls<=2);
});
