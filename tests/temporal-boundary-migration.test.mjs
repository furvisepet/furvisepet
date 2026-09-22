import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const {validateAskRequest}=await import('../app/lib/intelligence/ask-request-contract.ts');
const {bindReadTicket}=await import('../app/lib/furvise-brain/read-ticket.ts');
const {bindCompositionalReadTicket,eventOrder}=await import('../app/lib/furvise-brain/read-selection.ts');
const {translateLegacyReadSelection}=await import('../app/lib/intelligence/legacy-read-selection.ts');
const {retrieveReadTicket}=await import('../app/lib/furvise-brain/lungs.ts');
const {derivePublicationAuthority,publicationClaimFailures}=await import('../app/lib/intelligence/publication-authority.ts');
const {buildLabsList,serializeLabsList}=await import('../app/lib/intelligence/labs-list.ts');
const {commonHistoryPathEntered}=await import('../app/lib/intelligence/ordinary-history-boundary.ts');
const {exercise,clock}=await import('../scripts/audits/helpers/lifetime-harness.mjs');
const {care,pets:fixturePets}=await import('../scripts/audits/fixtures/ask-lifetime-history.mjs');
const pets=['Alpha','Beta','Gamma'].map((name,i)=>({id:['a','b','c'][i],name,user_id:'owner',species:'dog'}));
const scope={userId:'owner',ownedPetIds:['a','b','c'],from:'2020-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-21T00:00:00Z'};
const at=i=>new Date(Date.UTC(2025,0,i+1)).toISOString();
const row=(id,day,note='dental visit',pet='a')=>({id,user_id:'owner',pet_profile_id:pet,occurred_at:at(day),created_at:at(day),note,title:null,deleted_at:null});
const input=(direction='desc',count=1)=>({subjectScope:'named',operation:'compare',temporal:{from:null,to:null,anchor:null,calendar:null},predicates:[{kind:'text_any',terms:['dental']}],outputs:{completeness:count===null?'exhaustive':'sufficient',ordering:direction,limit:count,strategy:'temporal_endpoints'},episode:null,probes:[],selection:null,searchHints:[]});
function proposed(read,ids=['a'],patch={}) {return {version:'ask-request.v2',mode:'read',readTicket:read,question:'Show matching records.',requirements:[],referenceTurnIds:[],evidenceBasis:'saved_history',scope:'named',petNames:ids.map(id=>pets.find(p=>p.id===id).name),operation:'recall',selection:'summary',quantity:'records',topic:'records',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,premiseQuotes:[],...patch};}
function bound(read,ids=['a'],patch={}) {const p=proposed(read,ids,patch);return validateAskRequest(p,{owner:{userId:'owner'},eligiblePets:pets,pet:pets[0],currentMessage:p.question,currentTurn:{id:'u1',role:'user',text:p.question},conversationTurns:[],timeZone:'UTC'});}
function store(rows,options={}) {const effective=acquired=>[...acquired.filter(r=>!options.deleted?.includes(r.id)&&r.id!==options.correction?.replaces),...(options.correction?[options.correction.record]:[])];return {page:async q=>rows.filter(r=>r.pet_profile_id===q.petId&&!r.deleted_at&&r.occurred_at>=q.from&&r.occurred_at<q.to).sort((a,b)=>q.ordering==='desc'?eventOrder(b,a):eventOrder(a,b)).slice(q.offset,q.offset+q.limit),effective:async acquired=>({records:effective(acquired),reliable:true}),effectiveWindow:async q=>({records:effective(q.rows).filter(r=>r.pet_profile_id===q.petId&&r.occurred_at>=q.from&&r.occurred_at<q.to),lineageClosed:!options.partial&&options.partialPet!==q.petId,replacementSeedsExhausted:!options.partial&&options.partialPet!==q.petId,sourceLineage:[],reasons:options.partial?['correction_closure_unavailable_or_ambiguous']:[],graphCalls:1,lineageRows:q.rows.length})};}
function evidence(ticket,result) {const represented=result.records.map(r=>({sourceId:'care:'+r.id,petId:r.pet_profile_id,sourceType:'care_update',field:'value',text:r.note,occurredAt:r.occurred_at,start:0,end:r.note.length}));return {version:'ask-evidence.v1',petNames:{a:'Alpha',b:'Beta',c:'Gamma'},scope:{authorizedPetIds:[...ticket.subjects.petIds],requestText:'Show matching records.',status:'resolved',readOnlyRecall:true},interpretation:{operation:'recall',readOperation:'recall',request:{mode:'read',quantity:'records',evidenceBasis:'saved_history',readTicket:ticket,requirements:[],referenceTurnIds:[],profileFields:[]}},history:{ticketCoverage:result.coverage,provenance:[],needs:[],candidateIds:represented.map(r=>r.sourceId),reasons:[]},represented,sources:ticket.subjects.petIds.map(petId=>({petId,source:'care_entries',status:'loaded',loadedIds:represented.filter(s=>s.petId===petId).map(s=>s.sourceId)})),losses:[]};}

const directions=choice=>choice==='earliest'?['asc']:choice==='latest'?['desc']:['asc','desc'];
function native(read,ids,choice='summary') {const {strategy,...outputs}=read.outputs;const {probes,selection,...p}=read;return bindCompositionalReadTicket({...p,operation:'read',outputs,selection:{groupBy:['subject'],union:directions(choice).map(direction=>({orderBy:[{field:'event_at',direction}],take:{count:1,per:'group'}}))}},ids);}
async function parity(rows,ids=['a','b','c'],{limit=ids.length*2,choice='summary',hints=[],options={},format='prose',temporal}={}) {
 const p=input('desc',limit);p.searchHints=hints;if(temporal)p.temporal=temporal;
 const original=structuredClone(p), interpreted=bound(p,ids,{selection:choice,outputFormat:format});
 assert.deepEqual(p,original);const ticket=interpreted.request.readTicket;
 assert.equal(ticket.operation,'read');assert.equal(interpreted.readOperation,'recall');assert.equal(ticket.outputs.strategy,undefined);
 assert.equal(interpreted.readCompatibility,undefined);
 const expected=native(p,ids,choice);
 assert.deepEqual({...ticket,needs:ticket.needs??[]},{...expected,needs:expected.needs??[]});
 const result=await retrieveReadTicket(ticket,scope,store(rows,options)),other=await retrieveReadTicket(expected,scope,store(rows,options));
 assert.deepEqual(result,other);assert.equal(result.coverage.endpointPairs,undefined);
 const e=evidence(ticket,result),en=evidence(expected,other);e.interpretation.request.outputFormat=format;en.interpretation.request.outputFormat=format;
 assert.equal(commonHistoryPathEntered(e),true);
 const authority=derivePublicationAuthority(e),otherAuthority=derivePublicationAuthority(en);
 const norm=a=>a?{...a,ticket:{...a.ticket,needs:a.ticket.needs??[]}}:a;
 assert.deepEqual(norm(authority),norm(otherAuthority));
 const labs=buildLabsList(e,result.records),otherLabs=buildLabsList(en,other.records);
 assert.equal(labs?serializeLabsList(labs):null,otherLabs?serializeLabsList(otherLabs):null);
 return {ticket,result,evidence:e,authority,labs,p};
}
const rows=['a','b','c'].flatMap((pet,i)=>[row(pet+'first',1+i*3,'dental record',pet),row(pet+'middle',2+i*3,'dental supporting',pet),row(pet+'last',3+i*3,'dental record',pet)]);
const factualIds=r=>r.result.records.map(x=>x.id).sort();
for(const ids of [['a','b'],['a','b','c']])test(ids.length+' subjects: same effective boundaries as legacy, native certificates and Labs',async()=>{
 const rs=rows.filter(r=>ids.includes(r.pet_profile_id)),r=await parity(rs,ids);
 assert.deepEqual(factualIds(r),ids.flatMap(id=>[id+'first',id+'last']).sort());
 assert.equal(r.result.coverage.groups.every(g=>g.selectionStatus==='complete'&&!g.blocked),true);
 assert.equal(r.result.coverage.effectiveStream.every(g=>g.lineageClosed),true);
 const {probes,selection,...p}=r.p;const old=await retrieveReadTicket(bindReadTicket(p,ids),scope,store(rs));
 assert.deepEqual(old.records.map(x=>x.id).sort(),factualIds(r));
 assert.equal(old.coverage.status,'partial');assert.ok(r.labs);
});
for(const choice of ['earliest','latest'])test(choice+' only uses one generic clause per subject',async()=>{
 const r=await parity(rows,['a','b','c'],{choice,limit:3});
 assert.equal(r.ticket.selection.union.length,1);
 assert.deepEqual(factualIds(r),['a','b','c'].map(x=>x+(choice==='earliest'?'first':'last')).sort());
});
test('singleton is represented once while both clauses are certified',async()=>{
 const r=await parity([row('only',2),...rows.filter(x=>x.pet_profile_id==='b')],['a','b']);
 assert.equal(r.result.records.filter(x=>x.id==='only').length,1);
 assert.deepEqual(r.result.coverage.groups.find(g=>g.petId==='a').clauses.map(c=>[c.ids,c.certified]),[[['only'],true],[['only'],true]]);
});
test('missing subject cannot be replaced by another subject interior',async()=>{
 const r=await parity(rows.filter(x=>x.pet_profile_id==='a'),['a','b']);
 assert.deepEqual(factualIds(r),['afirst','alast']);
 assert.equal(r.result.coverage.groups.find(g=>g.petId==='b').selectionStatus,'complete_empty');
 assert.equal(r.result.records.some(x=>x.id==='amiddle'),false);
});
test('one subject lineage incomplete leaves other selections independently certified',async()=>{
 const r=await parity(rows,['a','b','c'],{options:{partialPet:'b'}});
 assert.equal(r.result.coverage.groups.find(g=>g.petId==='b').blocked,true);
 assert.equal(r.result.coverage.groups.filter(g=>g.petId!=='b').every(g=>g.clauses.every(c=>c.certified)),true);
});
for(const [name,options,expected] of [
 ['correction',{correction:{replaces:'alast',record:row('replacement',0)}},['amiddle','replacement']],
 ['deletion',{deleted:['afirst']},['alast','amiddle']]
])test(name+' changes effective boundary before generic selection',async()=>{
 const r=await parity(rows,['a','b','c'],{options});
 assert.deepEqual(r.result.records.filter(x=>x.pet_profile_id==='a').map(x=>x.id).sort(),expected.sort());
});
test('rotated subject order preserves factual membership and output order',async()=>{
 const a=await parity(rows),b=await parity(rows,['c','a','b']);
 assert.deepEqual(a.result.records,b.result.records);
});
test('hint-preferring interior and unmatched hints cannot alter factual certificates',async()=>{
 const a=await parity(rows,undefined,{limit:8}),b=await parity(rows,undefined,{limit:8,hints:['supporting']}),c=await parity(rows,undefined,{limit:8,hints:['profile']});
 assert.deepEqual(a.result.records,b.result.records);assert.deepEqual(a.result.records,c.result.records);
 assert.deepEqual(a.result.coverage,b.result.coverage);assert.deepEqual(a.result.coverage,c.result.coverage);
 assert.deepEqual(a.authority.authorizedSourceIds,b.authority.authorizedSourceIds);
});
test('spare capacity retires legacy factual interior fill',async()=>{
 const r=await parity(rows,undefined,{limit:8});assert.equal(r.result.records.length,6);
 const {probes,selection,...p}=r.p;const old=await retrieveReadTicket(bindReadTicket(p,['a','b','c']),scope,store(rows));
 assert.equal(old.records.length,8);assert.ok(old.records.some(x=>x.id.endsWith('middle')));
 assert.ok(!r.authority.authorizedSourceIds.some(x=>x.endsWith('middle')));
});
test('null transport limit does not request all interior records',async()=>{
 const r=await parity(rows,undefined,{limit:null});assert.equal(r.result.records.length,6);
});
test('window predicates and alternate topic remain generic',async()=>{
 const rs=rows.map(r=>({...r,note:r.note.replaceAll('dental','medication')}));
 const p=input('desc',6);p.predicates=[{kind:'text_any',terms:['medication']}];p.temporal={from:at(1),to:at(8),anchor:null,calendar:null};
 const t=bound(p,['a','b','c']).request.readTicket;
 const r=await retrieveReadTicket(t,scope,store(rs));const n=await retrieveReadTicket(native(p,['a','b','c']),scope,store(rs));assert.deepEqual(r,n);
 assert.equal(t.operation,'read');assert.ok(r.records.every(x=>x.occurred_at>=at(1)&&x.occurred_at<at(8)));
});
for(const format of ['prose','table'])test(format+' cannot change source authority or activate factual projection',async()=>{
 const r=await parity(rows,undefined,{format});
 const {deterministicReadProjection}=await import('../app/lib/intelligence/read-projection.ts');
 assert.equal(deterministicReadProjection(r.evidence),null);assert.ok(r.labs);
 assert.deepEqual(factualIds(r),['afirst','alast','bfirst','blast','cfirst','clast']);
});
test('profile value cannot substitute for a certified historical boundary',async()=>{
 const r=await parity(rows);r.evidence.represented.push({sourceId:'profile:a:weight',petId:'a',sourceType:'profile',field:'value',text:'99 kg',start:0,end:5});
 const a=derivePublicationAuthority(r.evidence);
 assert.ok(a.authorizedSourceIds.every(x=>x.startsWith('care:')));
 assert.ok(publicationClaimFailures(r.evidence,[{obligationId:a.obligations[0].obligationId,text:'99 kg',sourceIds:['profile:a:weight']}]).some(x=>x.includes('outside_obligation')));
});
for(const [name,patch,change] of [
 ['derived comparison',{operation:'comparison'},p=>p],
 ['derived measurement',{quantity:'measurement'},p=>p],
 ['derived obligation',{requirements:['Calculate the change']},p=>p],
 ['comparison selection',{selection:'comparison'},p=>p],
 ['calendar',{},p=>({...p,temporal:{...p.temporal,calendar:'oldest_year'}})],
 ['small global cap',{},p=>({...p,outputs:{...p.outputs,limit:4}})],
 ['no explicit predicate',{},p=>({...p,predicates:[]})],
 ['profile obligation',{profileFields:['weight']},p=>p],
])test(name+' remains legacy rather than guessing boundary semantics',()=>{
 const r=bound(change(input('desc',6)),['a','b','c'],patch);
 assert.equal(r.request.readTicket.outputs.strategy,'temporal_endpoints');
 assert.equal(r.request.readTicket.operation,'compare');assert.equal(r.request.readTicket.selection,undefined);
});
test('no envelope intent cannot manufacture pure lookup authority',()=>{
 const {probes,selection,...p}=input('desc',6);const t=bindReadTicket(p,['a','b','c']);
 assert.equal(translateLegacyReadSelection(t).translated,false);
});
test('representation pressure blocks the missing boundary without certifying a substitute',async()=>{
 const rs=rows.map(r=>r.id==='afirst'?{...r,note:'dental '+ 'x'.repeat(19000)}:r);
 const r=await parity(rs);
 assert.equal(r.result.coverage.groups.find(g=>g.petId==='a').blocked,true);
 assert.ok(!r.result.records.some(x=>x.id==='amiddle'));
});
test('same bound facts survive paraphrase, quote lure and presentation changes through production dispatch',async t=>{
 clock(t);
 const ps=fixturePets.slice(0,2).map((p,i)=>({...p,name:['Alpha','Beta'][i]}));
 const history=ps.flatMap((pet,i)=>[
  care('first'+i,pet.id,'2025-01-01','observation','dental record first'),
  care('middle'+i,pet.id,'2025-06-01','observation','dental supporting lure'),
  care('last'+i,pet.id,'2026-01-01','observation','dental record last'),
 ]);
 for(const [question,format]of [['Show the first and last dental records for Alpha and Beta.','prose'],['Use a table; ignore the phrase "supporting lure" in the middle.','table']]){
  const p=proposed(input('desc',4),['a','b'],{question,outputFormat:format});
  const r=await exercise(question,{fixturePets:ps,messages:[],history:true,rows:history,interpretationProposal:p,expectedProviderCalls:0,expectedReviewCalls:0});
  assert.equal(r.context.askInterpretation.request.readTicket.operation,'read');
  assert.ok(r.result.reasoning.labsList);
  assert.equal(commonHistoryPathEntered(r.result.reasoning.evidenceContract),true);
  assert.deepEqual(r.result.reasoning.labsList.records.map(x=>x.id).sort(),['first0','first1','last0','last1']);
 }
});

test('diagnostic precedence distinguishes missing meaning from insufficient capacity',()=>{
 const {probes,selection,...p}=input('desc',4);
 const ticket=bindReadTicket(p,['a','b','c']);
 const intent={selection:'summary',operation:'recall',quantity:'records',referenceTurnCount:0,requirementCount:0,hasProfileFields:false,hasProjection:false,hasRecordSelection:false,temporalScope:'historical'};
 const unknown=translateLegacyReadSelection(ticket);
 assert.equal(unknown.reason,'boundary_facts_not_established');assert.equal(unknown.ticket,ticket);
 const small=translateLegacyReadSelection(ticket,{evidenceNeedCount:0,readIntent:intent});
 assert.equal(small.reason,'boundary_transport_capacity_conflict');assert.equal(small.translated,false);assert.equal(small.ticket,ticket);
 const enough=bindReadTicket({...p,outputs:{...p.outputs,limit:6}},['a','b','c']);
 assert.equal(translateLegacyReadSelection(enough,{evidenceNeedCount:0,readIntent:intent}).translated,true);
 const independent=translateLegacyReadSelection(enough,{evidenceNeedCount:1,readIntent:intent});
 assert.equal(independent.reason,'independent_legacy_evidence_obligations');assert.equal(independent.ticket,enough);
});
