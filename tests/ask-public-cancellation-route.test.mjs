import test from "node:test";
import assert from "node:assert/strict";
import {readOnlySuccessRouteFixture as fixture} from "./helpers/ask-read-only-success-route.mjs";
const questions=[
 "Cancel Juniper’s pending archive action.",
 "Cancel the pending action.",
 "Delete Juniper’s saved observation.",
 "Correct Juniper’s saved weight to 7 kg."
];
for(const question of questions)test("public read-only POST refuses without domain effects: "+question,async t=>{
 t.mock.method(console,"info",()=>{});
 const f=fixture();
 try{
  const response=await f.send(question),body=await response.json();
  assert.equal(response.status,200,JSON.stringify(f.state.errors));
  assert.equal(body.success,true);assert.match(body.answer,/requested action is unavailable through read-only Ask/);
  assert.equal(body.dataChanged,false);assert.equal(body.carePersistence.status,"skipped");assert.equal(body.intelligencePersistence.saved,false);
  assert.deepEqual(body.response.applicationActions,[]);assert.equal(body.turn.actionCount,0);assert.equal(body.turn.mutationOutcome,"not_requested");
  assert.equal(f.state.reads,0);assert.ok(f.state.tables.every(table=>table==="dog_profiles"));
  assert.equal(f.wire.length,2);assert.equal(f.state.calls,2);assert.deepEqual(f.admitted,f.wire);
  assert.equal(f.state.providerEvents.filter(e=>e.outcome==="started").length,2);assert.equal(body.turn.providerCallCount,2);
  assert.equal(body.persistence.saved,true);assert.equal(f.state.persistedAnswer.response_data.turn.finalStage,"COMPLETED");
  assert.equal(body.turn.taskOutcome,"limited");assert.equal(body.creditsUsed,0);assert.deepEqual(f.state.credit,{status:"released",disposition:"release"});
  assert.ok(f.state.events.indexOf("assistant:terminal")<f.state.events.indexOf("credit:release"));assert.equal(f.state.leaseReleased,1);
 }finally{await f.release();}
});
