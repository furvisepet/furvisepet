import assert from 'node:assert/strict';
import test from 'node:test';
import { groundReadProbes } from '../app/lib/intelligence/read-probes.ts';
import { validateEvidenceNeeds } from '../app/lib/intelligence/evidence-needs.ts';
import { bindReadTicket } from '../app/lib/furvise-brain/read-ticket.ts';
import { retrieveReadTicket } from '../app/lib/furvise-brain/lungs.ts';
import { compileHistoryReadStrategies } from '../app/lib/intelligence/history-read-strategies.ts';
import { translateLegacyReadSelection } from '../app/lib/intelligence/legacy-read-selection.ts';
const pets=[{id:'a',name:'Juniper'},{id:'b',name:'Tamarack'}];
const quotes=['Juniper medication change','Tamarack food reaction'];
const context={currentMessage:quotes.join('; '),currentTurn:{id:'user-now'},conversationTurns:[]};
const raw=()=>quotes.map((quote,i)=>({quote,sourceTurnId:null,petNames:[pets[i].name],terms:[i?'food':'medication'],order:'latest'}));
// Deliberately TEST-ONLY candidate translation: production must not adopt this
// structural mapping unless execution and authority parity are demonstrated.
const probes=()=>raw().map(({terms,order,...source})=>({...source,from:null,to:null,target:null,termGroups:[terms],ordering:order==='latest'?'desc':'asc'}));
const scope={userId:'owner',ownedPetIds:['a','b'],from:'2020-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-20T00:00:00Z'};
const proposal=()=>({operation:'read',temporal:{from:null,to:null,anchor:null},predicates:[],outputs:{completeness:'sufficient',ordering:'desc',limit:null,strategy:'chronological'}});
const old=()=>bindReadTicket(proposal(),['a','b']);
function common(ps=probes(),ctx=context){const g=groundReadProbes(ps,ctx,[],pets),p=proposal();delete p.outputs.strategy;return {grounded:g,ticket:bindReadTicket({...p,needs:g.needs},['a','b'],g.bindings)};}
const row=(id,pet,note,day=1)=>({id,user_id:'owner',pet_profile_id:pet,note,title:null,deleted_at:null,occurred_at:new Date(Date.UTC(2025,0,day)).toISOString(),created_at:new Date(Date.UTC(2025,0,day)).toISOString()});
const store=(rows,options={})=>({page:async q=>{if(options.failPet===q.petId)throw Error('unavailable');return rows.filter(r=>r.pet_profile_id===q.petId).slice(q.offset,q.offset+q.limit);},needPage:async q=>{if(options.failPet===q.petId)throw Error('unavailable');return rows.filter(r=>r.pet_profile_id===q.petId&&(!q.terms.length||q.terms.some(t=>r.note.includes(t)))).slice(0,q.limit);},effective:async rows=>({records:rows.filter(r=>r.id!==options.corrected),reliable:true})});
const ids=r=>r.records.map(r=>r.id);

test('groundable advisory obligations are not equivalent to mandatory need acquisition',async()=>{
 const plan=validateEvidenceNeeds(raw(),context.currentMessage,[],[],pets,{scopeSource:'ticket'});
 assert.equal(plan.issues.length,0);assert.equal(plan.needs.length,2);
 const rows=[row('med','a','medication'),row('context','a','routine observation'),row('meal','b','food')];
 const a=await retrieveReadTicket(old(),scope,store(rows)),b=await retrieveReadTicket(common().ticket,scope,store(rows));
 assert.ok(ids(a).includes('context'));assert.ok(!ids(b).includes('context'));
 assert.equal(a.coverage.needs,undefined);assert.equal(b.coverage.needs.length,2);
 assert.equal(translateLegacyReadSelection(old(),{evidenceNeedCount:2}).reason,'independent_legacy_evidence_obligations');
});
test('even identical retrieved facts do not establish coverage parity',async()=>{
 const rows=[row('med','a','medication'),row('meal','b','food')];
 const a=await retrieveReadTicket(old(),scope,store(rows)),b=await retrieveReadTicket(common().ticket,scope,store(rows));
 assert.deepEqual(ids(a),ids(b));assert.equal(a.coverage.status,'complete');assert.equal(b.coverage.status,'partial');
 assert.ok(b.coverage.reasons.includes('bounded_need_candidates_not_semantic_completeness'));
});
test('finite global cardinality cannot disappear when creating needs',()=>{
 const p=proposal();p.outputs.limit=1;const g=common().grounded;
 assert.throws(()=>bindReadTicket({...p,needs:g.needs},['a','b'],g.bindings),e=>e.cause.rule==='needs_incompatible_with_single_measurement_read');
 delete p.outputs.strategy;assert.throws(()=>bindReadTicket({...p,needs:g.needs},['a','b'],g.bindings),e=>e.cause.rule==='incompatible_with_needs');
});
test('legacy non-ticket compiler reserves broad context alongside independent obligations',()=>{
 const needs=validateEvidenceNeeds(raw(),context.currentMessage,[],[],pets).needs;
 const broad={from:null,to:null,descending:true,lexical:false,terms:[]};
 const compiled=compileHistoryReadStrategies(context.currentMessage,2026,{from:null,to:null},[broad],4,needs);
 assert.equal(compiled.strategies.filter(x=>x.needId).length,2);
 assert.ok(compiled.strategies.some(x=>!x.needId));assert.equal(common().ticket.needs.length,2);
});
test('failure behavior differs: chronological failure is global, common needs remain independent',async()=>{
 const rows=[row('med','a','medication')];const s=store(rows,{failPet:'b'});
 const a=await retrieveReadTicket(old(),scope,s),b=await retrieveReadTicket(common().ticket,scope,s);
 assert.equal(a.coverage.status,'unavailable');assert.deepEqual(ids(a),[]);
 assert.deepEqual(ids(b),['med']);assert.equal(b.coverage.needs.find(n=>n.petId==='b').status,'unavailable');
});
test('different source-grounded windows need an explicit retrieval contract, not quotation parsing',async()=>{
 const ps=probes();ps[0].from='2025-01-01T00:00:00Z';ps[0].to='2025-01-02T00:00:00Z';
 ps[1].from='2025-01-02T00:00:00Z';ps[1].to='2025-01-03T00:00:00Z';
 const {ticket}=common(ps);assert.equal(ticket.needs[0].from,ps[0].from);assert.equal(ticket.needs[1].from,ps[1].from);
 const plan=validateEvidenceNeeds(raw(),context.currentMessage,[],[],pets,{scopeSource:'ticket'});
 assert.ok(plan.needs.every(n=>n.window===undefined));
});
test('same pet distinct topics retain distinct grounded obligations',()=>{
 const ps=probes();ps[1].petNames=['Juniper'];const {ticket}=common(ps);
 assert.equal(ticket.needs.length,2);assert.deepEqual(ticket.needs.map(n=>n.petIds),[['a'],['a']]);
 assert.notEqual(ticket.needs[0].sourceSpanId,ticket.needs[1].sourceSpanId);
});
test('rotated probes bind semantic source spans rather than inferred ID meanings',()=>{
 const first=common(),second=common(probes().reverse());
 const bindings=t=>t.ticket.needs.map(n=>({span:n.sourceSpanId,pets:n.petIds,terms:n.termGroups})).sort((a,b)=>a.span.localeCompare(b.span));
 assert.deepEqual(bindings(first),bindings(second));assert.equal(second.ticket.needs[0].id,'need:0');assert.deepEqual(second.ticket.needs[0].petIds,['b']);
});
test('forged quotes, assistant turns, and unauthorized names reject the entire batch',()=>{
 for(const patch of [{quote:'invented'},{sourceTurnId:'assistant'},{petNames:['Foreign']}]){
 const ps=probes();ps[1]={...ps[1],...patch};
 assert.throws(()=>groundReadProbes(ps,{...context,conversationTurns:[{id:'assistant',role:'assistant',text:context.currentMessage}]},['assistant'],pets));
 }
});
test('duplicate source obligation rejects; independently quoted equivalent probes remain distinct',()=>{
 const ps=probes();assert.throws(()=>common([ps[0],ps[0]]),e=>e.cause.rule==='duplicate_probe_grounding');
 ps[1]={...ps[0],quote:quotes[1]};assert.equal(common(ps).ticket.needs.length,2);
});
test('no-hit and corrected need retain independent actual-hit accounting',async()=>{
 const r=await retrieveReadTicket(common().ticket,scope,store([row('med','a','medication')],{corrected:'med'}));
 assert.deepEqual(ids(r),[]);assert.deepEqual(r.coverage.needs.find(n=>n.petId==='a').candidateIds,['med']);
 assert.deepEqual(r.coverage.needs.find(n=>n.petId==='b').candidateIds,[]);
 assert.equal(r.coverage.status,'partial');
});
test('homogeneous native selection bypasses legacy compatibility',()=>{
 const ticket={...old(),selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]}};
 assert.equal(translateLegacyReadSelection(ticket,{evidenceNeedCount:2}).reason,'native_selection');
});
