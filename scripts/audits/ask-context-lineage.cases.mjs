import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './helpers/lifetime-harness.mjs';
import { pets, ownerId, care } from './fixtures/ask-lifetime-history.mjs';
const { buildFurviseContext }=await import('../../app/lib/intelligence/retrieve-context.ts');
const rows=[care('old-weight','luna','2017-04-03','weight','Luna weighed 4.2 kg.')];
const messages=[{id:'prior',conversation_id:'chat',user_id:ownerId,request_id:'request',role:'user',user_text:'Luna weighed 99 kg.',sequence_number:1,created_at:'2026-09-01T00:00:00Z'}];
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
