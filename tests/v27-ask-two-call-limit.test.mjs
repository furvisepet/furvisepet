import test from 'node:test';
import assert from 'node:assert/strict';
import {admitAiOperation} from '../app/lib/ai/usage-guard/admission.ts';
import {MemoryAiGuardTestStore} from '../app/lib/ai/usage-guard/memory-test-store.ts';

const env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'10',FURVISE_RATE_LIMIT_HASH_SECRET:'x'.repeat(48)};
const model='gpt-5.4-mini';
for (const scenario of [
 {name:'answer then review', phases:[{stage:'interpretation'},{stage:'answer_generation'},{purpose:'history_review',stage:'verification'}]},
 {name:'repair then answer', phases:[{stage:'interpretation'},{purpose:'interpretation_repair',stage:'interpretation'},{stage:'answer_generation'}]},
 {name:'retry then verification', phases:[{stage:'interpretation'},{stage:'answer_generation'},{purpose:'generation_repair',stage:'repair'}]},
]) test('Ask caps all phases at two: '+scenario.name,async()=>{
 const store=new MemoryAiGuardTestStore();
 const a=await admitAiOperation({env,store,feature:'ask',intendedModel:model,userId:'owner',requestId:scenario.name,payload:{scenario:scenario.name}});
 let starts=0;
 try {
  for(const phase of scenario.phases.slice(0,2)){
   const call=await a.beginProviderCall({...phase,model,input:'offline',maxOutputTokens:100});
   starts++;
   await a.recordProviderUsage(call.reservation,model,{inputTokens:1,outputTokens:1,cachedInputTokens:0});
  }
  await assert.rejects(a.beginProviderCall({...scenario.phases[2],model,input:'offline',maxOutputTokens:100}),/AI_PROVIDER_BUDGET_EXHAUSTED|provider_call_budget_exhausted/);
  assert.equal(starts,2);
 } finally {await a.release();}
});
