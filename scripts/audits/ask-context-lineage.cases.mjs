import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptFixture,id} from '../../tests/helpers/canonical-receipt.mjs';
import { database } from './helpers/lifetime-harness.mjs';
import { pets, ownerId, care } from './fixtures/ask-lifetime-history.mjs';
const { buildFurviseContext }=await import('../../app/lib/intelligence/retrieve-context.ts');
const rows=[care('old-weight','luna','2017-04-03','weight','Luna weighed 4.2 kg.')];
const messages=[{id:'prior',conversation_id:'chat',user_id:ownerId,request_id:'request',role:'user',user_text:'Luna weighed 99 kg.',sequence_number:1,created_at:'2026-09-01T00:00:00Z'}];
for(const deleted of [false,true])test('old canonical receipt survives dialogue truncation without resurrecting deleted rows, deleted='+deleted,async()=>{
 const f=receiptFixture({deleted}),ctx=await f.context({catalog:true});
 assert.ok(!ctx.conversationTurns.some(turn=>turn.id===f.source.id));
 assert.equal(ctx.storedReadReferences.length,1);
 const result=await f.execute(f.request(ctx));
 assert.equal(result.status,'complete');assert.equal(result.records[0].operation.status,'succeeded');
 assert.match(result.records[0].text,/does not establish whether linked records still exist/);
 const live=await buildFurviseContext({supabase:f.db,userId:f.owner,petId:f.pet.id,conversationId:id(7),currentMessage:'Show stored records.',
  historyAccess:{months:3,from:'2026-06-01T00:00:00Z',to:'2026-09-18T00:00:00Z'}});
 assert.deepEqual(live.careEntries.map(row=>row.note),deleted?[]:['First exact observation.','Second \u03b1 observation.']);
 assert.equal(live.conversationTurns.some(turn=>turn.operationReceipt),false);
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

test('future-dated current row stays outside elapsed history while canonical operation remains verifiable',async()=>{
 const f=receiptFixture({future:true}),ctx=await f.context({catalog:true});
 const receipt=await f.execute(f.request(ctx));
 assert.equal(receipt.status,'complete');assert.equal(receipt.records[0].operation.status,'succeeded');
 const live=await buildFurviseContext({supabase:f.db,userId:f.owner,petId:f.pet.id,conversationId:id(7),currentMessage:'What did I save?',
  historyAccess:{months:3,from:'2026-06-17T00:00:00Z',to:'2026-09-18T00:00:00Z'}});
 assert.deepEqual(live.careEntries,[]);
 assert.match(receipt.records[0].text,/does not establish whether linked records still exist/);
});
