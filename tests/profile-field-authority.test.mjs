import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const {buildAskContext,generateContextAwareAskResponse}=await import('../app/lib/ai/ask-reasoning.ts');
const {askRequestProviderSchema}=await import('../app/lib/intelligence/ask-request-contract.ts');
const {evidenceSource}=await import('../app/lib/intelligence/ask-evidence.ts');
const {derivePublicationAuthority,publicationClaimFailures,publicationGenerationContext}=await import('../app/lib/intelligence/publication-authority.ts');
const {profileFieldProjection,profileFieldSentence,isTypedProfileRead}=await import('../app/lib/intelligence/profile-field-authority.ts');
const {PROFILE_PRESENTATION_UNAVAILABLE,PROFILE_PRESENTATION_LIMITATION,profilePresentationLimitationFailure}=await import('../app/lib/intelligence/profile-presentation-limitation.ts');
const {readReviewedHistoryAnswer,recordHistoryReview,historyReviewSignature}=await import('../app/lib/intelligence/history-review-state.ts');
const {labsPresentation}=await import('../app/lib/intelligence/labs-presentation.ts');
const {buildProfileFieldLabs,serializeProfileFieldLabs,profileFieldLabsReviewFailure}=await import('../app/lib/intelligence/profile-field-labs.ts');
const {reviewHistoricalAnswer}=await import('../app/lib/intelligence/review-history-narrative.ts');
const {validateGeneratedAnswer}=await import('../app/lib/intelligence/validation/validate-answer.ts');
const noProvider={responses:{create:async()=>{throw Error('NO_PROVIDER_FOR_PROFILE_FIELDS');}}};
const pet={id:'pet-a',user_id:'owner',name:'Milo',species:'dog',sex:'male',breed:'Saved breed label',weight_value:4.71,weight_unit:'kg',updated_at:'2026-09-01T00:00:00Z'};
function fixture({fields=['weight'],profile=pet,question='Saved profile field',format='prose',omitFormat=false,rows,scope=['pet-a'],source=true}={}){
 const evidence={version:'ask-evidence.v1',petNames:{'pet-a':'Milo','pet-b':'Other'},
 scope:{authorizedPetIds:scope,requestText:question,status:'resolved',readOnlyRecall:true,requestKind:'ordinary'},
 interpretation:{operation:'recall',readOperation:'recall',petIds:scope,readOnly:true,request:{mode:'read',evidenceBasis:'saved_profile',profileFields:fields,referenceTurnIds:[],requirements:[],readTicket:null,outputFormat:format}},
 sources:source?[evidenceSource('pet-a','profile',['pet-a'])]:[],represented:[],losses:[],verifiedFacts:[],
 completeness:{retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown'},representation:'complete'};
 if(omitFormat)delete evidence.interpretation.request.outputFormat;
 const input={profiles:rows||[profile],question,careEntries:[],recentUpdates:[],memories:[],productFeedback:[],conversationTurns:[],evidenceContract:evidence,client:noProvider};
 const context=buildAskContext(input,false),e=context.promptContext.evidenceContract;
 return {input,e,p:profileFieldProjection(e),context};
}
function field(f){return f.p.fields[0];}
function claims(f,text,ids){const o=derivePublicationAuthority(f.e).obligations[0];return publicationClaimFailures(f.e,[{obligationId:o.obligationId,text,sourceIds:ids??o.authorizedSourceIds}]);}
test('provider grammar makes incompatible saved-profile dimensions unrepresentable',async()=>{
 const {default:Ajv}=await import('ajv');const validate=new Ajv({allErrors:true}).compile(askRequestProviderSchema({}));
 const request={appendJob:null,readTicket:null,writeJob:null,task:null,temporalScope:'current',mutationIntent:null,recordSelection:null,
  profileFields:['weight'],projection:null,version:'ask-request.v2',mode:'read',question:"What is Milo's saved profile weight?",requirements:[],
  evidenceNeeds:[],outputFormat:null,evidenceBasis:'saved_profile',premiseQuotes:[],excludedPetNames:[],referenceTurnIds:[],scope:'named',petNames:['Milo'],
  operation:'recall',selection:'summary',quantity:null,topic:'profile',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null};
 assert.equal(validate({request}),true,JSON.stringify(validate.errors));
 assert.equal(validate({request:{...request,outputFormat:'json'}}),true,JSON.stringify(validate.errors));
 assert.equal(validate({request:{...request,outputFormat:'csv'}}),true,JSON.stringify(validate.errors));
 assert.equal(validate({request:{...request,outputFormat:'compact'}}),false);
 for(const patch of [{quantity:'records'},{from:'2026-01-01'},{terms:['weight']},{mutationIntent:'correct_record'},{scope:'none'},{profileFields:[]},{frame:{}}])
  assert.equal(validate({request:{...request,...patch}}),false,JSON.stringify(patch));
 const general={...request,temporalScope:null,profileFields:[],mode:'conversation',scope:'none',petNames:[],operation:'general',evidenceBasis:'general'};
 assert.equal(validate({request:general}),true,JSON.stringify(validate.errors));
});
for(const key of ['name','species','sex','breed'])test('same canonical authority for saved '+key,()=>{
 const f=fixture({fields:[key]});assert.equal(field(f).storedValue,pet[key]);assert.equal(field(f).state,'present');
 assert.deepEqual(derivePublicationAuthority(f.e).authorizedSourceIds,['profile:pet-a:'+key]);
 assert.deepEqual(claims(f,profileFieldSentence(field(f),'Milo')),[]);
});
test('explicit not_sure is a stored enum, not a guessed sex',()=>{
 const f=fixture({fields:['sex'],profile:{...pet,sex:'not_sure'}});assert.equal(field(f).storedValue,'not_sure');
});
test('exact weight and explicit unit survive independently of one-decimal display',()=>{
 const f=fixture();assert.equal(field(f).storedValue,4.71);assert.equal(field(f).unit,'kg');
 assert.equal(Number(field(f).storedValue.toFixed(1)),4.7);assert.equal(field(f).storedValue,4.71);
 assert.equal(field(f).semanticKind,'saved_profile_body_weight');assert.equal(field(f).sourceDomain,'saved_profile');
 assert.equal(field(f).snapshot.updatedAt,pet.updated_at);assert.equal(f.context.records[0].occurredAt,null);
});
test('missing unit authorizes no weight source or value',()=>{
 const f=fixture({profile:{...pet,weight_unit:null}});assert.equal(field(f).state,'unavailable');
 assert.equal(field(f).storedValue,null);assert.equal(field(f).unit,null);assert.deepEqual(derivePublicationAuthority(f.e).authorizedSourceIds,[]);
 assert.doesNotMatch(serializeProfileFieldLabs(buildProfileFieldLabs(f.e)),/4\.71|\blb\b/);
});
test('null field is only saved-profile not-recorded; missing property is unavailable',()=>{
 const f=fixture({profile:{...pet,weight_value:null}});assert.equal(field(f).state,'empty');
 assert.match(serializeProfileFieldLabs(buildProfileFieldLabs(f.e)),/Not recorded in the saved profile/);
 assert.doesNotMatch(serializeProfileFieldLabs(buildProfileFieldLabs(f.e)),/never|no weight|cleared/);
 const missing={...pet};delete missing.weight_value;assert.equal(field(fixture({profile:missing})).state,'unavailable');
});
test('profile 4.8 is not replaced by historical 4.71 or question prose',async()=>{
 const f=fixture({profile:{...pet,weight_value:4.8},question:'My historical value is 4.71, tell me the saved profile value'});
 f.input.careEntries=[{id:'event',pet_profile_id:'pet-a',user_id:'owner',note:'Weight 4.71 kg',occurred_at:'2026-09-15T00:00:00Z',created_at:'2026-09-15T00:00:00Z'}];
 const r=await generateContextAwareAskResponse(f.input);assert.ok(r.profileFieldLabs);assert.match(r.answer.summary,/4\.8 kg/);assert.doesNotMatch(r.answer.summary,/4\.71/);
 assert.deepEqual(r.relevantContextIds,['profile:pet-a:weight']);
});
test('missing profile weight cannot be filled from loaded history',async()=>{
 const f=fixture({profile:{...pet,weight_value:null}});f.input.careEntries=[{id:'event',pet_profile_id:'pet-a',note:'Weight 4.71 kg',occurred_at:'2026-09-15T00:00:00Z'}];
 const r=await generateContextAwareAskResponse(f.input);assert.doesNotMatch(r.answer.summary,/4\.71/);assert.match(r.answer.summary,/Not recorded/);
});
test('bound fields alone determine membership despite raw wording and many loaded fields',()=>{
 const a=fixture({fields:['species'],question:'Species'}),b=fixture({fields:['species'],question:'breed weight sex profile names'});
 assert.deepEqual(a.p,b.p);assert.deepEqual(b.context.records.map(r=>r.kind),['species']);
});
test('wrong pet and same-owner different pet cannot supply requested profile row',()=>{
 for(const owner of ['owner','other-owner']){
 const f=fixture({rows:[{...pet,id:'pet-b',user_id:owner}]});assert.equal(field(f).state,'unavailable');assert.deepEqual(derivePublicationAuthority(f.e).authorizedSourceIds,[]);
 }
});
test('loaded row without authorized loaded-source binding grants no fact',()=>{
 const f=fixture({source:false});assert.equal(field(f).state,'unavailable');assert.deepEqual(derivePublicationAuthority(f.e).authorizedSourceIds,[]);
});
test('supported profile formats preserve authority and fulfill deterministic presentation',async()=>{
 const fields=['species','weight'],base=fixture({fields}),expected=derivePublicationAuthority(base.e);
 for(const format of ['prose','bullets','table',null,undefined]){
  const f=fixture({fields,format,omitFormat:format===undefined}),labs=buildProfileFieldLabs(f.e);
  assert.ok(labs);assert.deepEqual(labs.projection,base.p);
  assert.deepEqual(derivePublicationAuthority(f.e).authorizedSourceIds,expected.authorizedSourceIds);
  assert.deepEqual(f.p.fields.map(x=>[x.subjectId,x.fieldSelector,x.storedValue,x.unit,x.sourceDomain]),
   [['pet-a','species','dog',null,'saved_profile'],['pet-a','weight',4.71,'kg','saved_profile']]);
  const text=serializeProfileFieldLabs(labs);assert.match(text,/4\.71 kg/);assert.match(text,/dog/);
  if(format==='table'){
   assert.match(text,/^\| Pet \| Saved profile field \| Saved value \|\n\| --- \| --- \| --- \|/);
   assert.match(text,/\| Milo \| weight \| 4\.71 kg \|/);
  }else if(format==='bullets'){
   assert.equal(text.split('\n').length,2);assert.ok(text.split('\n').every(line=>line.startsWith('- ')));
  }else{
   assert.equal(text.split('\n\n').length,2);assert.doesNotMatch(text,/^[-|]/m);
  }
  let calls=0;f.input.client={responses:{create:async()=>{calls++;throw Error('PROFILE_FORMAT_PROVIDER_FORBIDDEN');}}};
  const r=await generateContextAwareAskResponse(f.input);
  assert.equal(calls,0);assert.equal(r.model,'server-profile-field-labs');assert.equal(r.answer.summary,text);
  assert.deepEqual(r.profileFieldLabs.projection,base.p);assert.deepEqual(r.relevantContextIds,expected.authorizedSourceIds);
  assert.equal(profileFieldLabsReviewFailure(r),null);
  assert.equal(await reviewHistoricalAnswer({result:r,client:f.input.client}),true);
  const v=validateGeneratedAnswer(r,{pet,eligiblePets:[pet],currentMessage:f.input.question,memories:[],careEntries:[]},'routine',['pet-a']);
  assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'complete');assert.equal(calls,0);
  assert.deepEqual(derivePublicationAuthority(v.response.evidenceContract).authorizedSourceIds,expected.authorizedSourceIds);
 }
});
test('unsupported typed and invalid internal formats have no profile Labs renderer',()=>{
 for(const format of ['csv','json','compact']){
  const f=fixture({fields:['species','weight'],format});
  assert.equal(labsPresentation(format),null);assert.equal(buildProfileFieldLabs(f.e),null);
 }
});
test('unsupported profile presentation cannot reopen factual generation',async()=>{
 const fields=['species','weight'],base=fixture({fields}),expected=derivePublicationAuthority(base.e);
 for(const format of ['csv','json','compact']){
  const f=fixture({fields,format});
  assert.deepEqual(f.p,base.p,'Presentation must not destroy typed profile authority: '+format);
  const authority=derivePublicationAuthority(f.e);
  assert.deepEqual(authority.authorizedSourceIds,expected.authorizedSourceIds);
  assert.ok(authority.obligations.every(o=>o.sourceDomain==='saved_profile'));
  assert.equal(buildProfileFieldLabs(f.e),null);
  let calls=0;f.input.client={responses:{create:async()=>{calls++;throw Error('UNSUPPORTED_PROFILE_PROVIDER_FORBIDDEN');}}};
  let r;
  try{r=await generateContextAwareAskResponse(f.input);}
  catch(error){assert.equal(calls,0,'Unsupported '+format+' attempted factual provider generation');throw error;}
  assert.equal(calls,0);assert.equal(r.model,PROFILE_PRESENTATION_UNAVAILABLE);
  assert.equal(r.answer.summary,PROFILE_PRESENTATION_LIMITATION);assert.equal(profilePresentationLimitationFailure(r),null);
  assert.deepEqual(r.relevantContextIds,[],'Unsupported '+format+' reopened facts through '+r.model);
  assert.equal(r.referencedRecords?.length||0,0);assert.equal(r.profileFieldLabs,undefined);
  assert.equal(r.labsList,undefined);assert.doesNotMatch(r.answer.summary,/4\.71|\bdog\b/);
  assert.deepEqual(derivePublicationAuthority(r.evidenceContract).authorizedSourceIds,expected.authorizedSourceIds);
  assert.equal(await reviewHistoricalAnswer({result:r,client:f.input.client}),true);assert.equal(calls,0);
  const v=validateGeneratedAnswer(r,{pet,eligiblePets:[pet],currentMessage:f.input.question,memories:[],careEntries:[]},'routine',['pet-a']);
  assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'limited');
  assert.deepEqual(derivePublicationAuthority(v.response.evidenceContract).authorizedSourceIds,expected.authorizedSourceIds);
  assert.deepEqual(readReviewedHistoryAnswer(v.response).sourceIds,[]);
  assert.equal(v.response.evidenceContract.history,undefined);
  assert.equal(v.response.intelligenceMetadata.usedCareHistory,false);
 }
});
test('model cannot substitute history, another field, or another pet source',()=>{
 const f=fixture();for(const source of ['care:event','profile:pet-a:species','profile:pet-b:weight'])
 assert.ok(claims(f,'Milo ? saved profile weight: 4.71 kg',[source]).some(x=>x.startsWith('publication_source_outside_obligation')));
});
test('model cannot drift exact number, unit, enum or claim real-world absence',()=>{
 for(const text of ['Milo ? saved profile weight: 4.7 kg','Milo ? saved profile weight: 4.71 lb','Milo has no weight.'])
 assert.ok(claims(fixture(),text).length);
 const f=fixture({fields:['species']});assert.ok(claims(f,'Milo ? saved profile species: cat').length);
});
test('generation payload is rebuilt from authorized projections without hidden alternatives',()=>{
 const f=fixture({fields:['species']});const p=publicationGenerationContext(f.e,{profiles:[pet],history:'4.71',proposedWeight:9});
 assert.deepEqual(p.contextRecords.map(r=>r.sourceId),['profile:pet-a:species']);assert.equal(p.profiles,undefined);
 assert.equal(p.history,undefined);assert.equal(p.proposedWeight,undefined);
});
test('proposed update is not state; committed reloaded value yields different snapshot',()=>{
 const a=fixture();a.input.applicationActions=[{type:'pet.update_profile',payload:{weight_value:9}}];
 assert.equal(field(a).storedValue,4.71);const b=fixture({profile:{...pet,weight_value:9,updated_at:'2026-09-22T00:00:00Z'}});
 assert.equal(field(b).storedValue,9);assert.notEqual(field(a).snapshot.contentId,field(b).snapshot.contentId);
 pet.weight_value=99;assert.equal(field(a).storedValue,4.71);pet.weight_value=4.71;
});
test('changed projection or represented value and serialized copy cannot mint authority',()=>{
 const a=fixture();field(a).storedValue=9;assert.throws(()=>derivePublicationAuthority(a.e),/SNAPSHOT_CHANGED/);
 const b=fixture();b.e.represented[0].text='9 kg';assert.throws(()=>derivePublicationAuthority(b.e),/SNAPSHOT_CHANGED/);
 assert.throws(()=>derivePublicationAuthority(structuredClone(fixture().e)),/SNAPSHOT_CHANGED/);
});
test('unmigrated fields and mixed selectors stay outside this projection',()=>{
 for(const key of ['age','lifecycle_status','current_food','monthly_budget','avoid']){
 const f=fixture({fields:['species',key]});assert.equal(f.p,null);assert.equal(isTypedProfileRead(f.e),false);
 }
});
test('deterministic Labs generation/review/final validation uses no provider',async()=>{
 const f=fixture({fields:['name','species','sex','breed','weight'],format:'table'}),r=await generateContextAwareAskResponse(f.input);
 assert.equal(r.model,'server-profile-field-labs');assert.equal(profileFieldLabsReviewFailure(r),null);
 assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),true);
 const v=validateGeneratedAnswer(r,{pet,eligiblePets:[pet],currentMessage:f.input.question,memories:[],careEntries:[]},'routine',['pet-a']);
 assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'complete');assert.equal(profileFieldLabsReviewFailure(v.response),null);
 assert.deepEqual(v.response.applicationActions,[]);assert.deepEqual(v.response.careActions,[]);
});
test('renderer tampering and proposed writes cannot pass deterministic review',async()=>{
 const f=fixture();const r=await generateContextAwareAskResponse(f.input);r.answer.summary=r.answer.summary.replace('4.71','4.7');
 assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),false);
 const other=await generateContextAwareAskResponse(f.input);other.applicationActions.push({type:'pet.update_profile'});
 assert.equal(await reviewHistoricalAnswer({result:other,client:noProvider}),false);
});

const limitationContext=f=>({pet,eligiblePets:[pet],currentMessage:f.input.question,memories:[],careEntries:[]});
for(const [name,mutate] of [
 ['profile value',r=>{r.answer.summary+=' 4.71 kg';}],
 ['other factual claim',r=>{r.answer.sections.push({heading:'Fact',body:'This pet is a dog.'});}],
 ['source IDs',r=>{r.relevantContextIds.push('profile:pet-a:weight');}],
 ['profile source',r=>{r.referencedRecords.push({id:'profile:pet-a:weight',sourceType:'profile',value:'4.71 kg'});}],
 ['history source',r=>{r.referencedRecords.push({id:'care:event',sourceType:'care_update',value:'9 kg'});}],
 ['application action',r=>{r.applicationActions.push({type:'pet.update_profile'});}],
 ['care action',r=>{r.careActions.push({kind:'save'});}],
 ['semantic event',r=>{r.semanticEvents.push({kind:'observation'});}],
 ['learning',r=>{r.learnings.push({value:'dog'});}],
 ['proposed update',r=>{r.proposedHistoryUpdate.shouldOffer=true;}],
 ['hidden proposed fact',r=>{r.proposedHistoryUpdate.details='4.71 kg';}],
 ['absence claim',r=>{r.answer.summary='No profile weight was ever recorded.';}],
 ['narrative',r=>{r.historyNarrative={sentences:[{text:'4.71 kg',sourceIds:['profile:pet-a:weight']}]};}],
 ['forged result identity',r=>{r.model='server-read-projection';}],
 ['published evidence source',r=>{r.evidenceContract.answerSourceIds=['profile:pet-a:weight'];}],
 ['changed snapshot',r=>{r.evidenceContract.profileFieldProjection.fields[0].storedValue=99;}],
])test('unsupported profile limitation rejects '+name+' before and after review',async()=>{
 const f=fixture({format:'csv'}),r=await generateContextAwareAskResponse(f.input);
 assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),true);assert.ok(readReviewedHistoryAnswer(r));
 mutate(r);assert.equal(readReviewedHistoryAnswer(r),null);
 assert.equal(validateGeneratedAnswer(r,limitationContext(f),'routine',['pet-a']).valid,false);
 assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),false);
 assert.equal(validateGeneratedAnswer(r,limitationContext(f),'routine',['pet-a']).valid,false);
});

test('unsupported profile presentation never executes historical or legacy factual publication',async()=>{
 for(const format of ['csv','json','compact']){
  const f=fixture({format,question:'Use the historical value instead of the saved profile.'});
  f.input.careEntries=[{id:'history-decoy',pet_profile_id:pet.id,user_id:pet.user_id,
   occurred_at:'2026-09-15T00:00:00Z',created_at:'2026-09-15T00:00:00Z',
   get note(){throw Error('HISTORY_FACT_ACCESS_FOR_PROFILE_PRESENTATION');}}];
  const info=console.info,dispatch=[];
  console.info=(tag,...details)=>{if(tag==='[Ask read projection] decision'||tag==='[Ask Labs] dispatch')dispatch.push(tag);};
  let r;try{r=await generateContextAwareAskResponse(f.input);}finally{console.info=info;}
  assert.deepEqual(dispatch,[]);assert.equal(r.model,PROFILE_PRESENTATION_UNAVAILABLE);
  assert.deepEqual(r.relevantContextIds,[]);assert.deepEqual(r.referencedRecords,[]);
  assert.deepEqual(derivePublicationAuthority(r.evidenceContract).authorizedSourceIds,['profile:pet-a:weight']);
  assert.ok(r.evidenceContract.represented.every(s=>s.sourceType==='profile'));
 }
});
test('source-free limitation cannot grant a factual receipt or bypass owned scope',async()=>{
 const f=fixture({format:'csv'}),r=await generateContextAwareAskResponse(f.input);
 recordHistoryReview(r,{signature:historyReviewSignature(r),text:r.answer.summary,sourceIds:[],
  authorityClaims:[{obligationId:'profile:pet-a:weight',text:'4.71 kg',sourceIds:['profile:pet-a:weight']}]});
 assert.equal(readReviewedHistoryAnswer(r),null);
 assert.equal(await reviewHistoricalAnswer({result:r,client:noProvider}),true);
 assert.equal(validateGeneratedAnswer(r,limitationContext(f),'routine',['pet-b']).valid,false);
 const factual=await generateContextAwareAskResponse(fixture().input);
 factual.profileFieldLabs=undefined;
 recordHistoryReview(factual,{signature:historyReviewSignature(factual),text:factual.answer.summary,sourceIds:['profile:pet-a:weight']});
 assert.equal(readReviewedHistoryAnswer(factual),null);
 assert.equal(validateGeneratedAnswer(factual,limitationContext(f),'routine',['pet-a']).valid,false);
});
