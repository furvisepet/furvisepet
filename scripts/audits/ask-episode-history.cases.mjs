import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {exercise,clock,ASK_PROMPT_CONTEXT_CHAR_BUDGET} from './helpers/lifetime-harness.mjs';
import {care,irrelevant,ownerId} from './fixtures/ask-lifetime-history.mjs';
const {attachEpisodeReferences}=await import('../../app/lib/intelligence/episode-history.ts');
const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
const first=care('onset1','milo','2011-02-01','symptom','Milo had a vomiting episode. He vomited twice during this episode.',{episode_id:'ep1'});
const second=care('onset2','milo','2014-07-09','symptom','Milo had a separate vomiting episode.',{episode_id:'ep2'});
const update=care('update','milo','2011-02-02','symptom','Milo was improving during the same episode.',{episode_id:'ep1'});
const episodes=[first,second].map((s,index)=>({id:s.episode_id,user_id:ownerId,pet_profile_id:'milo',normalized_key:'vomiting',
  started_at:s.occurred_at,last_event_at:s.occurred_at,updated_at:s.updated_at,status:'resolved',sequence_number:index+1,recurrence_of:index?'ep1':null}));
const run=(q='List all vomiting episodes over Milo lifetime.',o={})=>exercise(q,{history:true,rows:[first,update,second],careEpisodes:episodes,messages:[],...o});
function persisted(result,sequence=2) {
  const response=buildAskConversationResponse(result.result.reasoning.answer);
  assert.ok(response);
  const stored=attachEpisodeReferences(response,result.context.episodeResult);
  assert.ok(stored.episodeReferences,JSON.stringify({message:'actual response presentation retained the authoritative list',response,result:result.context.episodeResult}));
  return {id:`a${sequence}`,user_id:ownerId,conversation_id:'chat',role:'furvise',sequence_number:sequence,
    created_at:'2026-09-04T00:00:00Z',response_data:stored};
}
test('two occurrences in one incident and several updates count as one episode',async t=>{
  clock(t);const r=await run(undefined,{rows:[first,update,{...update,id:'update2'}],careEpisodes:[episodes[0]]});
  assert.equal(r.context.episodeResult.supportedCount,1);
  assert.equal(r.context.episodeResult.items[0].reportedOccurrences,2);
  assert.equal(r.context.episodeResult.entryCount,3);
  assert.match(r.result.reasoning.answer.sections[0].items[0],/2 reported occurrences within this one episode/);
  assert.equal(r.result.acceptedCareActions.length,0);
});
test('supported recurrence, count/list/provenance agree in actual prompt and final validator',async t=>{
  clock(t);const r=await run(undefined,{answer:'Exactly seven episodes. Complete lifetime list.',providerOverrides:{relevantContextIds:['episode:invented']}});
  const e=r.prompt.evidenceContract.episodes;
  assert.equal(e.supportedCount,2);assert.equal(e.items[1].recurrenceOf,'ep1');assert.equal(e.items[1].sequenceNumber,2);
  assert.equal(r.result.reasoning.answer.sections[0].items.length,e.supportedCount);
  assert.match(r.result.reasoning.answer.summary,/2 explicitly supported/);
  assert.doesNotMatch(r.result.reasoning.answer.summary,/seven|Exactly/);
  assert.equal(e.exactTotal,null);assert.match(r.result.reasoning.answer.summary,/not an exact lifetime total/);
  assert.ok(e.provenance.some(p=>p.sourceId==='care:onset1'));
  persisted(r);
});
test('ambiguous grouping is not promoted from canonical IDs or time distance',async t=>{
  clock(t);const r=await run(undefined,{rows:[first,{...second,note:'Milo had a vomiting episode.'}]});
  assert.equal(r.context.episodeResult.coverage,'ambiguous');assert.equal(r.context.episodeResult.supportedCount,1);
  const raw=await run(undefined,{rows:[{...first,note:'Milo vomited twice.'},update]});
  assert.equal(raw.context.episodeResult.supportedCount,0);assert.equal(raw.context.episodeResult.exactTotal,null);
  const unlinked=await run(undefined,{rows:[{...first,episode_id:null},{...second,episode_id:null}],careEpisodes:[]});
  assert.equal(unlinked.context.episodeResult.supportedCount,0,'unlinked note IDs are not episode groups');
});
test('old decisive episode bypasses recent context window with bounded model input',async t=>{
  clock(t);const noise=Array.from({length:25},(_,i)=>({...episodes[0],id:`noise${i}`,normalized_key:'routine',started_at:'2026-09-03T00:00:00Z',last_event_at:'2026-09-03T00:00:00Z'}));
  const r=await run(undefined,{rows:[first,second,...irrelevant('milo',10000)],careEpisodes:[...episodes,...noise]});
  assert.equal(r.context.episodeResult.supportedCount,2);
  assert.equal(r.queries.find(q=>q.table==='pet_care_episodes').cap,20);
  assert.ok(r.serialized.length<=ASK_PROMPT_CONTEXT_CHAR_BUDGET);
  assert.equal(r.queries.filter(q=>q.table==='read_ask_episode_sources').length,4,'bounded reads before and after generation');
});
test('second one survives intervening turns, reload and new earlier history; that one retains selection',async t=>{
  clock(t);const original=await run();const saved=persisted(original);
  const intervening=Array.from({length:20},(_,i)=>({id:`u${i}`,user_id:ownerId,conversation_id:'chat',role:'user',user_text:'Thank you.',sequence_number:i+3,created_at:'2026-09-04T00:00:00Z'}));
  const newer={...first,id:'earlier',episode_id:'ep0',note:'Milo had a separate vomiting episode.',occurred_at:'2010-01-01T12:00:00Z'};
  const reloaded=await run('What changed during the second one?',{messages:JSON.parse(JSON.stringify([saved,...intervening])),rows:[newer,first,update,second],careEpisodes:[{...episodes[0],id:'ep0',started_at:newer.occurred_at},...episodes]});
  assert.equal(reloaded.context.episodeResult.referenceStatus,'resolved');
  assert.equal(reloaded.context.episodeResult.items[0].id,'episode:ep2');assert.equal(reloaded.context.episodeResult.items[0].ordinal,2);
  const selected=persisted(reloaded,25);
  const that=await run('Tell me about that one.',{messages:[saved,selected]});
  assert.equal(that.context.episodeResult.items[0].id,'episode:ep2');
});
for (const [label,patch] of [['deletion',{deleted_at:'2026-09-05T00:00:00Z'}],['update',{note:'Milo had a separate vomiting episode. Updated report.'}],['reassignment',{pet_profile_id:'bruno'}]]) {
  test(`stored reference ${label} is explained without substitution`,async t=>{
    clock(t);const saved=persisted(await run());const r=await run('What about the second episode?',{messages:[saved],rows:[first,update,{...second,...patch}]});
    assert.equal(r.context.episodeResult.referenceStatus,'stale');assert.equal(r.context.episodeResult.items.length,0);
    assert.match(r.result.reasoning.answer.summary,/changed, been corrected, or been removed/);
  });
}
test('changing an update within the same group also invalidates the displayed reference',async t=>{
  clock(t);const saved=persisted(await run());const r=await run('What about the first episode?',{messages:[saved],rows:[first,{...update,deleted_at:'2026-09-05T00:00:00Z'},second]});
  assert.equal(r.context.episodeResult.referenceStatus,'stale');
});
function correctionGraph() {
  const claim=(id,pet,s)=>({id,user_id:ownerId,subject_id:pet,subject_type:'pet',claim_kind:'event',operation_type:'assert',concept_key:'vomiting',canonical_concept_key:'vomiting',concept_resolution_status:'canonical',persistence_destination:'history',knowledge_status:'effective',occurred_at:s.occurred_at,recorded_at:s.created_at,provenance_classification:'owner_reported',structured_value:{note:s.note,title:s.title,severity:s.severity}});
  const a=claim('a','milo',second),b=claim('b','bruno',{...second,note:'Bruno had a separate vomiting episode.',created_at:'2026-09-05T00:00:00Z'});
  return {claims:[a,b],relations:[{id:'edge',user_id:ownerId,from_claim_id:'b',to_claim_id:'a',relation_type:'corrects'}],lineage:[{user_id:ownerId,claim_id:'a',legacy_row_id:second.id,legacy_table:'pet_care_entries',claim_role:'primary'}]};
}
test('late cross-pet correction removes Milo episode; deleted correction cannot resurrect original',async t=>{
  clock(t);const saved=persisted(await run());const graph=correctionGraph();
  const corrected=await run(undefined,{graph});assert.equal(corrected.context.episodeResult.supportedCount,1);
  const follow=await run('The second episode?',{graph,messages:[saved]});assert.equal(follow.context.episodeResult.referenceStatus,'stale');
  const removed=await run(undefined,{graph:{...graph,withheld_claim_ids:['a'],claims:[graph.claims[0]],relations:[]}});
  assert.equal(removed.context.episodeResult.supportedCount,1);
});
test('pet switching, foreign envelope, out-of-range ordinal and untrusted prose clarify',async t=>{
  clock(t);const saved=persisted(await run());
  for (const o of [{petId:'bruno',messages:[saved]}, {messages:[{...saved,response_data:{...saved.response_data,episodeReferences:{...saved.response_data.episodeReferences,ownerId:'foreign'}}}]},
    {messages:[{...saved,response_data:{directAnswer:'Second episode was July 2014.'}}]}]) {
    const r=await run('What about the second one?',o);assert.equal(r.context.episodeResult.referenceStatus,'clarify');assert.equal(r.context.episodeResult.items.length,0);
  }
  const ambiguous=await run('What about that one?',{messages:[saved]});assert.equal(ambiguous.context.episodeResult.referenceStatus,'clarify');
  const missing=await run('What about the eighth one?',{messages:[saved]});assert.equal(missing.context.episodeResult.referenceStatus,'clarify');
});
test('query failure, foreign sources and bounded source omissions fail safely',async t=>{
  clock(t);
  for(const options of [{episodeError:'XX000'},{episodeRowsOverride:{episodes,sources:[{...first,user_id:'foreign'}]}},{failGraph:true}]) {
    const r=await run(undefined,options);assert.equal(r.context.episodeResult.coverage,'unavailable');assert.equal(r.context.episodeResult.supportedCount,0);
  }
  const oversized=await run(undefined,{rows:[first,...Array.from({length:9},(_,i)=>({...update,id:`many${i}`}))]});
  assert.equal(oversized.context.episodeResult.supportedCount,0);
  const long=await run(undefined,{rows:[{...first,note:first.note+' detail'.repeat(1000)}]});
  assert.equal(long.context.episodeResult.supportedCount,0);assert.ok(long.context.episodeResult.reasons.includes('episode_input_bound'));
});
test('no references persist for a replaced list and real route calls the final attachment boundary',async t=>{
  clock(t);const r=await run();assert.equal(attachEpisodeReferences({directAnswer:'Other answer',sections:[]},r.context.episodeResult).episodeReferences,undefined);
  const old=persisted(r).response_data;
  assert.equal(attachEpisodeReferences({...old,directAnswer:'Replaced after generation'},r.context.episodeResult).episodeReferences,undefined);
  const route=readFileSync(new URL('../../app/api/ask/route.ts',import.meta.url),'utf8');
  assert.match(route,/response = attachEpisodeReferences\(response, intelligenceResult\?\.reasoning\.evidenceContract\?\.episodes\)/);
  assert.match(route,/attachEpisodeReferences\(applicationActions\.length/);
});
test('foreign pinned episode ID is never replaced by a nearby owned episode',async t=>{
  clock(t);const saved=persisted(await run());saved.response_data.episodeReferences.items[1].id='episode:foreign';
  const r=await run('What about the second episode?',{messages:[saved]});
  assert.equal(r.context.episodeResult.referenceStatus,'stale');assert.deepEqual(r.context.episodeResult.items,[]);
});
test('explicit year scope counts starts in that period and unsupported relative scope clarifies',async t=>{
  clock(t);const r=await run('List vomiting episodes in 2014.');
  assert.equal(r.context.episodeResult.supportedCount,1);assert.equal(r.context.episodeResult.items[0].id,'episode:ep2');
  assert.equal(r.context.episodeResult.from,'2014-01-01T00:00:00.000Z');
  const relative=await run('List vomiting episodes last year.');assert.equal(relative.context.episodeResult.referenceStatus,'clarify');
});
test('contradictory or multi-pet onset text and repeated onset updates cannot inflate groups',async t=>{
  clock(t);
  for(const suffix of [' Actually this belonged to Bruno.',' Bruno had the episode.',' It was uncertain.']) {
    const r=await run(undefined,{rows:[{...first,note:first.note+suffix}],careEpisodes:[episodes[0]]});
    assert.equal(r.context.episodeResult.supportedCount,0);
  }
  const repeated=await run(undefined,{rows:[first,{...first,id:'repeat'}],careEpisodes:[episodes[0]]});
  assert.equal(repeated.context.episodeResult.supportedCount,0);assert.equal(repeated.context.episodeResult.coverage,'ambiguous');
});
