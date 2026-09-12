import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecordInventory, recordInventoryEvidence } from '../app/lib/intelligence/record-inventory.ts';
import { eligibleAnswerSources } from '../app/lib/intelligence/ask-evidence.ts';
import { deterministicReadProjection } from '../app/lib/intelligence/read-projection.ts';

const context = () => ({ owner:{userId:'owner'}, eligiblePets:[{id:'pet',user_id:'owner'},{id:'foreign',user_id:'other'}],
  currentMessage:'How many saved care-history entries does Fable have in September 2026? Count database notes, not the events described inside a note.',
  historyAccess:{months:3,from:'2026-06-11T00:00:00.000Z',to:'2026-09-12T00:00:00.000Z'},
  askInterpretation:{readOnly:true,petIds:['pet','foreign'],request:{quantity:'records'},history:{from:'2026-09-01T00:00:00.000Z',to:'2026-10-01T00:00:00.000Z',terms:[]}} });
function database(response) {
  const calls=[];
  const q={}; for(const name of ['from','select','eq','is','gte','lt']) q[name]=(...args)=>{calls.push([name,...args]);return q;};
  q.abortSignal=async()=>response;
  return {db:q,calls};
}
test('physical note count is owned, excludes deleted notes, and stays inside access dates',async()=>{
  const {db,calls}=database({count:5,error:null});
  const result=await readRecordInventory(context(),db);
  assert.equal(result.length,1);assert.equal(result[0].count,5);assert.equal(result[0].petId,'pet');
  assert.equal(result[0].to,'2026-09-12T00:00:00.000Z');
  assert.deepEqual(calls.filter(c=>c[0]==='eq'),[['eq','user_id','owner'],['eq','pet_profile_id','pet']]);
  assert.ok(calls.some(c=>c[0]==='is'&&c[1]==='deleted_at'&&c[2]===null));
  assert.deepEqual(calls.find(c=>c[0]==='select'),['select','id',{count:'exact',head:true}]);
});
test('failed reads and semantic episode counts never create physical-record evidence',async()=>{
  const {db}=database({count:null,error:{message:'unavailable'}});
  assert.deepEqual(await readRecordInventory(context(),db),[]);
  const c=context();c.askInterpretation.request.quantity='episodes';
  const unused={from(){throw Error('must not query');}};
  assert.deepEqual(await readRecordInventory(c,unused),[]);
  c.askInterpretation.request.quantity='records';c.askInterpretation.history.terms=['vomiting'];
  assert.deepEqual(await readRecordInventory(c,unused),[]);
});
test('only exact represented aggregate evidence can draft a count answer',async()=>{
  const {db}=database({count:5,error:null}), items=await readRecordInventory(context(),db);
  const source=recordInventoryEvidence(items)[0];
  const evidence={recordInventory:items,scope:{authorizedPetIds:['pet'],readOnlyRecall:true,requestText:context().currentMessage},
    sources:[{petId:'pet',loadedIds:[source.sourceId],status:'loaded'}],losses:[],
    represented:[{...source,sourceType:'record_inventory',field:'value',start:0,end:source.text.length}]};
  assert.equal(eligibleAnswerSources(evidence).length,1);
  assert.match(deterministicReadProjection(evidence).sentences[0].text,/exactly 5/);
  evidence.represented[0].text=source.text.replace('exactly 5','exactly 9');
  assert.equal(eligibleAnswerSources(evidence).length,0);
});
test('record-container hints do not disable an exact count, content filters still do',async()=>{
  const c=context(); c.askInterpretation.history.terms=['saved care-history entries','database notes','stored notes'];
  const {db}=database({count:7,error:null});
  assert.equal((await readRecordInventory(c,db))[0].count,7);
  c.askInterpretation.history.terms.push('medication');
  assert.deepEqual(await readRecordInventory(c,{from(){throw Error('must not count all notes');}}),[]);
});
