import {nativeKey,nativeSlot} from "./helpers/direct-protocol.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {directFixturePlan} from './helpers/recursive-wire-fixture.mjs';
import {prepareAskInterpretationRequest,interpretAskQuestion} from '../app/lib/intelligence/interpret-ask.ts';
import {admitAiOperation} from '../app/lib/ai/usage-guard/admission.ts';
import {MemoryAiGuardTestStore} from '../app/lib/ai/usage-guard/memory-test-store.ts';
const corpus=JSON.parse(readFileSync(new URL('./fixtures/ask-wire-codec.json',import.meta.url),'utf8'));
// The frozen corpus predates the additive nullable draft field.
const template={...corpus.fixtures.find(f=>f.canonical.request.evidenceBasis==='saved_profile').canonical.request,draftAnswer:null};
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
 // Inactive JSON fields are now rejected by the source grammar before JSON parsing.
 const bad=structuredClone(good),field=mode==='cross_field'?'quantity':mode==='canonical'?'readTicket':'projection';
 const slot=nativeSlot(prepared.transport,bad,field);
 slot.target[slot.key]=mode==='cross_field'?'records':mode==='canonical'?{}:'{bad private example';
 const store=new MemoryAiGuardTestStore();
 const admission=await admitAiOperation({env,store,feature:'ask',intendedModel:'gpt-5.4-mini',userId:'owner',requestId:'test-'+mode,payload:{case:mode},now:new Date('2039-01-01T00:00:00Z')});
 let calls=0;const purposes=[],events=[];const begin=admission.beginProviderCall.bind(admission);
 admission.beginProviderCall=async x=>{purposes.push(x.purpose??'initial');return begin(x)};
 try{
  const invoke=()=>interpretAskQuestion({context,model:'gpt-5.4-mini',onProviderEvent:e=>events.push(e),client:{responses:{create:async req=>{
   calls++;
   if(calls===2){const input=JSON.parse(req.input);if(mode==='cross_field'){assert.equal(input.transportRepair.validationCode,'ASK_WIRE_CANONICAL_SCHEMA');assert.ok(input.transportRepair.fieldHints.includes('quantity'));}else if(mode==='canonical'){assert.equal(input.transportRepair.validationCode,'ASK_WIRE_CANONICAL_SCHEMA');assert.ok(input.transportRepair.fieldHints.includes('readTicket'));}else {assert.equal(input.transportRepair.validationCode,'ASK_WIRE_CANONICAL_SCHEMA');assert.ok(input.transportRepair.fieldHints.includes('projection'));}assert.ok(!req.input.includes('bad private example'));}
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

test('individually valid but conflicting profile fields get bounded schema-key hints',t=>runCase(t,'cross_field'));

test('factored provider schema expands exactly to the provider-compatible direct schema',async()=>{
 const {createAskProviderWireSchema}=await import('../app/lib/intelligence/ask-wire-provider-schema.ts');
 const prepared=prepareAskInterpretationRequest(context,'gpt-5.4-mini');
 const factored=prepared.request.text.format.schema, defs=factored.$defs||{};
 function expand(value,seen=[]){
  if(Array.isArray(value))return value.map(v=>expand(v,seen));
  if(!value||typeof value!=='object')return value;
  if(Object.hasOwn(value,'$ref')){assert.equal(Object.keys(value).length,1);const prefix='#/$defs/';assert.ok(value.$ref.startsWith(prefix));const key=value.$ref.slice(prefix.length);assert.ok(!seen.includes(key));assert.ok(Object.hasOwn(defs,key));return expand(defs[key],[...seen,key]);}
  return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='$defs').map(([k,v])=>[k,expand(v,seen)]));
 }
 assert.deepEqual(expand(factored),createAskProviderWireSchema(prepared.transport.schema));
 const branch=prepared.transport.schema.properties.request.anyOf[0];
 assert.ok(branch.properties.evidenceContext.anyOf.some(v=>v.properties[nativeKey(prepared.transport,'readTicket')]?.anyOf?.some(t=>t.type==='object')));
});
