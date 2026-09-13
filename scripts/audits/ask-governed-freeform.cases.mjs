import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, ownerId } from './fixtures/ask-lifetime-history.mjs';
const { governCanonicalEvents } = await import('../../app/lib/intelligence/semantic-events.ts');
const { persistSemanticEventRpc } = await import('../../app/lib/intelligence/semantic-event-persistence.ts');
const { recordedHash } = await import('../../app/lib/intelligence/recorded-provenance.ts');
const pet={id:'milo',name:'Milo'};
const proposal=(note,transition='started')=>({subject:{type:'pet',name:'Milo'},domain:'health',topic:'vomiting',eventTitle:'Vomiting after breakfast',transition,state:'active',temporal:{occurredAt:null,explicitTime:null},importance:'important',confidence:0.99,sourceExcerpt:note});
const opening='Milo started vomiting after breakfast and threw up on the kitchen rug.';
const continuation='Milo continued vomiting this afternoon after drinking water.';

// In-process DB transport double: actual governor and RPC serializer feed the
// actual reader/callback. SQL ownership, snapshots and source checks are separately
// asserted in the rollback SQL preparation, not claimed to execute here.
async function written() {
 const data={membership_contract:'ask-episode-membership.v1',episodes:[],sources:[],memberships:[],claims:[]};
 for (const [index,note] of [opening,continuation].entries()) {
   const active=index ? [{...data.episodes[0],normalized_key:'health_vomiting',summary:{semanticDomain:'health',semanticTopic:'vomiting'}}] : [];
   const governed=governCanonicalEvents({proposals:[proposal(note,index?'continued':'started')],message:note,resolvedPetSubject:pet,activeEpisodes:active});
   assert.equal(governed.accepted.length,1,JSON.stringify(governed.rejected));
   await persistSemanticEventRpc({event:governed.accepted[0],fallbackPetId:pet.id,sourceMessageId:`msg-${index}`,userId:ownerId,supabase:{rpc(name,args){
     assert.equal(name,'persist_furvise_server_semantic_event');
     assert.equal(args.p_user_id,ownerId);assert.equal(args.p_pet_id,pet.id);
     const p=args.p_event.recordedEvidence;
     assert.ok(p);assert.equal(p.sourceHash,recordedHash(note));assert.equal(p.noteHash,recordedHash(args.p_event.sourceExcerpt));
     const s=care(`written-${index}`,pet.id,`2011-02-0${index+1}`,'symptom',args.p_event.sourceExcerpt,{episode_id:'recorded-identity'});
     const m={id:`edge-${index}`,user_id:ownerId,pet_profile_id:pet.id,episode_id:s.episode_id,care_entry_id:s.id,claim_id:null,event_ordinal:index+1,event_role:index?'continuation':'opening',occurred_at:s.occurred_at,created_at:s.created_at,source_issue:null};
     m.recorded_provenance={...p,ownerId,careId:s.id,episodeId:s.episode_id,membershipId:m.id,role:m.event_role};
     data.sources.push(s);data.memberships.push(m);
     if(!index)data.episodes.push({id:s.episode_id,user_id:ownerId,pet_profile_id:pet.id,normalized_key:'vomiting',started_at:s.occurred_at,last_event_at:s.occurred_at,updated_at:s.updated_at,sequence_number:7,recurrence_of:null,status:'active'});
     return Promise.resolve({data:[{care_entry_id:s.id,episode_id:s.episode_id,already_persisted:false}],error:null});
   }}});
 }
 data.recorded_inventory={version:'ask-recorded-inventory.v1',ownerId,petId:pet.id,keys:['vomiting','vomit'],from:null,to:null,revision:'4.1',snapshot:'2026-09-04T18:00:00Z',episodeCount:1,careIds:data.sources.map(s=>s.id),claimIds:[],failures:[]};
 return data;
}
const run=(d,options={})=>exercise('List all recorded vomiting episodes over Milo lifetime.',{history:true,rows:d.sources,messages:[],careEpisodes:d.episodes,episodeRowsOverride:d,...options});
test('current governed writer -> inventory reader -> callback counts persisted identity across natural onset and continuation',async t=>{
 clock(t);const d=await written();const r=await run(d);
 assert.equal(r.context.episodeResult.exactTotal,1);assert.equal(r.context.episodeResult.entryCount,2);
 assert.equal(r.context.episodeResult.items[0].sequenceNumber,7);
 assert.match(r.result.reasoning.answer.summary,/Exactly 1 recorded vomiting episode/);
 assert.deepEqual(r.result.acceptedCareActions,[]);assert.deepEqual(r.result.acceptedLearnings,[]);
 const {attachEpisodeReferences}=await import('../../app/lib/intelligence/episode-contract.ts');
 const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
 const saved={id:'saved',user_id:ownerId,conversation_id:'chat',role:'furvise',sequence_number:2,response_data:attachEpisodeReferences(buildAskConversationResponse(r.result.reasoning.answer),r.context.episodeResult)};
 const page=structuredClone(d);delete page.recorded_inventory;
 const follow=await exercise('What changed during the first episode?',{history:true,rows:d.sources,messages:[saved],careEpisodes:d.episodes,episodeRowsOverride:page});
 assert.equal(follow.context.episodeResult.referenceStatus,'resolved');
 assert.deepEqual(follow.context.episodeResult.details.map(s=>s.note),[opening,continuation]);
});
for(const kind of ['missing','changed','foreign owner','foreign pet','foreign topic','inferred role','corrected','forgotten','revision'])test(`${kind} provenance cannot certify`,async t=>{
 clock(t);const d=await written();const options={};const p=d.memberships[0].recorded_provenance;
 if(kind==='missing')delete d.memberships[0].recorded_provenance;
 if(kind==='changed')d.sources[0].note='Milo vomited once.';
 if(kind==='foreign owner')p.ownerId='foreign';
 if(kind==='foreign pet')p.petId='bruno';
 if(kind==='foreign topic')p.topic='breathing';
 if(kind==='inferred role')p.transition='observed';
 if(kind==='corrected')d.memberships[0].recorded_provenance=null;
 if(kind==='forgotten')options.graph={withheld_source_ids:[d.sources[0].id]};
 if(kind==='revision'){let calls=0;options.graphAtCall=()=>{if(++calls===3)d.recorded_inventory.revision='5.1';return {};};}
 const r=await run(d,options);assert.equal(r.context.episodeResult.exactTotal,null);
});
for(const note of ['Milo did not start vomiting after breakfast.','If Milo started vomiting after breakfast, I would call the vet.','You said Milo started vomiting after breakfast.','Milo might have started vomiting after breakfast.','Bruno started vomiting after breakfast.','Correction: Milo never vomited after breakfast.'])test(`writer withholds provenance: ${note}`,()=>{
 const r=governCanonicalEvents({proposals:[proposal(note)],message:note,resolvedPetSubject:pet,activeEpisodes:[]});
 assert.ok(r.accepted.every(e=>e.recordedEvidence===undefined));
});

test('a model opening label without explicit onset and a wrong topic cannot mint provenance',()=>{
 for(const note of ['Milo vomited after breakfast.','Milo started limping after breakfast.','Milo started eating after vomiting.']) {
  const r=governCanonicalEvents({proposals:[proposal(note)],message:note,resolvedPetSubject:pet,activeEpisodes:[]});
  assert.ok(r.accepted.every(e=>e.recordedEvidence===undefined));
 }
});
test('ordinary other-topic health note receives source-bound classification',()=>{
 const note='Milo started limping after our walk around the park.';
 const r=governCanonicalEvents({proposals:[{...proposal(note),topic:'limping'}],message:note,resolvedPetSubject:pet,activeEpisodes:[]});
 assert.equal(r.accepted[0].recordedEvidence.topic,'limping');
 assert.equal(r.accepted[0].recordedEvidence.noteHash,recordedHash(note));
});
