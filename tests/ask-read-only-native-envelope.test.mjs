import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import {readOnlyProvider} from "../app/lib/ask-read-only/provider.ts";
import {runReadOnlyAsk,readOnlyToolsForPets,readOnlyAnswerSchemaForSources} from "../app/lib/ask-read-only/core.mjs";
const marker="PRIVATE synthetic owner@example.invalid detail";
const requestId="req_0123456789abcdef0123456789abcdef";
const input={ownerId:"owner",selectedPetId:"pet",pets:[{id:"pet",ownerId:"owner",name:"Juniper",species:"cat"}],dialogue:[],question:"Explain a shadow.",now:"2026-11-08T12:00:00Z",timeZone:"UTC"};
const answer={answer:"A general explanation.",quotes:[],sources:[],calculations:[],replyType:"answer"};
const message=text=>({type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text}]});
const envelope=output=>({status:"completed",output,usage:{input_tokens:1,output_tokens:1}});
const phaseInput=phase=>phase==="read_selection"?{instructions:"Explain or request an owned read.",context:{question:input.question},tools:readOnlyToolsForPets([{handle:"p1"}])}:{instructions:"Review.",context:{question:input.question},draft:"Draft.",TOOL_DATA:[],schema:readOnlyAnswerSchemaForSources([])};
for(const phase of ["read_selection","read_answer"])test("native "+phase+" projects upstream errors without private codes or bodies",async()=>{
 const events=[];let clientCalls=0;
 const client={responses:{create:async()=>{clientCalls++;throw new OpenAI.BadRequestError(400,{code:marker,type:"invalid_request_error",param:"tools",message:marker},marker,new Headers({"x-request-id":requestId}));}}};
 let error;try{await readOnlyProvider("offline",e=>events.push(e),client)(phaseInput(phase),phase);}catch(e){error=e;}
 assert.ok(error);assert.equal(clientCalls,1);
 assert.ok(!JSON.stringify({events,diagnostics:error.diagnostics}).includes(marker),"private provider fields must not escape the safe projection");
 const failed=events.find(e=>e.outcome==="failed");
 assert.equal(failed.providerErrorCode,"other");assert.equal(failed.providerError.status,400);assert.equal(failed.providerError.param,"tools");
 assert.equal(failed.providerError.requestId,requestId);
});
test("native 500 preserves safe support identity without retrying",async()=>{
 const events=[];let clientCalls=0;
 const client={responses:{create:async()=>{clientCalls++;throw new OpenAI.InternalServerError(500,{code:"server_error",type:"server_error",message:marker},marker,new Headers({"x-request-id":requestId}));}}};
 await assert.rejects(readOnlyProvider("offline",e=>events.push(e),client)(phaseInput("read_answer"),"read_answer"));
 assert.equal(clientCalls,1);const failed=events.find(e=>e.outcome==="failed");
 assert.equal(failed.providerError.requestId,requestId);assert.equal(failed.providerError.code,"server_error");
 assert.ok(!JSON.stringify(events).includes(marker));
});
test("native error projection does not execute unknown error getters",async()=>{
 let invoked=0;const thrown={};for(const key of ["name","status","code","error","message","stack"])
  Object.defineProperty(thrown,key,{get(){invoked++;return marker;}});
 const events=[],client={responses:{create:async()=>{throw thrown;}}};
 await assert.rejects(readOnlyProvider("offline",e=>events.push(e),client)(phaseInput("read_selection"),"read_selection"));
 assert.equal(invoked,0);assert.ok(!JSON.stringify(events).includes(marker));
});
for(const [name,bad] of [
 ["empty completed",envelope([])],
 ["reasoning only",envelope([{type:"reasoning",status:"completed",summary:[]}])],
 ["completed with error",{...envelope([message("A draft.")]),error:{code:"server_error",message:marker}}],
 ["refusal only",envelope([{type:"message",content:[{type:"refusal",refusal:marker}]}])],
 ["refusal plus answer",envelope([{type:"message",content:[{type:"refusal",refusal:marker},{type:"output_text",text:"A draft."}]}])]
])test("native "+name+" fails before a second provider phase or any read",async()=>{
 let clientCalls=0,readCalls=0;const events=[];
 const client={responses:{create:async()=>{clientCalls++;return clientCalls===1?bad:envelope([message(JSON.stringify(answer))]);}}};
 await assert.rejects(runReadOnlyAsk(input,{provider:readOnlyProvider("offline",e=>events.push(e),client),read:async()=>{readCalls++;throw Error("unexpected read");}}));
 assert.equal(clientCalls,1);assert.equal(readCalls,0);
 assert.ok(!events.some(e=>e.outcome==="succeeded"),"invalid payload cannot emit a successful phase");
 assert.ok(!JSON.stringify(events).includes(marker));
});
test("native tool selection permits empty narration when a read tool is present",async()=>{
 const client={responses:{create:async()=>envelope([{type:"function_call",call_id:"read-one",name:"read_pet_profile",arguments:JSON.stringify({pet:"p1"})}])}};
 const result=await readOnlyProvider("offline",()=>{},client)(phaseInput("read_selection"),"read_selection");
 assert.equal(result.text,"");assert.equal(result.calls.length,1);
});
test("native standalone draft text remains available",async()=>{
 const client={responses:{create:async()=>envelope([message("A general explanation.")])}};
 const result=await readOnlyProvider("offline",()=>{},client)(phaseInput("read_selection"),"read_selection");
 assert.equal(result.text,"A general explanation.");assert.deepEqual(result.calls,[]);
});
