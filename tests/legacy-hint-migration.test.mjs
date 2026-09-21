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
// Intentional migration: compare against semantic selection, not retired ranking.
async function compare(p,rows,pets=['a'],options={}){
 const input=bindReadTicket(p,pets),translated=translateLegacyReadSelection(input);
 assert.equal(translated.translated,true);
 const native={...translated.ticket,searchHints:[]};
 const a=await retrieveReadTicket(translated.ticket,scope,store(rows,options));
 const b=await retrieveReadTicket(native,scope,store(rows,options));
 assert.deepEqual(a.records,b.records);assert.deepEqual(a.coverage,b.coverage);
 return {a,b,ticket:translated.ticket};
}
test('older hinted match survives only as optional support, never the factual winner',async()=>{
 const f=await compare(proposal(),[row('old','a','weight food',1),row('new','a','weight',3)]);
 assert.deepEqual(ids(f.a),['new']);assert.deepEqual(f.a.supportingContext.records.map(r=>r.id),['old']);
 assert.equal(f.a.supportingContext.maySatisfyObligations,false);
});
test('multiple hints rank only support',async()=>{
 const f=await compare(proposal(['food','medicine']),[row('both','a','weight food medicine',1),row('one','a','weight food',3),row('latest','a','weight',4)]);
 assert.deepEqual(ids(f.a),['latest']);assert.deepEqual(new Set(f.a.supportingContext.reservedIds),new Set(['one','both']));
});
test('different advisory signals preserve identical factual IDs and certificates',async()=>{
 const rows=[row('food','a','weight food',1),row('medicine','a','weight medicine',2),row('latest','a','weight',3)];
 const a=await compare(proposal(['food']),rows),b=await compare(proposal(['medicine']),rows);
 assert.deepEqual(ids(a.a),ids(b.a));assert.deepEqual(a.a.coverage,b.a.coverage);
 assert.notEqual(a.a.supportingContext.records[0].id,b.a.supportingContext.records[0].id);
});
test('no hint matches cannot downgrade exhaustive factual scan',async()=>{
 const f=await compare(proposal(['unmatched'],null),[row('one')]);
 assert.equal(f.a.coverage.status,'complete');assert.equal(f.a.coverage.resultSet.certified,true);
 assert.equal(f.a.supportingContext.receipts[0].matchingIds.length,0);
});
test('redundant hint does not create factual coverage uncertainty',async()=>{
 const f=await compare(proposal(['weight'],null),[row('one')]);
 assert.equal(f.a.coverage.status,'complete');assert.ok(!f.a.coverage.reasons.includes('bounded_period_context_not_semantic_completeness'));
});
test('32 mandatory rows leave no room for rare support; exhaustive proof remains partial',async()=>{
 const rows=Array.from({length:40},(_,i)=>row('r'+i,'a',i===0?'weight rare':'weight',i+1));
 const f=await compare(proposal(['rare'],null),rows);assert.equal(f.a.records.length,32);
 assert.ok(!ids(f.a).includes('r0'));assert.equal(f.a.coverage.resultSet.certified,false);
 assert.equal(f.a.supportingContext.records.length,0);assert.ok(f.a.supportingContext.omissions.some(o=>o.eventId==='r0'));
});
test('character pressure does not let rare support replace required chronological representation',async()=>{
 const f=await compare(proposal(['rare'],null),[row('rare','a','weight rare '+'x'.repeat(10000),1),row('latest','a','weight '+'y'.repeat(10000),3)]);
 assert.deepEqual(ids(f.a),['latest']);assert.equal(f.a.coverage.resultSet.certified,false);assert.equal(f.a.supportingContext.records.length,0);
});
test('multi-subject global selection is independent of subject and hint order',async()=>{
 const rows=[row('old-a','a','weight food',1),row('new-b','b','weight',3)];
 for(const pets of [['a','b'],['b','a']])assert.deepEqual(ids((await compare(proposal(),rows,pets)).a),['new-b']);
});
test('effective correction replaces winner; superseded hint cannot revive it',async()=>{
 const f=await compare(proposal(),[row('old','a','weight food',4),row('replacement','a','weight corrected',3),row('context','a','weight food',1)],['a'],{replaced:'old'});
 assert.deepEqual(ids(f.a),['replacement']);assert.ok(!f.a.supportingContext.records.some(r=>r.id==='old'));
});
test('deleted hinted row is absent from facts and supporting context',async()=>{
 const f=await compare(proposal(['food'],null),[row('deleted','a','weight food',1),row('new','a','weight',3)],['a'],{deleted:['deleted']});
 assert.deepEqual(ids(f.a),['new']);assert.equal(f.a.coverage.status,'complete');assert.ok(!f.a.supportingContext.records.some(r=>r.id==='deleted'));
});
test('independent obligations, calendar and endpoint fill retain explicit exclusions',()=>{
 const t=bindReadTicket(proposal(),['a']);assert.equal(translateLegacyReadSelection(t,{evidenceNeedCount:1}).reason,'independent_legacy_evidence_obligations');
 const calendar=bindReadTicket(proposal(['food'],null,{temporal:{from:null,to:null,anchor:null,calendar:'oldest_year'}}),['a']);
 assert.equal(translateLegacyReadSelection(calendar).reason,'calendar_semantics');
 const endpoint=bindReadTicket(proposal(['food'],2,{operation:'compare',outputs:{strategy:'temporal_endpoints',ordering:'desc',limit:2,completeness:'sufficient'}}),['a']);
 assert.equal(translateLegacyReadSelection(endpoint).reason,'legacy_hint_ranking');
});
test('hint text cannot widen subjects, become predicates or authorize profile facts',async()=>{
 const f=await compare(proposal(['pet b profile weight 99']),[row('own'),row('foreign','b','weight pet b profile weight 99',4)]);
 assert.deepEqual(ids(f.a),['own']);assert.deepEqual(f.ticket.predicates,[{kind:'text_any',terms:['weight']}]);
 assert.ok(f.a.supportingContext.records.every(r=>r.pet_profile_id==='a'));assert.equal(f.a.supportingContext.maySatisfyObligations,false);
});
test('optional allocation receives only already acquired effective data, no extra queries',async()=>{
 const t=translateLegacyReadSelection(bindReadTicket(proposal(),['a'])).ticket,rows=[row('old','a','weight food'),row('new','a','weight',3)];
 const counts=[];
 for(const hints of [[],['food']]){let calls=0;const s=store(rows);const page=s.page;s.page=async q=>{calls++;return page(q);};await retrieveReadTicket({...t,searchHints:hints},scope,s);counts.push(calls);}
 assert.equal(counts[0],counts[1]);
});

test('native directional selection has identical proof with or without hints',async()=>{
 const t=translateLegacyReadSelection(bindReadTicket(proposal(),['a'])).ticket;
 const rows=[row('old','a','weight food',1),row('new','a','weight',3)];
 const s=()=>({...store(rows),effectiveWindow:async q=>({records:q.rows,lineageClosed:true,replacementSeedsExhausted:true,sourceLineage:[],reasons:[],graphCalls:1,lineageRows:0})});
 const a=await retrieveReadTicket(t,scope,s()),b=await retrieveReadTicket({...t,searchHints:[]},scope,s());
 assert.deepEqual(a.coverage,b.coverage);assert.deepEqual(ids(a),['new']);
 assert.equal(a.coverage.groups[0].selectionStatus,'complete');assert.deepEqual(a.supportingContext.records.map(r=>r.id),['old']);
});
test('semantic anchor after is also exclusive for optional context',async()=>{
 const t=translateLegacyReadSelection(bindReadTicket(proposal(['food'],1,{operation:'read_since_event',temporal:{from:null,to:null,anchor:{concept:'visit',relation:'after'}}}),['a'])).ticket;
 const rows=[row('before','a','weight food',1),row('anchor','a','visit weight food',2),row('after','a','weight food',3),row('latest','a','weight',4)];
 const a=await retrieveReadTicket(t,scope,store(rows));assert.deepEqual(ids(a),['latest']);
 assert.deepEqual(a.supportingContext.records.map(r=>r.id),['after']);
});
test('missing anchor does not acquire wider optional context',async()=>{
 const t=translateLegacyReadSelection(bindReadTicket(proposal(['food'],1,{operation:'read_since_event',temporal:{from:null,to:null,anchor:{concept:'missing',relation:'after'}}}),['a'])).ticket;
 const a=await retrieveReadTicket(t,scope,store([row('one','a','weight food')]));
 assert.equal(a.coverage.status,'anchor_missing');assert.equal(a.supportingContext,undefined);assert.deepEqual(a.records,[]);
});
test('failed effective proof cannot become supporting authority or weaken certification',async()=>{
 const t=translateLegacyReadSelection(bindReadTicket(proposal(),['a'])).ticket,rows=[row('one','a','weight food')];
 const s=()=>({...store(rows),effectiveWindow:async q=>({records:q.rows,lineageClosed:false,replacementSeedsExhausted:false,sourceLineage:[],reasons:['lineage_not_closed'],graphCalls:1,lineageRows:0})});
 const a=await retrieveReadTicket(t,scope,s()),b=await retrieveReadTicket({...t,searchHints:[]},scope,s());
 assert.deepEqual(a.coverage,b.coverage);assert.equal(a.coverage.groups[0].blocked,true);
 assert.equal(a.supportingContext.representation,'unavailable');assert.deepEqual(a.supportingContext.records,[]);
});
test('provider guidance requires factual meaning outside search hints',async()=>{
 const fs=await import('node:fs');
 assert.match(fs.readFileSync(new URL('../app/lib/furvise-brain/read-ticket.ts',import.meta.url),'utf8'),/never in hints alone/);
 assert.match(fs.readFileSync(new URL('../app/lib/intelligence/ask-request-contract.ts',import.meta.url),'utf8'),/never carry the only representation of requested meaning/);
});
