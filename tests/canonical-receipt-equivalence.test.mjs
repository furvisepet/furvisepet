import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptFixture,id} from './helpers/canonical-receipt.mjs';
const {loadStoredReadReferences}=await import('../app/lib/furvise-brain/stored-read-organ.ts');
const {buildFurviseContext}=await import('../app/lib/intelligence/retrieve-context.ts');
test('canonical planning recovers old operation independently of recent dialogue and exact multi-record payload',async()=>{
 const f=receiptFixture(),ctx=await f.context();
 assert.equal(ctx.conversationTurns.length,40);assert.ok(!ctx.conversationTurns.some(t=>t.id===f.source.id));
 assert.equal(ctx.storedReadReferences.length,1);const result=await f.execute(f.request(ctx));
 assert.equal(result.status,'complete');assert.equal(result.records[0].operation.status,'succeeded');
 assert.equal(result.records[0].operation.sourceMessageId,f.source.id);
 assert.equal(f.cap.action_payload.appendJob.items.length,2);
 assert.equal(f.cap.action_payload.appendJob.items[1].body.text,'Second \u03b1 observation.');
 assert.match(result.records[0].text,/does not establish whether linked records still exist/);
});
for(const status of ['succeeded','failed','cancelled','pending'])test('canonical planning preserves terminal disposition '+status,async()=>{
 const f=receiptFixture({status}),ctx=await f.context(),result=await f.execute(f.request(ctx));
 if(status==='pending'){assert.equal(result.status,'unavailable');assert.deepEqual(result.records,[]);}
 else{assert.equal(result.status,'complete');assert.equal(result.records[0].operation.status,status);}
});
for(const [name,change]of [
 ['owner',f=>f.cap.user_id=id(9)],['pet',f=>f.cap.pet_profile_id=id(9)],
 ['payload',f=>f.cap.action_payload={...f.cap.action_payload,label:'Changed'}],
 ['receipt source',f=>f.cap.receipt={...f.cap.receipt,sourceMessageId:id(9)}],
 ['receipt body',f=>f.cap.receipt={...f.cap.receipt,appendJob:{...f.cap.receipt.appendJob,items:[]}}],
 ['missing receipt',f=>f.cap.receipt=null],['status mismatch',f=>f.cap.status='failed'],
])test('fresh canonical receipt rejects changed '+name,async()=>{
 const f=receiptFixture(),ctx=await f.context(),p=f.request(ctx);change(f);
 const result=await f.execute(p);assert.equal(result.status,'unavailable');assert.deepEqual(result.records,[]);
});
test('deleted linked records and deleted former pet do not erase owner operation status or resurrect facts',async()=>{
 const f=receiptFixture({deleted:true}),ctx=await f.context(),p=f.request(ctx);f.tables.dog_profiles=[];
 const result=await f.execute(p);assert.equal(result.status,'complete');
 assert.equal(result.records[0].operation.status,'succeeded');
 assert.ok(result.records.every(r=>!f.care.some(c=>r.sourceId==='care:'+c.id)));
 assert.match(result.records[0].text,/does not establish whether linked records still exist/);
 assert.equal((await loadStoredReadReferences(f.owner,f.db)).length,1);
});
test('future current-row event is excluded by elapsed history bounds while independent receipt survives',async()=>{
 const f=receiptFixture({future:true}),ctx=await f.context();
 const result=await f.execute(f.request(ctx));assert.equal(result.status,'complete');
 const live=await buildFurviseContext({supabase:f.db,userId:f.owner,petId:f.pet.id,conversationId:id(7),currentMessage:'Show saved history.',
  historyAccess:{months:3,from:'2026-06-17T00:00:00Z',to:'2026-09-18T00:00:00Z'}});
 assert.deepEqual(live.careEntries,[]);assert.equal(live.conversationTurns.some(t=>t.operationReceipt),false);
});
test('assistant success and a source turn without a capability cannot mint an operation receipt',async()=>{
 const f=receiptFixture();f.tables.ask_action_capabilities=[];
 f.tables.ask_conversation_messages.push({id:id(900),user_id:f.owner,conversation_id:id(7),role:'furvise',response_data:{directAnswer:'Saved.'},sequence_number:100,created_at:'2026-09-17T13:00:00Z'});
 const ctx=await f.context();assert.deepEqual(ctx.storedReadReferences,[]);
 assert.equal((await f.execute(f.request(ctx))).status,'unavailable');
});
for(const table of ['ask_conversations','ask_conversation_messages'])test('planning refuses unavailable '+table,async()=>{
 const f=receiptFixture();f.fail.add(table);await assert.rejects(f.context(),/verify the conversation/);
});
test('missing conversation refuses planning while pre-bound durable receipt remains independently verifiable',async()=>{
 const f=receiptFixture(),ctx=await f.context(),p=f.request(ctx);f.tables.ask_conversations=[];
 await assert.rejects(f.context(),/verify the conversation/);assert.equal((await f.execute(p)).status,'complete');
});

for(const state of ['present','deleted','future','foreign','changed'])test('operation receipt and independently certified current stored reports: '+state,async t=>{
 t.mock.method(Date,'now',()=>Date.parse('2026-09-17T12:00:00Z'));
 const f=receiptFixture({deleted:state==='deleted',future:state==='future'}),ctx=await f.context();
 const receipt=await f.execute(f.request(ctx));assert.equal(receipt.status,'complete');
 if(state==='foreign')for(const r of f.care)r.user_id=id(99);
 if(state==='changed')f.care[0].note='Changed since persisted source semantics.';
 const {stressProposal}=await import('../scripts/audits/helpers/current-stress-harness.mjs');
 const {validateAskRequest}=await import('../app/lib/intelligence/ask-request-contract.ts');
 const {retrieveAskHistory}=await import('../app/lib/intelligence/history-retrieval.ts');
 const {createAskEvidenceContract}=await import('../app/lib/intelligence/ask-evidence.ts');
 const {generateContextAwareAskResponse}=await import('../app/lib/ai/ask-reasoning.ts');
 const proposal=stressProposal({authority:'stored_report',petNames:[f.pet.name],from:'2026-07-01',to:'2026-09-18'});
 const interpretation=validateAskRequest(proposal,ctx);
 const live=await retrieveAskHistory({...ctx,askInterpretation:interpretation,historyAccess:{from:'2026-07-01T00:00:00Z',to:'2026-09-18T00:00:00Z'}},f.db,[f.pet.id]);
 const response=await generateContextAwareAskResponse({evidenceContract:createAskEvidenceContract(live,[f.pet.id]),profiles:[f.pet],careEntries:live.askHistory.entries,
 memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],question:proposal.question,client:{responses:{create:async()=>{throw Error('NO_PROVIDER')}}}});
 if(state==='present'){
  assert.equal(response.model,'server-labs-list');
  assert.deepEqual(response.labsList.records.map(r=>r.body),f.care.map(r=>r.note));
 }else assert.deepEqual(response.relevantContextIds,[]);
 assert.equal((await f.execute(f.request(ctx))).records[0].operation.status,'succeeded');
});
