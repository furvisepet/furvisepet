import assert from 'node:assert/strict';
import test from 'node:test';
import {bindReadTicket} from '../app/lib/furvise-brain/read-ticket.ts';
import {eventOrder} from '../app/lib/furvise-brain/read-selection.ts';
import {retrieveReadTicket} from '../app/lib/furvise-brain/lungs.ts';
import {translateLegacyReadSelection} from '../app/lib/intelligence/legacy-read-selection.ts';
import {allocateSupportingContext,contextSignalsFromTicket} from '../app/lib/intelligence/supporting-context.ts';
const scope={userId:'owner',ownedPetIds:['a','b'],from:'2020-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-20T00:00:00Z'};
const row=(id,pet='a',note='weight',day=1)=>({id,user_id:'owner',pet_profile_id:pet,note,title:null,deleted_at:null,occurred_at:new Date(Date.UTC(2025,0,day)).toISOString(),created_at:new Date(Date.UTC(2025,0,day)).toISOString()});
const proposal=(hints=['food'],limit=1,patch={})=>({operation:'read',temporal:{from:null,to:null,anchor:null},predicates:[{kind:'text_any',terms:['weight']}],outputs:{strategy:'chronological',ordering:'desc',limit,completeness:'exhaustive'},searchHints:hints,...patch});
const store=(rows,{deleted=[],replaced=null,failPet=null}={})=>({page:async q=>{if(q.petId===failPet)throw Error('unavailable');return rows.filter(r=>r.pet_profile_id===q.petId&&!r.deleted_at&&Date.parse(r.occurred_at)>=Date.parse(q.from)&&Date.parse(r.occurred_at)<Date.parse(q.to)).sort((a,b)=>q.ordering==='desc'?eventOrder(b,a):eventOrder(a,b)).slice(q.offset,q.offset+q.limit);},effective:async rows=>({records:rows.filter(r=>!deleted.includes(r.id)&&r.id!==replaced),reliable:true})});
const ids=r=>r.records.map(x=>x.id);
// Deliberately test-only removal. Production still refuses hint-ranked inputs.
const attempted=t=>translateLegacyReadSelection({...t,searchHints:[]}).ticket;
async function compare(p,rows,pets=['a'],options={}){
 const old=bindReadTicket(p,pets),native=attempted(old);
 assert.equal(translateLegacyReadSelection(old).reason,'legacy_hint_ranking');
 return {old,native,a:await retrieveReadTicket(old,scope,store(rows,options)),b:await retrieveReadTicket(native,scope,store(rows,options))};
}
function context(f,rows,patch={}){
 const cs={userId:scope.userId,windows:f.old.subjects.petIds.map(petId=>({petId,from:scope.from,to:scope.to}))};
 return allocateSupportingContext({scope:cs,authoritativeRecords:f.b.records,effective:{records:rows,reliable:true},signals:contextSignalsFromTicket(f.old,cs),budget:{records:32,chars:18000},ordering:'desc',...patch});
}
test('finite hint-ranked chronology substitutes an older factual record for the newest',async()=>{
 const f=await compare(proposal(),[row('old','a','weight food',1),row('new','a','weight',3)]);
 assert.deepEqual(ids(f.a),['old']);assert.deepEqual(ids(f.b),['new']);assert.equal(f.a.coverage.chronology[0].blocked,true);
 const allocated=context(f,[row('old','a','weight food',1)]);
 assert.deepEqual(allocated.authoritative.records.map(r=>r.id),['new']);assert.deepEqual(allocated.supporting.records.map(r=>r.id),['old']);
 assert.equal(allocated.supporting.maySatisfyObligations,false);
});
test('two hint scores can change factual membership; they are not optional reservations',async()=>{
 const f=await compare(proposal(['food','medicine']),[row('both','a','weight food medicine',1),row('one','a','weight food',3),row('latest','a','weight',4)]);
 assert.deepEqual(ids(f.a),['both']);assert.deepEqual(ids(f.b),['latest']);
});
test('changing only advisory words changes legacy facts while common factual selection stays fixed',async()=>{
 const rows=[row('food','a','weight food',1),row('medicine','a','weight medicine',2),row('latest','a','weight',3)];
 const a=await compare(proposal(['food']),rows),b=await compare(proposal(['medicine']),rows);
 assert.notDeepEqual(ids(a.a),ids(b.a));assert.deepEqual(ids(a.b),ids(b.b));
});
test('no matching hint preserves records but still changes coverage and reasons',async()=>{
 const f=await compare(proposal(['unmatched'],null),[row('one')]);
 assert.deepEqual(ids(f.a),ids(f.b));assert.equal(f.a.coverage.status,'partial');assert.equal(f.b.coverage.status,'complete');
 assert.ok(f.a.coverage.reasons.includes('bounded_period_context_not_semantic_completeness'));
 assert.ok(!f.b.coverage.reasons.includes('bounded_period_context_not_semantic_completeness'));
 assert.equal(f.b.coverage.resultSet.certified,true);
});
test('predicate-implied redundant hints still fail coverage parity even on an exhaustive small set',async()=>{
 const f=await compare(proposal(['weight'],null),[row('one')]);
 assert.deepEqual(ids(f.a),ids(f.b));assert.equal(f.a.coverage.status,'partial');assert.equal(f.b.coverage.status,'complete');
 assert.equal(f.a.coverage.chronology[0].blocked,false);assert.equal(f.b.coverage.resultSet.certified,true);
});
test('unbounded hint ranking changes represented factual membership at the unchanged 32-row cap',async()=>{
 const rows=Array.from({length:40},(_,i)=>row('r'+i,'a',i===0?'weight rare':'weight',i+1));
 const f=await compare(proposal(['rare'],null),rows);
 assert.ok(ids(f.a).includes('r0'));assert.ok(!ids(f.b).includes('r0'));assert.equal(f.a.records.length,32);assert.equal(f.b.records.length,32);
 const allocated=context(f,rows);assert.deepEqual(allocated.authoritative.records.map(r=>r.id),ids(f.b));
 assert.equal(allocated.supporting.records.length,0);assert.ok(allocated.supporting.omissions.some(o=>o.eventId==='r0'));
 assert.equal(f.b.coverage.resultSet.certified,false);
});
test('character pressure makes unbounded hint ranking factual even with fewer than 32 rows',async()=>{
 const rows=[row('rare','a','weight rare '+ 'x'.repeat(10000),1),row('latest','a','weight '+ 'y'.repeat(10000),3)];
 const f=await compare(proposal(['rare'],null),rows);assert.deepEqual(ids(f.a),['rare']);assert.deepEqual(ids(f.b),['latest']);
 assert.equal(f.a.coverage.status,'partial');assert.equal(f.b.coverage.resultSet.certified,false);
});
test('multi-subject rotation cannot make a globally hint-ranked factual result advisory',async()=>{
 const rows=[row('old-a','a','weight food',1),row('new-b','b','weight',3)];
 for(const pets of [['a','b'],['b','a']]){
 const f=await compare(proposal(),rows,pets);assert.deepEqual(ids(f.a),['old-a']);assert.deepEqual(ids(f.b),['new-b']);
 }
});
test('correction changes optional candidates but cannot establish parity for factual hint ranking',async()=>{
 const rows=[row('old','a','weight food',1),row('replacement','a','weight food corrected',2),row('new','a','weight',3)];
 const f=await compare(proposal(),rows,['a'],{replaced:'old'});assert.deepEqual(ids(f.a),['replacement']);assert.deepEqual(ids(f.b),['new']);
 const allocated=context(f,rows.filter(r=>r.id!=='old'));assert.ok(!allocated.supporting.records.some(r=>r.id==='old'));
});
test('deleted hint hit does not become support; remaining no-hit records still have unequal coverage',async()=>{
 const rows=[row('deleted','a','weight food',1),row('new','a','weight',3)];
 const f=await compare(proposal(['food'],null),rows,['a'],{deleted:['deleted']});assert.deepEqual(ids(f.a),ids(f.b));
 assert.notEqual(f.a.coverage.status,f.b.coverage.status);const allocated=context(f,rows.filter(r=>r.id!=='deleted'));
 assert.ok(!allocated.supporting.records.some(r=>r.id==='deleted'));
});
test('independent evidence obligations and out-of-scope operators retain existing exclusions',()=>{
 const t=bindReadTicket(proposal(),['a']);assert.equal(translateLegacyReadSelection(t,{evidenceNeedCount:1}).reason,'independent_legacy_evidence_obligations');
 const calendar=bindReadTicket(proposal(['food'],null,{temporal:{from:null,to:null,anchor:null,calendar:'oldest_year'}}),['a']);
 assert.equal(translateLegacyReadSelection(calendar).reason,'calendar_semantics');
});
test('hintless inputs already migrate; empty hint arrays are not an additional advisory class',()=>{
 const t=bindReadTicket(proposal([],null),['a']);assert.equal(translateLegacyReadSelection(t).translated,true);
 assert.equal(translateLegacyReadSelection(t).ticket.outputs.strategy,undefined);
});
test('optional context failure cannot change the independently chosen factual result',async()=>{
 const rows=[row('old','a','weight food'),row('new','a','weight',3)],f=await compare(proposal(),rows);
 const snapshot=JSON.stringify(f.b),allocated=context(f,[rows[0]],{acquisition:[{petId:'a',state:'unavailable'}]});
 assert.deepEqual(allocated.authoritative.records.map(r=>r.id),['new']);assert.deepEqual(allocated.supporting.records,[]);
 assert.equal(JSON.stringify(f.b),snapshot);
});
