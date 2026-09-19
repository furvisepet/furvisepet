import assert from 'node:assert/strict';
import test from 'node:test';
import {exercise,clock,resolveAskTurnSubject} from './helpers/lifetime-harness.mjs';
import {care,ownerId,pets} from './fixtures/ask-lifetime-history.mjs';
const {attachEpisodeReferences}=await import('../../app/lib/intelligence/episode-contract.ts');
const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
const first=care('luna-onset1','luna','2011-02-01','symptom','Luna had a vomiting episode.',{episode_id:'luna-ep1'});
const second=care('luna-onset2','luna','2014-07-09','symptom','Luna had a separate vomiting episode.',{episode_id:'luna-ep2'});
const update=care('luna-update','luna','2014-07-10','symptom','Luna was eating normally again during the same episode.',{episode_id:'luna-ep2'});
const rows=[first,second,update,care('milo-only','milo','2014-07-10','symptom','Milo had a separate vomiting episode.',{episode_id:'milo-ep'})];
const episodes=[first,second].map((s,i)=>({id:s.episode_id,user_id:ownerId,pet_profile_id:'luna',normalized_key:'vomiting',started_at:s.occurred_at,last_event_at:s.occurred_at,updated_at:s.updated_at,status:'resolved',sequence_number:i+1,recurrence_of:i?'luna-ep1':null}));
const recent=[{role:'user',text:'List Luna vomiting episodes.'}];
const originalQuestion={id:'u1',user_id:ownerId,conversation_id:'chat',role:'user',user_text:recent[0].text,sequence_number:1,created_at:'2026-09-04T00:00:00Z'};
async function savedList(){
 const run=await exercise(recent[0].text,{history:true,petId:'luna',rows,careEpisodes:episodes,messages:[originalQuestion]});
 const response=attachEpisodeReferences(buildAskConversationResponse(run.result.reasoning.answer),run.context.episodeResult);
 assert.ok(response.episodeReferences);
 return {id:'a1',user_id:ownerId,conversation_id:'chat',role:'furvise',response_data:response,sequence_number:2,created_at:'2026-09-04T00:00:00Z'};
}
async function follow(message,saved,extra={}){
 const {resolution}=await resolveAskTurnSubject({message,pets,ownerId,selectedPetId:'milo',recentConversation:recent,extractFrame:async()=>{throw new Error('unexpected extraction');}});
 assert.equal(resolution.requiresClarification,false);
 return exercise(message,{history:true,petId:resolution.petId,authoritativePetIds:resolution.petIds,rows,careEpisodes:episodes,messages:[originalQuestion,saved],...extra});
}
test('resolved switch loads Luna evidence and revalidates her displayed episode through the real callback',async t=>{
 clock(t);const saved=await savedList();const run=await follow('What changed during the second one?',saved);
 assert.equal(run.context.pet.id,'luna');
 assert.ok(run.context.careEntries.every(row=>row.pet_profile_id==='luna'));
 assert.equal(run.context.episodeResult.referenceStatus,'resolved');
 assert.equal(run.context.episodeResult.items[0].id,'episode:luna-ep2');
 assert.match(JSON.stringify(run.result.reasoning.answer),/Luna was eating normally again/);
 assert.doesNotMatch(run.serialized,/milo-only/);
 assert.equal(run.result.acceptedCareActions.length,0);
 const stored=attachEpisodeReferences(buildAskConversationResponse(run.result.reasoning.answer),run.context.episodeResult);
 assert.equal(stored.episodeReferences.petId,'luna');
});
test('switching pet context does not authorize a differently scoped saved list',async t=>{
 clock(t);const saved=await savedList();saved.response_data.episodeReferences.petId='milo';
 const run=await follow('What changed during the second one?',saved);
 assert.equal(run.context.episodeResult.referenceStatus,'clarify');assert.deepEqual(run.context.episodeResult.items,[]);
});
test('changed sources remain stale after subject continuity repair',async t=>{
 clock(t);const saved=await savedList();
 const run=await follow('What changed during the second one?',saved,{rows:rows.map(row=>row.id===second.id?{...row,deleted_at:'2026-09-05T00:00:00Z'}:row)});
 assert.equal(run.context.episodeResult.referenceStatus,'stale');assert.deepEqual(run.context.episodeResult.items,[]);
 assert.equal(run.result.acceptedCareActions.length,0);
});

test('topic-qualified ordinal keeps the switched pet through subject resolution and callback',async t=>{
 clock(t);const saved=await savedList();
 const run=await follow('What changed during the second vomiting episode?',saved);
 assert.equal(run.context.pet.id,'luna');
 assert.equal(run.context.episodeResult.referenceStatus,'resolved');
 assert.equal(run.context.episodeResult.items[0].id,'episode:luna-ep2');
 assert.doesNotMatch(run.serialized,/milo-only/);
});

test('explicit pet overrides qualified ordinal discourse and rejects the other pet list',async t=>{
 clock(t);const saved=await savedList();
 const run=await follow('What changed during Milo second vomiting episode?',saved);
 assert.equal(run.context.pet.id,'milo');
 assert.equal(run.context.episodeResult.referenceStatus,'clarify');
 assert.deepEqual(run.context.episodeResult.items,[]);
 assert.doesNotMatch(run.serialized,/luna-onset/);
});
