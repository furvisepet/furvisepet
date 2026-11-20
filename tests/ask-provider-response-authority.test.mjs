import test from "node:test";
import assert from "node:assert/strict";
import {interpretStructuredProviderResponse as interpret} from "../app/lib/ai/ask-provider.ts";
const text='{"value":37}';
const msg=(status="completed",content=[{type:"output_text",text}])=>({type:"message",role:"assistant",status,content});
for(const type of ["reasoning","function_call","web_search_call"]) for(const status of ["incomplete","failed","in_progress"])
 test("completed response ignores "+type+" item "+status,()=>{
  let calls=0;const result=interpret({status:"completed",output:[{type,status},msg()]},raw=>{calls++;return JSON.parse(raw);});
  assert.equal(result.status,"completed");assert.equal(result.finishReason,"completed");assert.deepEqual(result.parsed,{value:37});assert.equal(calls,1);
 });
for(const reason of ["max_output_tokens","content_filter",null,undefined,"future_reason"])
 test("top incomplete wins over completed message: "+reason,()=>{
  let called=false;const result=interpret({status:"incomplete",incomplete_details:reason===undefined?undefined:{reason},output:[msg()]},()=>{called=true;});
  assert.equal(result.status,"incomplete");assert.equal(result.finishReason,"incomplete");assert.equal(called,false);
 });
for(const status of ["failed","queued","in_progress","cancelled","unknown",""])
 test("noncompleted response cannot parse: "+status,()=>{
  let called=false;const result=interpret({status,output:[msg()]},()=>{called=true;});
  assert.equal(result.status,status==="failed"?"failed":"invalid");assert.equal(called,false);assert.equal(result.finishReason,status||null);
 });
test("error envelope fails closed even under completed response",()=>{
 const result=interpret({status:"completed",error:{code:"server_error"},output:[msg()]},()=>assert.fail("must not parse"));
 assert.equal(result.status,"failed");assert.equal(result.finishReason,"completed");
});
for(const status of ["incomplete","failed","in_progress"])
 test("legacy incomplete/nonterminal message remains fail closed: "+status,()=>{
  const result=interpret({output_text:text,output:[msg(status)]},()=>assert.fail("must not parse"));
  assert.equal(result.status,["failed","incomplete"].includes(status)?status:"invalid");
  assert.equal(result.finishReason,status);
 });
for(const status of ["incomplete","failed","in_progress"])
 test("legacy completed message ignores reasoning status: "+status,()=>{
  const result=interpret({output:[{type:"reasoning",status},msg()]},JSON.parse);
  assert.equal(result.status,"completed");assert.equal(result.finishReason,"completed");assert.deepEqual(result.parsed,{value:37});
 });
test("legacy missing or mixed message statuses fail closed",()=>{
 for(const output of [[{...msg(),status:undefined}],[msg(),msg("incomplete")],[msg(),msg("in_progress")],[msg(),{...msg(),status:undefined}]]){
  const result=interpret({output},()=>assert.fail("must not parse"));
  assert.notEqual(result.status,"completed");
 }
});
for(const type of ["reasoning","function_call","unknown"])
 test("non-message fake text and refusal cannot be extracted: "+type,()=>{
  const fake={type,status:"completed",content:[{type:"output_text",text:'{"fake":true}'},{type:"refusal",refusal:"fake refusal"}]};
  const empty=interpret({status:"completed",output:[fake]},()=>assert.fail("must not parse"));
  assert.equal(empty.status,"invalid");assert.equal(empty.rawText,null);assert.equal(empty.refusal,null);
  const complete=interpret({status:"completed",output:[fake,msg()]},JSON.parse);
  assert.equal(complete.status,"completed");assert.deepEqual(complete.parsed,{value:37});assert.equal(complete.refusal,null);
 });
test("message refusal wins over text",()=>{
 const result=interpret({status:"completed",output_text:text,output:[msg("completed",[{type:"refusal",refusal:"Cannot comply"}])]},()=>assert.fail("must not parse"));
 assert.equal(result.status,"refused");
});
test("valid SDK aggregate remains preferred and text-only adapter remains compatible",()=>{
 for(const envelope of [{status:"completed",output_text:text,output:[msg("completed",[{type:"output_text",text:"invalid fallback"}])]},{output_text:text}]){
  assert.deepEqual(interpret(envelope,JSON.parse).parsed,{value:37});
 }
});
test("reasoning-only legacy envelope cannot manufacture completion",()=>{
 for(const status of ["completed","incomplete","failed"]){
  assert.equal(interpret({output_text:text,output:[{type:"reasoning",status}]},()=>assert.fail("must not parse")).status,"invalid");
 }
});

test("safe direct branch diagnostic identifies a rejected provider branch without text",()=>{
  const privateText="OWNER_PRIVATE_NOTE";
  const result=interpret({status:"completed",output_text:privateText},()=>{throw new Error("ASK_DIRECT_BRANCH_SCHEMA",{cause:{field:privateText}});});
  assert.equal(result.status,"invalid");
  assert.equal(result.validationReason,"ASK_DIRECT_BRANCH_SCHEMA");
  assert.ok(!JSON.stringify({validationReason:result.validationReason,errorMessage:result.errorMessage}).includes(privateText));
});
