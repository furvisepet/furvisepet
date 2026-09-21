import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const {allocateSupportingContext,groundContextSignals,contextSignalsFromTicket}=await import('../app/lib/intelligence/supporting-context.ts');
const {bindReadTicket}=await import('../app/lib/furvise-brain/read-ticket.ts');
const {bindCompositionalReadTicket,eventOrder}=await import('../app/lib/furvise-brain/read-selection.ts');
const {retrieveReadTicket}=await import('../app/lib/furvise-brain/lungs.ts');
const {derivePublicationAuthority,publicationClaimFailures,publicationGenerationContext}=await import('../app/lib/intelligence/publication-authority.ts');
const pets=[{id:'a',name:'Juniper'},{id:'b',name:'Tamarack'}];
const scope={userId:'owner',windows:pets.map(p=>({petId:p.id,from:'2020-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z'}))};
const row=(id,pet='a',note='observation',day=1)=>({id,user_id:'owner',pet_profile_id:pet,note,title:null,deleted_at:null,occurred_at:new Date(Date.UTC(2025,0,day)).toISOString(),created_at:new Date(Date.UTC(2025,0,day)).toISOString()});
const required=row('selected','a','weight 5.17 kg',20);
const ctx={currentMessage:'Juniper food context; Tamarack medication context',currentTurn:{id:'u-now'},conversationTurns:[]};
const signal=(terms=['food'],petNames=['Juniper'],quote='Juniper food context',priority=0,reservation=1)=>groundContextSignals([{quote,sourceTurnId:null,petNames,terms}],ctx,[],pets,scope,priority,reservation);
const ticket=(hints=[],ids=['a','b'])=>bindReadTicket({operation:'read',temporal:{from:null,to:null,anchor:null},predicates:[],searchHints:hints,outputs:{ordering:'desc',completeness:'sufficient',limit:null}},ids);
const allocate=(records,patch={})=>allocateSupportingContext({scope,authoritativeRecords:[required],effective:{records,reliable:true},signals:signal(),budget:{records:4,chars:18000},ordering:'desc',...patch});
const ids=rows=>rows.map(r=>r.id);
const bytes=rows=>rows.reduce((n,r)=>n+JSON.stringify(r).length,0);
function legacyAllocate(mandatory,groups,ordered,budget){
 const prioritized=[...new Map([...mandatory,...groups.flatMap(g=>g.slice(0,1))].map(r=>[r.id,r])).values()];
 for(let i=0;groups.some(g=>i<g.length);i++)for(const group of groups)if(group[i]&&!prioritized.some(r=>r.id===group[i].id))prioritized.push(group[i]);
 for(const r of ordered)if(!prioritized.some(x=>x.id===r.id))prioritized.push(r);
 const kept=[];let chars=0;for(const r of prioritized){if(kept.length>=budget.records||chars+JSON.stringify(r).length>budget.chars)continue;kept.push(r);chars+=JSON.stringify(r).length;}return {kept,chars};
}
test('one factual selection plus hint preserves legacy supporting allocation where exact',()=>{
 const rows=[row('context','a','routine',2),row('food','a','food',1)],budget={records:3,chars:18000};
 const hints=contextSignalsFromTicket(ticket(['food']),scope),r=allocate(rows,{signals:hints,budget});
 const old=legacyAllocate([required],[[rows[1]]],rows,budget);
 assert.deepEqual([...ids(r.authoritative.records),...ids(r.supporting.records)],ids(old.kept));assert.equal(r.usage.chars,old.chars);
 assert.deepEqual(r.supporting.receipts[0].provenance,{kind:'ticket_hint',index:0});assert.equal(r.supporting.maySatisfyObligations,false);
});
test('two advisory topic reservations have exact legacy parity under the shared budget',()=>{
 const rows=[row('meal','a','food',1),row('medicine','a','medication',2),row('routine','a','routine',3)],budget={records:3,chars:18000};
 const hints=contextSignalsFromTicket(ticket(['food','medication'],['a']),scope),r=allocate(rows,{signals:hints,budget});
 const old=legacyAllocate([required],[[rows[0]],[rows[1]]],rows,budget);
 assert.deepEqual([...ids(r.authoritative.records),...ids(r.supporting.records)],ids(old.kept));
 assert.deepEqual(r.supporting.omissions,[{eventId:'routine',reason:'representation_budget'}]);assert.equal(r.usage.chars,old.chars);
});
test('scope and candidate rotation leave multi-subject context and mandatory facts unchanged',()=>{
 const rows=[row('a-food','a','food'),row('b-food','b','food')];
 const a=allocate(rows,{signals:contextSignalsFromTicket(ticket(['food']),scope)});
 const reverse={...scope,windows:[...scope.windows].reverse()};
 const b=allocate(rows.toReversed(),{scope:reverse,signals:contextSignalsFromTicket(ticket(['food'],['b','a']),reverse)});
 assert.deepEqual(a,b);assert.deepEqual(ids(a.supporting.records),['a-food','b-food']);
});
test('rare support survives verbose routine context without displacing the selected record',()=>{
 const rows=[...Array.from({length:20},(_,i)=>row('routine-'+i,'a','food '.repeat(900),i+2)),row('rare','a','transition',1)];
 const r=allocate(rows,{signals:contextSignalsFromTicket(ticket(['food','transition'],['a']),scope),budget:{records:4,chars:10000}});
 assert.deepEqual(ids(r.authoritative.records),['selected']);assert.ok(ids(r.supporting.records).includes('rare'));assert.ok(r.supporting.omissions.length);assert.ok(r.usage.chars<=10000);
});
test('optional oversized source is omitted whole; a smaller supporting source can still fit',()=>{
 const r=allocate([row('large','a','food '.repeat(5000),3),row('small','a','food',2)]);
 assert.deepEqual(ids(r.supporting.records),['small']);assert.equal(r.supporting.representation,'partial');assert.ok(r.supporting.omissions.some(o=>o.eventId==='large'));
});
test('no advisory matches does not mean no factual evidence or semantic absence',()=>{
 const r=allocate([row('routine')]);assert.equal(r.supporting.receipts[0].matchingIds.length,0);
 assert.equal(r.supporting.representation,'complete');assert.deepEqual(ids(r.authoritative.records),['selected']);
 assert.equal(r.supporting.certified,undefined);assert.equal(r.supporting.completeness,undefined);
});
test('one failed supporting acquisition preserves other support and every authoritative record',()=>{
 const r=allocate([row('a-food','a','food'),row('b-food','b','food')],{acquisition:[{petId:'b',state:'unavailable'}]});
 assert.deepEqual(ids(r.authoritative.records),['selected']);assert.deepEqual(ids(r.supporting.records),['a-food']);
 assert.ok(r.supporting.omissions.some(o=>o.eventId==='b-food'&&o.reason==='context_acquisition_unavailable'));
});
test('supporting records come only from the supplied effective snapshot after correction',()=>{
 const corrected=row('replacement','a','food corrected',2),r=allocate([corrected]);
 assert.deepEqual(ids(r.supporting.records),['replacement']);assert.ok(!ids(r.supporting.records).includes('superseded'));
});
test('deleted and unresolved supporting records are excluded without changing required facts',()=>{
 const dead={...row('dead','a','food'),deleted_at:'2025-02-01T00:00:00Z'},uncertain=row('uncertain','a','food');
 const r=allocate([],{effective:{records:[dead,uncertain],reliable:true,sourceLineage:[{eventId:'uncertain'}]}});
 assert.deepEqual(r.supporting.records,[]);assert.equal(r.supporting.omissions.length,2);assert.deepEqual(ids(r.authoritative.records),['selected']);
});
test('different hints change context only, never authoritative membership or cardinality',()=>{
 const rows=[row('meal','a','food'),row('medicine','a','medication')],budget={records:2,chars:18000};
 const a=allocate(rows,{budget,signals:contextSignalsFromTicket(ticket(['food']),scope)}),b=allocate(rows,{budget,signals:contextSignalsFromTicket(ticket(['medication']),scope)});
 assert.deepEqual(a.authoritative,b.authoritative);assert.deepEqual(ids(a.supporting.records),['meal']);assert.deepEqual(ids(b.supporting.records),['medicine']);
});
test('mandatory overflow is explicit and cannot be filled with optional evidence',()=>{
 const r=allocate([row('small','a','food')],{authoritativeRecords:[required,row('huge','b','x'.repeat(20000))]});
 assert.equal(r.authoritative.representationComplete,false);assert.deepEqual(r.authoritative.omittedIds,['huge']);assert.deepEqual(r.supporting.records,[]);
 assert.equal(r.supporting.omissions[0].reason,'authoritative_representation_blocked');
});
test('whole selected record has priority over any number of advisory reservations',()=>{
 const r=allocate([row('meal','a','food')],{budget:{records:1,chars:bytes([required])}});
 assert.deepEqual(ids(r.authoritative.records),['selected']);assert.deepEqual(r.supporting.records,[]);assert.equal(r.authoritative.representationComplete,true);
});
test('grounding preserves USER provenance and does not export need identities',()=>{
 const [s]=signal();assert.deepEqual(s.petIds,['a']);assert.deepEqual(s.provenance,{kind:'user_span',turnId:'u-now',start:0,end:20});
 assert.equal(s.needId,undefined);assert.equal(s.id,undefined);assert.equal(s.sourceSpanId,undefined);
 const earlier={currentMessage:'Use that context',conversationTurns:[{id:'prior',role:'user',text:ctx.currentMessage}]};
 const [previous]=groundContextSignals([{quote:'Juniper food context',sourceTurnId:'prior',petNames:['Juniper'],terms:['food']}],earlier,['prior'],pets,scope);
 assert.equal(previous.provenance.turnId,'prior');
});
for(const patch of [{quote:'invented'},{petNames:['Foreign']},{sourceTurnId:'assistant'},{needId:'need:made-up'}])test('invalid advisory grounding rejects '+JSON.stringify(patch),()=>{
 assert.throws(()=>groundContextSignals([{quote:'Juniper food context',sourceTurnId:null,petNames:['Juniper'],terms:['food'],...patch}],
 {...ctx,conversationTurns:[{id:'assistant',role:'assistant',text:ctx.currentMessage}]},['assistant'],pets,scope));
});
test('a forged signal cannot bypass deterministic grounding',()=>{
 assert.throws(()=>allocate([],{signals:[{petIds:['a'],terms:['food'],priority:0,reservation:1,provenance:{kind:'ticket_hint',index:0}}]}),/ungrounded_signal/);
});
test('scope never widens and supporting snapshot conflicts cannot replace authoritative values',()=>{
 const r=allocate([row('foreign','c','food'),{...required,note:'weight 99 kg'},row('before','a','food',1)] ,{scope:{...scope,windows:scope.windows.map(w=>({...w,from:'2025-01-10T00:00:00Z'}))}});
 assert.deepEqual(r.supporting.records,[]);assert.equal(r.authoritative.records[0].note,'weight 5.17 kg');assert.equal(r.supporting.omissions.length,3);
});
test('duplicate changed supporting snapshots are withheld rather than arbitrarily chosen',()=>{
 const r=allocate([row('same','a','food'),row('same','a','food changed')]);assert.deepEqual(r.supporting.records,[]);
 assert.equal(r.supporting.omissions[0].reason,'conflicting_support_snapshot');
});
test('priority and reservation remain representation policy, not required factual evidence',()=>{
 const rows=[row('meal','a','food'),row('medicine','b','medication')];
 const sigs=[...signal(),...signal(['medication'],['Tamarack'],'Tamarack medication context',2)];
 const r=allocate(rows,{signals:sigs,budget:{records:2,chars:18000}});assert.deepEqual(ids(r.supporting.records),['medicine']);assert.equal(r.supporting.maySatisfyObligations,false);
});
function evidence(ticket,result){
 const spans=result.records.map(r=>({sourceId:'care:'+r.id,petId:r.pet_profile_id,sourceType:'care_update',field:'value',text:r.note,occurredAt:r.occurred_at,start:0,end:r.note.length}));
 return {scope:{authorizedPetIds:ticket.subjects.petIds,requestText:'fixture',readOnlyRecall:true},petNames:{a:'Juniper',b:'Tamarack'},
 interpretation:{readOperation:'recall',operation:'recall',request:{readTicket:ticket,mode:'read',quantity:'records',evidenceBasis:'saved_history',profileFields:[],requirements:[],referenceTurnIds:[]}},
 history:{ticketCoverage:result.coverage,provenance:[],needs:[],claimSources:[],corrections:'complete'},represented:spans,losses:[],
 sources:ticket.subjects.petIds.map(petId=>({petId,source:'care_entries',status:'loaded',loadedIds:spans.filter(s=>s.petId===petId).map(s=>s.sourceId)}))};
}
async function certifiedFixture(){
 const p={operation:'read',temporal:{from:null,to:null,anchor:null},predicates:[{kind:'text_any',terms:['weight']}],outputs:{ordering:'desc',limit:null,completeness:'sufficient'},selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]}};
 const t=bindCompositionalReadTicket(p,['a']);
 const result=await retrieveReadTicket(t,{userId:'owner',ownedPetIds:['a'],from:scope.windows[0].from,to:scope.windows[0].to,asOf:'2026-09-20T00:00:00Z'},
 {page:async()=>[required],effective:async records=>({records,reliable:true})});
 return {ticket:t,result,evidence:evidence(t,result)};
}
test('SUPPORTING CONTEXT CAN HELP THE MOUTH; IT CANNOT ESTABLISH TRUTH',async()=>{
 const f=await certifiedFixture(),snapshot=JSON.stringify(f),before=derivePublicationAuthority(f.evidence);
 assert.ok(before.obligations.every(o=>o.authority==='certified'));
 const r=allocate([row('alternative','a','food and weight 99 kg')]);
 assert.equal(JSON.stringify(f),snapshot);assert.deepEqual(derivePublicationAuthority(f.evidence),before);
 // Even if support is separately represented by a caller, it cannot satisfy
 // the independently certified factual obligation under the existing policy.
 const e=structuredClone(f.evidence),s=r.supporting.records[0];
 e.represented.push({sourceId:'care:'+s.id,petId:'a',sourceType:'care_update',field:'value',text:s.note,start:0,end:s.note.length,occurredAt:s.occurred_at});e.sources[0].loadedIds.push('care:'+s.id);
 assert.deepEqual(derivePublicationAuthority(e).authorizedSourceIds,['care:selected']);
 assert.ok(publicationClaimFailures(e,[{obligationId:before.obligations[0].obligationId,text:'Weight 99 kg',sourceIds:['care:alternative']}]).length);
 const generation=publicationGenerationContext(e,{supporting:r.supporting});assert.deepEqual(generation.contextRecords.map(r=>r.sourceId),['care:selected']);
});
test('context partial never changes a certified task and context complete never upgrades a blocked task',async()=>{
 const f=await certifiedFixture(),before=structuredClone(f.result.coverage);
 const partial=allocate([row('meal','a','food')],{budget:{records:1,chars:18000}});assert.equal(partial.supporting.representation,'partial');assert.deepEqual(f.result.coverage,before);
 const blocked=structuredClone(f.result.coverage);blocked.status='partial';blocked.groups[0].blocked=true;
 const snapshot=JSON.stringify(blocked),full=allocate([row('meal','a','food')]);assert.equal(full.supporting.representation,'complete');assert.equal(JSON.stringify(blocked),snapshot);
});
test('exhaustive result-set incompleteness cannot be repaired by representing every context row',async()=>{
 const t=bindReadTicket({operation:'read',temporal:{from:null,to:null,anchor:null},predicates:[],outputs:{completeness:'exhaustive',ordering:'asc',limit:null}},['a']);
 const result=await retrieveReadTicket(t,{userId:'owner',ownedPetIds:['a'],from:scope.windows[0].from,to:scope.windows[0].to,asOf:'2026-09-20T00:00:00Z'},
 {page:async q=>Array.from({length:q.limit},(_,i)=>row('row-'+(q.offset+i),'a','observation',1)),effective:async records=>({records,reliable:true})});
 assert.equal(result.coverage.resultSet.certified,false);const snapshot=JSON.stringify(result);
 const r=allocate([row('context','a','food')]);assert.equal(r.supporting.representation,'complete');assert.equal(JSON.stringify(result),snapshot);
});
test('allocator has no model, retrieval, semantic plan, certificate or authority output',()=>{
 const r=allocate([]);assert.deepEqual(Object.keys(r).sort(),['authoritative','supporting','usage']);assert.equal(r.records,undefined);
 assert.equal(r.supporting.authorizedSourceIds,undefined);assert.equal(r.supporting.certificate,undefined);assert.equal(r.supporting.needs,undefined);
});

test('grounded signals cannot be replayed in a different owner or wider temporal scope',()=>{
 const sigs=signal();assert.throws(()=>allocate([],{signals:sigs,scope:{...scope,userId:'other'}}),/ungrounded_signal_scope/);
 assert.throws(()=>allocate([],{signals:sigs,scope:{...scope,windows:scope.windows.map(w=>({...w,from:'1900-01-01T00:00:00Z'}))}}),/ungrounded_signal_scope/);
 const t=ticket(['food']);const bounded={...t,temporal:{...t.temporal,from:'2025-01-01T00:00:00Z'}};
 assert.throws(()=>contextSignalsFromTicket(bounded,scope),/hint_scope/);
});
