import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './helpers/lifetime-harness.mjs';
import { pets, ownerId, care } from './fixtures/ask-lifetime-history.mjs';
const { buildFurviseContext }=await import('../../app/lib/intelligence/retrieve-context.ts');
const rows=[care('old-weight','luna','2017-04-03','weight','Luna weighed 4.2 kg.')];
const messages=[{id:'prior',conversation_id:'chat',user_id:ownerId,request_id:'request',role:'user',user_text:'Luna weighed 99 kg.',sequence_number:1,created_at:'2026-09-01T00:00:00Z'}];
for(const deleted of [false,true])test('old receipt is freshly revalidated beyond the dialogue window, deleted='+deleted,async()=>{
 const saved=care('saved','luna','2026-09-01','general','Original observation.',{intelligence_source_message_id:'prior',deleted_at:deleted?'2026-09-02T00:00:00Z':null});
 const excluded=care('excluded','luna','2020-01-01','general','Outside access.',{intelligence_source_message_id:'prior'});
 const recent=Array.from({length:14},(_,i)=>({...messages[0],id:'recent-'+i,request_id:'recent-request-'+i,user_text:'Unrelated message '+i,sequence_number:i+2,created_at:`2026-09-02T00:${String(i).padStart(2,'0')}:00Z`}));
 const db=database([saved,excluded],{fixturePets:pets,conversationPetId:'luna',messages:[...messages,...recent]});
 const from=db.from.bind(db);
 db.from=table=>{const q=from(table),select=q.select.bind(q);q.select=columns=>{
  if(table==='pet_care_entries'&&columns.includes('source_message:'))q.then=(resolve,reject)=>Promise.resolve({data:[{...saved,source_message:messages[0]}],error:null}).then(resolve,reject);
  return select(columns);
 };return q;};
 const ctx=await buildFurviseContext({supabase:db,userId:ownerId,petId:'luna',conversationId:'chat',currentMessage:'Show exactly what was stored earlier.',historyAccess:{months:3,from:'2026-06-01T00:00:00Z',to:'2026-09-17T00:00:00Z'}});
 const recovered=ctx.conversationTurns.find(turn=>turn.id==='prior');
 if(deleted){assert.equal(recovered,undefined);return;}
 assert.equal(recovered.recoveredReceiptReference,true);
 assert.deepEqual(recovered.operationReceipt.records.map(r=>r.id),['saved']);
 assert.equal(recovered.operationReceipt.records[0].note,'Original observation.');
 assert.equal(ctx.conversationTurns.filter(turn=>turn.id.startsWith('recent-')).length,12);
});
for(const conversationPetId of ['milo','luna']) test('named pet has independent context from selected conversation: '+conversationPetId,async()=>{
 const db=database(rows,{fixturePets:pets,conversationPetId,messages});
 const ctx=await buildFurviseContext({supabase:db,userId:ownerId,petId:'luna',conversationId:'chat',conversationPetId,currentMessage:'What did Luna weigh in 2017?'});
 assert.equal(ctx.pet.id,'luna'); assert.deepEqual(ctx.careEntries.map(r=>r.id),['old-weight']);
});
test('unavailable conversation lineage suppresses uncertain claims, keeps independently loaded owned history',async()=>{
 const db=database(rows,{fixturePets:pets,conversationPetId:'milo',messages});
 const from=db.from.bind(db);
 db.from=table=>{const q=from(table); const select=q.select.bind(q); q.select=columns=>{
  if(table==='pet_care_entries' && columns.includes('intelligence_source_message_id')) q.then=(resolve,reject)=>Promise.resolve({data:null,error:{code:'LINEAGE_OFFLINE'}}).then(resolve,reject);
  return select(columns);
 };return q;};
 const ctx=await buildFurviseContext({supabase:db,userId:ownerId,petId:'luna',conversationId:'chat',conversationPetId:'milo',currentMessage:'Read Luna history.'});
 assert.deepEqual(ctx.conversationTurns,[]);
 assert.equal(ctx.episodePresentation,undefined);
 assert.deepEqual(ctx.careEntries.map(r=>r.id),['old-weight']);
 assert.ok(ctx.contextRecovery.unavailableSources.includes('conversation_source_lineage'));
});

test('future-dated saved record remains receipt-readable without entering elapsed history',async()=>{
 const future=care('future-saved','luna','2026-09-18','general','Luna is scheduled for a 8:15 PM observation.',{intelligence_source_message_id:'future-source',occurred_at:'2026-09-18T03:15:00Z',created_at:'2026-09-17T12:46:00Z',updated_at:'2026-09-17T12:46:00Z'});
 const source={...messages[0],id:'future-source',request_id:'future-request',user_text:'Save this future-dated Luna note.',created_at:'2026-09-17T12:46:00Z'};
 const assistant={id:'future-assistant',conversation_id:'chat',user_id:ownerId,request_id:'future-request',role:'furvise',user_text:null,response_data:{directAnswer:'Saved.'},sequence_number:2,created_at:'2026-09-17T12:46:01Z'};
 const db=database([future],{fixturePets:pets,conversationPetId:'luna',messages:[source,assistant]});
 const ctx=await buildFurviseContext({supabase:db,userId:ownerId,petId:'luna',conversationId:'chat',currentMessage:'What did I save?',
  historyAccess:{months:3,from:'2026-06-17T00:00:00Z',to:'2026-09-18T00:00:00Z'}});
 const recovered=ctx.conversationTurns.find(turn=>turn.id==='future-source');
 assert.ok(recovered?.operationReceipt,'durable save lineage must survive future event time');
 assert.deepEqual(recovered.operationReceipt.records.map(r=>r.id),['future-saved']);
 assert.equal(ctx.careEntries.some(row=>row.id==='future-saved'),false,'future event must not enter elapsed clinical history');
});
