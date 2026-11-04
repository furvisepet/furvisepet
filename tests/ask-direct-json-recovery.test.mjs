import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {directFixturePlan} from './helpers/recursive-wire-fixture.mjs';
import {prepareAskInterpretationRequest,interpretAskQuestion} from '../app/lib/intelligence/interpret-ask.ts';
import {admitAiOperation} from '../app/lib/ai/usage-guard/admission.ts';
import {MemoryAiGuardTestStore} from '../app/lib/ai/usage-guard/memory-test-store.ts';
const corpus=JSON.parse(readFileSync(new URL('./fixtures/ask-wire-codec.json',import.meta.url),'utf8'));
const template=corpus.fixtures.find(f=>f.canonical.request.evidenceBasis==='saved_profile').canonical.request;
const pet={id:'pet',user_id:'owner',name:'Aster',species:'cat'};
const text="What is Aster's current profile weight?";
const currentTurn={id:'current',role:'user',text,createdAt:'2026-09-20T12:00:00Z'};
const context={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:text,currentTurn,conversationTurns:[currentTurn],conversationId:'conversation',timeZone:'UTC'};
const env={NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'10',FURVISE_RATE_LIMIT_HASH_SECRET:'offline-fixture-identity-'.repeat(3)};
const usage={input_tokens:100,output_tokens:20,total_tokens:120};
async function runCase(t,mode){
 t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});
 const prepared=prepareAskInterpretationRequest(context,'gpt-5.4-mini');
 const canonical={request:{...structuredClone(template),question:text,scope:'named',petNames:['Aster'],topic:'profile'}};
 const good=directFixturePlan(prepared.transport).encode(canonical);
 const bad=structuredClone(good);bad.request.readTicket=mode==='canonical'?'{}':'{bad private example';
 const store=new MemoryAiGuardTestStore();
 const admission=await admitAiOperation({env,store,feature:'ask',intendedModel:'gpt-5.4-mini',userId:'owner',requestId:'test-'+mode,payload:{case:mode},now:new Date('2039-01-01T00:00:00Z')});
 let calls=0;const purposes=[],events=[];const begin=admission.beginProviderCall.bind(admission);
 admission.beginProviderCall=async x=>{purposes.push(x.purpose??'initial');return begin(x)};
 try{
  const invoke=()=>interpretAskQuestion({context,model:'gpt-5.4-mini',onProviderEvent:e=>events.push(e),client:{responses:{create:async req=>{
   calls++;
   if(calls===2){const input=JSON.parse(req.input);assert.deepEqual(input.transportRepair,mode==='canonical'?{validationCode:'ASK_WIRE_CANONICAL_SCHEMA'}:{validationCode:'ASK_DIRECT_FIELD_JSON',field:'readTicket'});assert.ok(!req.input.includes('bad private example'));}
   return {status:'completed',output_text:JSON.stringify(calls===1||mode==='bad_twice'?bad:good),usage};
  }}}});
  if(mode!=='bad_twice'){const result=await admission.run(invoke);assert.equal(result.request.evidenceBasis,'saved_profile');assert.deepEqual(result.petIds,['pet']);}
  else await assert.rejects(admission.run(invoke),e=>e.diagnostics?.providerErrorCode==='ASK_INTERPRETATION_REPAIR_JSON');
  assert.equal(calls,2);assert.deepEqual(purposes,['initial','interpretation_repair']);
  assert.equal(events.filter(e=>e.validationDetails==='bounded_transport_repair').length,1);
 }finally{await admission.release();}
 const snapshot=store.getSnapshot('2039-01-01');assert.equal(snapshot.calls,2);assert.ok(snapshot.costMicrodollars>0);
}
test('one admitted repair reinterprets original user sources and validates before authority',t=>runCase(t,'success'));
test('a malformed repair fails closed without a third call',t=>runCase(t,'bad_twice'));
test('canonical shape rejection gets one strict repair from the original sources',t=>runCase(t,'canonical'));
