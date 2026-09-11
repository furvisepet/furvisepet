import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, ownerId } from './fixtures/ask-lifetime-history.mjs';
const source = care('recorded-one','milo','2011-02-01','symptom','Milo had a new vomiting episode.',{episode_id:'registered-one'});
const episode = {id:'registered-one',user_id:ownerId,pet_profile_id:'milo',normalized_key:'vomiting',started_at:source.occurred_at,updated_at:source.updated_at,sequence_number:7,recurrence_of:null,status:'resolved'};
const payload = () => ({membership_contract:'ask-episode-membership.v1',episodes:[episode],sources:[source],claims:[],memberships:[{id:'edge-one',user_id:ownerId,pet_profile_id:'milo',episode_id:episode.id,care_entry_id:source.id,claim_id:null,event_ordinal:1,event_role:'opening',occurred_at:source.occurred_at,created_at:source.created_at,source_issue:null}],recorded_inventory:{version:'ask-recorded-inventory.v1',ownerId,petId:'milo',keys:['vomiting','vomit'],from:null,to:null,revision:'1',snapshot:'2026-09-04T18:00:00Z',episodeCount:1,careIds:[source.id],claimIds:[],failures:[]}});
const run = (data=payload(), options={}) => exercise('List all recorded vomiting episodes over Milo lifetime.',{history:true,rows:data.sources,messages:[],careEpisodes:data.episodes,episodeRowsOverride:data,answer:'Exactly seven lifetime episodes.',...options});
test('complete recorded inventory reaches actual callback and final validator', async t=>{
 clock(t); const r=await run();
 assert.equal(r.context.episodeResult.exactTotal,1);
 assert.equal(r.context.episodeResult.items[0].sequenceNumber,7);
 assert.equal(r.context.episodeResult.items[0].ordinal,1);
 assert.match(r.result.reasoning.answer.summary,/Exactly 1 recorded vomiting episode/);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/seven lifetime/);
 assert.deepEqual(r.result.acceptedCareActions,[]); assert.deepEqual(r.result.acceptedLearnings,[]);
});
for (const kind of ['absent','stale snapshot','unknown version','stale revision','partial','unknown classification','ambiguous grouping','import gap','deleted','forgotten','corrected','overflow','owner','pet','concept','period','missing source','extra source','source hash','nonboundary note','ambiguous onset','missing member','episode count']) {
 test(`${kind} fails closed through callback`,async t=>{
  clock(t); const d=payload(); const options={};
  if(kind==='stale snapshot') d.recorded_inventory.snapshot='2026-08-01T00:00:00Z';
  if(kind==='absent') delete d.recorded_inventory;
  if(kind==='unknown version') d.recorded_inventory.version='unknown';
  if(kind==='stale revision') { let calls=0; Object.defineProperty(d.recorded_inventory,'revision',{enumerable:true,get:()=>String(++calls)}); }
  if(['partial','unknown classification','ambiguous grouping','import gap'].includes(kind)) d.recorded_inventory.failures=[kind];
  if(kind==='deleted') d.sources[0]={...source,deleted_at:'2026-08-01T00:00:00Z'};
  if(kind==='forgotten') options.graph={withheld_source_ids:[source.id]};
  if(kind==='corrected') d.sources[0]={...source,note:'Correction: Milo had no vomiting episode.'};
  if(kind==='overflow') d.recorded_inventory.episodeCount=33;
  if(kind==='owner') d.recorded_inventory.ownerId='foreign';
  if(kind==='pet') d.recorded_inventory.petId='bruno';
  if(kind==='concept') d.recorded_inventory.keys=['breathing'];
  if(kind==='period') d.recorded_inventory.from='2000-01-01T00:00:00Z';
  if(kind==='missing source') d.sources=[];
  if(kind==='extra source') d.recorded_inventory.careIds.push('unclassified');
  if(kind==='source hash') d.memberships[0].source_issue='legacy_source_changed_or_missing';
  if(kind==='nonboundary note') d.sources[0]={...source,note:'Milo vomited.'};
  if(kind==='ambiguous onset') d.sources[0]={...source,note:'Milo had a vomiting episode.'};
  if(kind==='missing member') d.memberships=[];
  if(kind==='episode count') d.recorded_inventory.episodeCount=2;
  const r=await run(d,options); assert.equal(r.context.episodeResult.exactTotal,null);
  assert.doesNotMatch(r.result.reasoning.answer.summary,/Exactly \d+ recorded/);
  assert.deepEqual(r.result.acceptedCareActions,[]); assert.deepEqual(r.result.acceptedLearnings,[]);
 });
}
function many(n) {
 const d=payload(); d.episodes=[];d.sources=[];d.memberships=[];
 for(let i=0;i<n;i++) {
  const e={...episode,id:`ep-${i}`,sequence_number:100+i,started_at:`2011-${String(i%12+1).padStart(2,'0')}-01T00:00:00.000Z`};
  const s={...source,id:`source-${i}`,episode_id:e.id,occurred_at:e.started_at};
  d.episodes.push(e);d.sources.push(s);d.memberships.push({...payload().memberships[0],id:`member-${i}`,episode_id:e.id,care_entry_id:s.id,occurred_at:s.occurred_at});
 }
 d.recorded_inventory.episodeCount=n; d.recorded_inventory.careIds=d.sources.map(s=>s.id);return d;
}
test('full aggregate of 12 shares census with bounded eight-item display and references',async t=>{
 clock(t); const r=await run(many(12));
 assert.equal(r.context.episodeResult.exactTotal,12);assert.equal(r.context.episodeResult.items.length,8);
 assert.equal(r.context.episodeResult.supportedCount,12);
 assert.match(r.result.reasoning.answer.summary,/Exactly 12 recorded/);assert.match(r.result.reasoning.answer.summary,/Showing 8/);
 assert.equal(r.prompt.contextRecords.filter(r=>r.sourceType==='episode_evidence').length,8);
 const {attachEpisodeReferences}=await import('../../app/lib/intelligence/episode-contract.ts');
 const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
 const response=attachEpisodeReferences(buildAskConversationResponse(r.result.reasoning.answer),r.context.episodeResult);
 assert.equal(response.episodeReferences.items.length,8);assert.equal(response.episodeReferences.exactTotal,null);
 assert.equal(attachEpisodeReferences({...response,directAnswer:'Changed by safety'},r.context.episodeResult).episodeReferences,undefined);
});
test('an invalid undisplayed ninth group prevents exact aggregate',async t=>{
 clock(t);const d=many(12);d.sources[8].note='Maybe another vomiting event.';
 const r=await run(d);assert.equal(r.context.episodeResult.exactTotal,null);assert.equal(r.context.episodeResult.items.length,8);
});
test('complete empty retained register yields recorded zero only',async t=>{
 clock(t);const r=await run(many(0));assert.equal(r.context.episodeResult.exactTotal,0);assert.match(r.result.reasoning.answer.summary,/Exactly 0 recorded/);
});
test('mutation after second graph pass invalidates census',async t=>{
 clock(t);const d=payload();let calls=0;
 const r=await run(d,{graphAtCall(){if(++calls===3)d.recorded_inventory.revision='2';return {};}});
 assert.equal(r.context.episodeResult.exactTotal,null);assert.equal(r.context.episodeResult.coverage,'unavailable');
});
test('claim-only native membership can certify the narrow recorded scope',async t=>{
 clock(t);const d=payload();const c={id:'claim-one',user_id:ownerId,subject_type:'pet',subject_id:'milo',claim_kind:'event',operation_type:'assert',source_type:'manual_history',canonical_concept_key:'vomiting',concept_key:'vomiting',concept_resolution_status:'canonical',concept_authority:'governed_registry',lifecycle_role:'opening',lifecycle_transition:'started',polarity:'affirmed',modality:'reported',persistence_destination:'history',knowledge_status:'effective',occurred_at:source.occurred_at,recorded_at:source.created_at,structured_value:{note:source.note,title:null,severity:null}};
 d.sources=[];d.claims=[c];d.memberships[0].care_entry_id=null;d.memberships[0].claim_id=c.id;d.recorded_inventory.careIds=[];d.recorded_inventory.claimIds=[c.id];
 const r=await run(d,{graph:{claims:[c]}});assert.equal(r.context.episodeResult.exactTotal,1);assert.equal(r.context.episodeResult.items[0].sourceId,'claim:claim-one');
});
for(const changed of [false,true]) test(`imported lineage deduplication, changed hash=${changed}`,async t=>{
 clock(t);const d=payload();const c={id:'import-one',user_id:ownerId,subject_type:'pet',subject_id:'milo',claim_kind:'event',operation_type:'assert',source_type:'legacy_import',canonical_concept_key:'vomiting',concept_key:'vomiting',concept_resolution_status:'canonical',concept_authority:'governed_registry',lifecycle_role:'opening',lifecycle_transition:'started',polarity:'affirmed',modality:'reported',persistence_destination:'history',knowledge_status:'effective',occurred_at:source.occurred_at,recorded_at:source.created_at,structured_value:{note:source.note,title:null,severity:null}};
 d.claims=[c];d.memberships.push({...d.memberships[0],id:'import-member',care_entry_id:null,claim_id:c.id,event_ordinal:2,source_issue:changed?'legacy_source_changed_or_missing':null});d.recorded_inventory.claimIds=[c.id];
 const r=await run(d,{graph:{claims:[c],lineage:[{user_id:ownerId,claim_id:c.id,legacy_table:'pet_care_entries',legacy_row_id:source.id,claim_role:'primary'}]}});
 assert.equal(r.context.episodeResult.exactTotal,changed?null:1);
 if(!changed)assert.equal(r.context.episodeResult.entryCount,1);
});
test('period census and final answer use the identical half-open scope',async t=>{
 clock(t);const d=payload();d.recorded_inventory.from='2011-01-01T00:00:00+00:00';d.recorded_inventory.to='2012-01-01T00:00:00+00:00';
 const r=await exercise('List all recorded vomiting episodes in 2011.',{history:true,rows:d.sources,messages:[],careEpisodes:d.episodes,episodeRowsOverride:d});
 assert.equal(r.context.episodeResult.exactTotal,1);assert.match(r.result.reasoning.answer.summary,/for 2011/);
 assert.ok(r.queries.filter(q=>q.table==='read_ask_episode_sources').every(q=>Date.parse(q.args.p_from)===Date.parse(d.recorded_inventory.from)&&Date.parse(q.args.p_to)===Date.parse(d.recorded_inventory.to)));
});
test('references from a 12-group census resolve against the pinned eight-group page',async t=>{
 clock(t);const d=many(12);const r=await run(d);
 const {attachEpisodeReferences}=await import('../../app/lib/intelligence/episode-contract.ts');const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
 const saved={id:'saved',user_id:ownerId,conversation_id:'chat',role:'furvise',sequence_number:2,response_data:attachEpisodeReferences(buildAskConversationResponse(r.result.reasoning.answer),r.context.episodeResult)};
 const page=structuredClone(d);const ids=new Set(r.context.episodeResult.items.map(i=>i.id.slice(8)));
 page.episodes=page.episodes.filter(e=>ids.has(e.id));page.sources=page.sources.filter(s=>ids.has(s.episode_id));page.memberships=page.memberships.filter(m=>ids.has(m.episode_id));delete page.recorded_inventory;
 const follow=await exercise('What changed during the first episode?',{history:true,rows:d.sources,messages:[saved],careEpisodes:d.episodes,episodeRowsOverride:page});
 assert.equal(follow.context.episodeResult.referenceStatus,'resolved');assert.equal(follow.context.episodeResult.items[0].sequenceNumber,100);
 assert.equal(follow.context.episodeResult.exactTotal,null);
});
test('PostgreSQL offset timestamp at period start is included',async t=>{
 clock(t);const d=payload();d.sources[0]={...source,occurred_at:'2011-01-01T00:00:00+00:00'};d.episodes[0]={...episode,started_at:d.sources[0].occurred_at};d.memberships[0].occurred_at=d.sources[0].occurred_at;
 d.recorded_inventory.from='2011-01-01T00:00:00+00:00';d.recorded_inventory.to='2012-01-01T00:00:00+00:00';
 const r=await exercise('List all recorded vomiting episodes in 2011.',{history:true,rows:d.sources,messages:[],careEpisodes:d.episodes,episodeRowsOverride:d});
 assert.equal(r.context.episodeResult.exactTotal,1);
});
