import assert from 'node:assert/strict';
import test from 'node:test';
import {exercise,clock} from './helpers/lifetime-harness.mjs';
import {care,ownerId} from './fixtures/ask-lifetime-history.mjs';
const {attachEpisodeReferences}=await import('../../app/lib/intelligence/episode-contract.ts');
const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
const first=care('onset1','milo','2011-02-01','symptom','Milo had a vomiting episode.',{episode_id:'ep1'});
const second=care('onset2','milo','2014-07-09','symptom','Milo had a separate vomiting episode.',{episode_id:'ep2'});
const update=care('update','milo','2014-07-10','symptom','Milo was eating normally again during the same episode.',{episode_id:'ep2'});
const episode=(s,i)=>({id:s.episode_id,user_id:ownerId,pet_profile_id:'milo',normalized_key:'vomiting',started_at:s.occurred_at,last_event_at:s.occurred_at,updated_at:s.updated_at,status:'resolved',sequence_number:i+1,recurrence_of:i?'ep1':null});
const run=(q,opts={})=>exercise(q,{history:true,rows:[first,second,update],careEpisodes:[first,second].map(episode),messages:[],...opts});
test('relationship question retains its intent instead of being replaced by an episode list',async t=>{
 clock(t);const r=await run('Was the food change related to his vomiting episodes?',{answer:'The records do not establish a cause.'});
 assert.equal(r.context.episodeResult,undefined);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/explicitly supported.*episode groups/);
});
test('resolved follow-up shows verified updates, not only identity',async t=>{
 clock(t);const original=await run('List all vomiting episodes over Milo lifetime.');
 const response=attachEpisodeReferences(buildAskConversationResponse(original.result.reasoning.answer),original.context.episodeResult);
 const saved={id:'answer1',user_id:ownerId,conversation_id:'chat',role:'furvise',sequence_number:2,created_at:'2026-09-04T00:00:00Z',response_data:response};
 const follow=await run('What changed during the second one?',{messages:[saved],answer:'Invented cure.'});
 assert.equal(follow.context.episodeResult.referenceStatus,'resolved');
 assert.match(JSON.stringify(follow.result.reasoning.answer),/eating normally again/);
 assert.doesNotMatch(JSON.stringify(follow.result.reasoning.answer),/Invented cure/);
});
test('explicit period reaches matching episodes after older discovery prefix',async t=>{
 clock(t);const older=Array.from({length:9},(_,i)=>care('old'+i,'milo',String(2000+i)+'-02-01','symptom','Milo had a separate vomiting episode.',{episode_id:'oldEp'+i}));
 const r=await run('List vomiting episodes in 2014.',{rows:[...older,second],careEpisodes:[...older,second].map(episode)});
 assert.equal(r.context.episodeResult.supportedCount,1);
 assert.equal(r.context.episodeResult.items[0].id,'episode:ep2');
 const request=r.queries.find(q=>q.table==='read_ask_episode_sources');
 assert.equal(request.args.p_from,'2014-01-01T00:00:00.000Z');
 assert.equal(request.args.p_to,'2015-01-01T00:00:00.000Z');
});

async function savedList() {
 const original=await run('List all vomiting episodes over Milo lifetime.');
 return {id:'wording-answer',user_id:ownerId,conversation_id:'chat',role:'furvise',sequence_number:2,created_at:'2026-09-04T00:00:00Z',
  response_data:attachEpisodeReferences(buildAskConversationResponse(original.result.reasoning.answer),original.context.episodeResult)};
}
test('topic-qualified ordinal uses the revalidated displayed episode',async t=>{
 clock(t);const saved=await savedList();
 const follow=await run('What changed during the second vomiting episode?',{messages:[saved],answer:'Invented cure.'});
 assert.equal(follow.context.episodeResult?.referenceStatus,'resolved');
 assert.equal(follow.context.episodeResult.items[0].id,'episode:ep2');
 assert.match(JSON.stringify(follow.result.reasoning.answer),/eating normally again/);
 assert.doesNotMatch(JSON.stringify(follow.result.reasoning.answer),/Invented cure/);
});
test('multiple ordinals never silently select one displayed episode',async t=>{
 clock(t);const saved=await savedList();
 for(const question of ['Compare the first and second episode.','Was it the first episode or the second episode?']) {
  const follow=await run(question,{messages:[saved]});
  assert.equal(follow.context.episodeResult?.referenceStatus,'clarify');
  assert.deepEqual(follow.context.episodeResult.items,[]);
 }
});

test('qualified follow-ups retain topic, missing-envelope and changed-source checks',async t=>{
 clock(t);const saved=await savedList();
 const missing=await run('What about the second vomiting episode?');
 assert.equal(missing.context.episodeResult?.referenceStatus,'clarify');
 const otherTopic=await run('What about the second soft-stool episode?',{messages:[saved]});
 assert.equal(otherTopic.context.episodeResult?.referenceStatus,'clarify');
 const changed=await run('What about the second vomiting episode?',{messages:[saved],rows:[first,{...second,note:second.note+' Updated report.'},update]});
 assert.equal(changed.context.episodeResult?.referenceStatus,'stale');
 assert.deepEqual(changed.context.episodeResult.items,[]);
 const determiner=await run('Tell me about that second vomiting episode.',{messages:[saved]});
 assert.equal(determiner.context.episodeResult?.referenceStatus,'resolved');
 assert.equal(determiner.context.episodeResult.items[0].id,'episode:ep2');
 assert.deepEqual(determiner.result.acceptedCareActions,[]);
 assert.deepEqual(determiner.result.acceptedLearnings,[]);
});
