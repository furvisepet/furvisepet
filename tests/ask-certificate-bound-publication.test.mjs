import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const {derivePublicationAuthority,publicationSources,publicationClaimFailures}=await import('../app/lib/intelligence/publication-authority.ts');
const {eligibleAnswerSources}=await import('../app/lib/intelligence/ask-evidence.ts');
const {generateContextAwareAskResponse}=await import('../app/lib/ai/ask-reasoning.ts');
const {bindTypedReadTicket}=await import('../app/lib/furvise-brain/typed-read-ticket.ts');
const {retrieveReadTicket}=await import('../app/lib/furvise-brain/lungs.ts');
const {eventOrder}=await import('../app/lib/furvise-brain/read-selection.ts');
const {buildLabsList,serializeLabsList}=await import('../app/lib/intelligence/labs-list.ts');
const {historyLabsAuthorityFailure}=await import('../app/lib/intelligence/ordinary-history-publication.ts');
const {reviewHistoricalAnswer}=await import('../app/lib/intelligence/review-history-narrative.ts');
const {readReviewedHistoryAnswer,recordHistoryReview,historyReviewSignature}=await import('../app/lib/intelligence/history-review-state.ts');
const {validateGeneratedAnswer}=await import('../app/lib/intelligence/validation/validate-answer.ts');
const names=['Aster','Bramble','Echo'],weights=[30.31,4.71,7.01],profileWeights=[30.4,4.8,7.1];
let providerCalls=0;
const noProvider={responses:{create:async()=>{providerCalls++;throw Error('FACTUAL_PROVIDER_FORBIDDEN');}}};
test.afterEach(()=>assert.equal(providerCalls,0));
async function fixture({closed=true,topic='weight',sameValue=false}={}){
 const pets=names.map((name,i)=>({id:'pet-'+i,name,user_id:'owner',species:'dog',avoid_ingredients:[],weight_value:profileWeights[i],weight_unit:'kg',updated_at:'2026-09-16T12:00:00Z'}));
 const petIds=pets.map(p=>p.id),eventIds=petIds.map((_,i)=>'event-'+i);
 const row=(petId,id,note,at)=>({id,user_id:'owner',pet_profile_id:petId,category:'general',title:null,note,occurred_at:at,created_at:at,updated_at:at,deleted_at:null});
 const selected=petIds.map((petId,i)=>row(petId,eventIds[i],topic==='weight'?names[i]+' weighed '+weights[sameValue?0:i]+' kg.':names[i]+' medication record: 5 mg.','2026-09-15T12:00:00Z'));
 const all=[...selected,...petIds.map((id,i)=>row(id,'older-'+i,topic==='weight'?names[i]+' weighed 99 kg.':names[i]+' medication record: 99 mg.','2026-09-01T12:00:00Z')),
  ...petIds.map((id,i)=>row(id,'other-'+i,'Unrelated saved observation.','2026-09-16T12:00:00Z'))];
 const ticket=bindTypedReadTicket({operation:'read',subjectScope:'named',needs:[],episode:null,
  temporal:{calendar:null,from:null,to:null,anchor:null},predicates:[{kind:'text_any',terms:topic==='weight'?['weight','weighed']:['medication']}],
  outputs:{completeness:'sufficient',ordering:'desc',limit:null},
  selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]}},petIds);
 const read=await retrieveReadTicket(ticket,{userId:'owner',ownedPetIds:petIds,from:'2010-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-20T00:00:00Z'},{
  page:async q=>all.filter(r=>r.pet_profile_id===q.petId&&r.occurred_at>=q.from&&r.occurred_at<q.to)
   .sort((a,b)=>q.ordering==='desc'?eventOrder(b,a):eventOrder(a,b)).slice(q.offset,q.offset+q.limit),
  effective:async rows=>({records:rows,reliable:true}),
  effectiveWindow:async({rows})=>({records:rows,lineageClosed:closed,replacementSeedsExhausted:closed,sourceLineage:[],graphCalls:1,lineageRows:rows.length,
   reasons:closed?['no_cross_query_snapshot']:['correction_closure_unavailable_or_ambiguous']}),
 });
 const care=selected.map(r=>({sourceId:'care:'+r.id,petId:r.pet_profile_id,sourceType:'care_update',field:'value',text:r.note,occurredAt:r.occurred_at}));
 const profiles=petIds.flatMap((petId,i)=>[{sourceId:'profile:'+petId+':weight',petId,sourceType:'profile',field:'value',text:profileWeights[i]+' kg'},
  {sourceId:'profile:'+petId+':species',petId,sourceType:'profile',field:'value',text:'dog'}]);
 const represented=[...all.map(r=>({sourceId:'care:'+r.id,petId:r.pet_profile_id,sourceType:'care_update',field:'value',text:r.note,occurredAt:r.occurred_at})),...profiles].map(s=>({...s,start:0,end:s.text.length}));
 const evidence={version:'ask-evidence.v1',petNames:Object.fromEntries(pets.map(p=>[p.id,p.name])),timeZone:'UTC',
  scope:{authorizedPetIds:petIds,requestText:'Latest requested records for these subjects.',status:'resolved',readOnlyRecall:true,requestKind:'record_lookup'},
  interpretation:{operation:'recall',readOperation:'recall',readOnly:true,petIds,request:{readTicket:ticket,mode:'read',quantity:'records',
   evidenceBasis:'saved_history',requirements:[],referenceTurnIds:[],outputFormat:'prose',projection:null,profileFields:[]}},
  history:{ticketCoverage:read.coverage,provenance:[],perPet:[],needs:[],candidateIds:all.map(r=>'care:'+r.id),eventCandidateIds:all.map(r=>'care:'+r.id),
   claimSources:[],excludedIds:[],continuation:read.coverage.continuation,retrieval:read.coverage.status,corrections:closed?'complete':'unknown',reasons:read.coverage.reasons},
  sources:petIds.flatMap(petId=>[{petId,source:'care_entries',status:'loaded',loadedIds:all.filter(r=>r.pet_profile_id===petId).map(r=>'care:'+r.id)},
   {petId,source:'profile',status:'loaded',loadedIds:[petId]}]),represented,losses:[],representation:'complete',verifiedFacts:[],
  completeness:{retrieval:read.coverage.status,corrections:closed?'complete':'unknown',extraction:'complete',grouping:'complete'}};
 for(const source of evidence.sources)source.completeness={retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'};
 const context={askHistory:{entries:read.records,coverage:{ticketCoverage:read.coverage}},currentMessage:evidence.scope.requestText,pet:pets[0],eligiblePets:pets,careEntries:read.records,memories:[],askInterpretation:evidence.interpretation};
 const f={evidence,pets,care,profiles,eventIds,context,ticket,read,all};
 f.result=await generate(f);f.evidence=f.result.evidenceContract;
 // Adversarial model representation may contain other loaded rows, but grants no Labs authority.
 for(const span of represented)if(!f.evidence.represented.some(s=>s.sourceId===span.sourceId)){
  f.evidence.represented.push(span);f.evidence.losses=f.evidence.losses.filter(loss=>loss.sourceId!==span.sourceId);
 }
 if(closed){assert.equal(f.result.model,'server-labs-list');assert.equal(historyLabsAuthorityFailure(f.result),null);
  assert.deepEqual(new Set(f.result.labsList.records.map(r=>r.id)),new Set(eventIds));}
 return f;
}
async function generate(f){return generateContextAwareAskResponse({evidenceContract:f.evidence,profiles:f.pets,careEntries:f.read.records,
 memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],question:f.context.currentMessage,requestId:'certificate-carrier',locale:'en-CA',client:noProvider});}
const authority=f=>derivePublicationAuthority(f.evidence,f.result.labsList?.records);
const validate=(f,r=f.result)=>validateGeneratedAnswer(r,f.context,'normal',f.pets.map(p=>p.id));
async function accepted(f){assert.equal(await reviewHistoricalAnswer({result:f.result,client:noProvider}),true);
 assert.ok(readReviewedHistoryAnswer(f.result));assert.equal(validate(f).valid,true);}
async function rejected(f){assert.equal(await reviewHistoricalAnswer({result:f.result,client:noProvider}),false);
 assert.equal(readReviewedHistoryAnswer(f.result),null);assert.equal(validate(f).valid,false);}
function refreshPresentation(r){r.answer.summary=serializeLabsList(r.labsList);r.relevantContextIds=r.labsList.records.map(row=>row.sourceId);}
async function limited(f,r=f.result){assert.equal(r.model,'server-history-unavailable');assert.equal(r.labsList,undefined);
 assert.deepEqual(r.relevantContextIds,[]);assert.equal(r.referencedRecords?.length||0,0);
 assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),true);
 const v=validate(f,r);assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'limited');}
async function profileFixture(f,fields=['species']){
 const evidence={...f.evidence,history:undefined,represented:[],losses:[],scope:{...f.evidence.scope,requestKind:'ordinary'},
  interpretation:{...f.evidence.interpretation,request:{mode:'read',evidenceBasis:'saved_profile',readTicket:null,quantity:null,
   profileFields:fields,projection:null,requirements:[],referenceTurnIds:[],outputFormat:'prose'}}};
 const p={...f,evidence,read:{records:[]},context:{...f.context,careEntries:[],askInterpretation:evidence.interpretation}};
 p.result=await generate(p);p.evidence=p.result.evidenceContract;assert.ok(p.result.profileFieldLabs);
 return p;
}

test('derived source authority excludes profile alternatives from certified history',async()=>{
 const f=await fixture(),before=JSON.stringify(f.evidence),a=authority(f);
 assert.deepEqual(new Set(a.authorizedSourceIds),new Set(f.care.map(s=>s.sourceId)));
 assert.ok(a.obligations.every(o=>o.authority==='certified'&&o.certificateType==='selection'));
 assert.equal(JSON.stringify(f.evidence),before);
 assert.equal(f.read.coverage.status,'partial');
 assert.ok(f.read.coverage.effectiveStream.every(s=>s.lineageClosed&&s.replacementSeedsExhausted));
 assert.equal(a.transportValid,true);assert.deepEqual(f.result.appActions||[],[]);
 await accepted(f);
});
test('Labs transport contains only certificate-authorized facts',async()=>{
 const f=await fixture(),labs=f.result.labsList;
 assert.deepEqual(labs.ticket,f.ticket);assert.deepEqual(labs.coverage,f.read.coverage);
 assert.deepEqual(labs,buildLabsList(f.evidence,f.read.records));
 for(const row of labs.records){
  const source=f.all.find(s=>s.id===row.id);
  assert.equal(row.sourceId,'care:'+source.id);assert.equal(row.petId,source.pet_profile_id);
  assert.equal(row.body,source.note);assert.equal(row.event_at,source.occurred_at);
 }
 assert.ok(eligibleAnswerSources(f.evidence).some(s=>s.sourceId==='care:older-0'));
 assert.ok(eligibleAnswerSources(f.evidence).some(s=>s.sourceId==='profile:pet-0:weight'));
 assert.ok(!labs.records.some(r=>r.sourceId.startsWith('profile:')||r.body.includes('99 kg')));
 await accepted(f);
});
test('profile substitution is rejected at deterministic Labs review',async()=>{
 const f=await fixture(),row=f.result.labsList.records.find(r=>r.petId==='pet-0');
 row.sourceId='profile:pet-0:weight';row.body='Aster weighed 30.4 kg.';
 refreshPresentation(f.result);await rejected(f);
});
test('same numeric value in profile still cannot satisfy a history obligation',async()=>{
 const f=await fixture();
 f.evidence.represented.filter(s=>s.sourceType==='profile'&&s.sourceId.endsWith(':weight')).forEach(s=>{
  s.text=weights[Number(s.petId.slice(-1))]+' kg';s.end=s.text.length;
 });
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:'selection:pet-0:0',
  text:'Aster weighed 30.31 kg.',sourceIds:['profile:pet-0:weight']}]).some(x=>x.startsWith('publication_source_outside_obligation:')));
 f.result.labsList.records.find(r=>r.petId==='pet-0').sourceId='profile:pet-0:weight';
 refreshPresentation(f.result);await rejected(f);
});
test('typed profile-only publication retains its separate field authority',async()=>{
 const p=await profileFixture(await fixture(),['species','weight']),a=derivePublicationAuthority(p.evidence);
 assert.ok(a.authorizedSourceIds.includes('profile:pet-0:weight'));
 assert.ok(a.authorizedSourceIds.every(id=>id.startsWith('profile:')));
 assert.ok(publicationSources(p.evidence).every(s=>s.sourceId.startsWith('profile:')));
 await accepted(p);
});
test('history and species have separate source sets and reject crossing them',async()=>{
 const f=await fixture(),p=await profileFixture(f),a=authority(f),pa=derivePublicationAuthority(p.evidence);
 assert.ok(a.authorizedSourceIds.every(id=>id.startsWith('care:')));
 assert.ok(pa.authorizedSourceIds.every(id=>id.endsWith(':species')));
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:'selection:pet-0:0',
  text:'Aster is a dog.',sourceIds:['profile:pet-0:species']}]).some(x=>x.startsWith('publication_source_outside_obligation:')));
 assert.ok(publicationClaimFailures(p.evidence,[{obligationId:pa.obligations[0].obligationId,
  text:'Aster is a dog.',sourceIds:['care:event-0']}]).some(x=>x.startsWith('publication_source_outside_obligation:')));
 await accepted(f);await accepted(p);
});
test('certified numeric and date drift fail despite correct event IDs',async()=>{
 for(const mutate of [r=>{r.body='Aster weighed 30.4 kg.';},r=>{r.event_at='2026-09-16T12:00:00Z';}]){
  const f=await fixture(),row=f.result.labsList.records.find(r=>r.petId==='pet-0');
  mutate(row);assert.equal(row.id,'event-0');assert.equal(row.sourceId,'care:event-0');
  refreshPresentation(f.result);await rejected(f);
 }
});
test('cross-subject source bindings are rejected',async()=>{
 const f=await fixture();
 assert.deepEqual(publicationClaimFailures(f.evidence,[{obligationId:'selection:pet-0:0',text:'Aster weighed 30.31 kg.',sourceIds:['care:event-0']}]),[]);
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:'selection:pet-0:0',
  text:'Bramble weighed 4.71 kg.',sourceIds:['care:event-1']}]).some(x=>x.startsWith('publication_source_outside_obligation:')));
 f.result.labsList.records.find(r=>r.petId==='pet-0').sourceId='care:event-1';
 refreshPresentation(f.result);await rejected(f);
});
test('exact certified Labs snapshot passes deterministic review with bound receipt',async()=>{
 const f=await fixture();await accepted(f);
 const receipt=readReviewedHistoryAnswer(f.result);
 assert.deepEqual(new Set(receipt.sourceIds),new Set(f.care.map(s=>s.sourceId)));
 assert.equal(validate(f).response.answer.summary,receipt.text);
});
test('legacy publication receipt without Labs proof cannot bypass final validation',async()=>{
 const f=await fixture();delete f.result.labsList;
 recordHistoryReview(f.result,{signature:historyReviewSignature(f.result),text:f.result.answer.summary,sourceIds:f.care.map(s=>s.sourceId)});
 assert.equal(readReviewedHistoryAnswer(f.result),null);
 assert.equal(validate(f).valid,false);
});
test('downstream presentation cannot widen the certified source set',async()=>{
 const f=await fixture(),row=f.all.find(r=>r.id==='older-0');
 f.result.labsList.records.push({id:row.id,sourceId:'care:'+row.id,petId:row.pet_profile_id,
  event_at:row.occurred_at,body:row.note,predicates_matched:f.ticket.predicates});
 refreshPresentation(f.result);await rejected(f);
});
test('lost selected source cannot reopen profile authority',async()=>{
 const f=await fixture();f.result.labsList.records=[];
 const a=authority(f);assert.ok(a);assert.ok(a.obligations.every(o=>o.authority==='unavailable'));
 assert.deepEqual(a.authorizedSourceIds,[]);
 assert.ok(f.evidence.represented.some(s=>s.sourceType==='profile'));
 refreshPresentation(f.result);await rejected(f);
});
test('uncertified history has explicit unavailable authority and zero factual claims',async()=>{
 const f=await fixture({closed:false}),a=derivePublicationAuthority(f.evidence,[]);
 assert.ok(a);assert.ok(a.obligations.every(o=>o.authority==='unavailable'));
 assert.deepEqual(a.authorizedSourceIds,[]);assert.deepEqual(publicationSources(f.evidence),[]);
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:a.obligations[0].obligationId,
  text:'Aster weighed 30.31 kg.',sourceIds:['care:event-0']}]).length);
 assert.equal(f.result.model,'server-labs-list');assert.deepEqual(f.result.labsList.records,[]);
 assert.deepEqual(f.result.relevantContextIds,[]);assert.equal(f.result.referencedRecords?.length||0,0);
 assert.ok(!f.result.answer.summary.includes('kg'));assert.ok(!f.result.answer.summary.includes('2026-09-15'));
 assert.match(f.result.answer.summary,/couldn't verify/);
 await accepted(f);assert.equal(validate(f).assessment.outcome,'limited');
 assert.deepEqual(readReviewedHistoryAnswer(f.result).sourceIds,[]);
 assert.equal(readReviewedHistoryAnswer(f.result).authorityClaims?.length||0,0);
});
test('unassigned claims and omitted selected rows cannot pass authority review',async()=>{
 const f=await fixture();
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:'unbound',
  text:'Aster weighed 30.31 kg.',sourceIds:['care:event-0']}]).length);
 f.result.labsList.records.pop();refreshPresentation(f.result);await rejected(f);
});
test('alternate topic uses the same organ certification and snapshot guards',async()=>{
 const f=await fixture({topic:'medication'});await accepted(f);
 assert.ok(authority(f).obligations.every(o=>o.authority==='certified'));
 assert.ok(f.result.labsList.records.every(r=>r.body.includes('5 mg')));
 f.result.labsList.records[0].body=f.result.labsList.records[0].body.replace('5 mg','6 mg');
 refreshPresentation(f.result);await rejected(f);
});
test('independent history and profile publish separately while combined carrier fails closed',async()=>{
 const f=await fixture(),p=await profileFixture(f);
 await accepted(f);await accepted(p);
 f.evidence.interpretation.request.profileFields=['species'];
 const combined=await generate(f);await limited(f,combined);
 assert.deepEqual(combined.relevantContextIds,[]);
});
test('independent profile authority cannot launder support into certified history',async()=>{
 const f=await fixture(),p=await profileFixture(f,['weight']);
 await accepted(p);
 const profile=derivePublicationAuthority(p.evidence);
 assert.ok(profile.authorizedSourceIds.includes('profile:pet-0:weight'));
 assert.ok(!authority(f).authorizedSourceIds.includes('profile:pet-0:weight'));
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:'selection:pet-0:0',
  text:'Aster weighed 30.4 kg.',sourceIds:['profile:pet-0:weight']}]).some(x=>x.startsWith('publication_source_outside_obligation:')));
 f.result.labsList.records[0].sourceId='profile:pet-0:weight';
 refreshPresentation(f.result);await rejected(f);
});
test('certified subject attribution cannot move a same-valued fact to another owned pet',async()=>{
 for(const mutate of [
  labs=>{labs.records.find(r=>r.petId==='pet-0').petId='pet-1';},
  labs=>{labs.petNames['pet-0']='Bramble';},
  labs=>{labs.records.find(r=>r.petId==='pet-0').id='event-1';},
 ]){
  const f=await fixture({sameValue:true});
  assert.ok(f.result.labsList.records.every(r=>r.body.includes('30.31 kg')));
  mutate(f.result.labsList);refreshPresentation(f.result);await rejected(f);
 }
});
test('an invented question date cannot replace the certified event date',async()=>{
 const f=await fixture();
 f.evidence.scope.requestText=f.context.currentMessage='Use September 16, 2026 as the recorded date.';
 f.result=await generate(f);f.evidence=f.result.evidenceContract;
 assert.ok(f.result.labsList.records.every(r=>r.event_at==='2026-09-15T12:00:00Z'));
 await accepted(f);
 f.result.labsList.records[0].event_at='2026-09-16T12:00:00Z';
 refreshPresentation(f.result);await rejected(f);
});
test('changing the authoritative source snapshot invalidates an accepted receipt',async()=>{
 for(const mutate of [
  f=>{f.result.labsList.records[0].body='Changed source body.';},
  f=>{f.evidence.represented.find(s=>s.sourceId==='care:event-0').text='Aster weighed 99 kg.';},
 ]){
  const f=await fixture();await accepted(f);mutate(f);
  assert.equal(readReviewedHistoryAnswer(f.result),null);assert.equal(validate(f).valid,false);
 }
});
