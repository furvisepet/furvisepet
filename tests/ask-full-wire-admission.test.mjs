import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import OpenAI from 'openai';
import { runWithAiAdmission } from '../app/lib/ai/usage-guard/context.ts';
import { readOnlyProvider } from '../app/lib/ask-read-only/provider.ts';
import { readOnlyToolsForPets } from '../app/lib/ask-read-only/core.mjs';
import { admitAiOperation } from '../app/lib/ai/usage-guard/admission.ts';
import { MemoryAiGuardTestStore } from '../app/lib/ai/usage-guard/memory-test-store.ts';
import { estimateInputTokens, estimateProviderCostMicrodollars } from '../app/lib/ai/usage-guard/cost-estimator.ts';
import { AI_FEATURE_POLICIES } from '../app/lib/ai/usage-guard/features.ts';

const model='gpt-5.4-mini',day='2038-06-17';
const env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'1',
 FURVISE_RATE_LIMIT_HASH_SECRET:'offline-full-wire-identity-fixture-000000'};
const reservedAskCost=estimateProviderCostMicrodollars(model,{inputTokens:AI_FEATURE_POLICIES.ask.maxInputTokens,outputTokens:AI_FEATURE_POLICIES.ask.maxOutputTokens});
const historicalCost=1_000_000-reservedAskCost-Math.floor(reservedAskCost/2);
const small=()=>({model,max_output_tokens:2400,instructions:'Synthetic instructions',
 input:'Synthetic request',text:{format:{type:'json_schema',name:'synthetic_contract',strict:true,
 schema:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false}}},
 reasoning:{effort:'none'},store:false});
const usage={input_tokens:11,output_tokens:7};
const call=async(request,invoke,extra={})=>{
 const {executeAdmittedResponsesRequest}=await import('../app/lib/ai/usage-guard/provider-call-budget.ts');
 return executeAdmittedResponsesRequest({request,model,maxOutputTokens:AI_FEATURE_POLICIES.ask.maxOutputTokens,invoke,...extra});
};
const admit=(store,id)=>admitAiOperation({env,store,feature:'ask',intendedModel:model,now:new Date(day+'T12:00:00Z'),
 requestId:id,userId:'synthetic-owner',payload:{fixture:id}});
const recording=(onBegin=()=>{})=>({providerDeadlineAt:Infinity,
 async beginProviderCall(value){await onBegin(value);return {reservation:{callId:'synthetic'}};},
 async recordProviderUsage(){},recordProviderFailure(){}});
const quiet=t=>{t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});};

test('full-wire regression: native read selection admits its entire dispatched tool contract',async t=>{
 quiet(t);let admitted,sent,calls=0;
 await assert.rejects(runWithAiAdmission(recording(v=>{admitted=v.input;}),()=>
  readOnlyProvider(model,()=>{},{responses:{create:async request=>{sent=request;calls++;
   return {status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[],usage};}}})({
    instructions:'Select an owned read or answer a general question.',context:{question:'Describe routine coat care.'},
    tools:readOnlyToolsForPets([{handle:'p1'}])},'read_selection')),
  e=>e.stage==='primary_invalid_output'&&e.diagnostics?.providerErrorCode==='ASK_READ_PROVIDER_INCOMPLETE'&&e.diagnostics?.providerEnvelope?.responseStatus==='incomplete');
 assert.equal(calls,1);assert.equal(admitted?.tools?.length,2,'native tool contract must be admitted');
 assert.equal(JSON.stringify(admitted),JSON.stringify(sent));
 assert.equal(sent.max_output_tokens,2400);
});

test('complete snapshot equals installed SDK serialized HTTP body, including all extra fields',async t=>{
 quiet(t);const request=small();request.metadata={fixture:'quote " and unicode 🐾'};
 request.tools=[{type:'function',name:'synthetic',description:'tool contract',parameters:{type:'object',properties:{}},strict:false}];
 request.include=['reasoning.encrypted_content'];
 let admitted,wire,calls=0;
 const sdk=new OpenAI({apiKey:'offline-not-a-credential',maxRetries:0,
 fetch:async(_url,options)=>{calls++;wire=options.body;return new Response(JSON.stringify({id:'synthetic',
 object:'response',status:'completed',output:[],usage}),{status:200,headers:{'content-type':'application/json'}});}});
 await runWithAiAdmission(recording(v=>{admitted=v.input;}),()=>call(request,snapshot=>sdk.responses.create(snapshot)));
 assert.equal(calls,1);assert.equal(wire,JSON.stringify(admitted));
 assert.deepEqual(JSON.parse(wire),request);
 assert.ok(estimateInputTokens(admitted)>estimateInputTokens({input:request.input,instructions:request.instructions}));
});

test('async admission cannot race original request mutation or a stateful serializer',async t=>{
 quiet(t);let seen,calls=0;
 const request=small();let serializations=0;
 request.metadata={toJSON(){serializations++;return {fixture:'first-'+serializations};}};
 const expected=JSON.parse(JSON.stringify({...request,metadata:{fixture:'first-1'}}));
 await runWithAiAdmission(recording(v=>{
  seen=v.input;request.input='changed after admission';
  request.text.format.schema.properties.value.type='number';
 }),()=>call(request,async snapshot=>{
  calls++;assert.deepEqual(snapshot,expected);assert.equal(snapshot,seen);
  assert.throws(()=>{snapshot.text.format.schema.properties.value.type='boolean';},TypeError);
  return {usage};
 }));
 assert.equal(serializations,1);assert.equal(calls,1);
});

test('every request component contributes to input admission before dispatch',async t=>{
 quiet(t);
 for(const field of ['input','instructions','schema','tools','metadata']){
  const store=new MemoryAiGuardTestStore(),a=await admit(store,'oversize-'+field),request=small();
  const large='x'.repeat(60001);
  if(field==='schema')request.text.format.schema.description=large;
  else if(field==='tools')request.tools=[{type:'function',name:'synthetic',description:large}];
  else if(field==='metadata')request.metadata={fixture:large};
  else request[field]=large;
  let calls=0;
  await assert.rejects(a.run(()=>call(request,async()=>{calls++;return {usage};})),
   e=>e.reason==='feature_token_budget_exceeded',field);
  assert.equal(calls,0,field);await a.release();
  assert.deepEqual(store.getSnapshot(day),{calls:0,costMicrodollars:0});
 }
});

test('exact estimator boundary admits once, one extra character fails closed',async t=>{
 quiet(t);
 for(const over of [0,1]){
  const request=small();request.input='';
  request.input='x'.repeat(60000-JSON.stringify(request).length+over);
  assert.equal(JSON.stringify(request).length,60000+over);
  const store=new MemoryAiGuardTestStore(),a=await admit(store,'boundary-'+over);let calls=0;
  const invoke=()=>a.run(()=>call(request,async()=>{calls++;throw Error('synthetic dispatch failure');}));
  await assert.rejects(invoke(),over?e=>e.reason==='feature_token_budget_exceeded':/synthetic dispatch failure/);
  assert.equal(calls,over?0:1);await a.release();
  assert.deepEqual(store.getSnapshot(day),{calls:over?0:1,costMicrodollars:over?0:reservedAskCost});
 }
});

test('one-dollar cumulative ceiling retains historical and unknown started exposure',async t=>{
 quiet(t);const store=new MemoryAiGuardTestStore();
 await store.reserveCall({callId:'historical',operationId:'historical',feature:'ask',day,
 callLimit:20,costLimitMicrodollars:1000000,maximumOperationCalls:1,
 operationCallTtlSeconds:3600,reservedCostMicrodollars:historicalCost});
 await store.markCallStarted({callId:'historical'});
 const a=await admit(store,'first-new');let calls=0;
 await assert.rejects(a.run(()=>call(small(),async()=>{calls++;throw Error('synthetic transport failure');})),
 /synthetic transport failure/);
 await a.fail();assert.equal(calls,1);
 assert.deepEqual(store.getSnapshot(day),{calls:2,costMicrodollars:historicalCost+reservedAskCost});
 await assert.rejects(admit(store,'second-new'),e=>e.reason==='daily_cost_limit');
 assert.deepEqual(store.getSnapshot(day),{calls:2,costMicrodollars:historicalCost+reservedAskCost});
});

test('model/output mismatches and non-JSON requests cannot reach admission or invocation',async()=>{
 for(const change of [
  r=>{r.model='other';},r=>{r.max_output_tokens=100001;},r=>{r.loop=r;}
 ]){
  const request=small();change(request);let admitted=0,invoked=0;
  await assert.rejects(runWithAiAdmission(recording(()=>{admitted++;}),
   ()=>call(request,async()=>{invoked++;return {usage};})));
  assert.equal(admitted,0);assert.equal(invoked,0);
 }
});

test('measured complete-wire evidence reconciles with unchanged estimator and policy',async t=>{
 quiet(t);
 if(!process.env.FURVISE_FULL_WIRE_FIXTURE){t.skip('external deterministic evidence supplied by bounded gate');return;}
 const wire=readFileSync(process.env.FURVISE_FULL_WIRE_FIXTURE,'utf8'),request=JSON.parse(wire);
 assert.equal(Buffer.byteLength(wire),164334);assert.equal(wire.length,164324);
 assert.equal(JSON.stringify(request),wire);
 assert.equal(estimateInputTokens(request),54775);
 assert.equal(AI_FEATURE_POLICIES.ask.maxInputTokens,20000);
 assert.equal(AI_FEATURE_POLICIES.ask.maxInputCharacters,80000);
 assert.equal(AI_FEATURE_POLICIES.ask.maxOutputTokens,2400);
 assert.equal(estimateProviderCostMicrodollars(model,{inputTokens:20000,outputTokens:100000}),465000);
 const store=new MemoryAiGuardTestStore(),a=await admit(store,'measured');let calls=0;
 // Preserve the historical wire bytes above, then exercise today's output cap on an explicit request copy.
 const currentRequest={...request,max_output_tokens:AI_FEATURE_POLICIES.ask.maxOutputTokens};
 await assert.rejects(a.run(()=>call(currentRequest,async()=>{calls++;return {usage};})),e=>e.reason==='feature_token_budget_exceeded');
 assert.equal(calls,0);await a.release();
 assert.deepEqual(store.getSnapshot(day),{calls:0,costMicrodollars:0});
});
