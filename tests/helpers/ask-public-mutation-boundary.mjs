import assert from "node:assert/strict";
import {readOnlySuccessRouteFixture} from "./ask-read-only-success-route.mjs";
/** Exercise the real public POST with a provider claiming an unauthorized effect. */
export async function assertPublicMutationDenied(question,claim){
 const f=readOnlySuccessRouteFixture({answer:claim,replyType:"answer"});
 try{
  const response=await f.send(question),body=await response.json();
  assert.equal(response.status,200,JSON.stringify(f.state.errors));
  assert.equal(body.dataChanged,false);assert.deepEqual(body.response.applicationActions,[]);
  assert.equal(f.state.reads,0);assert.ok(f.state.tables.every(table=>table==="dog_profiles"));
  assert.equal(f.state.calls,2);assert.deepEqual(f.wire,f.admitted);
  assert.match(body.response.summary,/can.t (?:make changes|cancel)|read.only/i);
  assert.ok(!body.response.summary.includes(claim),"an unauthorized terminal effect must not survive publication");
  assert.equal(f.state.credit.status,"released");
  assert.deepEqual(f.state.persistedAnswer.response_data.applicationActions,[]);
 }finally{await f.release();}
}
