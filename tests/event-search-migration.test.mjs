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
const input=(direction='desc',count=1)=>({subjectScope:'named',operation:'read',temporal:{from:null,to:null,anchor:null,calendar:null},predicates:[{kind:'text_any',terms:['dental']}],outputs:{completeness:count===null?'exhaustive':'sufficient',ordering:direction,limit:count,strategy:'event_candidates'},episode:null,probes:[],selection:null,searchHints:[]});
function proposed(read,ids=['a'],patch={}) {return {version:'ask-request.v2',mode:'read',readTicket:read,question:'Show matching records.',requirements:[],referenceTurnIds:[],evidenceBasis:'saved_history',scope:'named',petNames:ids.map(id=>pets.find(p=>p.id===id).name),operation:'recall',selection:read.outputs.limit===null?'period':read.outputs.ordering==='asc'?'earliest':'latest',quantity:'records',topic:'records',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,premiseQuotes:[],...patch};}
function bound(read,ids=['a'],patch={}) {const p=proposed(read,ids,patch);return validateAskRequest(p,{owner:{userId:'owner'},eligiblePets:pets,pet:pets[0],currentMessage:p.question,currentTurn:{id:'u1',role:'user',text:p.question},conversationTurns:[],timeZone:'UTC'});}
function native(read,ids=['a']) {const {strategy,...outputs}=read.outputs;const {probes,selection,...p}=read;return read.outputs.limit===null?bindReadTicket({...p,outputs},ids):bindCompositionalReadTicket({...p,outputs,selection:{groupBy:ids.length===1?['subject']:[],union:[{orderBy:[{field:'event_at',direction:outputs.ordering}],take:{count:outputs.limit,per:ids.length===1?'group':'result'}}]}},ids);}
function store(rows,options={}) {const effective=acquired=>[...acquired.filter(r=>!options.deleted?.includes(r.id)&&r.id!==options.correction?.replaces),...(options.correction?[options.correction.record]:[])];return {page:async q=>rows.filter(r=>r.pet_profile_id===q.petId&&!r.deleted_at&&r.occurred_at>=q.from&&r.occurred_at<q.to).sort((a,b)=>q.ordering==='desc'?eventOrder(b,a):eventOrder(a,b)).slice(q.offset,q.offset+q.limit),effective:async acquired=>({records:effective(acquired),reliable:true}),effectiveWindow:async q=>({records:effective(q.rows).filter(r=>r.pet_profile_id===q.petId&&r.occurred_at>=q.from&&r.occurred_at<q.to),lineageClosed:!options.partial,replacementSeedsExhausted:!options.partial,sourceLineage:[],reasons:options.partial?['correction_closure_unavailable_or_ambiguous']:[],graphCalls:1,lineageRows:q.rows.length})};}
function evidence(ticket,result) {const represented=result.records.map(r=>({sourceId:'care:'+r.id,petId:r.pet_profile_id,sourceType:'care_update',field:'value',text:r.note,occurredAt:r.occurred_at,start:0,end:r.note.length}));return {version:'ask-evidence.v1',petNames:{a:'Alpha',b:'Beta',c:'Gamma'},scope:{authorizedPetIds:[...ticket.subjects.petIds],requestText:'Show matching records.',status:'resolved',readOnlyRecall:true},interpretation:{operation:'recall',readOperation:'recall',request:{mode:'read',quantity:'records',evidenceBasis:'saved_history',readTicket:ticket,requirements:[],referenceTurnIds:[],profileFields:[]}},history:{ticketCoverage:result.coverage,provenance:[],needs:[],candidateIds:represented.map(r=>r.sourceId),reasons:[]},represented,sources:ticket.subjects.petIds.map(petId=>({petId,source:'care_entries',status:'loaded',loadedIds:represented.filter(s=>s.petId===petId).map(s=>s.sourceId)})),losses:[]};}
async function parity(p,rows,ids=['a'],options={}) {const original=structuredClone(p);const interpreted=bound(p,ids);assert.deepEqual(p,original);const migrated=interpreted.request.readTicket;assert.equal(migrated.outputs.strategy,undefined);assert.deepEqual(interpreted.readCompatibility,{inputStrategy:'event_candidates'});const expected=native(p,migrated.subjects.petIds);assert.deepEqual({...migrated,needs:migrated.needs ?? []},{...expected,needs:expected.needs ?? []});const a=await retrieveReadTicket(migrated,scope,store(rows,options)),b=await retrieveReadTicket(expected,scope,store(rows,options));assert.deepEqual(a,b);const ae=evidence(migrated,a),be=evidence(expected,b);assert.equal(commonHistoryPathEntered(ae),true);const authority=derivePublicationAuthority(ae);const semanticAuthority=a=>a?{...a,ticket:{...a.ticket,needs:a.ticket.needs ?? []}}:a;assert.deepEqual(semanticAuthority(authority),semanticAuthority(derivePublicationAuthority(be)));const al=buildLabsList(ae,a.records),bl=buildLabsList(be,b.records);assert.equal(al ? serializeLabsList(al) : null,bl ? serializeLabsList(bl) : null);return {ticket:migrated,result:a,evidence:ae,authority};}
for(const [name,p,rows,ids] of [
 ['one',input(),[row('one',1)],['a']],
 ['latest',input(),[row('old',1),row('new',2)],['a']],
 ['earliest',input('asc'),[row('old',1),row('new',2)],['a']],
 ['global latest three',input('desc',3),[row('a1',1),row('a4',4),row('b3',3,'dental','b'),row('c2',2,'dental','c')],['a','b','c']],
 ['all',input('asc',null),[row('old',1),row('new',2)],['a']],
 ['zero',input(),[],['a']],
 ['window',{...input(),temporal:{from:at(2),to:at(4),anchor:null}},[row('old',1),row('inside',3),row('outside',4)],['a']],
])test(name+' search has native common proof, source authority and publication parity',async()=>{const r=await parity(p,rows,ids);if(p.outputs.limit!==null&&rows.length)assert.ok(r.authority?.obligations.some(o=>o.authority==='certified'));if(p.outputs.limit===null)assert.equal(r.result.coverage.resultSet.certified,true);const {probes,selection,...legacy}=p;const before=await retrieveReadTicket(bindReadTicket(legacy,ids),scope,store(rows));assert.deepEqual(before.records,r.result.records);});
test('native per-subject selection is preserved without inventing legacy per-pet quotas',async()=>{const p=input();delete p.outputs.strategy;p.outputs.limit=null;p.selection={groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]};const b=bound(p,['a','b']);assert.equal(b.readCompatibility,undefined);const r=await retrieveReadTicket(b.request.readTicket,scope,store([row('a',1),row('b',2,'dental','b')]));assert.deepEqual(r.records.map(r=>r.id).sort(),['a','b']);});
test('redundant hint may preserve support but cannot replace chronological winner',async()=>{const p=input();p.predicates=[{kind:'text_any',terms:['dental','vaccination']}];p.searchHints=['vaccination'];const rows=[row('old',1,'vaccination'),row('new',2,'dental')];const r=await parity(p,rows);assert.deepEqual(r.result.records.map(r=>r.id),['new']);const noHints=await parity({...p,searchHints:[]},rows);assert.deepEqual(r.result.coverage,noHints.result.coverage);assert.deepEqual({...r.authority,ticket:{...r.authority.ticket,searchHints:[]} },noHints.authority);const {probes,selection,...legacy}=p;const old=await retrieveReadTicket(bindReadTicket(legacy,['a']),scope,store(rows));assert.deepEqual(old.records.map(r=>r.id),['old']);});
for(const [name,options]of [['corrected',{correction:{replaces:'new',record:row('replacement',3)}}],['deleted',{deleted:['new']}],['lineage blocked',{partial:true}]])test(name+' event uses common effective history/certification',async()=>{const r=await parity(input(),[row('old',1),row('new',2)],['a'],options);if(options.partial)assert.equal(r.authority,null);else assert.deepEqual(r.result.records.map(r=>r.id),[name==='deleted'?'old':'replacement']);});
test('profile evidence cannot satisfy migrated historical selection',async()=>{const r=await parity(input(),[row('event',1,'dental visit body weight was 4 kg')]);const e=r.evidence;e.sources.push({petId:'a',source:'profile',status:'loaded',loadedIds:['a']});e.represented.push({sourceId:'profile:a:weight',petId:'a',sourceType:'profile',field:'value',start:0,end:4,text:'9 kg'});const authority=derivePublicationAuthority(e);assert.deepEqual(authority.authorizedSourceIds,['care:event']);assert.ok(publicationClaimFailures(e,[{obligationId:authority.obligations[0].obligationId,text:'9 kg',sourceIds:['profile:a:weight']}]).some(f=>f.includes('outside_obligation')));});
test('all matching distinguishes 80 effective matches from 32 represented rows',async()=>{const r=await parity(input('asc',null),Array.from({length:80},(_,i)=>row('r'+i,i)));assert.equal(r.result.coverage.resultSet.matchingIds.length,80);assert.equal(r.result.coverage.resultSet.matchingSetComplete,true);assert.equal(r.result.coverage.resultSet.representationComplete,false);assert.equal(r.result.coverage.resultSet.certified,false);});
test('subject order cannot change global search winners',async()=>{const rows=[row('a',1),row('b',2,'dental','b'),row('c',3,'dental','c')];const a=await parity(input('desc',2),rows,['a','b','c']),b=await parity(input('desc',2),rows,['c','a','b']);assert.deepEqual(a.result.records,b.result.records);});
for(const [name,change,patch] of [
 ['ambiguous reference',p=>p,{selection:'reference',ordinal:'that'}],
 ['uncertain cardinality',p=>p,{selection:'summary'}],
 ['calendar',p=>{p.temporal.calendar='oldest_year';return p;},{}],
 ['hint-only semantics',p=>{p.searchHints=['surgery'];return p;},{}],
 ['separate requested facts',p=>p,{requirements:['Explain the cause']}],
 ['independent profile',p=>p,{profileFields:['weight']}],
])test(name+' stays legacy',()=>{const p=change(input());const b=bound(p,['a'],patch);assert.equal(b.request.readTicket.outputs.strategy,'event_candidates');assert.equal(b.readCompatibility,undefined);});
test('bound ticket alone has no proof that reference intent was preserved',()=>{const {probes,selection,...p}=input();const ticket=bindReadTicket(p,['a']);assert.equal(translateLegacyReadSelection(ticket).translated,false);});
test('unresolved anchor cannot be smuggled into event search strategy',()=>{const p=input();p.operation='read_since_event';p.temporal.anchor={concept:'dental',relation:'after'};assert.throws(()=>bound(p));});
test('independent grounded needs cannot combine with event strategy',()=>{const p=input();delete p.probes;p.needs=[{needId:'need:0',from:null,to:null,target:null,termGroups:[['dental']],ordering:'asc'}];assert.throws(()=>bound(p));});
test('migrated empty event search keeps source-free deterministic limitation with zero generation/review',async t=>{clock(t);const ps=fixturePets.slice(0,1).map(p=>({...p,name:'Aster'}));const question='Show the latest dental record for Aster.';const p=proposed(input(),['a'],{question,petNames:['Aster']});const r=await exercise(question,{fixturePets:ps,messages:[],history:true,rows:[care('routine','milo','2026-06-04','behavior','Usual walk.')],interpretationProposal:p,expectedProviderCalls:0,expectedReviewCalls:0});assert.equal(r.context.askInterpretation.request.readTicket.outputs.strategy,undefined);assert.deepEqual(r.context.askHistory.coverage.eventCandidateIds,[]);assert.match(r.result.reasoning.answer.summary,/verify the specific event/);assert.deepEqual(r.result.reasoning.relevantContextIds,[]);assert.equal(r.result.answerValidation.assessment.outcome,'limited');});

const {deterministicReadProjection}=await import('../app/lib/intelligence/read-projection.ts');
const {validateGeneratedAnswer}=await import('../app/lib/intelligence/validation/validate-answer.ts');
const {UNVERIFIED_EVENT_LIMITATION}=await import('../app/lib/intelligence/evidence-need-coverage.ts');
async function emptyFixture(t,rows=[],patch={}) {
  clock(t);
  const ps=fixturePets.slice(0,1).map(p=>({...p,name:'Aster'}));
  const question='Show the latest dental record for Aster.';
  return exercise(question,{fixturePets:ps,messages:[],history:true,rows,
    interpretationProposal:proposed(input(),['a'],{question,petNames:['Aster'],...patch}),
    expectedProviderCalls:0,expectedReviewCalls:0});
}
test('certified empty effective scope uses existing selection authority and zero provider calls',async t=>{
  const r=await emptyFixture(t);
  const e=r.result.reasoning.evidenceContract, coverage=e.history.ticketCoverage;
  assert.equal(coverage.groups[0].exhausted,true);
  assert.equal(coverage.effectiveStream[0].lineageClosed,true);
  assert.deepEqual(coverage.effectiveStream[0].effectiveIds,[]);
  const authority=derivePublicationAuthority(e);
  assert.deepEqual(authority.obligations.map(o=>[o.authority,o.status,o.authorizedSourceIds]),[['certified','complete_empty',[]]]);
  assert.ok(r.result.reasoning.labsList);
  assert.match(r.result.reasoning.answer.summary,/No matching records were found in this certified selection window/);
  assert.equal(r.result.answerValidation.assessment.outcome,'complete');
  const unproven=structuredClone(e);unproven.history.ticketCoverage.groups[0].clauses[0].certified=false;
  assert.equal(derivePublicationAuthority(unproven),null);
  assert.equal(buildLabsList(unproven,[]),null);
  assert.equal(deterministicReadProjection(unproven).sentences[0].text,UNVERIFIED_EVENT_LIMITATION);
});
test('exhaustive empty resultSet has matching and representation completeness',async()=>{
  const r=await parity(input('asc',null),[]);
  assert.equal(r.result.coverage.resultSet.matchingSetComplete,true);
  assert.equal(r.result.coverage.resultSet.representationComplete,true);
  assert.equal(r.result.coverage.resultSet.certified,true);
  assert.match(serializeLabsList(buildLabsList(r.evidence,[])),/No matching notes/);
});
test('incomplete acquisition never certifies absence',async()=>{
  const ticket=bound(input()).request.readTicket;
  const db=store([]);db.page=async()=>{throw Error('offline fixture retrieval unavailable');};
  const result=await retrieveReadTicket(ticket,scope,db),e=evidence(ticket,result);
  assert.notEqual(result.coverage.groups[0].selectionStatus,'complete_empty');
  assert.equal(derivePublicationAuthority(e),null);
  assert.doesNotMatch(serializeLabsList(buildLabsList(e,[])),/No matching records were found/);
});
for (const quantity of [null,'records']) test('unresolved reference zero candidates remains source-free without Labs or providers: '+quantity,async t=>{
  const r=await emptyFixture(t,[],{selection:'reference',ordinal:'that',quantity});
  assert.equal(r.context.askInterpretation.request.readTicket.outputs.strategy,'event_candidates');
  assert.equal(r.result.reasoning.labsList,undefined);
  assert.equal(derivePublicationAuthority(r.result.reasoning.evidenceContract),null);
  assert.equal(r.result.reasoning.answer.summary,UNVERIFIED_EVENT_LIMITATION);
  assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
});
test('ambiguous reference never obtains a common empty-search certificate',async()=>{
  const ticket=bound(input(),['a'],{selection:'reference',ordinal:'that'}).request.readTicket;
  const r=await retrieveReadTicket(ticket,scope,store([row('one',1),row('two',2)]));
  assert.equal(ticket.outputs.strategy,'event_candidates');
  assert.equal(r.coverage.groups,undefined);
  assert.equal(r.coverage.resultSet,undefined);
  assert.equal(derivePublicationAuthority(evidence(ticket,r)),null);
  assert.notEqual(r.coverage.status,'complete_empty');
});
test('a teeth-cleaning counterexample prevents lexical empty from becoming concept absence',async t=>{
  const r=await emptyFixture(t,[care('teeth','milo','2026-06-04','observation','Teeth were cleaned under anaesthesia.')]);
  const e=r.result.reasoning.evidenceContract;
  assert.equal(e.history.ticketCoverage.groups[0].exhausted,true);
  assert.deepEqual(e.history.ticketCoverage.selection.matchedIds,[]);
  assert.deepEqual(e.history.ticketCoverage.effectiveStream[0].effectiveIds,['teeth']);
  assert.equal(r.result.reasoning.labsList,undefined);
  assert.equal(r.result.reasoning.answer.summary,UNVERIFIED_EVENT_LIMITATION);
  assert.equal(r.result.answerValidation.assessment.outcome,'limited');
});
test('closed tombstone removing final effective row permits certified empty',async()=>{
  const r=await parity(input(),[row('deleted',1)],['a'],{deleted:['deleted']});
  assert.deepEqual(r.result.coverage.effectiveStream[0].effectiveIds,[]);
  assert.equal(r.authority.obligations[0].status,'complete_empty');
  assert.match(serializeLabsList(buildLabsList(r.evidence,[])),/No matching records were found/);
});
test('a correction to nonmatching prose proves lexical emptiness only',async()=>{
  const r=await parity(input(),[row('old',1)],['a'],{correction:{replaces:'old',record:row('corrected',2,'Teeth were cleaned.')}});
  assert.deepEqual(r.result.coverage.selection.matchedIds,[]);
  assert.deepEqual(r.result.coverage.effectiveStream[0].effectiveIds,['corrected']);
  assert.equal(buildLabsList(r.evidence,[]),null);
});
test('unclosed correction lineage forbids certified empty even without represented records',async()=>{
  const r=await parity(input(),[],['a'],{partial:true});
  assert.equal(r.authority,null);
  assert.equal(r.result.coverage.effectiveStream[0].lineageClosed,false);
  assert.doesNotMatch(serializeLabsList(buildLabsList(r.evidence,[])),/No matching records were found/);
});
test('source-free limitation exception cannot publish added facts, citations or writes',async t=>{
  const r=await emptyFixture(t,[care('routine','milo','2026-06-04','behavior','Usual walk.')]);
  for(const alter of [
    x=>{x.answer.summary+=' Weight is 4 kg.';},
    x=>{x.answer.title='A dental event occurred';},
    x=>{x.suggestedFollowUps=['A dental event occurred'];},
    x=>{x.answer.sections=[{heading:'Facts',body:'Weight is 4 kg.'}];},
    x=>{x.relevantContextIds=['profile:milo:weight'];},
    x=>{x.historyNarrative.sentences[0].sourceIds=['care:routine'];},
    x=>{x.historyNarrative.sentences[0].calculations=[{value:4}];},
    x=>{x.applicationActions=[{type:'invented'}];},
  ]) {
    const candidate=structuredClone(r.result.reasoning);alter(candidate);
    const v=validateGeneratedAnswer(candidate,r.context,'routine',['milo']);
    assert.equal(v.valid,false);
    assert.ok(v.errors.includes('publication_obligation_authority_required'));
  }
});
test('omitted and empty needs execute identically without production normalization',async()=>{
  const a=native(input());const b={...a,needs:[]};
  assert.deepEqual(await retrieveReadTicket(a,scope,store([row('one',1)])),await retrieveReadTicket(b,scope,store([row('one',1)])));
});
