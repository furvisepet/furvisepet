import {readOnlyProvider as nativeReadOnlyProvider} from "../../app/lib/ask-read-only/provider.ts";
import {safeAskProviderErrorDiagnostic} from "../../app/lib/ai/ask-provider-error-diagnostic.ts";
import assert from "node:assert/strict";
import {isDeepStrictEqual} from "node:util";
import {buildReadOnlyPublication} from "../../app/lib/ask-read-only/publication.ts";
import {finalizeDurableAskAnswer} from "../../app/lib/furvise-brain/durable-answer-finalization.ts";
import {buildSuccessfulAskResponse} from "../../app/lib/intelligence/finalize-ask-publication.ts";
import {isAiCreditIntegrityError} from "../../app/lib/ai/usage-ledger.ts";
import vm from "node:vm";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runReadOnlyAsk} from "../../app/lib/ask-read-only/core.mjs";
import {AskTurnLifecycle,deriveAskAttemptId} from "../../app/lib/ai/ask-turn-model.ts";
import {OperationDeadline} from "../../app/lib/ai/execution-deadline.ts";
import {AskPipelineError} from "../../app/lib/ai/ask-reasoning.ts";
import {createAskCreditSettlement} from "../../app/lib/ai/ask-credit-settlement.ts";
import {createAskAdmissionSettlement} from "../../app/lib/ai/ask-admission-settlement.ts";
import {ASK_REQUEST_KEYS,parseConfirmedTemporalScope} from "../../app/lib/ask-request-contract.ts";
import {resolveAskHistoryAccess} from "../../app/lib/intelligence/history-access.ts";
import {resolveAskTimeZone} from "../../app/lib/ask-time-zone.ts";
import {AiAdmissionError} from "../../app/lib/ai/usage-guard/errors.ts";
import {publicAskFailureCode,FURVISE_ANSWER_UNAVAILABLE_MESSAGE} from "../../app/lib/furvise-output.ts";
globalThis.fetch=async()=>{throw Error("Offline route tests forbid network");};
const source=readFileSync(new URL("../../app/api/ask/route.ts",import.meta.url),"utf8");
const ast=ts.createSourceFile("route.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=["POST","executeAskRequest","withTimeout","askFailure","internalFailureClass","logAskProviderEvent","safeAskOperationalCode","persistReadOnlyAnswer","finalizePersistedAskAnswer","validAssistantCompletionRow","completedResponseFromPersisted","AskApiError"];
const code=ast.statements.filter(n=>(ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n))&&names.includes(n.name?.text)).map(n=>n.getText(ast).replace(/^export /,"")).join("\n");
export const id=n=>"77777777-7777-4777-8777-"+String(n).padStart(12,"0");
const selected={id:id(2),user_id:id(1),name:"Juniper",species:"cat"};
export const note={kind:"history",id:id(3),ownerId:id(1),petId:id(2),body:"A saved observation.",eventAt:"2025-06-01T12:00:00Z",recordedAt:"2025-06-02T12:00:00Z"};
export const selection={calls:[{id:"read",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0})}],text:""};
export function readOnlyFailureRouteFixture(provider,records=[note],options={}){
 const state={calls:0,reads:0,credit:null,traces:[],errors:[],leaseReleased:0,admissionFailed:0,userMessages:0,tables:[],providerEvents:[],operationalEvents:[],events:[],persistedAnswer:null,readRequests:[]};
 const noop=()=>{};class InfrastructureError extends Error{}
 const q={select(){return q},eq(){return q},neq(){return q},retry(){return q},order(){return q},limit(){return q},abortSignal(){return q},async returns(){return {data:[selected],error:null}}};
 const db={from(table){state.tables.push(table);assert.equal(table,"dog_profiles","only profile admission may use this database fixture");return q}};
 const scope={Request,Response,Headers,AbortSignal,setTimeout,clearTimeout,console:options.realProviderLog?console:{info:noop,warn:noop},AskTurnLifecycle,deriveAskAttemptId,OperationDeadline,AskPipelineError,
  ASK_REQUEST_KEYS,parseConfirmedTemporalScope,resolveAskTimeZone,resolveAskHistoryAccess,runReadOnlyAsk,
  ASK_OPERATION_TIMEOUT_MS:150000,ASK_MAX_QUESTION_CHARACTERS:1200,askRequestTimeoutMs:120000,askGuardOperationTtlSeconds:180,
  API_BODY_LIMITS:{ask:10000},RequestBoundaryError:InfrastructureError,RateLimitRejection:InfrastructureError,AiAdmissionError,AiCreditLimitError:InfrastructureError,AiCreditLedgerError:InfrastructureError,
  loadAskAuthenticationContext:async()=>options.authentication??({supabase:db,userId:id(1)}),readBoundedJson:r=>r.json(),
  hasOnlyKeys:(v,keys)=>Object.keys(v).every(k=>keys.includes(k)),isUuid:v=>/^[a-f0-9-]{36}$/.test(v),isSecurityUuid:v=>/^[a-f0-9-]{36}$/.test(v),
  resolveAskLocale:()=>"en",hashAiCreditPayload:()=>"payload-hash",classifyCurrentPetLoss:()=>null,detectImmediateAskEmergency:()=>null,
  loadAskEntitlementContext:async()=>({usage:{allowed:true,remaining:5,limit:5,ledgerMode:"database"},planId:"free"}),
  readAskProfiles:async callback=>({...await callback(),diagnostic:{}}),loadPersistedRequest:async()=>null,
  claimWithRestoredAskOrigin:({claim,payload})=>claim(payload),claimIdempotentOperation:async()=>({operation:{execute:callback=>callback(),ownerToken:"offline-owner-token"}}),
  ensureConversationAndUserMessage:async()=>{state.userMessages++;if(options.conversationError)throw options.conversationError;return {conversationId:id(4),userMessageId:id(5),userSequence:1}},
  loadReadOnlyContext:async()=>({pets:[{id:id(2),ownerId:id(1),name:"Juniper",species:"cat"}],dialogue:[],...options.context}),
  requireRateLimitedRequest:async()=>({release:async()=>{state.leaseReleased++}}),getAskModelConfiguration:()=>({primary:options.model??"offline-model"}),getAskProviderCooldown:()=>({active:false}),
  admitAiOperation:async input=>{if(options.admissionError)throw options.admissionError;if(options.admitAiOperation)return options.admitAiOperation(input);return {run:callback=>callback(),complete:async()=>{},fail:async()=>{state.admissionFailed++}}},
  reserveAiCredit:async()=>{state.credit={status:"reserved",disposition:null};return {status:"reserved"}},
  createReadOnlyDataAccess:()=>async request=>{state.reads++;state.readRequests.push(structuredClone(request));assert.equal(request.pet.id,id(2));if(options.readError)throw options.readError;return {sources:records,total:records.length}},
  readOnlyProvider:(_model,onEvent)=>options.nativeClient
   ?nativeReadOnlyProvider(options.model??"offline-model",event=>{if(event.outcome==="started")state.calls++;state.providerEvents.push(event);onEvent(event);},options.nativeClient)
   :async(request,phase)=>{
    state.calls++;onEvent({stage:phase==="read_selection"?"interpretation":"primary",outcome:"started",model:"offline-model",elapsedMs:0});
    return provider(request,phase,state.calls);
   },
  logAskStage:noop,logAskServerError:(stage,error)=>state.errors.push({stage,error}),logAskPreProvider503:noop,logAskProviderEvent:noop,
  emitAskTurnTrace:trace=>state.traces.push(trace),isProviderRateLimit:()=>false,
  safeAskProviderErrorDiagnostic,emitOperationalEvent:event=>state.operationalEvents.push(event),
  isDeepStrictEqual,buildReadOnlyPublication,finalizeDurableAskAnswer,buildSuccessfulAskResponse,isAiCreditIntegrityError,
  completeAskConversationTurn:async input=>{
   assert.equal(input.userId,id(1));state.events.push("assistant:initial");
   state.persistedAnswer={id:id(7),request_id:input.requestId,context_used:input.contextUsed,save_metadata:input.saveMetadata,response_data:structuredClone(input.responseData)};
   return {data:[{assistant_message_id:id(7)}],error:null};
  },
  finalizeAskAssistantResponse:async input=>{
   assert.equal(input.userId,id(1));assert.equal(input.messageId,id(7));state.events.push("assistant:terminal");
   state.persistedAnswer.response_data=structuredClone(input.responseData);return {data:true,error:null};
  },
  loadPersistedRequestByConversation:async input=>{
   assert.equal(input.userId,id(1));return {conversationId:id(4),userMessageId:id(5),userSequence:1,assistantMessage:structuredClone(state.persistedAnswer)};
  },
  setAiCreditDisposition:async input=>{assert.equal(input.userId,id(1));state.credit.disposition=input.disposition;state.events.push("credit:intent");},
  completeAiCredit:async input=>{assert.equal(input.userId,id(1));assert.equal(state.persistedAnswer.response_data.turn.finalStage,"COMPLETED");assert.notEqual(state.credit.status,"completed");state.credit.status="completed";state.events.push("credit:complete");},
  getRemainingAiCredits:async()=>({limit:5,remaining:state.credit?.status==="completed"?4:5,planId:"free"}),
  publicAskFailureCode,safeAskDiagnosticStage:()=>"",
  handleAskApiError:error=>{state.errors.push({stage:"public_error",error});return Response.json({success:false},{status:503})},friendlyAnswerFailure:FURVISE_ANSWER_UNAVAILABLE_MESSAGE,FURVISE_ASK_UNAVAILABLE_MESSAGE:"unavailable"
 };
 Object.assign(scope,createAskAdmissionSettlement(noop),{
  safeReleaseAiCredit:createAskCreditSettlement({logAskStage:noop,logAskServerError:noop,ledger:{
   setDisposition:async input=>{assert.equal(input.userId,id(1));state.credit.disposition=input.disposition},
   reconcile:async()=>{state.credit.status="released";state.events.push("credit:release")},isIntegrityError:()=>false
  }}).safeReleaseAiCredit
 });
 const POST=vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+"\nPOST",scope);
 return {state,send:(question="Explain the saved observation.",extra={})=>POST(new Request("https://fixture.invalid/api/ask",{method:"POST",body:JSON.stringify({petId:id(2),logicalTurnId:id(6),message:question,...extra})}))};
}