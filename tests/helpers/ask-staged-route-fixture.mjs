import {fixtureSemanticsPage} from '../../scripts/audits/helpers/source-semantics-fixture.mjs';
// Offline execution of the actual POST handlers. Only provider/DB/auth IO is replaced.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,next) {
 if(s==='server-only') return {shortCircuit:true,url:'data:text/javascript,export {}'};
 if(s.endsWith('/care-authority-client.ts')) return {shortCircuit:true,url:'data:text/javascript,export const createCanonicalCareAuthorityClient=()=>globalThis.__routeFixture.db;'};
 if(s.endsWith('/security/idempotency/admin-client.ts')) return {shortCircuit:true,url:'data:text/javascript,export const createIdempotencyAdminClient=()=>globalThis.__routeFixture.db;'};
 if(s.endsWith('/ask-conversation-authority.ts')) return {shortCircuit:true,url:'data:text/javascript,export const completeAskConversationTurn=(x)=>globalThis.__routeFixture.complete(x);export const updateAskAssistantResponse=(x)=>globalThis.__routeFixture.update(x);export const finalizeAskAssistantResponse=(x)=>globalThis.__routeFixture.update(x);'};
 if(s.startsWith(".") && c.parentURL?.startsWith("file:")) { for(const ext of [".ts",".tsx",".mjs"]) { const url=new URL(s+ext,c.parentURL); if(existsSync(url)) return next(url.href,c); } }
 return next(s,c);
}});
globalThis.fetch=async()=>{throw Error('Offline route proof forbids network');};
const {enforceVerifiedStateClaims,resolveFurviseActionTargetBindings}=await import('../../app/lib/application-actions/index.ts');
const {inspectAskPublication}=await import('../../app/lib/intelligence/inspect-ask-publication.ts');
const {typedTaskRequirements}=await import('../../app/lib/intelligence/task-execution-contract.ts');
const {buildAskSaveMetadata}=await import('../../app/lib/ask.mjs');
const {createAskAdmissionSettlement}=await import('../../app/lib/ai/ask-admission-settlement.ts');
const publicPolicy=await import('../../app/lib/public-v1-capabilities.ts');
const {buildFurvisePlanningContext}=await import('../../app/lib/intelligence/planning-context.ts');
const {prepareAppendTurn,continueConfirmedAppend}=await import('../../app/lib/intelligence/append-turn.ts');
const {executeActionCapability}=await import('../../app/lib/application-actions/capabilities.ts');
const {interpretAskQuestion}=await import('../../app/lib/intelligence/interpret-ask.ts');
const {AskPipelineError}=await import('../../app/lib/ai/ask-reasoning.ts');
const {FURVISE_ANSWER_UNAVAILABLE_MESSAGE,publicAskFailureCode}=await import('../../app/lib/furvise-output.ts');
const {createAskCreditSettlement}=await import('../../app/lib/ai/ask-credit-settlement.ts');
const {exceedsSelectedPetRead}=await import('../../app/lib/intelligence/selected-pet-read.ts');
const {explicitlyNamedOwnedPets}=await import('../../app/lib/intelligence/entities/resolve-turn-subject.ts');
const {AskTurnLifecycle,deriveAskAttemptId}=await import('../../app/lib/ai/ask-turn-model.ts');
const {OperationDeadline}=await import('../../app/lib/ai/execution-deadline.ts');
const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
const {resolveAskTimeZone}=await import('../../app/lib/ask-time-zone.ts');
const {resolveAskHistoryAccess}=await import('../../app/lib/intelligence/history-access.ts');
const {detectImmediateAskEmergency,buildImmediateEmergencyGuidance}=await import('../../app/lib/ask-safety-context.ts');
const {ASK_REQUEST_KEYS}=await import('../../app/lib/ask-request-contract.ts');

const {assessTaskExecution}=await import('../../app/lib/intelligence/task-execution-contract.ts');
const {finalizeAskPostReview}=await import('../../app/lib/furvise-brain/post-review-finalizer.ts');
const {finalizeDurableAskAnswer}=await import('../../app/lib/furvise-brain/durable-answer-finalization.ts');
const {attachEpisodeReferences}=await import('../../app/lib/intelligence/episode-history.ts');
const {buildSuccessfulAskResponse,didPersistEffectiveAskState}=await import('../../app/lib/intelligence/finalize-ask-publication.ts');
const {parseStoredApplicationActions}=await import('../../app/lib/application-actions/index.ts');
const {completeAskConversationTurn,updateAskAssistantResponse,finalizeAskAssistantResponse}=await import('../../app/lib/ask-conversation-authority.ts');

const {safeAskDiagnosticStage}=await import('../../app/lib/ai/ask-error-diagnostic.ts');
export const id=n=>`89100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const cedar='log that Cedar refused lunch. what are his last two weights';
export function proposal(message=cedar){return {version:'ask-request.v2',mode:'mixed',question:message,requirements:[],referenceTurnIds:[],scope:'selected',petNames:[],operation:'recall',selection:'latest',quantity:'records',topic:'weight',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,task:null,writeJob:null,evidenceBasis:'saved_history',premiseQuotes:[],
 appendJob:{operation:'append',petName:'Cedar',bodyQuote:'Cedar refused lunch.',companionQuote:'what are his last two weights'},
 readTicket:{operation:'read',subjectScope:'selected',temporal:{from:null,to:null,anchor:null},predicates:[{kind:'text_any',terms:['weight','weighed']}],selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:2,per:'group'}}]},outputs:{completeness:'exhaustive',ordering:'desc',limit:null}}};}
function handler(path,names,scope,entry='POST'){const source=readFileSync(new URL(path,import.meta.url),'utf8');const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast).replace(/^export /,'')).join('\n');
 return vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\n'+entry,scope);}
const {hydratePlanningCatalog,verifyPlanningCatalogSource}=await import('../../app/lib/intelligence/hydrate-planning-catalog.ts');
const {resolveReplaceJob}=await import('../../app/lib/furvise-brain/replace-job.ts');
const {resolveRemovePlan}=await import('../../app/lib/furvise-brain/remove-job.ts');
const {prepareBoundReplaceAction,prepareBoundRemoveAction}=await import('../../app/lib/application-actions/planner.ts');
const {prepareStateTransitionTurn}=await import('../../app/lib/intelligence/state-transition-turn.ts');
const {continueLifecyclePlan,lifecyclePlanOrchestration}=await import('../../app/lib/intelligence/lifecycle-turn.ts');
const {createActionCapabilities,cancelActionCapability}=await import('../../app/lib/application-actions/capabilities.ts');
const {shouldAutoExecuteAction}=await import('../../app/lib/application-actions/index.ts');
const {careHistoryCorrectionOrchestration}=await import('../../app/lib/ai/ask-command-router.ts');
const {isOrdinarySavedHistoryRequest}=await import('../../app/lib/intelligence/publication-authority.ts');
const {conditionalEmergencyGuidance,evaluateAskSafetyContext}=await import('../../app/lib/ask-safety-context.ts');
const {buildFurviseClarification}=await import('../../app/lib/furvise-output.ts');
const {runOptionalAskSubsystem}=await import('../../app/lib/ai/ask-turn-model.ts');
const {resolveAutomaticCareHistoryPresentation,isExplicitCareHistorySaveRequest}=await import('../../app/lib/intelligence/care-history-policy.ts');
const {persistCanonicalSuggestions}=await import('../../app/lib/intelligence/canonical-suggestion-continuation.ts');
const {createCanonicalCareAuthorityClient}=await import('../../app/lib/intelligence/care-authority-client.ts');
export function fixture(options={}){
 const events=[],errors=[];const state={planner:0,confirmed:false,options,events,errors,traces:[],credit:null};
 const pet={id:id(11),user_id:id(1),name:'Cedar',species:'dog',lifecycle_status:'active',sex:'male'};
 const rows={dog_profiles:[pet],ask_conversations:[{id:id(21),user_id:id(1),pet_profile_id:pet.id}],ask_conversation_messages:[],ask_action_capabilities:[],ai_update_suggestions:[],pet_care_entries:[],pet_concerns:[]};
 const care=(n,date,note)=>({id:id(n),user_id:id(1),pet_profile_id:pet.id,category:'general',title:null,note,occurred_at:date,created_at:date,updated_at:date,deleted_at:null});
 rows.pet_care_entries.push(care(51,'2025-06-15T12:00:00Z','Cedar weighed 9.2 kg.'),care(52,'2025-07-15T12:00:00Z','Cedar weighed 9.4 kg.'));
 function query(table){let filters=[],sort=[],offset=0,limit=Infinity,insert=null,columns=null;const q={
 select(value){columns=value;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},neq(k,v){filters.push(r=>r[k]!==v);return q;},is(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},gte(k,v){filters.push(r=>r[k]>=v);return q;},lte(k,v){filters.push(r=>r[k]<=v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},
 order(k,{ascending=true}={}){sort.push([k,ascending]);return q;},range(a,b){offset=a;limit=b-a+1;return q;},limit(n){limit=n;return q;},retry(){return q;},abortSignal(){return q;},insert(v){events.push('write-attempt:'+table);insert=v;return q;},
 async result(single=false){events.push(`read:${table}`);(state.queries??=[]).push({table,columns,beforeBrain:state.planner===0});if(table==='pet_care_entries'){assert.ok(state.confirmed||state.permits?.length,'No factual retrieval before permit or confirmation');if(options.readFailure)return{data:null,error:{code:'offline'}};}
 if(insert){assert.equal(table,'ask_action_capabilities');rows[table].push({...insert,id:id(71),status:'pending',receipt:null,expires_at:'2099-01-01T00:00:00Z'});insert=null;}
 let data=rows[table].filter(r=>filters.every(f=>f(r)));if(sort.length)data=data.toSorted((a,b)=>{for(const [k,asc]of sort){const x=String(a[k]).localeCompare(String(b[k]));if(x)return asc?x:-x;}return 0;});data=data.slice(offset,offset+limit);if(columns && columns!=='*')data=data.map(row=>Object.fromEntries(columns.split(',').map(k=>[k.trim(),row[k.trim()]])));return {data:single?data[0]||null:data,error:null};},
 maybeSingle(){return q.result(true);},single(){return q.result(true);},returns(){return q.result();},then(a,b){return q.result().then(a,b);}};return q;}
 const db={from(table){assert.ok(rows[table],`Unexpected table ${table}`);return query(table);},rpc(name,args){events.push('rpc-attempt:'+name);if(name==='list_ask_replace_targets')return Promise.resolve({data:rows.pet_care_entries.filter(r=>r.user_id===args.p_user_id&&args.p_pet_ids.includes(r.pet_profile_id)),error:null});if(name==='read_ask_source_semantics')return {abortSignal:async()=>fixtureSemanticsPage(rows.pet_care_entries,args,{})};
 if(name==='persist_ask_canonical_suggestion')return {single:async()=>{const cap=rows.ask_action_capabilities.find(c=>c.id===args.p_capability_id&&c.user_id===args.p_user_id);assert.ok(cap?.action_payload.appendJob||cap?.action_payload.replaceJob||cap?.action_payload.removeJob);events.push('suggestion:persist');let row=rows.ai_update_suggestions.find(s=>s.canonical_capability_id===cap.id);if(!row){row={id:id(72),user_id:args.p_user_id,pet_profile_id:cap.pet_profile_id,conversation_id:id(21),source_message_id:cap.assistant_message_id,type:'history',title:'Add to care history',details:cap.action_payload.description,status:'pending',canonical_capability_id:cap.id,canonical_payload:{version:1,kind:cap.action_payload.appendJob?'append':cap.action_payload.replaceJob?'replace':'remove',job:structuredClone(cap.action_payload.appendJob||cap.action_payload.replaceJob||cap.action_payload.removeJob),capabilityId:cap.id,sourceMessageId:cap.source_message_id,targetId:cap.target_id||null,targetUpdatedAt:cap.action_payload.replaceJob?.target?.updatedAt||cap.action_payload.removeJob?.resolvedTarget?.updatedAt||null},invalidated_at:null};rows.ai_update_suggestions.push(row);}return{data:row,error:null};}};
 if(name==='read_ask_history_correction_page'){assert.ok(state.confirmed);events.push('lungs:lineage');return {abortSignal:async()=>({data:{claims:[],relations:[],lineage:[],sources:rows.pet_care_entries.filter(r=>args.p_care_ids.includes(r.id)),truncated:false},error:null})};}
 assert.equal(name,'execute_ask_action_capability');return {maybeSingle:async()=>{events.push('heart:execute');const cap=rows.ask_action_capabilities.find(r=>r.id===args.p_capability_id&&r.user_id===args.p_user_id&&r.assistant_message_id===args.p_assistant_message_id);if(!cap)return{data:null,error:null};
 if(options.dbFailure)return {data:null,error:{code:'42501'}};
 const changed=cap.status==='pending'&&args.p_mode==='confirm';const status=args.p_mode==='cancel'?'cancelled':'succeeded';
 const action={...cap.action_payload,id:cap.id,status,resultMessage:status==='succeeded'?'Saved.':null};
 if(changed && action.replaceJob){
 const job=action.replaceJob;assert.equal(job.petId,cap.pet_profile_id);assert.equal(job.sourceMessageId,cap.source_message_id);
 const target=rows.pet_care_entries.find(r=>r.id===job.target.recordId&&r.user_id===cap.user_id&&r.pet_profile_id===job.petId&&r.updated_at===job.target.updatedAt&&r.deleted_at===null);
 if(!target)return{data:null,error:{code:'fixture_stale_or_foreign_target'}};
 assert.equal(target.id,cap.target_id);target.note=job.body.text;target.updated_at='2026-09-20T12:00:01Z';events.push('heart:row');
} else if(changed){assert.ok(action.appendJob,'Confirmed append carries its canonical obligations');assert.equal(action.appendJob.petId,action.petId);assert.equal(action.appendJob.sourceMessageId,action.sourceMessageId);
 for(const [index,item]of action.appendJob.items.entries()){rows.pet_care_entries.push({...care(53+index,item.occurredAt||'2026-09-20T12:00:00Z',item.body.text),intelligence_source_message_id:action.sourceMessageId,care_event_metadata:{sourceSpanId:item.body.id,sourceNoteIndex:index+1}});events.push('heart:row');}}
 cap.status=status;cap.receipt=options.noReceipt?null:action;if(cap.receipt&&status==='succeeded'){events.push('heart:receipt');state.confirmed=true;}
 if(options.lostAcknowledgment && !state.ackLost){state.ackLost=true;return{data:null,error:{code:'connection_lost_after_commit'}};}
 return {data:{action,changed},error:null};}};}};
 globalThis.__routeFixture={db,complete:async x=>{if(options.conversationFailure)return{data:null,error:Error('unavailable')};let row=rows.ask_conversation_messages.find(r=>r.id===id(61));if(!row){row={id:id(61),user_id:id(1),conversation_id:id(21),role:'furvise',sequence_number:2,created_at:'2026-09-20T12:00:00Z'};rows.ask_conversation_messages.push(row);}row.response_data=x.responseData;return{data:[{assistant_message_id:row.id}],error:null};},update:async x=>{const row=rows.ask_conversation_messages.find(r=>r.id===x.messageId&&r.user_id===x.userId);if(!row)return{data:false,error:null};row.response_data=x.responseData;return{data:true,error:null};}};
 const noop=()=>{};class FixtureError extends Error{};
 // Engine-only injection exercises confirmation mechanics; default fixture retains real public policy.
 const sandbox={isAskEnabled:()=>options.aiEnabled!==false,resolveReplaceJob,resolveRemovePlan,prepareBoundReplaceAction,prepareBoundRemoveAction,prepareStateTransitionTurn,continueLifecyclePlan,lifecyclePlanOrchestration,createActionCapabilities,cancelActionCapability,shouldAutoExecuteAction,careHistoryCorrectionOrchestration,isOrdinarySavedHistoryRequest,conditionalEmergencyGuidance,evaluateAskSafetyContext,buildFurviseClarification,runOptionalAskSubsystem,resolveAutomaticCareHistoryPresentation,isExplicitCareHistorySaveRequest,persistCanonicalSuggestions,createCanonicalCareAuthorityClient,hydratePlanningCatalog:async(...args)=>{events.push("catalog:permit");(state.permits??=[]).push(structuredClone(args[0]));return hydratePlanningCatalog(...args);},verifyPlanningCatalogSource,...publicPolicy,...(options.engineCapabilities?{PUBLIC_V1_CAPABILITIES:{...publicPolicy.PUBLIC_V1_CAPABILITIES,askMutations:true},publicV1AskCapability:request=>{const decision=publicPolicy.publicV1AskCapability(request);return decision.reason==='mutation'?{available:true,reason:'supported'}:decision;}}:{}),Response,Request,Headers,AbortSignal,console,ASK_REQUEST_KEYS,AskTurnLifecycle,deriveAskAttemptId,OperationDeadline,resolveAskTimeZone,resolveAskHistoryAccess,buildAskConversationResponse,detectImmediateAskEmergency,buildImmediateEmergencyGuidance,prepareAppendTurn,buildFurvisePlanningContext,exceedsSelectedPetRead,explicitlyNamedOwnedPets,
 ASK_OPERATION_TIMEOUT_MS:150000,ASK_MAX_QUESTION_CHARACTERS:1200,API_BODY_LIMITS:{ask:10000},RequestBoundaryError:FixtureError,RateLimitRejection:FixtureError,FurviseContextError:FixtureError,AiAdmissionError:FixtureError,AiCreditLimitError:FixtureError,AiCreditLedgerError:FixtureError,AskPipelineError,
 loadAskAuthenticationContext:async()=>options.denied?{response:Response.json({success:false},{status:401})}:{supabase:db,userId:id(1)},readBoundedJson:r=>r.json(),hasOnlyKeys:()=>true,isUuid:v=>/^[a-f0-9-]{36}$/.test(v),isSecurityUuid:v=>/^[a-f0-9-]{36}$/.test(v),resolveAskLocale:()=> 'en',hashAiCreditPayload:()=> 'hash',
 classifyCurrentPetLoss:()=>null,logAskStage:noop,logAskServerError:(stage,error)=>errors.push({stage,error}),emitAskTurnTrace:trace=>state.traces.push(trace),
 loadAskEntitlementContext:async()=>({usage:{allowed:true,remaining:5,limit:5,ledgerMode:options.creditLedger?'database':'development_missing_migration'},planId:'free'}),
 readAskProfiles:async cb=>({...await cb(undefined),diagnostic:{}}),loadPersistedRequest:async()=>null,
 claimWithRestoredAskOrigin:({claim,payload})=>claim(payload),claimIdempotentOperation:async()=>({operation:{execute:fn=>fn(),ownerToken:'lease',payloadHash:'hash'}}),
 ensureConversationAndUserMessage:async({question})=>{rows.ask_conversation_messages.push({id:id(31),user_id:id(1),conversation_id:id(21),role:'user',user_text:question,sequence_number:1,created_at:'2026-09-20T12:00:00Z'});return{conversationId:id(21),userMessageId:id(31),userSequence:1};},
 requireRateLimitedRequest:async()=>({release:async()=>events.push('rate:release')}),reportOptionalContextRecovery:noop,recordContextRecoveryOnTurn:noop,
 derivePendingLifecycleAssertion:()=>null,getPetLifecycleStatus:()=> 'active',resolveDurableLifecycleCorrection:()=>null,deriveAskTurnView:()=>({contextUsed:{usedSources:[]},concerns:[],recentlyResolvedConcerns:[]}),
 getAskModelConfiguration:()=>({primary:'gpt-5.4-mini'}),getAskProviderCooldown:()=>({active:false}),askGuardOperationTtlSeconds:180,askRequestTimeoutMs:120000,
 admitAiOperation:options.admitAiOperation,withTimeout:p=>p,
 interpretAskQuestion:async input=>{events.push('brain');options.onContext?.(input.context);const interpreted = await interpretAskQuestion({...input,client:{responses:{create:async(request,providerOptions)=>{state.planner++;if(options.providerCreate)return options.providerCreate(request,providerOptions);if(options.modelDown)throw Error('offline provider');return {output_text:JSON.stringify(options.proposal||proposal())};}}}});options.onInterpretation?.(interpreted);return interpreted;},logAskProviderEvent:event=>{state.providerEvents??=[];state.providerEvents.push(structuredClone(event));},
 buildSubjectClarificationOrchestration:()=>{events.push('clarification:unexpected');throw Error('F_EXPECTS_TYPED_BINDER_REJECTION');},
 buildFurviseContext:async()=>{events.push('factual-context:attempt');throw Error('F_UNRESOLVED_FACTUAL_CONTEXT_ATTEMPT');},failAiAdmission:async()=>{},logAskPreProvider503:noop,
 askFailure:(code,message,status)=>Response.json({success:false,code,message},{status}),handleAskApiError:(error)=>{errors.push({error});return Response.json({success:false,error:String(error)},{status:503});},friendlyAnswerFailure:FURVISE_ANSWER_UNAVAILABLE_MESSAGE,FURVISE_ASK_UNAVAILABLE_MESSAGE:'unavailable',
 standaloneEmergencyResponse:({response})=>Response.json({success:true,response,creditsUsed:0}),
 };
 Object.assign(sandbox, {
  reserveAiCredit:async()=>{events.push('credit:reserve');state.credit={status:'reserved',disposition:null};return{status:'reserved'};},
  safeReleaseAiCredit:createAskCreditSettlement({logAskStage:noop,logAskServerError:noop,ledger:{
   setDisposition:async input=>{events.push('credit:disposition');state.credit.disposition=input.disposition;},
   reconcile:async()=>{events.push('credit:reconcile');state.credit.status='released';},
   isIntegrityError:()=>false,
  }}).safeReleaseAiCredit,
  emitOperationalEvent:noop,
  isProviderRateLimit:()=>false,
 });
 if(options.realProviderLog) sandbox.logAskProviderEvent=handler('../../app/api/ask/route.ts',
  ['logAskProviderEvent','safeAskOperationalCode'],sandbox,'logAskProviderEvent');
 // Exercise the real limitation publication boundary; only the persistence IO
 // is captured. This fixture does not certify a database write or durable replay.
 Object.assign(sandbox,{enforceVerifiedStateClaims,resolveFurviseActionTargetBindings,inspectAskPublication,
  typedTaskRequirements,buildAskSaveMetadata,
  ...createAskAdmissionSettlement(noop),
  persistAssistantAnswer:async input=>{
   state.publications??=[];state.publications.push(input);
   return Response.json({success:true,response:input.response});
  }});
 if(options.realEmergencyResponse) sandbox.standaloneEmergencyResponse=handler('../../app/api/ask/route.ts',
  ['standaloneEmergencyResponse'],sandbox,'standaloneEmergencyResponse');

 if(!options.engineCapabilities||options.fullCatalogPipeline){
 Object.assign(sandbox,{assessTaskExecution,finalizeAskPostReview,finalizeDurableAskAnswer,attachEpisodeReferences,buildSuccessfulAskResponse,didPersistEffectiveAskState,parseStoredApplicationActions,completeAskConversationTurn,updateAskAssistantResponse,finalizeAskAssistantResponse});
 const persist=handler('../../app/api/ask/route.ts',['persistAssistantAnswer','validAssistantCompletionRow','finalizePersistedAskAnswer'],sandbox,'persistAssistantAnswer');
 sandbox.persistAssistantAnswer=async input=>{state.publications??=[];state.publications.push(input);events.push('publication:persist');return persist(input);};
 }
 Object.assign(sandbox,{safeAskDiagnosticStage,publicAskFailureCode});
 sandbox.askFailure=handler('../../app/api/ask/route.ts',['askFailure','internalFailureClass'],sandbox,'askFailure');
 if(options.fullCatalogPipeline){
 sandbox.buildSubjectClarificationOrchestration=handler('../../app/api/ask/route.ts',['buildSubjectClarificationOrchestration'],sandbox,'buildSubjectClarificationOrchestration');
 sandbox.getRemainingAiCredits=async()=>({allowed:true,remaining:5,limit:5,ledgerMode:'database'});
 sandbox.revalidateAskStateViews=()=>{};
 }
 const post=handler('../../app/api/ask/route.ts',['POST','executeAskRequest','enforceAnswerStateClaims'],sandbox);
 const confirm=handler('../../app/api/ask/actions/[messageId]/route.ts',['POST','unavailable','revalidateActionViews'],{...sandbox,executeActionCapability,continueConfirmedAppend,getAuthenticatedApiContext:async()=>({supabase:db,userId:options.confirmOwner||id(1)}),emitOperationalEvent:noop,revalidatePath:noop});
 return {state,rows,db,send:(message=cedar)=>post(new Request('https://fixture.invalid/api/ask',{method:'POST',body:JSON.stringify({petId:options.petId||pet.id,logicalTurnId:id(41),message})})),confirm:(actionId=id(71),decision='confirm',messageId=id(61))=>confirm(new Request('https://fixture.invalid/api/ask/actions/'+messageId,{method:'POST',body:JSON.stringify({actionId,decision})}),{params:Promise.resolve({messageId})})};
}

export const engineFixture=(options={})=>fixture({...options,engineCapabilities:true});

