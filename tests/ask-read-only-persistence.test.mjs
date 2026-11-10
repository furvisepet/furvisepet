import test from "node:test";
import assert from "node:assert/strict";
import {readOnlyPublicationFixture as fixture} from "./helpers/ask-read-only-publication.mjs";
test("successful publication returns a persisted read-only answer",async()=>{
 const f=await fixture(),response=await f.run();assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.success,true);assert.equal(body.persistence.saved,true);
 assert.equal(f.state.credits,1);assert.equal(f.calls,2);assert.equal(f.events.at(-1),"lease:release");
});
test("read-only terminal answer is durable before a credit can complete",async()=>{
 const f=await fixture(),response=await f.run();assert.equal(response.status,200);
 assert.ok(f.events.indexOf("assistant:terminal")<f.events.indexOf("credit:complete"),f.events.join(","));
 assert.equal(f.state.credits,1);assert.equal(f.calls,2);assert.equal(f.events.at(-1),"lease:release");
});
test("failed terminal finalization cannot charge merely because an initial row exists",async()=>{
 const f=await fixture({failTerminal:true}),response=await f.run();
 assert.equal(response.status,503);assert.equal(f.state.credits,0);assert.equal(f.state.released,true);
 assert.ok(!f.events.includes("credit:intent"));assert.equal(f.events.at(-1),"lease:release");
});
test("changed terminal readback fails closed without a completed credit",async()=>{
 const f=await fixture({lostAcknowledgment:true,changedReadback:true}),response=await f.run();
 assert.equal(response.status,503);assert.equal(f.state.credits,0);assert.equal(f.state.released,true);
});
test("committed terminal answer with a lost acknowledgment is recovered before one credit completion",async()=>{
 const f=await fixture({lostAcknowledgment:true}),response=await f.run();assert.equal(response.status,200);
 assert.ok(f.events.indexOf("assistant:readback")<f.events.indexOf("credit:complete"),f.events.join(","));
 assert.equal(f.state.credits,1);assert.equal((await response.json()).creditsUsed,1);
});
test("credit-disposition outage does not discard an already durable answer",async()=>{
 const f=await fixture({failDisposition:true}),response=await f.run();assert.equal(response.status,200);
 assert.equal(f.state.row.response_data.turn.finalStage,"COMPLETED");assert.equal(f.state.credits,0);assert.ok(!f.events.includes("credit:release"));
});
test("credit completion outage preserves the durable answer and pending settlement",async()=>{
 const f=await fixture({failCredit:true}),response=await f.run();assert.equal(response.status,200);
 assert.equal(f.state.row.response_data.turn.finalStage,"COMPLETED");assert.equal(f.state.credits,0);assert.ok(!f.events.includes("credit:release"));
});
test("a clarification is durably saved before its reservation is released",async()=>{
 const f=await fixture({limited:true}),response=await f.run();assert.equal(response.status,200);
 assert.ok(f.events.indexOf("assistant:terminal")<f.events.indexOf("credit:release"),f.events.join(","));
 assert.equal(f.state.credits,0);assert.equal(f.state.released,true);assert.equal((await response.json()).creditsUsed,0);
});

test("release outage preserves a durable clarification without claiming a completed credit",async()=>{
 const f=await fixture({limited:true,failRelease:true}),response=await f.run();
 assert.equal(response.status,200);assert.equal(f.state.credits,0);
 assert.equal(f.state.row.response_data.turn.finalStage,"COMPLETED");
 const body=await response.json();assert.equal(body.creditsUsed,0);
 assert.equal(body.turn.creditState,"release_pending");
});
