import test from "node:test";
import assert from "node:assert/strict";
import {persistEmergencyHistory} from "../app/lib/ask-read-only/emergency-history.ts";
const id=n=>"88888888-8888-4888-8888-"+String(n).padStart(12,"0");
const input=()=>({userId:id(1),petId:id(2),conversationId:"",requestId:id(3),question:"My cat is struggling to breathe now.",responseData:{urgency:"urgent",directAnswer:"Contact an emergency veterinarian now.",turn:{logicalTurnId:id(3),creditState:"not_required",routeType:"emergency",executionMode:"deterministic",providerCallCount:0,finalStage:"COMPLETED"}},saveMetadata:{answerType:"urgent_guidance",persistenceEligible:false,reason:"deterministic_emergency_preflight"},contextUsed:{petName:null,usedSources:[]}});
function fixture(patch={}){
 const state={claims:0,lookups:0,creates:0,appends:0,releases:0,args:null};
 const rows=x=>[{conversation_id:id(4),message_id:id(5),message_request_id:x.requestId,message_role:"user",message_user_text:x.userText,message_sequence_number:1},
 {conversation_id:id(4),message_id:id(6),message_request_id:x.requestId,message_role:"furvise",message_response_data:structuredClone(x.responseData),message_save_metadata:structuredClone(x.saveMetadata),message_context_used:structuredClone(x.contextUsed),message_sequence_number:2}];
 const deps={claim:async()=>{state.claims++;return {release:async()=>{state.releases++;}};},conversation:async(c,o)=>{state.lookups++;assert.equal(o,id(1));return {id:c,pet_profile_id:id(2)};},
 create:async x=>{state.creates++;state.args=x;assert.equal(x.userId,id(1));assert.equal(x.petId,id(2));assert.equal(x.title,"Emergency guidance");return {data:rows(x),error:null};},
 append:async x=>{state.appends++;state.args=x;assert.equal(x.userId,id(1));return {data:rows(x),error:null};},...patch};
 return {state,deps,rows};
}
test("confirmed atomic owner-bound exchange saves Ask chat only with zero models and no clinical/profile reads",async()=>{
 const f=fixture(),r=await persistEmergencyHistory(input(),f.deps);
 assert.equal(r.status,"confirmed");assert.equal(r.receipt.conversationId,id(4));assert.equal(f.state.creates,1);assert.equal(f.state.lookups,0);assert.equal(f.state.releases,1);
 assert.deepEqual(f.state.args.contextUsed,{petName:null,usedSources:[]});assert.equal(f.state.args.responseData.turn.providerCallCount,0);assert.equal(f.state.args.saveMetadata.persistenceEligible,false);
});
test("append revalidates owner and selected conversation container without inventing a patient",async()=>{
 const f=fixture(),r=await persistEmergencyHistory({...input(),conversationId:id(4)},f.deps);
 assert.equal(r.status,"confirmed");assert.equal(f.state.lookups,1);assert.equal(f.state.appends,1);assert.equal(f.state.creates,0);
});
for(const mode of ["foreign","mismatched_pet","deleted"])test(mode+" conversation cannot authorize an append",async()=>{
 const f=fixture({conversation:async()=>mode==="deleted"?null:{id:mode==="foreign"?id(9):id(4),pet_profile_id:mode==="mismatched_pet"?id(9):id(2)}});
 const r=await persistEmergencyHistory({...input(),conversationId:id(4)},f.deps);assert.equal(r.status,"skipped");assert.equal(f.state.appends,0);assert.equal(f.state.releases,1);
});
test("all/invalid subject, request and owner identifiers skip before any write or rate lease",async()=>{
 for(const patch of [{petId:"all"},{petId:"foreign"},{userId:""},{requestId:""},{conversationId:"forged"}]){
  const f=fixture(),r=await persistEmergencyHistory({...input(),...patch},f.deps);assert.equal(r.status,"skipped");assert.equal(f.state.claims,0);assert.equal(f.state.creates,0);
 }
});
test("rate/admission failure cannot remove emergency guidance or create unguarded history",async()=>{
 const f=fixture({claim:async()=>{throw Error("RATE_LIMIT");}}),r=await persistEmergencyHistory(input(),f.deps);assert.equal(r.status,"unconfirmed");assert.equal(f.state.creates,0);
});
test("ownership rejection from atomic authority is unconfirmed, never a false saved receipt",async()=>{
 const f=fixture({create:async()=>({data:null,error:{code:"42501"}})}),r=await persistEmergencyHistory(input(),f.deps);assert.equal(r.status,"unconfirmed");assert.equal(f.state.releases,1);
});
test("malformed, mismatched and incomplete RPC results never become saved",async()=>{
 for(const mutate of [r=>r.pop(),r=>r[1].message_request_id=id(9),r=>r[0].message_user_text="other",r=>r[1].message_response_data={directAnswer:"untrusted"},r=>r[1].message_context_used={petName:"invented"},r=>r[1].message_save_metadata={},r=>r[1].message_sequence_number=1,r=>r[1].conversation_id=id(9)]){
  const f=fixture();f.deps.create=async x=>{const rows=f.rows(x);mutate(rows);return {data:rows,error:null};};
  assert.equal((await persistEmergencyHistory(input(),f.deps)).status,"unconfirmed");
 }
});
test("a bounded timeout aborts publication; late success cannot change an unconfirmed result or create a second request",async()=>{
 let resolve,signal,creates=0;const f=fixture({create:x=>{creates++;signal=x.signal;return new Promise(r=>{resolve=()=>r({data:f.rows(x),error:null});});}});
 const r=await persistEmergencyHistory(input(),f.deps,5);assert.equal(r.status,"unconfirmed");assert.equal(r.reason,"deadline");assert.equal(signal.aborted,true);assert.equal(creates,1);
 resolve();await Promise.resolve();await Promise.resolve();assert.equal(r.status,"unconfirmed");assert.equal(creates,1);
});
test("an aborted request cannot dispatch a history write, including after a delayed lease",async()=>{
 const c=new AbortController();c.abort();const f=fixture();assert.equal((await persistEmergencyHistory({...input(),signal:c.signal},f.deps)).status,"unconfirmed");assert.equal(f.state.claims,0);
 let unlock;const d=new AbortController(),g=fixture({claim:()=>new Promise(r=>{unlock=()=>r({release:async()=>{}});})});
 const pending=persistEmergencyHistory({...input(),signal:d.signal},g.deps,5);d.abort();unlock();assert.equal((await pending).status,"unconfirmed");assert.equal(g.state.creates,0);
});
