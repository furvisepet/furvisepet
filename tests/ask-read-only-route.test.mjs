import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {ASK_REQUEST_KEYS,parseConfirmedTemporalScope} from "../app/lib/ask-request-contract.ts";
import {OperationDeadline} from "../app/lib/ai/execution-deadline.ts";
import {AskTurnLifecycle,deriveAskAttemptId} from "../app/lib/ai/ask-turn-model.ts";
import {buildAskConversationResponse} from "../app/lib/ask.mjs";
import {detectImmediateAskEmergency,buildImmediateEmergencyGuidance} from "../app/lib/ask-safety-context.ts";
import {classifyCurrentPetLoss} from "../app/lib/ai/pet-loss.ts";
const source=readFileSync(new URL("../app/api/ask/route.ts",import.meta.url),"utf8");
const ast=ts.createSourceFile("route.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=["POST","executeAskRequest","standaloneEmergencyResponse"];
const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>node.getText(ast).replace(/^export /,"")).join("\n");
function routeFixture(authentication={supabase:{from(){throw new Error("unexpected private data access");}},userId:"fixture-owner"}){
 const counters={auth:0,entitlement:0,provider:0};
 const scope={Request,Response,Headers,AbortSignal,OperationDeadline,AskTurnLifecycle,deriveAskAttemptId,buildAskConversationResponse,
  detectImmediateAskEmergency,buildImmediateEmergencyGuidance,classifyCurrentPetLoss,ASK_REQUEST_KEYS,parseConfirmedTemporalScope,
  ASK_OPERATION_TIMEOUT_MS:150000,ASK_MAX_QUESTION_CHARACTERS:1200,API_BODY_LIMITS:{ask:10000},RequestBoundaryError:Error,
  loadAskAuthenticationContext:async()=>{counters.auth++;return authentication;},readBoundedJson:request=>request.json(),
  hasOnlyKeys:(value,keys)=>value&&Object.keys(value).every(key=>keys.includes(key)),isUuid:value=>/^[a-f0-9-]{36}$/.test(value),
  resolveAskLocale:()=>"en",resolveAskTimeZone:()=>"UTC",hashAiCreditPayload:()=>"offline-hash",logAskStage:()=>{},logAskServerError:()=>{},emitAskTurnTrace:()=>{},
  loadAskEntitlementContext:async()=>{counters.entitlement++;throw new Error("simulated allowance infrastructure outage");},
  readOnlyProvider:()=>{counters.provider++;throw new Error("unexpected provider");},FURVISE_ASK_UNAVAILABLE_MESSAGE:"temporarily unavailable",
  askFailure:(code,message,status)=>Response.json({success:false,code,message},{status}),handleAskApiError:()=>Response.json({success:false},{status:503})};
 const POST=vm.runInNewContext(ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+"\nPOST",scope);
 const send=(message,extra={})=>POST(new Request("https://fixture.invalid/api/ask",{method:"POST",body:JSON.stringify({message,logicalTurnId:"11111111-1111-4111-8111-111111111111",...extra})}));
 return {send,counters};
}
test("actual public POST delivers emergency guidance before allowance, pet lookup, persistence and provider",async()=>{
 const f=routeFixture(),response=await f.send("My dog cannot breathe");
 assert.equal(response.status,200);const body=await response.json();
 assert.equal(body.handledWithoutAi,true);assert.equal(body.creditsUsed,0);assert.equal(body.persistence.saved,false);
 assert.match(body.response.summary,/Contact an emergency veterinarian or clinic now/);
 assert.equal(body.conversationId,undefined);assert.equal(body.usage,undefined);
 assert.deepEqual(f.counters,{auth:1,entitlement:0,provider:0});
});
test("actual POST preserves authentication and prevents caller-defined emergency bypass fields",async()=>{
 const denied=routeFixture({response:new Response(null,{status:401})});assert.equal((await denied.send("My dog cannot breathe")).status,401);
 const f=routeFixture();assert.equal((await f.send("My dog cannot breathe",{emergencyBypass:true})).status,400);
 assert.equal(f.counters.entitlement,0);assert.equal(f.counters.provider,0);
});
test("ordinary questions still fail closed when allowance infrastructure fails",async()=>{
 const f=routeFixture();assert.equal((await f.send("Why does glass reflect light?")).status,503);
 assert.equal(f.counters.entitlement,1);assert.equal(f.counters.provider,0);
});
test("test launcher terminates a pending test as a failure instead of hanging or silently skipping",()=>{
 const dir=mkdtempSync(join(tmpdir(),"furvise-runner-"));
 try{
  const path=join(dir,"pending.test.mjs");writeFileSync(path,'import test from "node:test"; test("pending fixture", async()=>new Promise(()=>{}));');
  const result=spawnSync(process.execPath,["scripts/run-tests.mjs","--test-timeout=100",path],{encoding:"utf8",timeout:15000});
  assert.equal(result.error,undefined);assert.equal(result.status,1);assert.match(result.stdout+result.stderr,/timeout|cancelled|pending/i);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
