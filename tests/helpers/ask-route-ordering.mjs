// Offline execution of the actual POST handlers. Only provider/DB/auth IO is replaced.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,next) {
 if(s==='server-only') return {shortCircuit:true,url:'data:text/javascript,export {}'};
 if(s.endsWith('/security/idempotency/admin-client.ts')) return {shortCircuit:true,url:'data:text/javascript,export const createIdempotencyAdminClient=()=>globalThis.__routeFixture.db;'};
 if(s.endsWith('/ask-conversation-authority.ts')) return {shortCircuit:true,url:'data:text/javascript,export const completeAskConversationTurn=(x)=>globalThis.__routeFixture.complete(x);export const updateAskAssistantResponse=(x)=>globalThis.__routeFixture.update(x);'};
 if(s.startsWith(".") && c.parentURL?.startsWith("file:")) { for(const ext of [".ts",".tsx",".mjs"]) { const url=new URL(s+ext,c.parentURL); if(existsSync(url)) return next(url.href,c); } }
 return next(s,c);
}});
globalThis.fetch=async()=>{throw Error('Offline route proof forbids network');};
const {buildFurvisePlanningContext}=await import('../../app/lib/intelligence/planning-context.ts');
const {prepareAppendTurn,continueConfirmedAppend}=await import('../../app/lib/intelligence/append-turn.ts');
const {executeActionCapability}=await import('../../app/lib/application-actions/capabilities.ts');
const {interpretAskQuestion}=await import('../../app/lib/intelligence/interpret-ask.ts');
const {exceedsSelectedPetRead}=await import('../../app/lib/intelligence/selected-pet-read.ts');
const {explicitlyNamedOwnedPets}=await import('../../app/lib/intelligence/entities/resolve-turn-subject.ts');
const {AskTurnLifecycle,deriveAskAttemptId}=await import('../../app/lib/ai/ask-turn-model.ts');
const {OperationDeadline}=await import('../../app/lib/ai/execution-deadline.ts');
const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
const {resolveAskTimeZone}=await import('../../app/lib/ask-time-zone.ts');
const {resolveAskHistoryAccess}=await import('../../app/lib/intelligence/history-access.ts');
const {detectImmediateAskEmergency,buildImmediateEmergencyGuidance}=await import('../../app/lib/ask-safety-context.ts');
const {ASK_REQUEST_KEYS}=await import('../../app/lib/ask-request-contract.ts');
export const id=n=>`89100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const cedar='log that Cedar refused lunch. what are his last two weights';
export function proposal(message=cedar){return {version:'ask-request.v2',mode:'mixed',question:message,requirements:[],referenceTurnIds:[],scope:'selected',petNames:[],operation:'recall',selection:'latest',quantity:'records',topic:'weight',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,task:null,writeJob:null,evidenceBasis:'saved_history',premiseQuotes:[],
 appendJob:{operation:'append',petName:'Cedar',bodyQuote:'Cedar refused lunch.',companionQuote:'what are his last two weights'},
 readTicket:{operation:'read',subjectScope:'selected',temporal:{from:null,to:null,anchor:null},predicates:[{kind:'text_any',terms:['weight','weighed']}],outputs:{completeness:'exhaustive',ordering:'desc',limit:2}}};}
function handler(path,names,scope){const source=readFileSync(new URL(path,import.meta.url),'utf8');const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast).replace(/^export /,'')).join('\n');
 return vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nPOST',scope);}
export function fixture(options={}){
 const events=[],errors=[];const state={planner:0,confirmed:false,options,events,errors};
 const pet={id:id(11),user_id:id(1),name:'Cedar',species:'dog',lifecycle_status:'active',sex:'male'};
 const rows={dog_profiles:[pet],ask_conversations:[{id:id(21),user_id:id(1),pet_profile_id:pet.id}],ask_conversation_messages:[],ask_action_capabilities:[],pet_care_entries:[]};
 const care=(n,date,note)=>({id:id(n),user_id:id(1),pet_profile_id:pet.id,category:'general',title:null,note,occurred_at:date,created_at:date,updated_at:date,deleted_at:null});
 rows.pet_care_entries.push(care(51,'2025-06-15T12:00:00Z','Cedar weighed 9.2 kg.'),care(52,'2025-07-15T12:00:00Z','Cedar weighed 9.4 kg.'));
 function query(table){let filters=[],sort=[],offset=0,limit=Infinity,insert=null;const q={
 select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},neq(k,v){filters.push(r=>r[k]!==v);return q;},is(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},gte(k,v){filters.push(r=>r[k]>=v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},
 order(k,{ascending=true}={}){sort.push([k,ascending]);return q;},range(a,b){offset=a;limit=b-a+1;return q;},limit(n){limit=n;return q;},retry(){return q;},abortSignal(){return q;},insert(v){insert=v;return q;},
 async result(single=false){events.push(`read:${table}`);if(table==='pet_care_entries'){assert.ok(state.confirmed,'No factual retrieval before confirmation and receipt');if(options.readFailure)return{data:null,error:{code:'offline'}};}
 if(insert){assert.equal(table,'ask_action_capabilities');rows[table].push({...insert,id:id(71),status:'pending',receipt:null,expires_at:'2099-01-01T00:00:00Z'});insert=null;}
 let data=rows[table].filter(r=>filters.every(f=>f(r)));if(sort.length)data=data.toSorted((a,b)=>{for(const [k,asc]of sort){const x=String(a[k]).localeCompare(String(b[k]));if(x)return asc?x:-x;}return 0;});data=data.slice(offset,offset+limit);return {data:single?data[0]||null:data,error:null};},
 maybeSingle(){return q.result(true);},single(){return q.result(true);},returns(){return q.result();},then(a,b){return q.result().then(a,b);}};return q;}
 const db={from(table){assert.ok(rows[table],`Unexpected table ${table}`);return query(table);},rpc(name,args){
 if(name==='read_ask_history_correction_page'){assert.ok(state.confirmed);events.push('lungs:lineage');return {abortSignal:async()=>({data:{claims:[],relations:[],lineage:[],sources:rows.pet_care_entries.filter(r=>args.p_care_ids.includes(r.id)),truncated:false},error:null})};}
 assert.equal(name,'execute_ask_action_capability');return {maybeSingle:async()=>{events.push('heart:execute');const cap=rows.ask_action_capabilities.find(r=>r.id===args.p_capability_id&&r.user_id===args.p_user_id&&r.assistant_message_id===args.p_assistant_message_id);if(!cap)return{data:null,error:null};
 if(options.dbFailure)return {data:null,error:{code:'42501'}};
 const changed=cap.status==='pending'&&args.p_mode==='confirm';const status=args.p_mode==='cancel'?'cancelled':'succeeded';
 const action={...cap.action_payload,id:cap.id,status,resultMessage:status==='succeeded'?'Saved.':null};
 if(changed){rows.pet_care_entries.push(care(53,'2026-09-20T12:00:00Z',action.input.detail));events.push('heart:row');}
 cap.status=status;cap.receipt=options.noReceipt?null:action;if(cap.receipt&&status==='succeeded'){events.push('heart:receipt');state.confirmed=true;}
 if(options.lostAcknowledgment && !state.ackLost){state.ackLost=true;return{data:null,error:{code:'connection_lost_after_commit'}};}
 return {data:{action,changed},error:null};}};}};
 globalThis.__routeFixture={db,complete:async x=>{if(options.conversationFailure)return{data:null,error:Error('unavailable')};let row=rows.ask_conversation_messages.find(r=>r.id===id(61));if(!row){row={id:id(61),user_id:id(1),conversation_id:id(21),role:'furvise',sequence_number:2,created_at:'2026-09-20T12:00:00Z'};rows.ask_conversation_messages.push(row);}row.response_data=x.responseData;return{data:[{assistant_message_id:row.id}],error:null};},update:async x=>{const row=rows.ask_conversation_messages.find(r=>r.id===x.messageId&&r.user_id===x.userId);if(!row)return{data:false,error:null};row.response_data=x.responseData;return{data:true,error:null};}};
 const noop=()=>{};class FixtureError extends Error{};
 const sandbox={Response,Request,Headers,AbortSignal,console,ASK_REQUEST_KEYS,AskTurnLifecycle,deriveAskAttemptId,OperationDeadline,resolveAskTimeZone,resolveAskHistoryAccess,buildAskConversationResponse,detectImmediateAskEmergency,buildImmediateEmergencyGuidance,prepareAppendTurn,buildFurvisePlanningContext,exceedsSelectedPetRead,explicitlyNamedOwnedPets,
 ASK_OPERATION_TIMEOUT_MS:150000,ASK_MAX_QUESTION_CHARACTERS:1200,API_BODY_LIMITS:{ask:10000},RequestBoundaryError:FixtureError,RateLimitRejection:FixtureError,FurviseContextError:FixtureError,AiAdmissionError:FixtureError,AiCreditLimitError:FixtureError,AiCreditLedgerError:FixtureError,AskPipelineError:FixtureError,
 loadAskAuthenticationContext:async()=>options.denied?{response:Response.json({success:false},{status:401})}:{supabase:db,userId:id(1)},readBoundedJson:r=>r.json(),hasOnlyKeys:()=>true,isUuid:v=>/^[a-f0-9-]{36}$/.test(v),isSecurityUuid:v=>/^[a-f0-9-]{36}$/.test(v),resolveAskLocale:()=> 'en',hashAiCreditPayload:()=> 'hash',
 classifyCurrentPetLoss:()=>null,logAskStage:noop,logAskServerError:(stage,error)=>errors.push({stage,error}),emitAskTurnTrace:noop,
 loadAskEntitlementContext:async()=>({usage:{allowed:true,remaining:5,limit:5,ledgerMode:'development_missing_migration'},planId:'free'}),
 readAskProfiles:async cb=>({...await cb(undefined),diagnostic:{}}),loadPersistedRequest:async()=>null,
 claimWithRestoredAskOrigin:({claim,payload})=>claim(payload),claimIdempotentOperation:async()=>({operation:{execute:fn=>fn(),ownerToken:'lease',payloadHash:'hash'}}),
 ensureConversationAndUserMessage:async({question})=>{rows.ask_conversation_messages.push({id:id(31),user_id:id(1),conversation_id:id(21),role:'user',user_text:question,sequence_number:1,created_at:'2026-09-20T12:00:00Z'});return{conversationId:id(21),userMessageId:id(31),userSequence:1};},
 requireRateLimitedRequest:async()=>({release:async()=>events.push('rate:release')}),reportOptionalContextRecovery:noop,recordContextRecoveryOnTurn:noop,
 derivePendingLifecycleAssertion:()=>null,getPetLifecycleStatus:()=> 'active',resolveDurableLifecycleCorrection:()=>null,deriveAskTurnView:()=>({contextUsed:{usedSources:[]},concerns:[],recentlyResolvedConcerns:[]}),
 getAskModelConfiguration:()=>({primary:'offline-fixture'}),getAskProviderCooldown:()=>({active:false}),askGuardOperationTtlSeconds:180,askRequestTimeoutMs:120000,
 admitAiOperation:async()=>({run:cb=>cb(),complete:async()=>{},fail:async()=>{}}),withTimeout:p=>p,
 interpretAskQuestion:async input=>{events.push('brain');return interpretAskQuestion({...input,client:{responses:{create:async()=>{state.planner++;if(options.modelDown)throw Error('offline provider');return {output_text:JSON.stringify(options.proposal||proposal())};}}}});},logAskProviderEvent:noop,
 buildSubjectClarificationOrchestration:()=>({intent:'clarification',answer:{},safetyLevel:'normal',handledWithoutAi:true}),
 buildFurviseContext:async()=>{throw Error('Cedar may not load factual context before confirm');},failAiAdmission:async()=>{},logAskPreProvider503:noop,
 askFailure:(code,message,status)=>Response.json({success:false,code,message},{status}),handleAskApiError:(error)=>{errors.push({error});return Response.json({success:false,error:String(error)},{status:503});},friendlyAnswerFailure:'unavailable',FURVISE_ASK_UNAVAILABLE_MESSAGE:'unavailable',
 standaloneEmergencyResponse:({response})=>Response.json({success:true,response,creditsUsed:0}),
 };
 const post=handler('../../app/api/ask/route.ts',['POST','executeAskRequest'],sandbox);
 const confirm=handler('../../app/api/ask/actions/[messageId]/route.ts',['POST','unavailable','revalidateActionViews'],{...sandbox,executeActionCapability,continueConfirmedAppend,getAuthenticatedApiContext:async()=>({supabase:db,userId:options.confirmOwner||id(1)}),emitOperationalEvent:noop,revalidatePath:noop});
 return {state,rows,db,send:(message=cedar)=>post(new Request('https://fixture.invalid/api/ask',{method:'POST',body:JSON.stringify({petId:options.petId||pet.id,logicalTurnId:id(41),message})})),confirm:(actionId=id(71),decision='confirm',messageId=id(61))=>confirm(new Request('https://fixture.invalid/api/ask/actions/'+messageId,{method:'POST',body:JSON.stringify({actionId,decision})}),{params:Promise.resolve({messageId})})};
}
