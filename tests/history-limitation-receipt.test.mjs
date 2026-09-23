import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
const {bindCompositionalReadTicket}=await import('../app/lib/furvise-brain/read-selection.ts');
const {retrieveReadTicket}=await import('../app/lib/furvise-brain/lungs.ts');
const {generateContextAwareAskResponse}=await import('../app/lib/ai/ask-reasoning.ts');
const {evidenceSource}=await import('../app/lib/intelligence/ask-evidence.ts');
const {derivePublicationAuthority}=await import('../app/lib/intelligence/publication-authority.ts');
const {historyLimitationFailure,historyPublicationLimitation}=await import('../app/lib/intelligence/ordinary-history-publication.ts');
const {reviewHistoricalAnswer}=await import('../app/lib/intelligence/review-history-narrative.ts');
const {validateGeneratedAnswer}=await import('../app/lib/intelligence/validation/validate-answer.ts');
const {finalizeAskAnswer}=await import('../app/lib/intelligence/finalize-ask-answer.ts');
const {buildGovernedAskExecutionPlan}=await import('../app/lib/intelligence/ask-execution-plan.ts');
const {recordHistoryReview,readReviewedHistoryAnswer,historyReviewSignature}=await import('../app/lib/intelligence/history-review-state.ts');
const pet={id:'owned-subject',user_id:'owner',name:'Subject',species:'dog'};
let generationCalls=0,reviewCalls=0;
const generationClient={responses:{create:async()=>{generationCalls++;throw Error('FACTUAL_GENERATION_FORBIDDEN');}}};
const reviewClient={responses:{create:async()=>{reviewCalls++;throw Error('FACTUAL_REVIEW_FORBIDDEN');}}};
async function fixture({emptyStore=false,matching=false}={}){
 generationCalls=0;reviewCalls=0;
 const ticket=bindCompositionalReadTicket({operation:'read',temporal:{from:null,to:null,anchor:null},
  predicates:[{kind:'text_any',terms:['transition']}],outputs:{completeness:'sufficient',ordering:'desc',limit:null},
  selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]}},[pet.id]);
 const rows=emptyStore?[]:[{id:'event',user_id:'owner',pet_profile_id:pet.id,category:'general',title:null,
  note:matching?'A transition was recorded.':'A routine observation was recorded.',deleted_at:null,
  occurred_at:'2025-01-01T12:00:00Z',created_at:'2025-01-01T12:00:00Z'}];
 const read=await retrieveReadTicket(ticket,{userId:'owner',ownedPetIds:[pet.id],from:'2020-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-22T00:00:00Z'},
  {page:async({offset,limit})=>rows.slice(offset,offset+limit),effective:async rows=>({records:rows,reliable:true}),
   effectiveWindow:async({rows})=>({records:rows,lineageClosed:true,replacementSeedsExhausted:true,sourceLineage:[],graphCalls:1,lineageRows:rows.length,reasons:[]})});
 const evidence={version:'ask-evidence.v1',timeZone:'UTC',petNames:{[pet.id]:pet.name},
  scope:{authorizedPetIds:[pet.id],requestText:'Requested saved transition',status:'resolved',readOnlyRecall:true,requestKind:'record_lookup'},
  interpretation:{operation:'recall',readOperation:'recall',readOnly:true,petIds:[pet.id],
   request:{mode:'read',evidenceBasis:'saved_history',quantity:'records',readTicket:ticket,requirements:[],referenceTurnIds:[],profileFields:[]}},
  history:{ticketCoverage:read.coverage,provenance:[],perPet:[],needs:[],candidateIds:[],eventCandidateIds:[],claimSources:[],excludedIds:[],continuation:[],
   retrieval:read.coverage.status,corrections:'complete',reasons:[]},
  represented:[],sources:[evidenceSource(pet.id,'care_entries',read.records.map(r=>'care:'+r.id))],losses:[],representation:'complete',verifiedFacts:[],
  completeness:{retrieval:'complete',corrections:'complete',extraction:'unknown',grouping:'unknown'}};
 const reasoning=await generateContextAwareAskResponse({evidenceContract:evidence,profiles:[pet],careEntries:read.records,memories:[],productFeedback:[],
  conversationTurns:[],recentUpdates:[],question:evidence.scope.requestText,client:generationClient});
 const context={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:evidence.scope.requestText,careEntries:read.records,memories:[],askInterpretation:evidence.interpretation};
 return {reasoning,context,read,executionPlan:buildGovernedAskExecutionPlan({sourceMessageId:'source',petId:pet.id,careActions:[],semanticEvents:[],learnings:[]}),
  authoritativePetIds:[pet.id],requestId:'offline-empty-selection'};
}
function receipt(r,patch={}){
 recordHistoryReview(r,{signature:historyReviewSignature(r),text:r.answer.summary,sourceIds:[],sourceContent:[],...patch});
 return readReviewedHistoryAnswer(r);
}
test('certified lexical-empty selection keeps exact source-free limitation through finalization',async()=>{
 const f=await fixture(),r=f.reasoning,authority=derivePublicationAuthority(r.evidenceContract);
 assert.equal(authority.obligations[0].authority,'certified');assert.equal(authority.obligations[0].status,'complete_empty');
 assert.equal(f.read.coverage.effectiveStream[0].effectiveIds.length,1);
 assert.equal(r.model,'server-history-unavailable');assert.equal(historyLimitationFailure(r),null);
 assert.equal(r.answer.summary,historyPublicationLimitation(r.evidenceContract));assert.equal(readReviewedHistoryAnswer(r),null);
 assert.equal(await reviewHistoricalAnswer({result:r,client:reviewClient}),true);
 assert.deepEqual(readReviewedHistoryAnswer(r).sourceIds,[]);
 const {validation:v}=await finalizeAskAnswer(f);
 assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'limited');assert.equal(v.assessment.checks.taskCompletion,'failed');
 assert.equal(v.response.answer.summary,r.answer.summary);assert.match(v.response.answer.summary,/does not establish.*absent/);
 assert.deepEqual(v.response.relevantContextIds,[]);assert.deepEqual(v.response.referencedRecords,[]);
 assert.equal(v.response.labsList,undefined);assert.equal(v.completion,undefined);
 assert.deepEqual(derivePublicationAuthority(v.response.evidenceContract),authority);
 assert.equal(generationCalls,0);assert.equal(reviewCalls,0);
});
for(const [name,patch] of [
 ['text',{text:'No matching event ever occurred.'}],['source IDs',{sourceIds:['care:event']}],
 ['authority claim',{authorityClaims:[{obligationId:'selection:owned-subject:0',text:'No event occurred.',sourceIds:[]}]}],
 ['source content',{sourceContent:['A transition occurred.']}],['source report',{sourceReports:['A transition occurred.']}],
 ['action',{actions:[{kind:'care_history.add'}]}],['completion',{completion:[{index:0,status:'answered'}]}],
 ['prose',{proseText:''}],
])test('source-free history receipt rejects '+name,async()=>{
 const {reasoning:r}=await fixture();assert.equal(receipt(r,patch),null);
 assert.equal(generationCalls,0);assert.equal(reviewCalls,0);
});
for(const [name,mutate] of [
 ['changed limitation',r=>{r.answer.summary='No event ever occurred.';}],
 ['appended factual claim',r=>{r.answer.summary+=' A transition occurred in January.';}],
 ['factual source ID',r=>{r.relevantContextIds.push('care:event');}],
 ['action',r=>{r.applicationActions.push({kind:'care_history.add'});}],
 ['model identity',r=>{r.model='other-result';}],
 ['factual narrative',r=>{r.historyNarrative={sentences:[{text:'A transition occurred.',sourceIds:['care:event']}]};}],
])test('history limitation rejects result tampering: '+name,async()=>{
 const f=await fixture(),r=f.reasoning;assert.equal(await reviewHistoricalAnswer({result:r,client:reviewClient}),true);
 mutate(r);assert.notEqual(historyLimitationFailure(r),null);assert.equal(readReviewedHistoryAnswer(r),null);
 assert.equal(receipt(r),null,'A newly recorded signature cannot legitimize changed content');
 assert.equal(await reviewHistoricalAnswer({result:r,client:reviewClient}),false);
 assert.equal(validateGeneratedAnswer(r,f.context,'routine',[pet.id]).valid,false);
 assert.equal(generationCalls,0);assert.equal(reviewCalls,0);
});
test('certified factual Labs, including truly empty scope, retain their snapshot and review requirements',async()=>{
 for(const options of [{matching:true},{emptyStore:true}]){
  const f=await fixture(options),r=f.reasoning;assert.equal(r.model,'server-labs-list');
  assert.equal(readReviewedHistoryAnswer(r),null);assert.equal(validateGeneratedAnswer(r,f.context,'routine',[pet.id]).valid,false);
  assert.equal(await reviewHistoricalAnswer({result:r,client:reviewClient}),true);
  assert.equal(validateGeneratedAnswer(r,f.context,'routine',[pet.id]).valid,true);
  r.answer.summary+=' An additional factual claim.';
  assert.equal(readReviewedHistoryAnswer(r),null);assert.equal(await reviewHistoricalAnswer({result:r,client:reviewClient}),false);
  assert.equal(validateGeneratedAnswer(r,f.context,'routine',[pet.id]).valid,false);
  assert.equal(generationCalls,0);assert.equal(reviewCalls,0);
 }
});
