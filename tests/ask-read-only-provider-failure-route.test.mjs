import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import {readFileSync} from "node:fs";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {AskTurnLifecycle,deriveAskAttemptId} from "../app/lib/ai/ask-turn-model.ts";
import {OperationDeadline} from "../app/lib/ai/execution-deadline.ts";
import {AskPipelineError} from "../app/lib/ai/ask-reasoning.ts";
import {createAskCreditSettlement} from "../app/lib/ai/ask-credit-settlement.ts";
import {createAskAdmissionSettlement} from "../app/lib/ai/ask-admission-settlement.ts";
import {ASK_REQUEST_KEYS,parseConfirmedTemporalScope} from "../app/lib/ask-request-contract.ts";
import {resolveAskHistoryAccess} from "../app/lib/intelligence/history-access.ts";
import {resolveAskTimeZone} from "../app/lib/ask-time-zone.ts";
import {FURVISE_ANSWER_UNAVAILABLE_MESSAGE} from "../app/lib/furvise-output.ts";
globalThis.fetch=async()=>{throw Error("Offline route tests forbid network");};
const source=readFileSync(new URL("../app/api/ask/route.ts",import.meta.url),"utf8");
const ast=ts.createSourceFile("route.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=["POST","executeAskRequest","withTimeout"];
const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast).replace(/^export /,"")).join("\n");
const id=n=>"77777777-7777-4777-8777-"+String(n).padStart(12,"0");
const selected={id:id(2),user_id:id(1),name:"Juniper",species:"cat"};
const note={kind:"history",id:id(3),ownerId:id(1),petId:id(2),body:"A saved observation.",eventAt:"2025-06-01T12:00:00Z",recordedAt:"2025-06-02T12:00:00Z"};
const selection={calls:[{id:"read",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:null,to:null,query:null,offset:0})}],text:""};
function fixture(provider,records=[note]){
 const state={calls:0,reads:0,credit:null,traces:[],errors:[],leaseReleased:0,admissionFailed:0,userMessages:0};
 const noop=()=>{};class InfrastructureError extends Error{}
 const q={select(){return q},eq(){return q},neq(){return q},retry(){return q},order(){return q},limit(){return q},abortSignal(){return q},async returns(){return {data:[selected],error:null}}};
 const db={from(table){assert.equal(table,"dog_profiles","only profile admission may use this database fixture");return q}};
 const scope={Request,Response,Headers,AbortSignal,setTimeout,clearTimeout,console:{info:noop,warn:noop},AskTurnLifecycle,deriveAskAttemptId,OperationDeadline,AskPipelineError,
  ASK_REQUEST_KEYS,parseConfirmedTemporalScope,resolveAskTimeZone,resolveAskHistoryAccess,runReadOnlyAsk,
  ASK_OPERATION_TIMEOUT_MS:150000,ASK_MAX_QUESTION_CHARACTERS:1200,askRequestTimeoutMs:120000,askGuardOperationTtlSeconds:180,
  API_BODY_LIMITS:{ask:10000},RequestBoundaryError:InfrastructureError,RateLimitRejection:InfrastructureError,AiAdmissionError:InfrastructureError,AiCreditLimitError:InfrastructureError,AiCreditLedgerError:InfrastructureError,
  loadAskAuthenticationContext:async()=>({supabase:db,userId:id(1)}),readBoundedJson:r=>r.json(),
  hasOnlyKeys:(v,keys)=>Object.keys(v).every(k=>keys.includes(k)),isUuid:v=>/^[a-f0-9-]{36}$/.test(v),isSecurityUuid:v=>/^[a-f0-9-]{36}$/.test(v),
  resolveAskLocale:()=>"en",hashAiCreditPayload:()=>"payload-hash",classifyCurrentPetLoss:()=>null,detectImmediateAskEmergency:()=>null,
  loadAskEntitlementContext:async()=>({usage:{allowed:true,remaining:5,limit:5,ledgerMode:"database"},planId:"free"}),
  readAskProfiles:async callback=>({...await callback(),diagnostic:{}}),loadPersistedRequest:async()=>null,
  claimWithRestoredAskOrigin:({claim,payload})=>claim(payload),claimIdempotentOperation:async()=>({operation:{execute:callback=>callback(),ownerToken:"offline-owner-token"}}),
  ensureConversationAndUserMessage:async()=>{state.userMessages++;return {conversationId:id(4),userMessageId:id(5),userSequence:1}},
  loadReadOnlyContext:async()=>({pets:[{id:id(2),ownerId:id(1),name:"Juniper",species:"cat"}],dialogue:[]}),
  requireRateLimitedRequest:async()=>({release:async()=>{state.leaseReleased++}}),getAskModelConfiguration:()=>({primary:"offline-model"}),getAskProviderCooldown:()=>({active:false}),
  admitAiOperation:async()=>({run:callback=>callback(),complete:async()=>{},fail:async()=>{state.admissionFailed++}}),
  reserveAiCredit:async()=>{state.credit={status:"reserved",disposition:null};return {status:"reserved"}},
  createReadOnlyDataAccess:()=>async request=>{state.reads++;assert.equal(request.pet.id,id(2));return {sources:records,total:records.length}},
  readOnlyProvider:(_model,onEvent)=>async(request,phase)=>{
   state.calls++;onEvent({stage:phase==="read_selection"?"interpretation":"primary",outcome:"started",model:"offline-model",elapsedMs:0});
   return provider(request,phase,state.calls);
  },
  logAskStage:noop,logAskServerError:(stage,error)=>state.errors.push({stage,error}),logAskPreProvider503:noop,logAskProviderEvent:noop,
  emitAskTurnTrace:trace=>state.traces.push(trace),isProviderRateLimit:()=>false,
  askFailure:(code,message,status,extra={})=>Response.json({success:false,code,message,...extra},{status}),
  handleAskApiError:error=>{state.errors.push({stage:"public_error",error});return Response.json({success:false},{status:503})},friendlyAnswerFailure:FURVISE_ANSWER_UNAVAILABLE_MESSAGE,FURVISE_ASK_UNAVAILABLE_MESSAGE:"unavailable"
 };
 Object.assign(scope,createAskAdmissionSettlement(noop),{
  safeReleaseAiCredit:createAskCreditSettlement({logAskStage:noop,logAskServerError:noop,ledger:{
   setDisposition:async input=>{assert.equal(input.userId,id(1));state.credit.disposition=input.disposition},
   reconcile:async()=>{state.credit.status="released"},isIntegrityError:()=>false
  }}).safeReleaseAiCredit
 });
 const POST=vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+"\nPOST",scope);
 return {state,send:()=>POST(new Request("https://fixture.invalid/api/ask",{method:"POST",body:JSON.stringify({petId:id(2),logicalTurnId:id(6),message:"Explain the saved observation."})}))};
}
function assertFailed(f,response,expectedCalls,expectedReads){
 assert.equal(response.status,503,JSON.stringify(f.state.errors));
 assert.equal(f.state.calls,expectedCalls,JSON.stringify(f.state.errors.map(x=>({stage:x.stage,error:String(x.error),stack:x.error?.stack}))));assert.equal(f.state.reads,expectedReads);assert.equal(f.state.userMessages,1);
 assert.deepEqual(f.state.credit,{status:"released",disposition:"release"});
 assert.equal(f.state.leaseReleased,1);assert.equal(f.state.admissionFailed,1);
 assert.equal(f.state.traces.at(-1).providerCallCount,expectedCalls);
}
for(const failedCall of [1,2])test("actual public POST releases credit after provider HTTP 500 on physical call "+failedCall,async()=>{
 const f=fixture(async(_request,_phase,call)=>{if(call===failedCall)throw new AskPipelineError("primary_provider_failed","private-provider-detail",{model:"offline-model",elapsedMs:1,providerStatus:500});return selection});
 const response=await f.send();assertFailed(f,response,failedCall,failedCall-1);
 assert.ok(f.state.errors.some(x=>x.error?.diagnostics?.providerStatus===500));
 const body=await response.json();assert.equal(body.message,FURVISE_ANSWER_UNAVAILABLE_MESSAGE);assert.ok(!JSON.stringify(body).includes("private-provider-detail"));
});
test("actual public POST rejects a malformed native tool before source access and releases credit",async()=>{
 const f=fixture(async()=>({calls:[{...selection.calls[0],name:"delete_record"}],text:""}));
 assertFailed(f,await f.send(),1,0);
 assert.ok(f.state.errors.some(x=>String(x.error).includes("ASK_READ_TOOL_INVALID")));
});
test("actual public POST rejects a foreign source before the answer call and releases credit",async()=>{
 const f=fixture(async()=>selection,[{...note,ownerId:id(99)}]);assertFailed(f,await f.send(),1,1);
 assert.ok(f.state.errors.some(x=>String(x.error).includes("NOT_AUTHORIZED")));
});
test("actual public POST rejects a fabricated final quote handle without a repair call",async()=>{
 const f=fixture(async(_request,_phase,call)=>call===1?selection:{answer:"A note.",quotes:["invented"],sources:[],calculations:[],replyType:"answer"});
 assertFailed(f,await f.send(),2,1);
 assert.ok(f.state.errors.some(x=>String(x.error).includes("ASK_READ_QUOTE_NOT_VERIFIED")));
});

test("actual public POST deadline releases a reserved credit without a second call or source read",async t=>{
 t.mock.timers.enable({apis:["setTimeout","Date"],now:Date.parse("2026-11-08T12:00:00Z")});
 let started,rejectProvider;const began=new Promise(resolve=>{started=resolve});
 const f=fixture(async()=>{started();return new Promise((_resolve,reject)=>{rejectProvider=reject})});
 const pending=f.send();
 await Promise.race([began,pending.then(response=>{throw Error("Provider boundary not reached: "+response.status)})]);
 t.mock.timers.tick(120000);
 const response=await pending;assertFailed(f,response,1,0);
 assert.ok(f.state.errors.some(x=>String(x.error).includes("Ask request timed out")));
 const before=JSON.stringify({calls:f.state.calls,reads:f.state.reads,credit:f.state.credit});
 rejectProvider(new Error("late provider abort"));await Promise.resolve();await Promise.resolve();
 assert.equal(JSON.stringify({calls:f.state.calls,reads:f.state.reads,credit:f.state.credit}),before);
});
