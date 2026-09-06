import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise,clock } from './helpers/lifetime-harness.mjs';
import { care,ownerId } from './fixtures/ask-lifetime-history.mjs';
const {governCanonicalEvents}=await import('../../app/lib/intelligence/semantic-events.ts');
const {recordedCensus}=await import('../../app/lib/intelligence/recorded-inventory.ts');
const proposal=(note,kind='opening')=>({subject:{type:'pet',name:'Milo'},domain:'health',topic:'vomiting',eventTitle:'Vomiting observation',transition:'started',state:'active',temporal:{occurredAt:null,explicitTime:null},importance:'important',confidence:.99,sourceExcerpt:note,episodeBoundary:{kind,evidence:note,confidence:.99}});
const govern=p=>governCanonicalEvents({proposals:[p],message:p.sourceExcerpt,resolvedPetSubject:{id:'milo',name:'Milo'},activeEpisodes:[]});
for(const [petId,question,answer,unsupported] of [
 ['luna','What was Luna urine-test result?','The urine test was normal.',/test was normal/],
 ['oscar','What is Oscar diagnosis?','Oscar has arthritis.',/has arthritis/],
]) test(`original seed missing medical evidence stays unknown: ${petId}`,async t=>{
 clock(t);const r=await exercise(question,{history:true,petId,answer});
 assert.doesNotMatch(r.result.reasoning.answer.summary,unsupported);
 assert.match(r.result.reasoning.answer.summary,/not|unknown|can't|cannot|no /i);
});
for(const note of ['Milo had his first bout of vomiting after breakfast.','Milo had a separate bout of vomiting years later.','Milo threw up for the first time this morning.']) test(`semantic boundary without magic verb: ${note}`,()=>{
 assert.equal(govern(proposal(note)).accepted[0]?.recordedEvidence?.assessment?.kind,'opening');
});
test('unknown, unquoted, uncertain and wrong-subject assessments cannot certify',()=>{
 for(const p of [proposal('Milo vomited after breakfast.','unknown'),{...proposal('Milo had his first bout of vomiting.'),episodeBoundary:{kind:'opening',evidence:'invented quote',confidence:1}},proposal('Milo might have had a separate vomiting episode.'),proposal('Bruno had his first bout of vomiting.')]) {
  assert.ok(govern(p).accepted.every(e=>!e.recordedEvidence));
 }
});
const census=()=>({version:'ask-native-census.v1',ownerId,petId:'milo',keys:['vomiting','vomit'],from:null,to:null,episodeCount:45,sourceCount:900,revision:'4.1',snapshot:'2026-09-04T18:00:00Z'});
test('census count is independent of prompt/source bounds and validates owner scope',t=>{
 clock(t); const c=census();assert.ok(recordedCensus(c,ownerId,'milo',c.keys,null,null));
 for(const invalid of [{...c,ownerId:'other'},{...c,petId:'luna'},{...c,sourceCount:4},{...c,episodeCount:NaN},{...c,snapshot:'2011-01-01'},{...c,keys:['breathing']}])
  assert.equal(recordedCensus(invalid,ownerId,'milo',c.keys,null,null),null);
});
function data(){
 const note='Milo had his first bout of vomiting after breakfast.';
 const proof=govern(proposal(note)).accepted[0].recordedEvidence;
 const source=care('opening','milo','2011-02-01','symptom',note,{episode_id:'old'});
 const member={id:'edge',user_id:ownerId,pet_profile_id:'milo',episode_id:'old',care_entry_id:source.id,claim_id:null,event_ordinal:1,event_role:'opening',occurred_at:source.occurred_at,created_at:source.created_at,source_issue:null,
  recorded_provenance:{...proof,ownerId,careId:source.id,episodeId:'old',membershipId:'edge',role:'opening'}};
 return {membership_contract:'ask-episode-membership.v1',sources:[source],claims:[],memberships:[member],episodes:[{id:'old',user_id:ownerId,pet_profile_id:'milo',normalized_key:'vomiting',started_at:source.occurred_at,sequence_number:7,recurrence_of:null,status:'active',updated_at:source.updated_at}],recorded_census:census()};
}
test('production callback displays bounded page but uses full SQL census count',async t=>{
 clock(t);const d=data();const r=await exercise('List all Milo vomiting episodes.',{history:true,rows:d.sources,episodeRowsOverride:d});
 assert.equal(r.context.episodeResult.exactTotal,45);
 assert.equal(r.context.episodeResult.items.length,1);
 assert.match(r.result.reasoning.answer.summary,/Exactly 45 recorded vomiting episodes/);
});
test('mutation during generation invalidates the final answer, count and references',async t=>{
 clock(t);const d=data();
 const before=await exercise('List all Milo vomiting episodes.',{history:true,rows:d.sources,messages:[],episodeRowsOverride:d});
 assert.equal(before.context.episodeResult.exactTotal,45,'fresh aggregate must be established before testing invalidation');
 const r=await exercise('List all Milo vomiting episodes.',{history:true,rows:d.sources,messages:[],episodeRowsOverride:d,
  afterGeneration:()=>{d.recorded_census.revision='5.1';}});
 assert.equal(r.context.episodeResult.exactTotal,null);
 assert.equal(r.context.episodeResult.references,undefined);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/Exactly 45/);
});
