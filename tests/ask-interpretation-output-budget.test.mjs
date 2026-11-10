import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('.') && context.parentURL?.startsWith('file:')){
  const index=new URL(specifier+'/index.ts',context.parentURL);
  if(existsSync(index))return next(index.href,context);
 }
 return next(specifier,context);
}});
import {readOnlyFailureRouteFixture as fixture,note,selection} from "./helpers/ask-read-only-failure-route.mjs";
const {ASK_INTERPRETATION_MAX_OUTPUT_TOKENS: cap, ASK_MAX_OUTPUT_TOKENS: answerCap} = await import('../app/lib/ai/ask-provider.ts');
const {ASK_INTERPRETATION_LIMITS,interpretAskQuestion} = await import('../app/lib/intelligence/interpret-ask.ts');
const {buildAskProviderRequest} = await import('../app/lib/ai/ask-reasoning.ts');
const {AI_FEATURE_POLICIES: policies} = await import('../app/lib/ai/usage-guard/features.ts');
const {admitAiOperation} = await import('../app/lib/ai/usage-guard/admission.ts');
const {MemoryAiGuardTestStore} = await import('../app/lib/ai/usage-guard/memory-test-store.ts');
const {estimateProviderCostMicrodollars: cost} = await import('../app/lib/ai/usage-guard/cost-estimator.ts');
const model='gpt-5.4-mini', day='2032-02-06';
const environment={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'1',FURVISE_AI_DAILY_COST_LIMIT_USD:'0.0258',
 FURVISE_RATE_LIMIT_HASH_SECRET:'offline-budget-fixture-only-not-a-credential'};
const admit=(store,env=environment)=>admitAiOperation({env,store,feature:'ask',intendedModel:model,
 userId:'budget-owner',requestId:'budget-attempt',payload:{question:'offline'},now:new Date(day+'T00:00:00Z')});

test('legacy provider ceilings remain independent from the read-only Ask admission budget',()=>{
 assert.equal(cap,100000);
 assert.ok(cap<=128000);
  assert.equal(ASK_INTERPRETATION_LIMITS.outputTokens,Math.min(cap,8192));
 assert.equal(answerCap,8192);
 assert.equal(buildAskProviderRequest({currentMessage:'hello'}).max_output_tokens,policies.ask.maxOutputTokens);
 assert.equal(policies.ask.maxOutputTokens,2400);assert.equal(policies.ask.maximumProviderCalls,2);
 assert.equal(policies.ask.maxInputTokens,20000);
 assert.equal(policies.ask.maxInputCharacters,80000);
 assert.equal(policies.vet_brief.maxOutputTokens,12288);
 for(const [feature,expected] of Object.entries({product_explanation:360,product_query:520,product_question:650,safety_followup:650}))
  assert.equal(policies[feature].maxOutputTokens,expected);
});

test('real admission reserves the entire new output envelope before permitting dispatch',async t=>{
 t.mock.method(console,'info',()=>{});
 const store=new MemoryAiGuardTestStore(),a=await admit(store);
 const expected=cost(model,{inputTokens:policies.ask.maxInputTokens,outputTokens:policies.ask.maxOutputTokens});
 assert.equal(expected,25800);
 assert.deepEqual(store.getSnapshot(day),{calls:1,costMicrodollars:expected});
 const call=await a.beginProviderCall({model,input:{question:'offline'},maxOutputTokens:policies.ask.maxOutputTokens});
 assert.equal(call.reservation.reservedCostMicrodollars,expected);
 await a.fail(Error('offline simulated provider failure'));
 assert.equal(store.getSnapshot(day).costMicrodollars,expected,'started failure retains the reservation');
});

test('daily dollar ceiling rejects the larger reservation before any provider call',async t=>{
 t.mock.method(console,'info',()=>{});
 const store=new MemoryAiGuardTestStore();
 await assert.rejects(admit(store,{...environment,FURVISE_AI_DAILY_COST_LIMIT_USD:'0.025799'}),
  e=>e.reason==='daily_cost_limit');
 assert.deepEqual(store.getSnapshot(day),{calls:0,costMicrodollars:0});
});

test('admission rejects output above the authorized ceiling and releases an unstarted reservation',async t=>{
 t.mock.method(console,'info',()=>{});
 const store=new MemoryAiGuardTestStore(),a=await admit(store);
 await assert.rejects(a.beginProviderCall({model,input:{question:'offline'},maxOutputTokens:policies.ask.maxOutputTokens+1}),
  e=>e.reason==='feature_token_budget_exceeded');
 await a.release();
 assert.deepEqual(store.getSnapshot(day),{calls:0,costMicrodollars:0});
});

// Exercise the current public route and actual native provider parser, preserving
// incomplete-output, no-retry, read-only, publication and credit invariants.
for(const output of [[],[{type:'message',status:'incomplete',content:[{type:'output_text',text:'{"version":'}]}]])
 for(const failedCall of [1,2])test('incomplete native output releases credit without repair or writes: '+output.length+', call '+failedCall,async()=>{
  let calls=0,sent;const records=[structuredClone(note)],before=structuredClone(records);
  const nativeClient={responses:{create:async request=>{
   sent=request;calls++;
   if(calls<failedCall)return {status:'completed',output:[{type:'function_call',call_id:'read',name:'search_saved_records',arguments:selection.calls[0].arguments}],usage:{input_tokens:1,output_tokens:1}};
   return {status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output,usage:{input_tokens:1,output_tokens:1}};
  }}};
  const f=fixture(()=>{throw Error('must use real native parser')},records,{nativeClient,model:'offline-fixture'});
  const response=await f.send();
  assert.equal(response.status,503);
  assert.equal(calls,failedCall);assert.equal(f.state.calls,failedCall);
  assert.equal(f.state.reads,failedCall-1);
  assert.equal(sent.max_output_tokens,policies.ask.maxOutputTokens);
  assert.equal(sent.model,'offline-fixture');
  assert.deepEqual(f.state.credit,{status:'released',disposition:'release'});
  assert.equal(f.state.persistedAnswer,null);
  assert.ok(f.state.tables.every(table=>table==='dog_profiles'));
  assert.deepEqual(records,before);
  assert.ok(!f.state.events.some(event=>event.startsWith('assistant:')||event==='credit:complete'));
  assert.equal(f.state.providerEvents.filter(event=>event.outcome==='failed').length,1);
  assert.equal(f.state.traces.at(-1).providerCallCount,failedCall);
 });
test('interpretation SDK retries and deadline remain independently bounded',()=>{
 const code=readFileSync(new URL('../app/lib/intelligence/interpret-ask.ts',import.meta.url),'utf8');
 assert.match(code,/maxRetries:\s*0/);
 assert.equal(ASK_INTERPRETATION_LIMITS.timeoutMs,25000);
});

test('the configured GPT-5.4 Mini request retains effort none and never retries incomplete output',async t=>{
 t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});
 const pet={id:'subject',user_id:'owner',name:'Test Subject',species:'dog'};
 const context={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:'Explain this scenario.',
  currentTurn:{id:'source',role:'user',text:'Explain this scenario.'},conversationTurns:[],timeZone:'UTC'};
 let calls=0;
 await assert.rejects(interpretAskQuestion({context,model,client:{responses:{create:async request=>{
  calls++;
  assert.deepEqual(request.reasoning,{effort:'none'});
  assert.equal(request.max_output_tokens,policies.ask.maxOutputTokens);
  return {status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[]};
 }}}}),e=>e.diagnostics?.providerErrorCode==='ASK_INTERPRETATION_INCOMPLETE');
 assert.equal(calls,1);
});
