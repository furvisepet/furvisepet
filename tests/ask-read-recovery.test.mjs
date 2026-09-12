import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverTransientRead } from '../app/lib/security/read-recovery.ts';
import { literalInventoryWindow, readRecordInventory } from '../app/lib/intelligence/record-inventory.ts';

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

test('numeric calculation leaves take units only from an unambiguous adjacent source token',async()=>{
  const { verifiedCalculationQuantities }=await import('../app/lib/intelligence/history-calculation.ts');
  const p={operation:'difference',operands:[{sourceId:'a',field:'text',literal:'31.32'},{sourceId:'b',field:'text',literal:'31.10'}],value:0.22,unit:'kg'};
  const sources=[{sourceId:'a',text:'Body mass was 31.32 kg.'},{sourceId:'b',text:'Body mass was 31.10 kg.'}];
  assert.ok(verifiedCalculationQuantities([p],sources));
  assert.equal(verifiedCalculationQuantities([p],[{...sources[0],text:'Body mass was 131.32 kg.'},sources[1]]),null);
  assert.equal(verifiedCalculationQuantities([p],[{...sources[0],text:'31.32 kg and 31.32 ml.'},sources[1]]),null);
});

test('each quote binds its own date, not the dates of earlier quoted notes',async()=>{
  const { historyNarrativeAnchorsSupported }=await import('../app/lib/intelligence/history-narrative-facts.ts');
  const sources=[{text:'Started coughing on 2025-01-04.',occurredAt:'2025-01-04T00:00:00Z'},{text:'Stopped coughing on 2025-01-07.',occurredAt:'2025-01-07T00:00:00Z'}];
  const text='2025-01-04 report: "Started coughing on 2025-01-04."\n2025-01-07 report: "Stopped coughing on 2025-01-07."';
  assert.equal(historyNarrativeAnchorsSupported(text,sources,'',[],false),true);
  assert.equal(historyNarrativeAnchorsSupported(text.replace('2025-01-07 report','2025-01-04 report'),sources,'',[],false),false);
});

test('two-date body-mass projection computes a cited draft and refuses ambiguous or foreign measurements',async()=>{
  const { deterministicReadProjection }=await import('../app/lib/intelligence/read-projection.ts');
  const { verifiedCalculationQuantities }=await import('../app/lib/intelligence/history-calculation.ts');
  const records=[{sourceId:'care:a',petId:'p',occurredAt:'2023-03-09T00:00:00Z',text:'Mira weighed 18.4 kg. No carrier or harness included.'},{sourceId:'care:b',petId:'p',occurredAt:'2023-04-09T00:00:00Z',text:'Mira weighed 18.7 kg. No carrier or harness included.'}];
  const e={scope:{readOnlyRecall:true,authorizedPetIds:['p'],requestText:'Compare Mira’s body weights on March 9 and April 9, 2023. Give the change in kilograms.'},interpretation:{request:{outputFormat:'prose'}},petNames:{p:'Mira'},losses:[],sources:[{petId:'p',status:'loaded',loadedIds:['care:a','care:b']}],represented:records.map(r=>({...r,sourceType:'care_update',field:'value',start:0,end:r.text.length}))};
  const draft=deterministicReadProjection(e);assert.ok(draft);assert.equal(draft.sentences[2].calculations[0].value,0.3);assert.ok(verifiedCalculationQuantities(draft.sentences[2].calculations,records));
  assert.match(draft.sentences[2].text,/does not establish a cause/);
  assert.equal(deterministicReadProjection({...e,represented:[e.represented[0],{...e.represented[1],petId:'foreign'}]}),null);
  assert.equal(deterministicReadProjection({...e,represented:[e.represented[0],{...e.represented[1],text:'Mira weighed 18.7 kg with carrier included.'}]}),null);
});
