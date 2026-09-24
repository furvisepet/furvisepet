import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fixture,id} from './helpers/canonical-replace.mjs';
const {bindStoredRead,storedReadDigest}=await import('../app/lib/furvise-brain/stored-read.ts');
const {executeStoredRead,loadStoredReadReferences}=await import('../app/lib/furvise-brain/stored-read-organ.ts');
const {bindStoredReadEvidence,storedReadPublicationFailure,STORED_READ_LIMITATION}=await import('../app/lib/intelligence/stored-read-publication.ts');
const {validateAskRequest,askRequestProviderSchema}=await import('../app/lib/intelligence/ask-request-contract.ts');
const {generateContextAwareAskResponse,buildAskContext}=await import('../app/lib/ai/ask-reasoning.ts');
const {reviewHistoricalAnswer}=await import('../app/lib/intelligence/review-history-narrative.ts');
const {readReviewedHistoryAnswer}=await import('../app/lib/intelligence/history-review-state.ts');
const {validateGeneratedAnswer}=await import('../app/lib/intelligence/validation/validate-answer.ts');
const {reviewTaskCompletion}=await import('../app/lib/intelligence/review-task-completion.ts');
const {derivePublicationAuthority,publicationSources,publicationClaimFailures}=await import('../app/lib/intelligence/publication-authority.ts');
const {bindRemovePlan,resolveRemovePlan}=await import('../app/lib/furvise-brain/remove-job.ts');
const {prepareBoundRemoveAction}=await import('../app/lib/application-actions/planner.ts');
const {validateAppendJob}=await import('../app/lib/furvise-brain/append-job.ts');
const {getFurviseActionPolicy}=await import('../app/lib/application-actions/policy.ts');
const owner=id(1),pet=id(2),now=new Date('2026-09-23T12:00:00Z');
function database(tables){
 const queries=[];
 return {queries,from(table){const filters=[];let cap=Infinity;const q={
  select(){return q},eq(k,v){filters.push(r=>r[k]===v);queries.push([table,k,v]);return q},
  is(k,v){return q.eq(k,v)},in(k,v){filters.push(r=>v.includes(r[k]));return q},
  order(){return q},limit(n){cap=n;return q},
  then(resolve,reject){const found=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:found.slice(0,cap),error:null,count:found.length}).then(resolve,reject)},
  async maybeSingle(){const r=await q;return {...r,data:r.data.length===1?r.data[0]:null}},
 };return q;}};
}
function plan(domain='memory',scope='subjects',reference=null,references=[]){
 return bindStoredRead({operation:'read',domain,scope,reference,projection:'records'},{ownerId:owner,subjectIds:scope==='owner'?[]:[pet],references});
}
function memory(patch={}){return {id:id(20),user_id:owner,pet_id:pet,subject_type:'pet',category:'behavior',fact_key:'handling_preference',
 fact_value:'Prefers a slow approach',normalized_value:null,confidence:1,importance:'high',durability:'durable',status:'active',
 source_type:'ask_message',source_id:id(3),source_excerpt:'Prefers a slow approach',superseded_by:null,
 created_at:now.toISOString(),updated_at:now.toISOString(),last_confirmed_at:now.toISOString(),...patch};}
function memoryDb(rows){return database({furvise_memories:rows,ask_conversation_messages:[{id:id(3),user_id:owner,role:'user',user_text:'Prefers a slow approach'}]});}
async function publish(p,db,format='prose'){
 const result=await executeStoredRead(p,{ownerId:owner,ownedPetIds:[pet],db,capabilityDb:db,now});
 const evidence={version:'ask-evidence.v1',scope:{authorizedPetIds:p.subjectIds,requestText:'Arbitrary reference',status:'resolved',readOnlyRecall:true,requestKind:'ordinary'},
  interpretation:{operation:'recall',petIds:p.subjectIds,readOnly:true,request:{mode:'read',evidenceBasis:'stored',storedRead:p,quantity:null,requirements:[],referenceTurnIds:[],outputFormat:format}},
  sources:[],represented:[],losses:[],verifiedFacts:[],completeness:{retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown'},representation:'complete'};
 bindStoredReadEvidence(evidence,result);
 let calls=0;const client={responses:{create:async()=>{calls++;throw Error('NO_PROVIDER');}}};
 const input={profiles:[],question:'Arbitrary reference',careEntries:[],recentUpdates:[],memories:[],productFeedback:[],conversationTurns:[],evidenceContract:evidence,client};
 const response=await generateContextAwareAskResponse(input);
 const context={owner:{userId:owner},pet:{id:pet},eligiblePets:[],currentMessage:input.question,memories:[],careEntries:[],askInterpretation:evidence.interpretation};
 const validate=r=>validateGeneratedAnswer(r,context,'routine',p.subjectIds);
 return {result,evidence,response,client,context,validate,calls:()=>calls};
}
async function accepted(f,outcome='complete'){
 assert.equal(storedReadPublicationFailure(f.response),null);
 assert.equal(await reviewHistoricalAnswer({result:f.response,client:f.client}),true);
 const validated=f.validate(f.response);assert.equal(validated.valid,true,JSON.stringify(validated.errors));assert.equal(validated.assessment.outcome,outcome);
 const final=await reviewTaskCompletion({validation:validated,context:f.context,requestId:'request',validate:f.validate,client:f.client});
 assert.strictEqual(final,validated);assert.equal(f.calls(),0);return final;
}
test('effective owned memory becomes certified exact Labs transport without model representation',async()=>{
 const f=await publish(plan(),memoryDb([memory()]));
 assert.equal(f.result.status,'complete');assert.equal(f.response.model,'server-stored-read-labs');
 assert.equal(f.response.answer.summary,'Prefers a slow approach');assert.deepEqual(f.response.relevantContextIds,['memory:'+id(20)]);
 assert.equal(f.result.records[0].provenance.sourceId,id(3));assert.ok(f.result.records[0].version);
 assert.deepEqual(derivePublicationAuthority(f.evidence).authorizedSourceIds,f.response.relevantContextIds);
 await accepted(f);
});
for(const [name,patch] of Object.entries({superseded:{superseded_by:id(9)},rejected:{status:'rejected'},resolved:{status:'resolved'},
 expired:{expires_at:'2020-01-01T00:00:00Z'},inactive:{status:'inactive'},forgotten:{status:'forgotten'},foreign:{user_id:id(9)},
 other_subject:{pet_id:id(9)},invalid_provenance:{source_id:id(99)},assistant_source:{source_type:'assistant'}})){
 test('memory excludes '+name+' without borrowed context authority',async()=>{
 const f=await publish(plan(),memoryDb([memory(patch)]));assert.deepEqual(f.response.relevantContextIds,[]);
 assert.doesNotMatch(f.response.answer.summary,/Prefers a slow approach/);assert.equal(f.calls(),0);
 });
}
test('owner and pet memory scopes never mix',async()=>{
 const owned=memory({id:id(21),pet_id:null,subject_type:'owner',category:'communication_preference',fact_key:'communication_style',fact_value:'concise',source_excerpt:'concise'});
 const db=database({furvise_memories:[owned,memory()],ask_conversation_messages:[{id:id(3),user_id:owner,role:'user',user_text:'Prefers a slow approach; concise'}]});
 const a=await publish(plan(),db),b=await publish(plan('memory','owner'),db);
 assert.deepEqual(a.response.relevantContextIds,['memory:'+id(20)]);assert.deepEqual(b.response.relevantContextIds,['memory:'+id(21)]);
 await accepted(b);
});
test('bounded incomplete memory set is source-free, never a partial factual list',async()=>{
 const f=await publish(plan(),memoryDb(Array.from({length:101},(_,i)=>memory({id:id(100+i)}))));
 assert.equal(f.result.reason,'effective_set_incomplete');assert.deepEqual(f.response.relevantContextIds,[]);await accepted(f,'limited');
});
test('current-state is explicitly unsupported with no access to its preloaded snapshot',async()=>{
 const db=database({pet_current_state:[{state:{secret:'must not publish'}}]});
 const f=await publish(plan('current_state'),db);assert.equal(f.result.status,'unsupported');
 assert.equal(f.response.answer.summary,STORED_READ_LIMITATION);assert.deepEqual(db.queries,[]);await accepted(f,'limited');
});
for(const format of ['csv','json','compact','table','bullets'])test('unsupported residual format '+format+' cannot reopen generation',async()=>{
 const f=await publish(plan(),memoryDb([memory()]),format);assert.equal(f.result.status,'complete');
 assert.deepEqual(f.response.relevantContextIds,[]);assert.doesNotMatch(f.response.answer.summary,/Prefers/);
 assert.deepEqual(derivePublicationAuthority(f.evidence).authorizedSourceIds,['memory:'+id(20)]);await accepted(f,'limited');
});
for(const [name,mutate] of [
 ['text',r=>r.answer.summary+=' Invented fact.'],['source',r=>r.relevantContextIds.push('care:other')],
 ['action',r=>r.applicationActions.push({kind:'care_history.add'})],
 ['snapshot',r=>r.evidenceContract.storedReadResult.records[0].text='Changed'],
 ['subject',r=>r.evidenceContract.interpretation.request.storedRead.subjectIds=[id(9)]],
])test('stored Labs tamper '+name+' fails before and after review',async()=>{
 const f=await publish(plan(),memoryDb([memory()]));await accepted(f);mutate(f.response);
 assert.equal(readReviewedHistoryAnswer(f.response),null);assert.equal(await reviewHistoricalAnswer({result:f.response,client:f.client}),false);
 assert.equal(f.validate(f.response).valid,false);assert.equal(f.calls(),0);
});
test('memory source cannot authorize history or a receipt claim',async()=>{
 const f=await publish(plan(),memoryDb([memory()])),a=derivePublicationAuthority(f.evidence);
 for(const [text,sourceIds] of [['Invented medical history',a.authorizedSourceIds],['Prefers a slow approach',['operation_receipt:foreign']]])
  assert.ok(publicationClaimFailures(f.evidence,[{obligationId:a.obligations[0].obligationId,text,sourceIds}]).length);
 assert.equal(publicationSources(f.evidence).length,1);
});
async function capability(kind,status='succeeded'){
 const f=fixture();f.pet.updated_at='2026-09-22T00:00:00Z';f.rows.pet_care_entries[0].updated_at='2026-09-22T00:00:00Z';
 let action;
 if(kind==='replace')action=await f.prepare();
 else if(kind==='append'){
  const appendJob=validateAppendJob({operation:'append',petName:f.pet.name,bodyQuote:f.source.text,companionQuote:null},{...f.source,role:'user'},[f.pet],owner);
  action={id:'action-source',kind:'care_history.add',petId:pet,sourceMessageId:f.source.id,...getFurviseActionPolicy('care_history.add'),
   label:'Save',description:'Review save',evidence:f.source.text,href:null,explicitIntent:false,appendJob,status:'proposed',resultMessage:null,errorMessage:null,
   input:{field:null,value:null,title:'Owner note',detail:null,category:'general',target:'specified'}};
 }else{
  const domain=kind==='pet_remove'?'pet_profile':'care_history';
  const job=await resolveRemovePlan(bindRemovePlan({operation:'remove',domain,target:domain==='pet_profile'?'subject_profile':'last_event_for_subject',
   petName:f.pet.name,instructionQuote:f.source.text.trim()},{...f.source,role:'user'},{id:pet,name:f.pet.name},{ownerId:owner,references:[]}),f.db,owner);
  action=prepareBoundRemoveAction(job,'request');
 }
 const row={id:id(5),user_id:owner,pet_profile_id:pet,source_message_id:id(3),assistant_message_id:id(6),
  action_payload:action,status,receipt:status==='pending'?null:{...action,id:id(5),status,resultMessage:status==='succeeded'?'Done.':null,errorMessage:null},
  created_at:'2026-09-23T00:00:00Z',expires_at:'2099-01-01T00:00:00Z'};
 const db=database({ask_action_capabilities:[row]});
 const references=await loadStoredReadReferences(owner,db);
 assert.equal(references.length,1);
 return {row,db,references,p:plan('operation_receipt','owner',references[0].ref,references)};
}
for(const kind of ['append','replace','remove','pet_remove'])test('exact terminal '+kind+' receipt reads without its subject or conversation rows',async()=>{
 const c=await capability(kind),f=await publish(c.p,c.db);
 assert.equal(f.result.status,'complete');assert.match(f.response.answer.summary,/succeeded/);
 assert.equal(f.result.records[0].provenance.sourceType,c.row.action_payload.kind);
 assert.equal(f.result.records[0].operation.status,'succeeded');
 assert.equal(f.result.records[0].operation.targetId,c.row.action_payload.removeJob?.resolvedTarget.recordId || c.row.action_payload.targetSourceId || null);
 assert.equal(f.result.records[0].provenance.sourceId,id(3));await accepted(f);
});
for(const status of ['failed','cancelled','pending'])test('receipt status '+status+' cannot become success',async()=>{
 const c=await capability('replace',status),f=await publish(c.p,c.db);
 assert.doesNotMatch(f.response.answer.summary,/succeeded/);
 if(status==='pending'){assert.deepEqual(f.response.relevantContextIds,[]);await accepted(f,'limited');}
 else{assert.match(f.response.answer.summary,new RegExp(status));await accepted(f);}
});
test('foreign, invented and ambiguous operation handles reject',async()=>{
 const c=await capability('replace');
 for(const refs of [[],[{...c.references[0],ownerId:id(9)}],[...c.references,...c.references]])
 assert.throws(()=>plan('operation_receipt','owner',c.references[0].ref,refs),/stored_read/);
});
test('changed durable payload/receipt and fake assistant success cannot mint authority',async()=>{
 for(const change of [r=>r.user_id=id(9),r=>r.action_payload={...r.action_payload,label:'Changed'},r=>r.receipt={...r.receipt,sourceMessageId:id(9)},r=>r.receipt=null]){
 const c=await capability('replace');change(c.row);const f=await publish(c.p,c.db);
 assert.equal(f.result.status,'unavailable');assert.deepEqual(f.response.relevantContextIds,[]);await accepted(f,'limited');
 }
 const f=await publish(plan('operation_receipt','owner'),database({ask_conversation_messages:[{role:'furvise',response_data:{answer:'saved'}}],pet_care_entries:[{note:'matching content'}]}));
 assert.equal(f.result.status,'unavailable');await accepted(f,'limited');
});
test('untyped preloaded memories and receipts never enter factual model records',()=>{
 const p={id:pet,user_id:owner,name:'Subject',species:'dog'};
 const c=buildAskContext({profiles:[p],question:'show the facts',careEntries:[],recentUpdates:[],productFeedback:[],conversationTurns:[],
  memories:[{id:id(20),dog_profile_id:pet,text:'Forbidden secret',created_at:now.toISOString(),type:'memory'}]},false);
 assert.ok(c.records.every(r=>!['remembered_detail','operation_receipt'].includes(r.sourceType)));
 assert.doesNotMatch(JSON.stringify(c.promptContext),/Forbidden secret/);
});
test('old receipt and backward-reference lexical gates are absent from context loading',()=>{
 const s=readFileSync(new URL('../app/lib/intelligence/retrieve-context.ts',import.meta.url),'utf8');
 assert.doesNotMatch(s,/requestsStoredNoteReadback|backwardReferenceRead|operationReceipt:/);
 assert.match(s,/conversationId && feature === "ask"/);
});

test('provider grammar and Binder carry arbitrary-language stored READ without lexical routing',async()=>{
 const f=fixture();
 const request={...f.request,storedRead:{operation:'read',domain:'memory',scope:'subjects',reference:null,projection:'records'},
  mode:'read',mutationIntent:null,writeJob:null,evidenceBasis:'stored',selection:'summary',operation:'recall',frame:null,
  profileFields:[],evidenceNeeds:[],projection:null,recordSelection:null,temporalScope:null,outputFormat:null,premiseQuotes:[],excludedPetNames:[],
  removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:null};
 const {default:Ajv}=await import('ajv'),validate=new Ajv().compile(askRequestProviderSchema({},f.context));
 assert.equal(validate({request}),true,JSON.stringify(validate.errors));
 for(const text of ['What remains in your ledger of recollections?','\u00bfQu\u00e9 recuerdas de este sujeto?','Go on\u2014show the retained details.']){
  const p=validateAskRequest({...request,question:text},{...f.context,currentMessage:text});
  assert.equal(p.request.storedRead.domain,'memory');assert.deepEqual(p.request.storedRead.subjectIds,[pet]);
 }
 for(const patch of [{writeJob:{}},{readTicket:{}},{profileFields:['weight']},{scope:'none'},{petNames:['Foreign']}])
  assert.throws(()=>validateAskRequest({...request,...patch},f.context),/ASK_REQUEST_INVALID/);
});
test('owner READ is explicit and cannot acquire pet or mutation scope',()=>{
 const f=fixture(),base={...f.request,storedRead:{operation:'read',domain:'memory',scope:'owner',reference:null,projection:'records'},
  mode:'read',mutationIntent:null,writeJob:null,evidenceBasis:'stored',selection:'summary',operation:'recall',scope:'none',petNames:[],frame:null};
 const p=validateAskRequest(base,f.context);assert.deepEqual(p.petIds,[]);assert.equal(p.request.storedRead.ownerId,owner);
 assert.throws(()=>validateAskRequest({...base,petNames:[f.pet.name]},f.context),/stored_read_scope/);
});
test('receipt reference catalog is bounded and does not require current wording',async()=>{
 const c=await capability('replace'),rows=Array.from({length:20},(_,i)=>({...c.row,id:id(50+i)}));
 const db=database({ask_action_capabilities:rows}),refs=await loadStoredReadReferences(owner,db);
 assert.equal(refs.length,12);assert.equal(new Set(refs.map(r=>r.ref)).size,12);
 assert.ok(refs.every(r=>r.ownerId===owner && r.payloadDigest===storedReadDigest(c.row.action_payload)));
});
test('tombstoned source lineage excludes a previously active memory',async()=>{
 const db=database({furvise_memories:[memory()],ask_conversation_messages:[{id:id(3),user_id:owner,role:'user',user_text:'Prefers a slow approach'}],
  pet_care_entries:[{user_id:owner,intelligence_source_message_id:id(3),deleted_at:now.toISOString()}]});
 const f=await publish(plan(),db);assert.deepEqual(f.response.relevantContextIds,[]);assert.equal(f.result.status,'complete_empty');
});

test('canonical stored subject scope cannot be overridden by outer aliases',async()=>{
 const {readInterpretationSubject}=await import('../app/lib/intelligence/interpret-ask.ts');
 const p=plan(),request={mode:'read',evidenceBasis:'stored',storedRead:p};
 const interpretation={request,readOnly:true,petIds:[id(9)],readPetIds:[id(9)]};
 const scope=readInterpretationSubject(interpretation,id(9),{ownerId:owner,pets:[{id:pet,user_id:owner}]});
 assert.deepEqual(scope.resolution.petIds,[pet]);
 const ownerScope=readInterpretationSubject({...interpretation,request:{...request,storedRead:plan('memory','owner')}},pet,{ownerId:owner,pets:[{id:pet,user_id:owner}]});
 assert.equal(ownerScope.resolution.status,'resolved');assert.deepEqual(ownerScope.resolution.petIds,[]);
 assert.equal(ownerScope.resolution.petId,pet,'conversation container only');
});
test('real history callback carries stored READ through finalization without unrelated database reads',async()=>{
 const {generateAskHistoryAnswer}=await import('../app/lib/intelligence/generate-ask-history.ts');
 const f=await publish(plan(),memoryDb([memory()]));
 const subject={id:pet,user_id:owner,name:'Subject',species:'dog',lifecycle_status:'active'};
 const context={...f.context,feature:'ask',locale:'en',currentTimestamp:now.toISOString(),conversationId:null,pet:subject,eligiblePets:[subject],
  storedReadResult:f.result,careEntries:[],selectedCareEntries:[],activeConcerns:[],recentlyResolvedConcerns:[],
  activeEpisodes:[],monitoringEpisodes:[],recentlyResolvedEpisodes:[],currentState:null,legacyPetMemories:[],memories:[],productFeedback:[],
  conversationTurns:[],contextRecovery:{unavailableSources:[]}};
 const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='offline-test-only';
 try {
 const result=await generateAskHistoryAnswer({context,supabase:{from(){throw Error('UNREQUESTED_STORED_READ');}},
  requestId:'request',sourceMessageId:id(40),authoritativePetIds:[pet]});
 assert.equal(result.intelligenceResult.answerValidation.valid,true);
 assert.equal(result.intelligenceResult.reasoning.model,'server-stored-read-labs');
 assert.equal(result.intelligenceResult.reasoning.answer.summary,'Prefers a slow approach');
 assert.deepEqual(result.intelligenceResult.acceptedSemanticEvents,[]);
 } finally {if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});

test('database response truncation cannot certify a complete effective memory set',async()=>{
 const db=memoryDb([memory()]);
 const wrapped={from(table){const q=db.from(table);if(table==='furvise_memories'){
  const then=q.then;q.then=(resolve,reject)=>then(r=>resolve({...r,count:r.count+1}),reject);
 }return q;}};
 const f=await publish(plan(),wrapped);assert.equal(f.result.reason,'effective_set_incomplete');await accepted(f,'limited');
});
test('owner-scoped stored READ survives the real callback without selected-pet substitution',async()=>{
 const {generateAskHistoryAnswer}=await import('../app/lib/intelligence/generate-ask-history.ts');
 const row=memory({pet_id:null,subject_type:'owner',category:'communication_preference',fact_key:'communication_style',fact_value:'concise',source_excerpt:'concise'});
 const f=await publish(plan('memory','owner'),database({furvise_memories:[row],ask_conversation_messages:[{id:id(3),user_id:owner,role:'user',user_text:'concise'}]}));
 const subject={id:pet,user_id:owner,name:'Subject',species:'dog',lifecycle_status:'active'};
 const context={...f.context,feature:'ask',locale:'en',currentTimestamp:now.toISOString(),conversationId:null,pet:subject,eligiblePets:[subject],
  storedReadResult:f.result,careEntries:[],selectedCareEntries:[],activeConcerns:[],recentlyResolvedConcerns:[],
  activeEpisodes:[],monitoringEpisodes:[],recentlyResolvedEpisodes:[],currentState:null,legacyPetMemories:[],memories:[],productFeedback:[],
  conversationTurns:[],contextRecovery:{unavailableSources:[]}};
 const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='offline-test-only';
 try {
  const result=await generateAskHistoryAnswer({context,supabase:{from(){throw Error('UNREQUESTED_STORED_READ');}},
   requestId:'request',sourceMessageId:id(40),authoritativePetIds:[]});
  assert.equal(result.intelligenceResult.answerValidation.valid,true);
  const response=result.intelligenceResult.reasoning;
  assert.equal(response.model,'server-stored-read-labs');
  assert.deepEqual(response.evidenceContract.scope.authorizedPetIds,[]);
  assert.deepEqual(response.relevantContextIds,['memory:'+id(20)]);
 }finally{if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
test('Brain transport binds opaque receipt READ for arbitrary wording with one injected proposal',async()=>{
 const {interpretAskQuestion}=await import('../app/lib/intelligence/interpret-ask.ts');
 const c=await capability('replace'),f=fixture();
 for(const question of ['And the outcome of that operation?','Has the ledger acknowledged my change?']){
  let calls=0;
  const request={...f.request,mode:'read',mutationIntent:null,writeJob:null,frame:null,evidenceBasis:'stored',selection:'summary',
   operation:'recall',question,scope:'none',petNames:[],storedRead:{operation:'read',domain:'operation_receipt',scope:'owner',reference:c.references[0].ref,projection:'records'}};
  const context={...f.context,currentMessage:question,storedReadReferences:c.references};
  const interpretation=await interpretAskQuestion({context,model:'gpt-5.4-mini',client:{responses:{async create(input){
   calls++;const prompt=JSON.parse(input.input);
   assert.ok(JSON.stringify(prompt).includes(c.references[0].ref));
   return {status:'completed',output_text:JSON.stringify({request}),usage:{input_tokens:1,output_tokens:1}};
  }}}});
  assert.equal(calls,1);assert.equal(interpretation.request.storedRead.reference.capabilityId,c.row.id);
  const result=await executeStoredRead(interpretation.request.storedRead,{ownerId:owner,ownedPetIds:[],db:c.db,capabilityDb:c.db,now});
  assert.equal(result.status,'complete');assert.equal(result.records[0].operation.status,'succeeded');
 }
});
