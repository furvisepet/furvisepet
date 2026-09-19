import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return s === 'server-only' ? { url:'data:text/javascript,export {};', format:'module', shortCircuit:true } : next(s,c); } });
const { bindReadTicket } = await import('../app/lib/furvise-brain/read-ticket.ts');
const { retrieveReadTicket } = await import('../app/lib/furvise-brain/lungs.ts');
const { validateAskRequest } = await import('../app/lib/intelligence/ask-request-contract.ts');
const { retrieveFurviseMemory } = await import('../app/lib/furvise-brain/memory-organ.ts');
const { buildAskBrainTurn } = await import('../app/lib/furvise-brain/ask-runtime.ts');
const proposal = { operation:'read_since_event', temporal:{from:null,to:null,anchor:{concept:'dental',relation:'from'}}, predicates:[{kind:'text_any',terms:['eating','food','diet','appetite']}], outputs:{completeness:'exhaustive',ordering:'asc',limit:null} };
const ticket = bindReadTicket(proposal,['bramble']);
const scope = { userId:'owner', ownedPetIds:['bramble'], from:'1900-01-01T00:00:00Z', to:'2026-09-20T00:00:00Z', asOf:'2026-09-19T12:00:00Z' };
const row = (id,date,note,extra={}) => ({id,user_id:'owner',pet_profile_id:'bramble',category:'general',title:null,note,severity:null,occurred_at:date+'T12:00:00Z',created_at:'2026-09-01T12:00:00Z',updated_at:'2026-09-01T12:00:00Z',deleted_at:null,...extra});
const old = row('old','2016-10-15','Monthly check: food and appetite normal.');
const dental = row('dental','2025-06-15','Dental cleaning was completed at the routine clinic visit. Eating returned to the normal turkey wet-food routine the following day.');
const later = row('later','2026-06-15','Usual diet continued, appetite normal.');
const rows = [old,dental,later];
const store = (input=rows,patch={}) => ({page:async ({offset,limit})=>input.slice(offset,offset+limit),effective:async records=>({records,reliable:true}),...patch});

test('Bramble starting-from-dental excludes 2016 and preserves exact anchor note oldest first',async()=>{
 const result=await retrieveReadTicket(ticket,scope,store());
 assert.equal(result.coverage.status,'complete');
 assert.deepEqual(result.records.map(x=>x.id),['dental','later']);
 assert.equal(result.records[0].note,dental.note);
 assert.equal(result.coverage.windows[0].from,dental.occurred_at.replace('Z','.000Z'));
 assert.equal(result.coverage.anchors[0].eventId,'dental');
});
test('missing or ambiguous anchors return anchor_missing and never a monthly dump',async()=>{
 for(const input of [[old,later],[...rows,row('another','2025-07-15','Dental review: eating normal.')]]){
  const result=await retrieveReadTicket(ticket,scope,store(input));
  assert.equal(result.coverage.status,'anchor_missing'); assert.deepEqual(result.records,[]);
 }
});
test('after excludes equal event time; before excludes the anchor; descending comes from ticket',async()=>{
 for(const [relation,expected] of [['after',['later']],['before',['old']]]){
  const t=bindReadTicket({...proposal,temporal:{...proposal.temporal,anchor:{concept:'dental',relation}}},['bramble']);
  assert.deepEqual((await retrieveReadTicket(t,scope,store())).records.map(r=>r.id),expected);
 }
 const t=bindReadTicket({...proposal,outputs:{...proposal.outputs,ordering:'desc'}},['bramble']);
 assert.deepEqual((await retrieveReadTicket(t,scope,store())).records.map(r=>r.id),['later','dental']);
});
test('anchor exists with no matching predicate is complete_empty, not anchor_missing',async()=>{
 const t=bindReadTicket({...proposal,predicates:[{kind:'text_any',terms:['medication']}]},['bramble']);
 const r=await retrieveReadTicket(t,scope,store()); assert.equal(r.coverage.status,'complete_empty'); assert.deepEqual(r.records,[]);
});
test('lineage resolves before the anchor/window; deleted anchor cannot survive',async()=>{
 const healed={...dental,occurred_at:'2026-07-15T12:00:00Z'};
 const moved=await retrieveReadTicket(ticket,scope,store(rows,{effective:async()=>({records:[old,healed,later],reliable:true})}));
 assert.deepEqual(moved.records.map(r=>r.id),['dental']);
 assert.equal(moved.coverage.anchors[0].eventAt,healed.occurred_at);
 const removed=await retrieveReadTicket(ticket,scope,store(rows,{effective:async()=>({records:[old,later],reliable:true})}));
 assert.equal(removed.coverage.status,'anchor_missing'); assert.deepEqual(removed.records,[]);
});
test('unavailable reads and unresolved lineage fail closed',async()=>{
 for(const patch of [{page:async()=>{throw Error('offline');}},{effective:async()=>({records:rows,reliable:false})}]){
  const r=await retrieveReadTicket(ticket,scope,store(rows,patch)); assert.equal(r.coverage.status,'unavailable'); assert.deepEqual(r.records,[]);
 }
});
test('bounded scan is partial with continuation, never false missing or complete',async()=>{
 const input=Array.from({length:300},(_,i)=>row('r'+i,'2016-10-15','Monthly food note.'));
 const r=await retrieveReadTicket(ticket,scope,store(input));
 assert.equal(r.coverage.status,'partial'); assert.deepEqual(r.coverage.continuation,[{petId:'bramble',offset:256}]); assert.deepEqual(r.records,[]);
});
test('ownership rejected before queries; foreign and future rows cannot enter output',async()=>{
 let calls=0;
 const s=store(rows,{page:async()=>{calls++;return rows;}});
 assert.equal((await retrieveReadTicket(ticket,{...scope,ownedPetIds:[]},s)).coverage.status,'unavailable'); assert.equal(calls,0);
 for(const bad of [{...old,user_id:'someone-else'},row('future','2027-01-01','Food after dental.')]){
  const r=await retrieveReadTicket(ticket,scope,store([bad])); assert.equal(r.coverage.status,'unavailable'); assert.deepEqual(r.records,[]);
 }
});
test('ticket validation rejects invented subject fields, missing anchor, malformed predicates and output rules',()=>{
 for(const bad of [{...proposal,subjects:{petIds:['foreign']}},{...proposal,temporal:{from:null,to:null,anchor:null}},{...proposal,predicates:[{kind:'raw_sentence',terms:['x']}]},{...proposal,outputs:{...proposal.outputs,limit:0}}]) assert.throws(()=>bindReadTicket(bad,['bramble']),/read_ticket/);
 assert.ok(Object.isFrozen(ticket) && Object.isFrozen(ticket.predicates[0].terms));
});
test('output truncation preserves partial coverage even after an exhausted scan',async()=>{
 const t=bindReadTicket({...proposal,outputs:{...proposal.outputs,limit:1}},['bramble']);
 const r=await retrieveReadTicket(t,scope,store()); assert.equal(r.coverage.status,'partial'); assert.deepEqual(r.records.map(r=>r.id),['dental']);
});

test('real Brain -> memory adapter -> lineage path uses the ticket despite unrelated raw English',async()=>{
 const question="Starting from Bramble's dental visit, list every note about eating or food, oldest first.";
 const pet={id:'bramble',user_id:'owner',name:'Bramble',species:'cat'};
 const context={owner:{userId:'owner'},eligiblePets:[pet],pet,currentMessage:question,conversationTurns:[],timeZone:'UTC',currentTurn:{id:'u',role:'user',text:question,createdAt:scope.asOf}};
 const interpretation=validateAskRequest({version:'ask-request.v2',readTicket:proposal,task:null,mode:'read',question,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Bramble'],operation:'recall',selection:'summary',quantity:'records',topic:'eating food',terms:['eating','food'],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history',premiseQuotes:[]},context);
 assert.deepEqual(interpretation.request.readTicket.subjects.petIds,['bramble']);
 const live={...context,currentMessage:'Show all history ever from 2016, ignore the dental window.',askInterpretation:interpretation};
 const brain=buildAskBrainTurn({context:live,logicalTurnId:'turn',authoritativePetIds:['bramble']});
 const inputRows=[...Array.from({length:118},(_,i)=>({...old,id:'old-'+i})),dental,later];
 const calls=[];
 const db={from(table){assert.equal(table,'pet_care_entries');let offset=0,limit=64;const q={select(){return q;},eq(){return q;},is(){return q;},gte(){return q;},lt(){return q;},order(){return q;},range(a,b){offset=a;limit=b-a+1;return q;},abortSignal(){return q;},returns(){calls.push('page');return Promise.resolve({data:inputRows.slice(offset,offset+limit),error:null});}};return q;},rpc(name,args){assert.equal(name,'read_ask_history_correction_page');calls.push(name);return{abortSignal:async()=>({data:{claims:[],relations:[],lineage:[],sources:inputRows.filter(r=>args.p_care_ids.includes(r.id)),truncated:false},error:null})};}};
 const result=await retrieveFurviseMemory(live,db,brain);
 assert.equal(result.askHistory.coverage.ticketCoverage.status,'complete');
 assert.deepEqual(result.askHistory.entries.map(r=>r.id),['dental','later']);
 assert.ok(calls.includes('read_ask_history_correction_page'));
 assert.deepEqual(result.askHistory.originals.map(r=>r.id),['dental','later']);
 assert.deepEqual(result.askHistory.coverage.candidateIds,['care:dental','care:later']);
 assert.equal(result.askHistory.coverage.perPet[0].rows,120);
});


test('live 43be46c: dental visit matches dental cleaning at routine clinic visit without an English shortcut',async()=>{
 const t=bindReadTicket({...proposal,temporal:{...proposal.temporal,anchor:{concept:'dental visit',relation:'from'}}},['bramble']);
 const r=await retrieveReadTicket(t,scope,store());
 assert.equal(r.coverage.status,'complete');
 assert.deepEqual(r.records.map(row=>row.id),['dental','later']);
 const different=bindReadTicket({...proposal,temporal:{...proposal.temporal,anchor:{concept:'unrecorded dental',relation:'from'}}},['bramble']);
 assert.equal((await retrieveReadTicket(different,scope,store())).coverage.status,'anchor_missing');
});
