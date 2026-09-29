import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {interpretStructuredProviderResponse as interpret, structuredProviderEnvelopeDiagnostic as diagnostic} from "../app/lib/ai/ask-provider.ts";
import {interpretAskQuestion} from "../app/lib/intelligence/interpret-ask.ts";
const message = (status="completed", content=[{type:"output_text",text:"{}"}]) => ({id:"synthetic-message",type:"message",role:"assistant",status,content});
const cases = [
 ["completed message",{status:"completed",output:[message()]},"completed",true],
 ...["max_output_tokens","content_filter",null,undefined].map(reason=>["incomplete "+reason,{status:"incomplete",incomplete_details:reason===undefined?undefined:{reason},output:[message()]},"incomplete",false]),
 ...["completed","in_progress","incomplete"].map(status=>["reasoning "+status,{status:"completed",output:[{type:"reasoning",status,summary:[]},message() ]},status==="incomplete"?"incomplete":"completed",status!=="incomplete"]),
 ["incomplete message",{status:"completed",output:[message("incomplete")]},"incomplete",false],
 ["refusal",{status:"completed",output:[message("completed",[{type:"refusal",refusal:"Synthetic refusal"}])]},"refused",false],
 ["empty refusal",{status:"completed",output:[message("completed",[{type:"refusal",refusal:""}])]},"invalid",false],
 ["failed",{status:"failed",error:{code:"server_error",message:"Never log this body"},output:[]},"failed",false],
 ["completed with error",{status:"completed",error:{code:"invalid_prompt",message:"Never log this body"},output:[message()]},"failed",false],
 ...["queued","in_progress","cancelled"].map(status=>[status,{status,output:[message()]},"invalid",false]),
 ["empty completed",{status:"completed",output:[]},"invalid",false],
 ["aggregate text compatibility",{status:"completed",output_text:"{}"},"completed",true],
];
for(const [name,envelope,expected,parsing] of cases) test("envelope audit: "+name,()=>{
 let calls=0;
 const before=structuredClone(envelope);
 const result=interpret(envelope,text=>{calls++;return JSON.parse(text);});
 const safe=diagnostic(envelope);
 assert.equal(result.status,expected);assert.equal(result.parsingAttempted,parsing);assert.equal(calls,parsing?1:0);
 assert.equal(safe.responseStatus,envelope.status);assert.deepEqual(envelope,before);
 assert.deepEqual(safe.outputItems,(envelope.output||[]).map(x=>({type:x.type,status:x.status??null})));
});
for(const usage of [undefined,null,{input_tokens:0,output_tokens:0},{input_tokens:91,output_tokens:17},{input_tokens:-1,output_tokens:NaN}])
 test("usage presence and counts: "+JSON.stringify(usage),()=>{
 const safe=diagnostic({usage});
 assert.equal(safe.hasUsage,usage!=null);
 assert.equal(safe.inputTokens,Number.isSafeInteger(usage?.input_tokens)&&usage.input_tokens>=0?usage.input_tokens:null);
 assert.equal(safe.outputTokens,Number.isSafeInteger(usage?.output_tokens)&&usage.output_tokens>=0?usage.output_tokens:null);
});
test("diagnostics never copy identifiers, text, raw errors, unknown enums, schema, or headers",()=>{
 const secret="SENTINEL_PRIVATE_CONTENT";
 const safe=diagnostic({id:secret,status:secret,output_text:secret,incomplete_details:{reason:secret},
 error:{code:secret,message:secret},headers:{authorization:secret},schema:{description:secret},
 output:[{type:secret,status:secret,id:secret,content:[{type:"output_text",text:secret}]},
 message("completed",[{type:"refusal",refusal:secret},{type:"output_text",text:secret}])],usage:{input_tokens:2,output_tokens:3}});
 assert.ok(!JSON.stringify(safe).includes(secret));
 assert.equal(safe.responseStatus,"other");assert.equal(safe.errorCode,"other");assert.equal(safe.incompleteReason,"other");
 assert.equal(safe.hasMessageRefusal,true);assert.equal(safe.hasMessageOutputText,true);
 assert.equal(safe.outputItems[0].type,"other");
});
test("bounded item diagnostics and message-only content flags",()=>{
 const safe=diagnostic({output:Array.from({length:100},()=>({type:"reasoning",status:"incomplete",content:[{type:"refusal",refusal:"not-message"}]}))});
 assert.equal(safe.outputItems.length,32);assert.equal(safe.outputItemCount,100);assert.equal(safe.outputItemsTruncated,true);
 assert.equal(safe.hasMessageRefusal,false);assert.equal(safe.hasMessageOutputText,false);
});
for(const envelope of [
 {status:"incomplete",incomplete_details:{reason:"content_filter"},output:[],usage:{input_tokens:0,output_tokens:0}},
 {status:"completed",output:[{type:"reasoning",status:"incomplete",summary:[]},message()],usage:{input_tokens:7,output_tokens:9}}
]) test("interpretation failure preserves safe envelope and makes exactly one stub call: "+envelope.status,async t=>{
 t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",()=>{});
 const pet={id:"synthetic-subject",user_id:"synthetic-owner",name:"Offline Subject",species:"dog"};
 const context={owner:{userId:pet.user_id},pet,eligiblePets:[pet],currentMessage:"Offline envelope diagnostic.",
 currentTurn:{id:"synthetic-turn",role:"user",text:"Offline envelope diagnostic."},conversationTurns:[],timeZone:"UTC"};
 let calls=0;const events=[];
 await assert.rejects(interpretAskQuestion({context,model:"gpt-5.4-mini",onProviderEvent:e=>events.push(e),client:{responses:{create:async()=>{calls++;return envelope;}}}}),
 e=>{assert.equal(e.diagnostics.providerErrorCode,"ASK_INTERPRETATION_INCOMPLETE");assert.deepEqual(e.diagnostics.providerEnvelope,diagnostic(envelope));assert.equal(e.diagnostics.parsingAttempted,false);return true;});
 assert.equal(calls,1);assert.deepEqual(events.at(-1).providerEnvelope,diagnostic(envelope));
});
test("route includes the safe projection in its existing operational event",()=>{
 const source=readFileSync(new URL("../app/api/ask/route.ts",import.meta.url),"utf8");
 assert.match(source,/providerEnvelope: event\.providerEnvelope \?\? null/);
});

test("actual Ask route emits the envelope on a single failed interpretation without secret payload",async t=>{
 const {engineFixture}=await import("./helpers/ask-route-ordering.mjs");
 const logs=[];t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",(...args)=>logs.push(args));t.mock.method(console,"error",()=>{});
 const marker="PRIVATE_PROVIDER_TEXT_SHOULD_NOT_APPEAR";
 let calls=0;
 const f=engineFixture({creditLedger:true,realProviderLog:true,providerCreate:async()=>{
  calls++;return {status:"incomplete",incomplete_details:{reason:null},output:[{type:"reasoning",status:"incomplete",summary:[{type:"summary_text",text:marker}]}],
   usage:{input_tokens:0,output_tokens:0},id:marker};
 }});
 const response=await f.send();
 assert.equal(response.status,503);assert.equal(calls,1);
 const event=logs.find(x=>x[0]==="[Ask provider] stage failed")?.[1];
 assert.ok(event?.providerEnvelope);
 assert.equal(event.providerEnvelope.responseStatus,"incomplete");
 assert.equal(event.providerEnvelope.incompleteReason,null);
 assert.deepEqual(event.providerEnvelope.outputItems,[{type:"reasoning",status:"incomplete"}]);
 assert.equal(event.providerEnvelope.hasUsage,true);
 assert.ok(!JSON.stringify(logs).includes(marker));
 assert.equal(f.rows.ask_action_capabilities.length,0);
 assert.deepEqual(f.state.credit,{status:"released",disposition:"release"});
});
