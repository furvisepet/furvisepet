import test from "node:test";
import assert from "node:assert/strict";
import {AskPipelineError} from "../app/lib/ai/ask-reasoning.ts";
import {AiAdmissionError} from "../app/lib/ai/usage-guard/errors.ts";
import {getAskErrorPresentation} from "../app/lib/furvise-output.ts";
import {readOnlyFailureRouteFixture as fixture,note,selection,id} from "./helpers/ask-read-only-failure-route.mjs";
function assertFailed(f,response,expectedCalls,expectedReads){
 assert.equal(response.status,503,JSON.stringify(f.state.errors));
 assert.equal(f.state.calls,expectedCalls,JSON.stringify(f.state.errors.map(x=>({stage:x.stage,error:String(x.error),stack:x.error?.stack}))));assert.equal(f.state.reads,expectedReads);assert.equal(f.state.userMessages,1);
 assert.deepEqual(f.state.credit,{status:"released",disposition:"release"});
 assert.equal(f.state.leaseReleased,1);assert.equal(f.state.admissionFailed,1);
 assert.equal(f.state.traces.at(-1).providerCallCount,expectedCalls);
 assert.equal(f.state.traces.at(-1).finalStage,"FAILED_FINAL");
}
for(const failedCall of [1,2])test("actual public POST releases credit after provider HTTP 500 on physical call "+failedCall,async()=>{
 const f=fixture(async(_request,_phase,call)=>{if(call===failedCall)throw new AskPipelineError("primary_provider_failed","private-provider-detail",{model:"offline-model",elapsedMs:1,providerStatus:500});return selection});
 const response=await f.send();assertFailed(f,response,failedCall,failedCall-1);
 assert.ok(f.state.errors.some(x=>x.error?.diagnostics?.providerStatus===500));
 const body=await response.json();assert.equal(body.code,"ANSWER_NOT_COMPLETED");assert.equal(body.retryable,false);const presentation=getAskErrorPresentation(body.code);assert.equal(presentation.retryable,false);assert.equal(presentation.recommendedAction,"edit");assert.ok(!JSON.stringify(body).includes("private-provider-detail"));
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

test("a durable exhausted turn offers review rather than another provider attempt",async()=>{
 const f=fixture(async()=>{throw Error("must not reach provider")},[note],{admissionError:new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED","provider_call_budget_exhausted")});
 const response=await f.send(),body=await response.json();
 assert.equal(response.status,503);assert.equal(body.code,"ANSWER_NOT_COMPLETED");
 assert.equal(body.retryable,false);assert.equal(f.state.calls,0);assert.equal(f.state.reads,0);assert.equal(f.state.credit,null);
 assert.equal(f.state.traces.at(-1).finalStage,"FAILED_FINAL");
});
test("an infrastructure refusal before any provider call keeps the same safe retry",async()=>{
 const f=fixture(async()=>{throw Error("must not reach provider")},[note],{admissionError:new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE","unavailable")});
 const response=await f.send(),body=await response.json();
 assert.equal(response.status,503);assert.equal(body.code,"TEMPORARY_PROVIDER_FAILURE");
 assert.equal(getAskErrorPresentation(body.code).retryable,true);assert.equal(f.state.calls,0);assert.equal(f.state.credit,null);
});
