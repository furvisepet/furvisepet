import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return s === 'server-only' ? { url: 'data:text/javascript,export {};', format: 'module', shortCircuit: true } : next(s,c); } });
const { bindReadTicket } = await import('../app/lib/furvise-brain/read-ticket.ts');
const { retrieveReadTicket } = await import('../app/lib/furvise-brain/lungs.ts');
const { validateAskRequest } = await import('../app/lib/intelligence/ask-request-contract.ts');
const scope = { userId: 'owner', ownedPetIds: ['a','b'], from: '2020-01-01T00:00:00Z', to: '2026-09-20T00:00:00Z', asOf: '2026-09-19T00:00:00Z' };
const binding = (id='need:0', petIds=['a']) => ({ id, petIds, sourceSpanId: 'turn:0:12' });
const need = (patch={}) => ({ needId:'need:0', from:null, to:null, target:null, termGroups:[['food']], ordering:'asc', ...patch });
const proposal = needs => ({ operation:'read', temporal:{from:null,to:null,anchor:null}, predicates:[], outputs:{completeness:'sufficient',ordering:'asc',limit:null}, needs });
const ticket = (needs, bindings=[binding()]) => bindReadTicket(proposal(needs), [...new Set(bindings.flatMap(b=>b.petIds))], bindings);
const row = (id, petId='a', note='The owner reported a dietary transition.', at='2024-04-17T00:00:00Z') => ({ id,user_id:'owner',pet_profile_id:petId,note,title:null,occurred_at:at,created_at:at,updated_at:at,deleted_at:null });
const store = needPage => ({ needPage, page:async()=>{ assert.fail('Needs cannot silently fall back to ordinary scans'); },effective:async records=>({records,reliable:true}) });

test('actual query hits survive lexical differences and a missing query cannot mint an empty receipt',async()=>{
 const t=ticket([need()]);
 const result=await retrieveReadTicket(t,scope,store(async input=>{assert.deepEqual(input.terms,['food']);return [row('hit')];}));
 assert.deepEqual(result.coverage.needs[0].candidateIds,['hit']);
 assert.deepEqual(result.records.map(r=>r.id),['hit']);
 assert.equal(result.coverage.status,'partial');
 const unavailable=await retrieveReadTicket(t,scope,store(undefined));
 assert.equal(unavailable.coverage.needs[0].status,'unavailable');
 assert.equal(unavailable.coverage.needs[0].exhausted,false);
 assert.deepEqual(unavailable.coverage.needs[0].candidateIds,[]);
});

test('rare alias is reserved before routine interior and both budgets remain bounded',async()=>{
 const t=ticket([need({termGroups:[['food'],['transition']]})]);let calls=0;
 const r=await retrieveReadTicket(t,scope,store(async input=>{
  calls++;return input.terms[0]==='transition'?[row('rare')]:Array.from({length:input.limit},(_,i)=>row('routine-'+i,'a','Routine meal. '.repeat(60)));
 }));
 assert.equal(calls,2);assert.ok(r.records.some(r=>r.id==='rare'));
 assert.ok(r.coverage.reservedIds.includes('rare'));
 assert.ok(r.records.length<=32);
 assert.ok(r.records.reduce((n,r)=>n+r.note.length,0)<=18000);
 assert.ok(r.coverage.selection.scannedIds.length<=64);
 assert.ok(r.coverage.reasons.includes('effective_evidence_budget'));
});

test('per-pet probes carry independent hits; fifth and later probes stay explicitly incomplete',async()=>{
 const bindings=Array.from({length:4},(_,i)=>binding('need:'+i,[i%2?'b':'a']));
 const t=ticket(bindings.map(b=>need({needId:b.id,termGroups:[['food'],['transition']]})),bindings);let calls=0;
 const r=await retrieveReadTicket(t,scope,store(async input=>{calls++;return [row(input.petId+'-'+calls,input.petId)];}));
 assert.equal(calls,4);assert.equal(r.coverage.needs.length,4);
 for(const n of r.coverage.needs){assert.equal(n.exhausted,false);assert.equal(n.reason,'need_query_budget');assert.ok(n.candidateIds.every(id=>id.startsWith(n.petId+'-')));}
 assert.equal(r.coverage.status,'partial');
});

test('clipped windows stay partial and foreign rows or changing revisions fail closed',async()=>{
 const t=ticket([need({from:'2019-01-01T00:00:00Z',to:'2021-01-01T00:00:00Z'})]);
 const r=await retrieveReadTicket(t,scope,store(async input=>{assert.equal(input.from,'2020-01-01T00:00:00.000Z');return [];}));
 assert.equal(r.coverage.needs[0].reason,'need_window_clipped');assert.equal(r.coverage.needs[0].exhausted,false);
 for(const bad of [row('foreign','b'),{...row('foreign'),user_id:'other'},row('future','a','Future.','2027-01-01T00:00:00Z')]){
  const result=await retrieveReadTicket(ticket([need()]),scope,store(async()=>[bad]));
  assert.equal(result.coverage.status,'unavailable');assert.deepEqual(result.records,[]);
 }
 let calls=0;
 const changed=await retrieveReadTicket(ticket([need({termGroups:[['food'],['diet']]})]),scope,store(async()=>[{...row('same'),note:++calls===1?'Original.':'Changed.'}]));
 assert.equal(changed.coverage.status,'unavailable');assert.deepEqual(changed.records,[]);
});

test('need dimensions bind to an exact user span and owned pet; forged dimensions are rejected',()=>{
 const question='Explain Aster’s food change.';
 const pet={id:'a',user_id:'owner',name:'Aster',species:'dog'};
 const context={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:question,currentTurn:{id:'u1',role:'user',text:question},conversationTurns:[]};
 const p={version:'ask-request.v2',readTicket:proposal([need()]),mode:'read',question,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Aster'],operation:'recall',selection:'summary',quantity:null,topic:'food',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history',
  evidenceNeeds:[{quote:'food change',sourceTurnId:null,terms:['food'],petNames:['Aster']}]};
 const bound=validateAskRequest(p,context).request.readTicket.needs[0];
 assert.deepEqual(bound.petIds,['a']);assert.equal(bound.sourceSpanId,'u1:16:27');
 assert.ok(Object.isFrozen(bound)&&Object.isFrozen(bound.termGroups[0]));
 for(const raw of [{...need(),candidateIds:['invented']},need({needId:'need:9'}),need({from:'2023-02-30T00:00:00Z'}),need({target:'2024-03',from:'2024-04-01T00:00:00Z',to:'2024-05-01T00:00:00Z'})])
  assert.throws(()=>ticket([raw]),/read_needs/);
 assert.throws(()=>bindReadTicket(proposal([need()]),['a'],[binding('need:0',['foreign'])]),/read_needs/);
 assert.throws(()=>validateAskRequest({...p,evidenceNeeds:[{...p.evidenceNeeds[0],quote:'invented span'}]},context),/read_needs/);
 assert.throws(()=>validateAskRequest({...p,evidenceNeeds:[{...p.evidenceNeeds[0],petNames:['Foreign']}]},context),/read_needs/);
});
