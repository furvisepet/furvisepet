import assert from 'node:assert/strict';
import test from 'node:test';
import {exercise,clock} from './helpers/lifetime-harness.mjs';
import {stressProposal} from './helpers/current-stress-harness.mjs';
import {assertSourceFreePublication} from './helpers/publication-call-expectations.mjs';
import {care,decisive,irrelevant,ownerId,pets} from './fixtures/ask-lifetime-history.mjs';
const names=ids=>ids.map(id=>{const pet=pets.find(p=>p.id===id);assert.ok(pet);return pet.name;});
async function read(question,{plan={terms:['vomit'],from:'2014-01-01',to:'2015-01-01'},...options}={}){
 const ids=options.authoritativePetIds||[options.petId||'milo'];
 const run=await exercise(question,{...options,history:true,messages:[],interpretationProposal:stressProposal({question,petNames:names(ids),...plan})});
 assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);
 assert.ok(run.interpretationRequests.every(r=>r.input.length<=48000));
 assert.deepEqual(run.result.acceptedCareActions,[]);assert.deepEqual(run.result.acceptedSemanticEvents,[]);assert.deepEqual(run.result.acceptedLearnings,[]);
 return run;
}
const coverage=r=>r.context.askHistory.coverage;
const records=r=>r.result.reasoning.labsList?.records||[];
const contains=(r,id,note)=>r.context.askHistory.entries.some(x=>x.id===id&&(note===undefined||x.note===note));
const published=(r,id,note)=>records(r).some(x=>x.sourceId===id&&x.body===note);
function withheld(r,id){const stream=coverage(r).ticketCoverage.effectiveStream.find(x=>x.acquiredIds.includes(id));assert.ok(stream,'source was acquired');assert.equal(stream.effectiveIds.includes(id),false);assert.equal(stream.certifiedSelectedIds.includes(id),false);}
function certifiedEmpty(r){assert.equal(r.result.reasoning.model,'server-labs-list');assert.deepEqual(records(r),[]);assert.equal(coverage(r).ticketCoverage.status,'complete_empty');assert.equal(coverage(r).ticketCoverage.resultSet.certified,true);assert.deepEqual(r.result.reasoning.relevantContextIds,[]);}
const uncertain=(id,from=null,to=null)=>({sourceSemantics:{[id]:{classification:'attributed_correction',target:{kind:'scope',from,to,conceptKey:null}}}});
const original = care('old-vomit', 'milo', '2014-07-09', 'symptom', 'Milo vomited.');
const stool = care('old-stool', 'milo', '2014-07-10', 'symptom', 'Milo had soft stool.');
function claim(id, pet, note, extra = {}) { return { id, user_id: ownerId, subject_type: 'pet', subject_id: pet, claim_kind: 'event', operation_type: 'assert', concept_key: 'vomiting', canonical_concept_key: 'vomiting', concept_resolution_status: 'canonical', persistence_destination: 'history', knowledge_status: 'effective', occurred_at: '2014-07-09T12:00:00Z', recorded_at: '2014-07-09T12:01:00Z', provenance_classification: 'imported_legacy', structured_value: { title: null, note, severity: null }, ...extra }; }
const c1 = claim('claim-old', 'milo', original.note);
const c2 = claim('claim-correction', 'bruno', 'Bruno vomited, not Milo.', { operation_type: 'correct', recorded_at: '2026-08-20T12:00:00Z' });
const edge = { id: 'edge-1', user_id: ownerId, from_claim_id: c2.id, to_claim_id: c1.id, relation_type: 'corrects' };
const lineage = { user_id: ownerId, claim_id: c1.id, legacy_row_id: original.id, legacy_table: 'pet_care_entries', claim_role: 'primary' };
const graph = { claims: [c1, c2], relations: [edge], lineage: [lineage], sources: [original] };


for(const [name,patch] of [
 ['note and claim',{note:'Milo did not vomit.'}],['topic',{note:'Milo slept normally.'}],
 ['event date',{occurred_at:'2015-07-09T12:00:00Z'}],['pet',{pet_profile_id:'bruno'}],
 ['title',{title:'Possible vomiting, not confirmed'}],['severity',{severity:'severe'}],['category',{category:'general'}],
 ['creation time',{created_at:'2026-09-03T12:00:00Z'}],['update time',{updated_at:'2026-09-03T12:00:00Z'}],['deletion',{deleted_at:'2026-09-03T12:00:00Z'}]
])test('candidate/RPC source version change fails closed: '+name,async t=>{
 clock(t);const fresh={...original,...patch},linked={...c1,subject_id:fresh.pet_profile_id,occurred_at:fresh.occurred_at,structured_value:{note:fresh.note,title:fresh.title,severity:fresh.severity}};
 const r=await read('What vomiting records are there in 2014?',{rows:[original],graph:{claims:[linked],lineage:[lineage],sources:[fresh]}});
 assertSourceFreePublication(r);assert.equal(contains(r,original.id),false);
 assert.ok(coverage(r).reasons.includes('source_semantics_incomplete'));withheld(r,original.id);assert.equal(coverage(r).ticketCoverage.resultSet.certified,false);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/Milo vomited/);
});
test('unchanged linked source certifies the exact original note',async t=>{
 clock(t);const r=await read('What vomiting records are there in 2014?',{rows:[original],graph:{claims:[c1],lineage:[lineage],sources:[original]}});
 assert.equal(r.result.reasoning.model,'server-labs-list');assert.ok(published(r,'care:old-vomit',original.note));
 assert.ok(coverage(r).provenance.some(x=>x.status==='effective_linked'));assert.deepEqual(coverage(r).excludedIds,[]);
});
for(const changed of ['source','claim'])test('inconsistent linked '+changed+' version fails safely',async t=>{
 clock(t);const r=await read('What vomiting records are there in 2014?',{rows:[original],graph:{claims:[changed==='claim'?{...c1,structured_value:{...c1.structured_value,note:'Milo did not vomit.'}}:c1],lineage:[lineage],sources:[changed==='source'?{...original,note:'Milo did not vomit.'}:original]}});
 assertSourceFreePublication(r);assert.equal(contains(r,original.id),false);assert.notEqual(coverage(r).corrections,'complete');
});
for(const [petId,question,terms,ids] of [
 ['milo','Read Milo recorded soft-stool reports.',['stool'],['milo-stool-1','milo-stool-2']],
 ['milo','Compare every recorded weight for Milo.',['weigh'],['milo-weight-1','milo-weight-2','milo-weight-3']],
 ['milo','Read Milo food-change reports.',['food','rice'],['milo-food-1','milo-food-2']],
 ['luna','Read Luna litter reports.',['litter'],['luna-litter','luna-accidents','luna-restored','luna-improved']],
 ['oscar','Read Oscar medication and stiffness reports.',['medication','stiffness'],['oscar-course','oscar-stiffness-1','oscar-stiffness-2','oscar-improved']]
])test('migrated exact-source reachability: '+question,async t=>{
 clock(t);const sources=decisive.filter(row=>ids.includes(row.id)),r=await read(question,{petId,rows:[...sources,...irrelevant(petId)],plan:{terms,from:null,to:null}});
 for(const row of sources)assert.ok(published(r,'care:'+row.id,row.note));
 assert.equal(r.result.reasoning.model,'server-labs-list');assert.equal(r.result.answerValidation.assessment.outcome,'complete');
});
test('six-weight selection preserves all six exact values and identities',async t=>{
 clock(t);const rows=Array.from({length:6},(_,i)=>care('weight-'+i,'milo','2026-08-'+(10+i),'weight','Milo weighed '+(28.4-i/10)+' kg.'));
 const r=await read('Show every recorded weight measurement.',{rows,plan:{terms:['weigh'],from:null,to:null}});
 assert.deepEqual(new Set(records(r).map(x=>x.body)),new Set(rows.map(x=>x.note)));assert.equal(records(r).length,6);
});
test('a long unlinked correction remains intact internally without becoming factual authority',async t=>{
 clock(t);const note='Owner described the surroundings. '.repeat(22)+'Correction: the vomiting belonged to Bruno, not Milo.';
 const r=await read('What does the corrected vomiting record say?',{rows:[care('tail-correction','milo','2026-08-20','symptom',note)],graph:uncertain('tail-correction'),plan:{terms:['vomit'],from:null,to:null}});
 assertSourceFreePublication(r);assert.ok(coverage(r).ticketCoverage.reasons.includes('unlinked_correction_uncertain'));
 assert.doesNotMatch(r.result.reasoning.answer.summary,/belonged to Bruno|Milo vomited/);
});
test('100000 newer rows cannot turn retained old evidence into an exhaustive certificate',async t=>{
 clock(t);const old=care('decisive','milo','2011-02-01','symptom','Milo had soft stool, not vomiting.');
 const r=await read('What soft-stool records are there for Milo in 2011?',{rows:[old,...irrelevant('milo',100000)],plan:{terms:['stool'],from:'2011-01-01',to:'2012-01-01'}});
 assertSourceFreePublication(r);assert.ok(contains(r,old.id,old.note));assert.equal(coverage(r).ticketCoverage.resultSet.certified,false);
 assert.ok(coverage(r).perPet.every(p=>p.rows<=256));assert.ok(coverage(r).queryCount<=20);
});
test('same-time records retain all thirty identities within the existing limit',async t=>{
 clock(t);const rows=Array.from({length:30},(_,i)=>care('tie-'+String(i).padStart(3,'0'),'milo','2011-01-01','weight','Milo weighed '+(28+i/10)+' kg.'));
 const r=await read('List weight records in 2011.',{rows,plan:{terms:['weigh'],from:'2011-01-01',to:'2012-01-01'}});
 assert.equal(records(r).length,30);assert.deepEqual(new Set(records(r).map(x=>x.sourceId)),new Set(rows.map(x=>'care:'+x.id)));
});
test('validated reassignment removes Milo vomiting and preserves the unrelated stool',async t=>{
 clock(t);const r=await read('What records are there in July 2014?',{rows:[original,stool],graph,plan:{terms:[],from:'2014-07-01',to:'2014-08-01'}});
 assert.equal(contains(r,original.id),false);assert.ok(published(r,'care:old-stool',stool.note));
 withheld(r,original.id);
});
test('failed correction closure cannot resurrect the original',async t=>{
 clock(t);const r=await read('What vomiting records are there in 2014?',{rows:[original],graph,failGraph:true});
 assertSourceFreePublication(r);assert.equal(contains(r,original.id),false);assert.doesNotMatch(r.result.reasoning.answer.summary,/Milo vomited/);
});
test('topic-only lookup and row permutation preserve an old exact source',async t=>{
 clock(t);const old=care('old','milo','2011-02-01','weight','Milo weighed 28.4 kg.'),rows=[old,...irrelevant('milo',30)];
 for(const candidateRows of [rows,[...rows].reverse()]){const r=await read('What weight records have I reported?',{rows:candidateRows,plan:{terms:['weigh'],from:null,to:null}});
 assert.ok(published(r,'care:old',old.note));assert.deepEqual(r.result.reasoning.relevantContextIds,['care:old']);}
});
test('graph permutation never projects a Bruno replacement as Milo',async t=>{
 clock(t);for(const claims of [graph.claims,[...graph.claims].reverse()]){
 const r=await read('What vomiting records do Milo and Bruno have in 2014?',{rows:[original],graph:{...graph,claims},authoritativePetIds:['milo','bruno']});
 assert.ok(r.context.askHistory.entries.every(x=>!(x.pet_profile_id==='milo'&&x.note.includes('Milo vomited'))));
 assert.ok(records(r).some(x=>x.petId==='bruno'&&x.body==='Bruno vomited, not Milo.'));
 }
});
for(const [name,alter] of [
 ['competing corrections',()=>({claims:[c1,c2,{...c2,id:'c3'}],relations:[edge,{...edge,id:'e3',from_claim_id:'c3'}]})],
 ['cycle',()=>({claims:[{...c1,recorded_at:c2.recorded_at},c2],relations:[edge,{...edge,id:'cycle',from_claim_id:c1.id,to_claim_id:c2.id}]})],
 ['missing target',()=>({relations:[edge,{...edge,id:'missing',to_claim_id:'missing'}]})],
 ['graph cap',()=>({truncated:true})],['missing source',()=>({missingSourceIds:[original.id]})],
 ['stale imported note',()=>({sources:[{...original,note:'Edited source.'}]})]
])test('graph authority fails closed: '+name,async t=>{
 clock(t);const r=await read('What vomiting records are there in 2014?',{rows:[original],graph:{...graph,...alter()}});
 assertSourceFreePublication(r);assert.equal(contains(r,original.id),false);assert.notEqual(coverage(r).corrections,'complete');
 assert.doesNotMatch(r.result.reasoning.answer.summary,/Milo vomited/);
});
for(const state of ['tombstoned','forgotten','superseded'])test('removed correction cannot revive target: '+state,async t=>{
 clock(t);const r=await read('What vomiting records are there in 2014?',{rows:[original],graph:{...graph,claims:[c1,{...c2,knowledge_status:state}]}});
 assert.equal(contains(r,original.id),false);withheld(r,original.id);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/Milo vomited/);
});
test('retraction of a correction never revives its original target',async t=>{
 clock(t);const retract={...c2,id:'retract',operation_type:'retract',recorded_at:'2026-08-21T12:00:00Z',persistence_destination:'none'};
 const r=await read('What vomiting records are there in 2014?',{rows:[original],graph:{...graph,claims:[c1,c2,retract],relations:[edge,{...edge,id:'retract-edge',from_claim_id:retract.id,to_claim_id:c2.id,relation_type:'retracts'}]}});
 assert.equal(contains(r,original.id),false);assert.doesNotMatch(r.result.reasoning.answer.summary,/Milo vomited/);
});
test('foreign-owner rows and relations cannot affect or appear in owned publication',async t=>{
 clock(t);const foreign={...original,id:'foreign',user_id:'other-owner',note:'FOREIGN SECRET vomiting.'};
 const r=await read('What vomiting records are there in 2014?',{rows:[original,foreign],graph:{claims:[{...c2,user_id:'other-owner'}],relations:[{...edge,user_id:'other-owner'}]}});
 assert.ok(published(r,'care:old-vomit',original.note));assert.doesNotMatch(JSON.stringify(r.result.reasoning),/FOREIGN SECRET|claim-correction/);
});
test('an explicitly unlinked correction cannot become an authoritative edge or an absence claim',async t=>{
 clock(t);const correction=care('unlinked','milo','2026-09-03','symptom','Correction: Bruno vomited, not Milo.');
 const r=await read('What vomiting records are there?',{rows:[original,correction],graph:uncertain('unlinked'),plan:{terms:['vomit'],from:null,to:null}});
 assertSourceFreePublication(r);assert.ok(coverage(r).ticketCoverage.reasons.includes('unlinked_correction_uncertain'));
 assert.doesNotMatch(r.result.reasoning.answer.summary,/Milo never|Bruno vomited/);
});
test('page interruption and evidence budget expose incomplete coverage without totals',async t=>{
 clock(t);const rows=Array.from({length:110},(_,i)=>care('n-'+String(i).padStart(3,'0'),'milo','2011-01-01','weight','Milo weighed '+i+' kg.'));
 for(const failHistoryPage of [0,2]){const r=await read('How many weight records are there in 2011?',{rows,failHistoryPage,plan:{terms:['weigh'],from:'2011-01-01',to:'2012-01-01'}});
 assertSourceFreePublication(r);if(failHistoryPage){assert.equal(coverage(r).ticketCoverage.status,'unavailable');assert.equal(coverage(r).ticketCoverage.resultSet,undefined);}else assert.equal(coverage(r).ticketCoverage.resultSet.certified,false);assert.doesNotMatch(r.result.reasoning.answer.summary,/Exactly 110/);}
});
test('long qualified note is published as an exact UTF16 JSON quote and reload source',async t=>{
 clock(t);const note='I recorded the urine test as pending. '+'Owner described the test visit. '.repeat(20)+'Result uncertain, not normal. 🐾';
 const r=await read('What did Luna’s September 3 urine-test result say?',{petId:'luna',rows:[care('long-note','luna','2026-09-03','vet_visit',note)],plan:{terms:['urine'],from:'2026-09-03',to:'2026-09-04'}});
 assert.ok(published(r,'care:long-note',note));assert.ok(r.result.reasoning.answer.summary.includes(JSON.stringify(note)));
 assert.equal(r.result.reasoning.referencedRecords[0].value,note);
});

test('deleted and concurrently deleted sources cannot yield affirmative prose',async t=>{
 clock(t);for(const concurrent of [false,true]){
 const deleted={...original,deleted_at:'2026-09-04T12:00:00Z'};
 const r=await read('What vomiting records are there in 2014?',{rows:[concurrent?original:deleted],graph:{sources:[deleted]}});
 assert.equal(contains(r,original.id),false);if(concurrent)assertSourceFreePublication(r);else certifiedEmpty(r);assert.doesNotMatch(r.result.reasoning.answer.summary,/Milo vomited|never vomited/);
 }
});
test('restoring a source does not revive a tombstoned imported claim',async t=>{
 clock(t);const r=await read('What vomiting records are there in 2014?',{rows:[original],graph:{...graph,claims:[{...c1,knowledge_status:'tombstoned'}],relations:[]}});
 assert.equal(contains(r,original.id),false);assert.doesNotMatch(r.result.reasoning.answer.summary,/Milo vomited/);
});
test('deleting a correction source leaves its authored relation in force',async t=>{
 clock(t);const changed=care('correction-source','bruno','2014-07-09','symptom',c2.structured_value.note,{deleted_at:'2026-09-04T12:00:00Z'});
 const r=await read('What vomiting records are there in 2014?',{rows:[original],graph:{...graph,lineage:[lineage,{...lineage,claim_id:c2.id,legacy_row_id:changed.id}],sources:[original,changed]}});
 assert.equal(contains(r,original.id),false);withheld(r,original.id);
});
test('oversized evidence cannot bypass the final limitation or character cap',async t=>{
 clock(t);const huge=care('huge','milo','2011-01-01','symptom','Vomiting history: '+'qualified details '.repeat(2000)+'not confirmed.');
 const r=await read('What vomiting records are there in 2011?',{rows:[huge],plan:{terms:['vomit'],from:'2011-01-01',to:'2012-01-01'}});
 assertSourceFreePublication(r);withheld(r,'huge');assert.ok(coverage(r).reasons.includes('source_semantics_source_deleted_or_changed'));assert.equal(coverage(r).ticketCoverage.resultSet.certified,false);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/Vomiting confirmed|qualified details/);
});
test('persisted removed-edge marker withholds the target after relation removal',async t=>{
 clock(t);const r=await read('What vomiting records are there in 2014?',{rows:[original],graph:{...graph,claims:[c1],relations:[],withheld_claim_ids:[c1.id]}});
 assert.equal(contains(r,original.id),false);assert.doesNotMatch(r.result.reasoning.answer.summary,/Milo vomited/);
});
test('nonhistorical safety engine handles general questions without a historical callback',async t=>{
 clock(t);for(const question of ['What should I do about vomiting?','Milo collapsed, what should I do?','Milo stopped vomiting today. Is that improvement?']){
 const r=await exercise(question,{rows:[],messages:[],history:false,taskReviewResponse:true,interpretationProposal:{mode:'conversation',scope:'none',operation:'general',subject:'non_pet',petNames:[],evidenceBasis:'general',topic:'general advice',terms:[],quantity:null,from:null,to:null,episodeTopic:null,ordinal:null,frame:null}});
 assert.equal(r.context.askHistory,undefined);assert.equal(r.result.reasoning.evidenceContract.history,undefined);
 if(question.includes('collapsed'))assert.equal(r.result.safety.currentMessageEmergency,true);
 assert.deepEqual(r.result.acceptedCareActions,[]);
 }
});
test('an explicit multi-year interval uses its typed bounds and no legacy fallback',async t=>{
 clock(t);const rows=[care('early','milo','2011-06-01','symptom','Milo vomited once.'),care('late','milo','2014-06-01','symptom','Milo vomited after a walk.'),care('outside','milo','2015-06-01','symptom','Outside vomiting report.')];
 const r=await read('What vomiting was reported between 2011 and 2014?',{rows,plan:{terms:['vomit'],from:'2011-01-01',to:'2015-01-01'}});
 assert.equal(r.context.historyFallback,undefined);assert.deepEqual(new Set(r.result.reasoning.relevantContextIds),new Set(['care:early','care:late']));
 assert.ok(published(r,'care:early',rows[0].note));assert.ok(published(r,'care:late',rows[1].note));
});
test('authorized multi-pet period keeps exact records attached to their subjects',async t=>{
 clock(t);const luna=care('luna-note','luna','2014-07-09','symptom','Luna had litter accidents.');
 const r=await read('Summarize Milo and Luna records in 2014.',{rows:[stool,luna],authoritativePetIds:['milo','luna'],plan:{terms:[],from:'2014-01-01',to:'2015-01-01'}});
 assert.deepEqual(coverage(r).perPet.map(p=>p.petId).sort(),['luna','milo']);
 assert.ok(records(r).some(x=>x.petId==='milo'&&x.body===stool.note));assert.ok(records(r).some(x=>x.petId==='luna'&&x.body===luna.note));
});
test('a qualified later replacement is never quoted as its superseded original note',async t=>{
 clock(t);const source=care('urine-original','luna','2014-09-03','vet_visit','Urine test: normal.');
 const oldClaim={...c1,id:'urine-old',subject_id:'luna',occurred_at:source.occurred_at,structured_value:{title:null,note:source.note,severity:null}};
 const replacement={...c2,id:'urine-new',subject_id:'luna',occurred_at:source.occurred_at,modality:'suspected',polarity:'negated',structured_value:{note:'Urine test: pending, not normal.'}};
 const r=await read('What did Luna’s September 3, 2014 urine-test result say?',{petId:'luna',rows:[source],plan:{terms:['urine'],from:'2014-09-03',to:'2014-09-04'},graph:{claims:[oldClaim,replacement],relations:[{...edge,from_claim_id:replacement.id,to_claim_id:oldClaim.id}],lineage:[{...lineage,claim_id:oldClaim.id,legacy_row_id:source.id}],sources:[source]}});
 assert.equal(contains(r,source.id),false);assert.doesNotMatch(JSON.stringify(records(r)),/Urine test: normal\./);
 withheld(r,source.id);assert.deepEqual(coverage(r).ticketCoverage.resultSet.matchingIds,['claim-urine-new']);assert.ok(published(r,'claim:urine-new','Urine test: pending, not normal.'));
});
test('Bruno lookup discovers reassignment without a Bruno legacy row',async t=>{
 clock(t);const r=await read('What vomiting records does Bruno have in 2014?',{petId:'bruno',rows:[original],graph});
 assert.ok(records(r).some(x=>x.petId==='bruno'&&x.sourceId==='claim:claim-correction'&&x.body==='Bruno vomited, not Milo.'));
 assert.ok(r.context.askHistory.entries.every(x=>x.pet_profile_id==='bruno'));
});
test('removing imported lineage cannot resurrect a source as unlinked evidence',async t=>{
 clock(t);const r=await read('What vomiting records are there in 2014?',{rows:[original],graph:{withheld_source_ids:[original.id]}});
 assert.equal(contains(r,original.id),false);assert.doesNotMatch(r.result.reasoning.answer.summary,/Milo vomited/);
});
test('correction-only lookup cannot promote unrelated shadow assertions',async t=>{
 clock(t);const r=await read('What vomiting records does Bruno have in 2014?',{petId:'bruno',rows:[],graph:{claims:[{...c2,operation_type:'assert'}],relations:[]}});
 certifiedEmpty(r);assert.deepEqual(r.context.askHistory.entries,[]);assert.doesNotMatch(r.result.reasoning.answer.summary,/Bruno vomited/);
});
test('actual table pages with tied timestamps preserve offset traversal and disclose representation loss',async t=>{
 clock(t);const rows=Array.from({length:101},(_,i)=>care('tie-page-'+String(i).padStart(3,'0'),'milo','2011-01-01','general','Milo weight '+(28+i/10)+' kg.'));
 const r=await read('List weight records in 2011.',{rows,plan:{terms:['weight'],from:'2011-01-01',to:'2012-01-01'}});
 assertSourceFreePublication(r);assert.equal(coverage(r).perPet[0].exhausted,true);assert.ok(coverage(r).perPet[0].pages>1);
 assert.equal(coverage(r).ticketCoverage.resultSet.matchingIds.length,101);assert.equal(coverage(r).ticketCoverage.resultSet.certified,false);
 assert.ok(coverage(r).ticketCoverage.resultSet.omittedIds.length>0);
});
for(const change of ['removed relation','changed claim'])test('graph revision during closure fails closed: '+change,async t=>{
 clock(t);const changed=change==='removed relation'?{...graph,relations:[]}:{...graph,claims:[c1,{...c2,knowledge_status:'unconfirmed'}]};
 const r=await read('What vomiting records are there in 2014?',{rows:[original],graphAtCall:call=>call===1?graph:changed});
 assertSourceFreePublication(r);assert.equal(contains(r,original.id),false);assert.notEqual(coverage(r).corrections,'complete');
});
test('multi-pet saturation preserves bounded coverage and discloses omitted records',async t=>{
 clock(t);const rows=['milo','luna','bruno'].flatMap((pet,p)=>Array.from({length:110},(_,i)=>care('saturated-'+p+'-'+i,pet,'2011-01-01','general',pet+' weight '+i+' kg.')));
 const r=await read('List Milo, Luna and Bruno weight records in 2011.',{rows,authoritativePetIds:['milo','luna','bruno'],plan:{terms:['weight'],from:'2011-01-01',to:'2012-01-01'}});
 assertSourceFreePublication(r);assert.equal(coverage(r).perPet.length,3);assert.ok(r.context.askHistory.entries.length<=32);
 assert.equal(coverage(r).ticketCoverage.resultSet.certified,false);assert.ok(coverage(r).ticketCoverage.resultSet.omittedIds.length>0);
});
test('a validated date correction removes the original from its old period',async t=>{
 clock(t);const moved={...c2,subject_id:'milo',occurred_at:'2015-07-09T12:00:00Z'};
 const r=await read('What vomiting records are there in 2014?',{rows:[original],graph:{...graph,claims:[c1,moved]}});
 assert.equal(contains(r,original.id),false);assert.deepEqual(records(r),[]);
 withheld(r,original.id);assert.deepEqual(coverage(r).ticketCoverage.resultSet.matchingIds,[]);assert.equal(coverage(r).ticketCoverage.windows[0].to,'2015-01-01T00:00:00.000Z');
});
test('unsupported replacement payload cannot be hidden by an unrelated useful source',async t=>{
 clock(t);const replacement={...c2,subject_id:'milo',structured_value:{unsupported:'shape'}};
 const r=await read('What records are there in 2014?',{rows:[original,stool],graph:{...graph,claims:[c1,replacement]},plan:{terms:[],from:'2014-01-01',to:'2015-01-01'}});
 assertSourceFreePublication(r);withheld(r,stool.id);assert.deepEqual(r.context.askHistory.entries,[]);assert.ok(coverage(r).reasons.includes('unsupported_claim_payload'));
 assert.doesNotMatch(r.result.reasoning.answer.summary,/Complete history|Milo had soft stool/);
});
