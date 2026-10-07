import * as C from "./helpers/canonical-calculation-retirement.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
const { recoverTransientRead }=await import("../app/lib/security/read-recovery.ts");
const { literalInventoryWindow, readRecordInventory }=await import("../app/lib/intelligence/record-inventory.ts");
const { eligibleAnswerSources }=await import("../app/lib/intelligence/ask-evidence.ts");

test('current report provenance survives read-only execution without assigning a multi-pet report to one pet',()=>{
  const e={scope:{readOnlyRecall:false,authorizedPetIds:['owned'],requestText:'Correct the duration to 19 minutes.'},
    interpretation:{request:{}},represented:[],sources:[],losses:[]};
  const sources=eligibleAnswerSources(e);
  assert.equal(sources.length,1);assert.equal(sources[0].sourceType,'current_request');
  assert.equal(sources[0].sourceId,'request:current');assert.equal(sources[0].text,e.scope.requestText);
  assert.deepEqual(eligibleAnswerSources({...e,scope:{...e.scope,readOnlyRecall:true}}),sources);
  assert.deepEqual(eligibleAnswerSources({...e,scope:{...e.scope,authorizedPetIds:['a','b']}}),[]);
});

test('read recovery retries transport failures once without masking permanent errors', async () => {
  let calls=0;
  assert.deepEqual(await recoverTransientRead(async()=>++calls===1?{error:{message:'TypeError: fetch failed'}}:{error:null,data:[1]}),{error:null,data:[1]});
  assert.equal(calls,2);
  calls=0; const error={code:'42501',message:'denied'};
  assert.deepEqual(await recoverTransientRead(async()=>{calls++;return {error};}),{error}); assert.equal(calls,1);
  calls=0; await assert.rejects(recoverTransientRead(async()=>{calls++;throw Object.assign(new Error('timeout'),{name:'TimeoutError'});}),/timeout/);assert.equal(calls,2);
});
test('literal inventory scope survives noisy planner hints, never content qualifiers',async()=>{
  const message='As of now, what is the exact number of Mira’s saved care-history entries dated in August 2026? Count stored notes, not clinical episodes. Save nothing.';
  assert.deepEqual(literalInventoryWindow(message,['Mira']),{from:'2026-08-01',to:'2026-09-01'});
  assert.equal(literalInventoryWindow(message.replace('entries','vomiting entries'),['Mira']),null);
  assert.equal(literalInventoryWindow(message.replace('in August','before August'),['Mira']),null);
  const calls=[];const db={};for(const k of ['from','select','eq','is','gte','lt'])db[k]=(...args)=>{calls.push([k,...args]);return db;};db.abortSignal=async()=>({error:null,count:4});
  const items=await readRecordInventory({currentMessage:message,owner:{userId:'owner'},eligiblePets:[{id:'pet',user_id:'owner',name:'Mira'}],askInterpretation:{readOnly:true,petIds:['pet'],request:{quantity:'episodes'},history:{from:null,to:null,terms:['dated in august garbled planner text']}}},db);
  assert.equal(items[0].count,4);assert.deepEqual(calls.find(c=>c[0]==='gte'),['gte','occurred_at','2026-08-01']);
});

test("canonical leaves take dimension from typed slots and magnitude from complete source tokens",async()=>{
 await C.certified("convert",["Recorded 31.32 kg"],"kg",31.32);const f=await C.certified("convert",["Recorded 131.32 kg"],"kg",131.32);assert.notEqual(f.response.calculationLabs.execution.results[0].value,31.32);C.rejects(c=>c.operands[0].literal="31.32");
});

test('each quote binds its own date, not the dates of earlier quoted notes',async()=>{
  const { historyNarrativeAnchorsSupported }=await import('../app/lib/intelligence/history-narrative-facts.ts');
  const sources=[{text:'Started coughing on 2025-01-04.',occurredAt:'2025-01-04T00:00:00Z'},{text:'Stopped coughing on 2025-01-07.',occurredAt:'2025-01-07T00:00:00Z'}];
  const text='2025-01-04 report: "Started coughing on 2025-01-04."\n2025-01-07 report: "Stopped coughing on 2025-01-07."';
  assert.equal(historyNarrativeAnchorsSupported(text,sources,'',[],false),true);
  assert.equal(historyNarrativeAnchorsSupported(text.replace('2025-01-07 report','2025-01-04 report'),sources,'',[],false),false);
});

test('uncertified comparison cannot calculate from ambiguous or foreign measurements',async()=>{
  const { assertStoredPublicationUnavailable }=await import('./helpers/unsupported-stored-publication.mjs');
  const records=[{sourceId:'care:a',petId:'p',occurredAt:'2023-03-09T00:00:00Z',text:'Mira weighed 18.4 kg. No carrier or harness included.'},{sourceId:'care:b',petId:'p',occurredAt:'2023-04-09T00:00:00Z',text:'Mira weighed 18.7 kg. No carrier or harness included.'}];
  const e={scope:{readOnlyRecall:true,authorizedPetIds:['p'],requestText:'Compare Mira’s body weights on March 9 and April 9, 2023. Give the change in kilograms.'},interpretation:{request:{outputFormat:null}},petNames:{p:'Mira'},losses:[],sources:[{petId:'p',status:'loaded',loadedIds:['care:a','care:b']}],represented:records.map(r=>({...r,sourceType:'care_update',field:'value',start:0,end:r.text.length}))};
  await assertStoredPublicationUnavailable(e);
  await assertStoredPublicationUnavailable({...e,represented:[e.represented[0],{...e.represented[1],petId:"foreign"}]});
  await assertStoredPublicationUnavailable({...e,represented:[e.represented[0],{...e.represented[1],text:"Mira weighed 18.7 kg with carrier included."}]});
});

test('bounded read recovery settles even when transport ignores abort, without accepting late data',async()=>{
 let calls=0;const signals=[];const late=[];
 await assert.rejects(recoverTransientRead(signal=>{calls++;signals.push(signal);return new Promise(resolve=>late.push(resolve));},{attemptTimeoutMs:5}),{name:'TimeoutError'});
 assert.equal(calls,2);assert.ok(signals.every(signal=>signal.aborted));
 for(const resolve of late)resolve({error:null,data:['late']});
});
test('HTTP gateway metadata is recoverable but authorization and SQL errors remain terminal',async()=>{
 let calls=0;
 assert.deepEqual(await recoverTransientRead(async()=>++calls===1?{error:{message:'upstream unavailable'},status:503}:{error:null,data:['owned']},{attemptTimeoutMs:100}),{error:null,data:['owned']});
 assert.equal(calls,2);
 for(const code of ['42501','57014','42P01','PGRST301']) {
  calls=0;const result=await recoverTransientRead(async()=>{calls++;return {error:{code},status:503};},{attemptTimeoutMs:100});
  assert.equal(result.error.code,code);assert.equal(calls,1,code);
 }
});
