import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
// Next enforces the server/client poison boundary; direct Node fixtures use the
// same resolver shim as the existing certificate-publication and Labs tests.
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
const { bindEvidenceReadTicket, bindEvidenceLocator } = await import('../app/lib/intelligence/evidence-read-ticket.ts');
const { createAskEvidenceContract, evidenceSource, representEvidence, evidenceAnswerPolicy, evidenceScopeKey } = await import('../app/lib/intelligence/ask-evidence.ts');

globalThis.fetch = async () => { throw Error('Direct evidence fixtures forbid network'); };
const message = 'Quote the 2024-04-07 pressure test.';
const proposal = () => ({ read: { operation: 'read', temporal: { from: null, to: null, anchor: null },
  predicates: [{ kind: 'text_any', terms: ['pressure test'] }], outputs: { completeness: 'sufficient', ordering: 'asc', limit: null } },
  kind: 'record_lookup', topics: ['pressure'], period: { kind: 'unspecified', surface: null }, status: 'resolved',
  locator: { intent: 'source', status: 'resolved', date: { year: 2024, month: 4, day: 7, label: '2024-04-07' } } });
const pet = { id: 'owned', user_id: 'owner', name: 'Pet' };
const row = (id, at, note, patch={}) => ({ id, user_id: 'owner', pet_profile_id: pet.id, occurred_at: at,
  created_at: '2026-01-01T00:00:00Z', note, title: null, deleted_at: null, ...patch });
const record = row('right', '2024-04-07T12:00:00Z', 'Pressure test: pending, not confirmed normal.');
const context = (rows=[record], p=proposal()) => ({ owner: { userId:'owner' }, pet, eligiblePets:[pet], currentMessage:message,
  careEntries:rows, selectedCareEntries:rows, conversationTurns:[], evidenceReadProposal:p });
const represent = (e, rows=[record]) => representEvidence(e, rows.map(r=>({ id:'care:'+r.id, petId:r.pet_profile_id,
  sourceType:'care_update', value:r.note, occurredAt:r.occurred_at, createdAt:r.created_at, metadata:{} })));

test('typed locator binds owned topic and year without reading the question or accepting candidate IDs',()=>{
 const p=proposal();const ticket=bindEvidenceReadTicket(p,[pet.id],message);
 const rows=[record,row('wrong-topic','2024-04-07T12:00:00Z','Different test: normal.'),
  row('wrong-year','2023-04-07T12:00:00Z','Pressure test: normal.'),
  row('foreign','2024-04-07T12:00:00Z','Pressure test: normal.',{user_id:'other'}),
  row('deleted','2024-04-07T12:00:00Z','Pressure test: normal.',{deleted_at:'2026-01-01'})];
 assert.deepEqual(bindEvidenceLocator(ticket,rows,'owner',id=>'care:'+id).candidateIds,['care:right']);
 p.read.predicates[0].terms[0]='Different test';
 assert.deepEqual(ticket.read.predicates[0].terms,['pressure test']);
 const e=createAskEvidenceContract(context(rows),['owned','not-owned']);
 assert.deepEqual(e.publicationTicket.read.subjects.petIds,['owned']);
 represent(e);assert.match(evidenceAnswerPolicy(e),/Pressure test: pending, not confirmed normal\./);
 const unknownYear=proposal();unknownYear.locator.date.year=null;
 assert.equal(bindEvidenceLocator(bindEvidenceReadTicket(unknownYear,[pet.id],message),rows,'owner',id=>id).candidateIds.length,2);
});

test('unrepresented competing rows and unknown loading cannot establish a unique or effective result',()=>{
 const later=row('later','2024-04-08T12:00:00Z','Pressure test: abnormal.');
 const e=createAskEvidenceContract({...context([record,later]),selectedCareEntries:[record]},[pet.id]);
 represent(e);assert.match(evidenceAnswerPolicy(e),/Other related records/);
 for(const status of ['unavailable','not_loaded']) {
  const labs=createAskEvidenceContract(context(),[pet.id]);
  labs.sources.find(s=>s.source==='care_entries').status=status;
  represent(labs);assert.match(evidenceAnswerPolicy(labs),/unavailable/);
 }
 const empty=createAskEvidenceContract(context([]),[pet.id]);represent(empty,[]);
 assert.match(evidenceAnswerPolicy(empty),/not fully represented/);
 assert.doesNotMatch(evidenceAnswerPolicy(empty),/never|no recorded/);
});

test('untrusted ticket metadata cannot certify facts, choose a second interpreter, or bypass Lungs',()=>{
 for(const patch of [{coverage:'complete'}, {verifiedFacts:[{text:'Normal'}]}, {candidateIds:['care:right']}, {write:true}])
  assert.throws(()=>bindEvidenceReadTicket({...proposal(),...patch},[pet.id],message),/INVALID/);
 for(const change of [p=>{p.locator.date.day=31;p.locator.date.month=2;},
  p=>{p.locator.date.label='invented';},p=>{p.read.outputs.limit=1;},
  p=>{p.read.operation='read_since_event';p.read.temporal.anchor={concept:'visit',relation:'from'};}]) {
  const p=proposal();change(p);assert.throws(()=>bindEvidenceReadTicket(p,[pet.id],message),/INVALID/);
 }
 assert.throws(()=>createAskEvidenceContract({...context(),askInterpretation:{readOnly:true,petIds:[pet.id],operation:'recall',topic:'x'}},[pet.id]),/DUPLICATE_INTERPRETER/);
});

test('only fully represented server-certified facts can override a count limitation',()=>{
 const p=proposal();p.kind='count';p.locator=null;p.read.outputs.completeness='exhaustive';
 const e=createAskEvidenceContract(context([record],p),[pet.id]);represent(e);
 assert.match(evidenceAnswerPolicy(e),/can't establish an exact total/);
 e.sources=[{...evidenceSource(pet.id,'care_entries',['care:right']),status:'loaded',
  completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'}}];
 represent(e);assert.match(evidenceAnswerPolicy(e),/can't establish an exact total/);
 e.verifiedFacts=[{scopeKey:evidenceScopeKey(e.scope),kind:'count',sourceIds:['care:right'],text:'One verified observation.'}];
 assert.equal(evidenceAnswerPolicy(e),'One verified observation.');
 const countFact=structuredClone(e.verifiedFacts[0]);
 e.verifiedFacts[0].sourceIds=[];
 assert.match(evidenceAnswerPolicy(e),/can't establish an exact total/);
 e.verifiedFacts=[countFact];
 const different=structuredClone(p);different.read.predicates[0].terms=['different test'];
 const differentLabs=createAskEvidenceContract(context([record],different),[pet.id]);
 assert.notEqual(evidenceScopeKey(e.scope),evidenceScopeKey(differentLabs.scope));
 differentLabs.sources=structuredClone(e.sources);represent(differentLabs);
 differentLabs.verifiedFacts=[{...countFact,scopeKey:evidenceScopeKey(differentLabs.scope)}];
 assert.match(evidenceAnswerPolicy(differentLabs),/can't establish an exact total/);
 e.losses.push({sourceId:'care:right',reason:'qualified_span_over_budget'});represent(e,[]);
 assert.match(evidenceAnswerPolicy(e),/can't establish an exact total/);
});

test('ordinary typed reads cannot bypass evidence policy through an unbound model narrative',()=>{
 const p=proposal();p.kind='ordinary';p.locator=null;
 const e=createAskEvidenceContract(context([record],p),[pet.id]);represent(e);
 assert.match(evidenceAnswerPolicy(e),/can't establish/);
 assert.equal(e.scope.readOnlyRecall,true);
});
