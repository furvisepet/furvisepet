import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const {derivePublicationAuthority,publicationSources,publicationGenerationContext,bindPublicationObligations,
 checkPublicationAuthority,publicationClaimFailures}=await import('../app/lib/intelligence/publication-authority.ts');
const {buildHistoryObligations}=await import('../app/lib/intelligence/history-obligations.ts');
const {buildAskProviderRequest}=await import('../app/lib/ai/ask-reasoning.ts');
const {reviewHistoricalAnswer}=await import('../app/lib/intelligence/review-history-narrative.ts');
const {readReviewedHistoryAnswer,readHistoryReviewDiagnostic,recordHistoryReview,historyReviewSignature}=await import('../app/lib/intelligence/history-review-state.ts');
const {validateGeneratedAnswer}=await import('../app/lib/intelligence/validation/validate-answer.ts');
const names=['Aster','Bramble','Echo'],weights=[30.31,4.71,7.01],profileWeights=[30.4,4.8,7.1];
function fixture(){
 const pets=names.map((name,i)=>({id:'pet-'+i,name,user_id:'owner',species:'dog'}));
 const petIds=pets.map(p=>p.id),eventIds=petIds.map((_,i)=>'event-'+i);
 const ticket={operation:'read',subjectScope:'conversation',subjects:{petIds},needs:[],episode:null,
  temporal:{calendar:null,from:null,to:null,anchor:null},predicates:[{kind:'text_any',terms:['weight','weighed']}],
  outputs:{completeness:'sufficient',ordering:'desc',limit:null},
  selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]}};
 const care=petIds.map((petId,i)=>({sourceId:'care:'+eventIds[i],petId,sourceType:'care_update',field:'value',
  text:names[i]+' weighed '+weights[i]+' kg.',occurredAt:'2026-09-15T12:00:00Z'}));
 const profiles=petIds.flatMap((petId,i)=>[{sourceId:'profile:'+petId+':weight',petId,sourceType:'profile',text:profileWeights[i]+' kg'},
  {sourceId:'profile:'+petId+':species',petId,sourceType:'profile',text:'dog'}]);
 const represented=[...care,...profiles].map(s=>({...s,start:0,end:s.text.length}));
 const coverage={status:'partial',reasons:['no_cross_query_snapshot','subject_scan_not_exhausted'],
  groups:petIds.map((petId,i)=>({petId,clauses:[{direction:'desc',count:1,ids:[eventIds[i]],certified:true}],
   selectedIds:[eventIds[i]],retainedIds:[eventIds[i]],selectionStatus:'complete',blocked:false,reasons:[]})),
  selection:{retainedIds:eventIds},effectiveStream:petIds.map((petId,i)=>({petId,lineageClosed:true,
   replacementSeedsExhausted:true,effectiveIds:[eventIds[i]],certifiedSelectedIds:[eventIds[i]]}))};
 const evidence={version:'ask-evidence.v1',petNames:Object.fromEntries(pets.map(p=>[p.id,p.name])),timeZone:'UTC',
  scope:{authorizedPetIds:petIds,requestText:'Latest recorded weight for these pets, one each.',status:'resolved',readOnlyRecall:true,requestKind:'record_lookup'},
  interpretation:{operation:'recall',readOperation:'recall',readOnly:true,petIds,request:{readTicket:ticket,mode:'read',quantity:'measurement',
   evidenceBasis:'saved_history',question:'Latest recorded weight for these pets, one each.',requirements:[],referenceTurnIds:['context-turn'],outputFormat:'prose',
   projection:{quantity:'body_mass',unit:'kg',order:'scope',nameHeader:'Pet',valueHeader:'Weight'},profileFields:[]}},
  history:{ticketCoverage:coverage,provenance:[],perPet:[],needs:[],candidateIds:care.map(c=>c.sourceId),eventCandidateIds:care.map(c=>c.sourceId),
   claimSources:[],excludedIds:[],continuation:[],retrieval:'partial',corrections:'complete',reasons:coverage.reasons},
  sources:petIds.flatMap((petId,i)=>[{petId,source:'care_entries',status:'loaded',loadedIds:[care[i].sourceId]},
   {petId,source:'profile',status:'loaded',loadedIds:[petId]}]),represented,losses:[],representation:'complete',verifiedFacts:[],
  completeness:{retrieval:'partial',corrections:'complete',extraction:'complete',grouping:'complete'}};
 return {evidence,pets,care,profiles,eventIds,context:{currentMessage:evidence.scope.requestText,pet:pets[0],eligiblePets:pets,careEntries:[],memories:[]}};
}
const sentence=(f,i,value=weights[i],sourceId=f.care[i].sourceId)=>({
 text:names[i]+' was recorded at '+value+' kg on September 15, 2026.',sourceIds:[sourceId]});
function result(f,sentences=f.care.map((_,i)=>sentence(f,i))){
 return {evidenceContract:f.evidence,historyNarrative:{sentences},historyNarrativeDeclined:false,
  answer:{title:'Furvise',summary:sentences.map(s=>s.text).join('\n'),sections:[],safetyNote:null},
  relevantContextIds:sentences.flatMap(s=>s.sourceIds),applicationActions:[],careActions:[],learnings:[],
  proposedHistoryUpdate:{shouldOffer:false},safetyLevel:'normal',responseMode:'practical_guidance',suggestedFollowUps:[]};
}
function approved(input){
 const n=input.draft.sentences.length;
 return {approved:true,rejectionReason:null,actionVerdicts:[],independentSentenceSupport:Array(n).fill(true),
  obligations:Object.fromEntries(input.obligations.map(o=>['obligation_'+o.index,{status:'answered',
   sentenceSupport:input.draft.sentences.map((s,i)=>o.index===0||o.petId==='pet-'+(i%3)),actionSupport:[]}]))};
}
function provider(fn){
 const calls=[];
 return {calls,client:{responses:{create:async request=>{const input=JSON.parse(request.input);calls.push({request,input});
  return {status:'completed',output_text:JSON.stringify(fn(input,request,calls.length)),usage:{input_tokens:1,output_tokens:1}};}}}};
}
function boundCheck(f,sentences){
 const bound=bindPublicationObligations(f.evidence,buildHistoryObligations(f.evidence));
 const completion=bound.obligations.map(o=>({index:o.index,status:'answered',sentenceIndexes:sentences.flatMap((s,i)=>o.index===0||o.petId==='pet-'+(i%3)?[i]:[]),sourceIds:[]}));
 return checkPublicationAuthority(f.evidence,bound.bindings,sentences,completion);
}
test('derived source authority excludes profile alternatives from certified history',()=>{
 const f=fixture(),before=JSON.stringify(f.evidence),a=derivePublicationAuthority(f.evidence);
 assert.deepEqual(a.authorizedSourceIds,f.care.map(s=>s.sourceId));
 assert.ok(a.obligations.every(o=>o.authority==='certified'&&o.certificateType==='selection'));
 assert.equal(JSON.stringify(f.evidence),before);
});
test('generation payload and provider source enums contain only certificate-authorized facts',()=>{
 const f=fixture();const request=buildAskProviderRequest({evidenceContract:f.evidence,pets:f.pets,
  contextRecords:f.evidence.represented,secretAlternateProfile:{weight:30.4},conversation:[{text:'other source 99 kg'}]});
 const input=JSON.parse(request.input);
 assert.deepEqual(input.contextRecords.map(s=>s.id),f.care.map(s=>s.sourceId));
 for(const value of profileWeights)assert.ok(!request.input.includes(value+' kg'));
 assert.equal(input.secretAlternateProfile,undefined);assert.equal(input.conversation,undefined);
 const schema=JSON.stringify(request.text.format.schema);assert.ok(!schema.includes('profile:pet-0:weight'));
 assert.ok(schema.includes('care:event-0'));assert.equal(input.publicationAuthority.length,3);
});
test('A2 profile substitution is rejected even if a reviewer approves it',async()=>{
 const f=fixture(),r=result(f,f.care.map((_,i)=>sentence(f,i,profileWeights[i],'profile:pet-'+i+':weight')));
 const p=provider(approved);assert.equal(await reviewHistoricalAnswer({result:r,client:p.client,repairAttempted:true}),false);
 assert.equal(readReviewedHistoryAnswer(r),null);assert.ok(p.calls.length<=1);
 assert.equal(validateGeneratedAnswer(r,f.context,'normal',f.pets.map(p=>p.id)).valid,false);
});
test('same numeric value in profile still cannot satisfy a history obligation',()=>{
 const f=fixture();f.evidence.represented.filter(s=>s.sourceType==='profile'&&s.sourceId.endsWith(':weight')).forEach((s,i)=>{s.text=weights[i]+' kg';s.end=s.text.length;});
 const check=boundCheck(f,f.care.map((_,i)=>sentence(f,i,weights[i],'profile:pet-'+i+':weight')));
 assert.ok(check.failures.some(x=>x.startsWith('publication_source_outside_obligation:')));
});
test('genuine profile-only work retains the existing profile evidence policy',()=>{
 const f=fixture();delete f.evidence.interpretation.request.readTicket;
 f.evidence.interpretation.request.evidenceBasis='saved_profile';f.evidence.interpretation.request.profileFields=['species','weight'];
 assert.equal(derivePublicationAuthority(f.evidence),null);
 assert.ok(publicationSources(f.evidence).some(s=>s.sourceId==='profile:pet-0:weight'));
 const original={contextRecords:f.profiles};assert.equal(publicationGenerationContext(f.evidence,original),original);
});
test('mixed history and species keep separate source sets and reject crossing them',()=>{
 const f=fixture();f.evidence.interpretation.request.profileFields=['species'];
 const a=derivePublicationAuthority(f.evidence);
 assert.ok(a.authorizedSourceIds.includes('profile:pet-0:species'));
 assert.ok(!a.authorizedSourceIds.includes('profile:pet-0:weight'));
 const claims=[{obligationId:'selection:pet-0:0',...sentence(f,0)},
  {obligationId:'profile:pet-0:species',text:'Aster is a dog.',sourceIds:['profile:pet-0:species']}];
 assert.deepEqual(publicationClaimFailures(f.evidence,claims),[]);
 claims[0].sourceIds=['profile:pet-0:species'];
 assert.ok(publicationClaimFailures(f.evidence,claims).some(x=>x.startsWith('publication_source_outside_obligation:')));
});
test('certified numeric and date drift fail despite correct event IDs',()=>{
 for(const text of ['Aster was recorded at 30.4 kg.','Aster weighed 30.31 kg on September 16, 2026.']){
  const f=fixture(),claims=[{obligationId:'selection:pet-0:0',text,sourceIds:['care:event-0']}];
  assert.ok(publicationClaimFailures(f.evidence,claims).some(x=>x.startsWith('publication_certified_fact_drift:')));
 }
});
test('cross-subject source bindings are rejected',()=>{
 const f=fixture();
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:'selection:pet-0:0',...sentence(f,1)}]).length);
});
test('correct historical records can pass model review with bound receipts',async()=>{
 const f=fixture(),r=result(f),p=provider(approved);
 assert.equal(await reviewHistoricalAnswer({result:r,client:p.client}),true,JSON.stringify(readHistoryReviewDiagnostic(r)));
 assert.equal(p.calls.length,1);const receipt=readReviewedHistoryAnswer(r);assert.ok(receipt);
 assert.equal(receipt.authorityClaims.length,3);
 assert.deepEqual(receipt.sourceIds.sort(),f.care.map(s=>s.sourceId).sort());
 const validated=validateGeneratedAnswer(r,f.context,'normal',f.pets.map(p=>p.id));
 assert.equal(validated.valid,true,JSON.stringify(validated.errors));
 assert.equal(validated.response.answer.summary,receipt.text);
});
test('legacy publication receipt without obligation proof cannot bypass final validation',()=>{
 const f=fixture(),r=result(f);
 recordHistoryReview(r,{signature:historyReviewSignature(r),text:r.answer.summary,sourceIds:f.care.map(s=>s.sourceId)});
 assert.equal(readReviewedHistoryAnswer(r),null);
 assert.equal(validateGeneratedAnswer(r,f.context,'normal',f.pets.map(p=>p.id)).valid,false);
});
test('repair cannot widen the authorized source set',async()=>{
 const f=fixture(),r=result(f);let reviewCalls=0,repairCalls=0;
 const p=provider((input,request)=>{
  if(request.text.format.name==='furvise_history_repair'){
   repairCalls++;assert.ok(input.contextRecords.every(s=>s.sourceType==='care_update'));
   assert.equal(input.publicationAuthority.filter(o=>o.authority==='certified').length,3);
   return {readVersion:'history-answer.v1',layout:'prose',table:null,json:null,limitation:null,navigationActions:null,
    historyNarrative:{sentences:f.care.map((_,i)=>({...sentence(f,i,profileWeights[i],'profile:pet-'+i+':weight'),calculations:[]}))},
    safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:[]};
  }
  reviewCalls++;const approval=approved(input);
  if(reviewCalls===1){approval.approved=false;approval.rejectionReason='Rephrase the answer.';}
  return approval;
 });
 assert.equal(await reviewHistoricalAnswer({result:r,client:p.client}),false);
 assert.equal(repairCalls,1);assert.equal(readReviewedHistoryAnswer(r),null);
 assert.ok(p.calls.every(c=>c.input.sources?.every(s=>s.sourceType==='care_update')??true));
});
test('lost selected source cannot reopen profile authority',()=>{
 const f=fixture();f.evidence.represented=f.evidence.represented.filter(s=>s.sourceType!=='care_update');
 const a=derivePublicationAuthority(f.evidence);assert.ok(a);assert.ok(a.obligations.every(o=>o.status==='unavailable'));
 assert.equal(a.sources.length,0);
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:'selection:pet-0:0',...sentence(f,0)}]).length);
});
test('uncertified history does not acquire a certificate',()=>{
 const f=fixture();f.evidence.history.ticketCoverage.groups.forEach(g=>{g.blocked=true;g.clauses[0].certified=false;g.selectionStatus='partial';});
 assert.equal(derivePublicationAuthority(f.evidence),null);
});
test('unassigned factual chunks and omitted selected records cannot pass authority review',()=>{
 const f=fixture(),bound=bindPublicationObligations(f.evidence,buildHistoryObligations(f.evidence));
 const check=checkPublicationAuthority(f.evidence,bound.bindings,[sentence(f,0)],[
  {index:0,status:'answered',sentenceIndexes:[0],sourceIds:['care:event-0']}]);
 assert.ok(check.failures.some(x=>x.startsWith('publication_claim_obligation_unbound:')));
 assert.ok(check.failures.some(x=>x.startsWith('publication_obligation_unreviewed:')));
});
test('alternate topic uses the same derived binding and literal guards',()=>{
 const f=fixture();f.evidence.interpretation.request.readTicket.predicates=[{kind:'text_any',terms:['medication']}];
 const source=f.evidence.represented.find(s=>s.sourceId==='care:event-0');source.text='Aster medication record: 5 mg.';source.end=source.text.length;
 assert.deepEqual(publicationClaimFailures(f.evidence,[{obligationId:'selection:pet-0:0',text:'Aster had a recorded 5 mg medication entry.',sourceIds:['care:event-0']}]),[]);
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:'selection:pet-0:0',text:'Aster had a recorded 6 mg medication entry.',sourceIds:['care:event-0']}]).length);
});

test('mixed historical selections and legitimate profile species pass independent review',async()=>{
 const f=fixture();f.evidence.interpretation.request.profileFields=['species'];
 const r=result(f,[...f.care.map((_,i)=>sentence(f,i)),
  ...names.map((name,i)=>({text:name+' is a dog.',sourceIds:['profile:pet-'+i+':species']}))]);
 const p=provider(input=>{
  const approval=approved(input);
  for(const o of input.obligations){
   if(o.index===0)continue;
   const binding=input.publicationAuthority.find(b=>b.subjectId===o.petId&&
    (o.text.includes('stored profile field')?b.profileField==='species':b.certificateType==='selection'));
   if(binding)approval.obligations['obligation_'+o.index].sentenceSupport=input.draft.sentences.map(s=>
    s.sourceIds.every(id=>binding.authorizedSourceIds.includes(id)));
  }
  return approval;
 });
 assert.equal(await reviewHistoricalAnswer({result:r,client:p.client,repairAttempted:true}),true,JSON.stringify(readHistoryReviewDiagnostic(r)));
 assert.equal(readReviewedHistoryAnswer(r).authorityClaims.length,6);
});
test('a valid independent profile obligation cannot launder profile support into certified history',async()=>{
 const f=fixture();f.evidence.interpretation.request.profileFields=['weight'];
 const r=result(f,f.care.map((_,i)=>({text:names[i]+' latest recorded weight was '+profileWeights[i]+' kg.',sourceIds:['profile:pet-'+i+':weight']})));
 const p=provider(approved);
 assert.equal(await reviewHistoricalAnswer({result:r,client:p.client,repairAttempted:true}),false);
 assert.equal(p.calls.length,1);
 assert.equal(readReviewedHistoryAnswer(r),null);
});
test('certified subject attribution cannot move a same-valued fact to another owned pet',()=>{
 const f=fixture();
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:'selection:pet-0:0',
  text:'Bramble was recorded at 30.31 kg.',sourceIds:['care:event-0']}]).includes('publication_certified_subject_drift:selection:pet-0:0'));
});
test('an invented question date is not authority for a certified event date',()=>{
 const f=fixture();f.evidence.scope.requestText='Was the latest record on September 16, 2026?';
 assert.ok(publicationClaimFailures(f.evidence,[{obligationId:'selection:pet-0:0',
  text:'Aster weighed 30.31 kg on September 16, 2026.',sourceIds:['care:event-0']}]).length);
});
test('changing the source snapshot invalidates an approved model receipt',async()=>{
 const f=fixture(),r=result(f),p=provider(approved);
 assert.equal(await reviewHistoricalAnswer({result:r,client:p.client}),true);
 f.evidence.represented.find(s=>s.sourceId==='care:event-0').text='Aster weighed 99 kg.';
 assert.equal(readReviewedHistoryAnswer(r),null);
 assert.equal(validateGeneratedAnswer(r,f.context,'normal',f.pets.map(p=>p.id)).valid,false);
});
