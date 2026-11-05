import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/ask-staged-route-fixture.mjs';
import {directFixturePlan} from './helpers/recursive-wire-fixture.mjs';
import {prepareAskInterpretationRequest} from '../app/lib/intelligence/interpret-ask.ts';
import {admitAiOperation} from '../app/lib/ai/usage-guard/admission.ts';
import {MemoryAiGuardTestStore} from '../app/lib/ai/usage-guard/memory-test-store.ts';
const corpus=JSON.parse(readFileSync(new URL('./fixtures/ask-wire-codec.json',import.meta.url),'utf8'));
const template=corpus.fixtures.find(f=>f.canonical.request.evidenceBasis==='saved_profile').canonical.request;
const env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'10',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-fixture-identity-'.repeat(3)};
test('normal Ask route repairs conflicting profile fields before factual context',async t=>{
 t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});
 let prepared,admission,calls=0;const interpretations=[];
 const question="What's Cedar's current profile weight?";
 const store=new MemoryAiGuardTestStore();
 const f=fixture({creditLedger:true,fullCatalogPipeline:true,
  admitAiOperation:async input=>admission=await admitAiOperation({...input,store,env}),
  onContext:ctx=>{prepared=prepareAskInterpretationRequest(ctx,'gpt-5.4-mini')},
  onInterpretation:value=>interpretations.push(value),
  providerCreate:async req=>{
   calls++;const proposal={request:{...structuredClone(template),question,scope:'named',petNames:['Cedar'],topic:'profile'}};
   const wire=directFixturePlan(prepared.transport).encode(proposal);
   if(calls===1)wire.request.quantity='records';
   else {const input=JSON.parse(req.input);assert.ok(input.transportRepair.fieldHints.includes('quantity'));}
   return {status:'completed',output_text:JSON.stringify(wire),usage:{input_tokens:100,output_tokens:20,total_tokens:120}};
  }});
 const before=structuredClone(f.rows.pet_care_entries);
 try {
  const response=await f.send(question);await response.json();
  assert.equal(calls,2);assert.equal(interpretations.length,1);assert.equal(interpretations[0].request.evidenceBasis,'saved_profile');
  assert.ok(f.state.events.includes('factual-context:attempt'));
  assert.deepEqual(f.rows.pet_care_entries,before);
  assert.equal(response.status,503,'fixture deliberately stops at factual context; no answer is claimed');
 }finally{if(admission)await admission.release();}
});
