import test from "node:test";
import assert from "node:assert/strict";
import {readOnlyFailureRouteFixture,id} from "./helpers/ask-read-only-failure-route.mjs";
const question="My cat is struggling to breathe right now and breathing with her mouth open. What should I do first?";
test("authenticated current emergency persists an owner-bound Ask exchange with zero provider/credit/care calls",async()=>{
 const f=readOnlyFailureRouteFixture(()=>{throw Error("NO_PROVIDER");},[],{emergency:true});
 const r=await f.send(question),b=await r.json();assert.equal(r.status,200);
 assert.match(b.response.directAnswer,/Contact an emergency veterinarian or clinic now/);
 assert.equal(b.persistence.saved,true);assert.equal(b.conversationId,id(4));assert.equal(b.userMessageId,id(5));assert.equal(b.assistantMessageId,id(7));
 assert.equal(b.handledWithoutAi,true);assert.equal(b.creditsUsed,0);assert.equal(b.dataChanged,false);assert.equal(b.carePersistence.status,"skipped");
 assert.equal(f.state.calls,0);assert.equal(f.state.reads,0);assert.equal(f.state.credit,null);assert.equal(f.state.userMessages,1);assert.equal(f.state.emergencyWrites,1);
 assert.equal(f.state.persistedAnswer.response_data.turn.finalStage,"COMPLETED");assert.equal(f.state.persistedAnswer.response_data.turn.providerCallCount,0);
 assert.deepEqual(f.state.tables,[]);assert.equal(b.contextUsed.petName,null);assert.deepEqual(b.contextUsed.usedSources,[]);
});
test("emergency persistence failure keeps immediate guidance and truthfully leaves saving unconfirmed",async()=>{
 const f=readOnlyFailureRouteFixture(()=>{throw Error("NO_PROVIDER");},[],{emergency:true,emergencyWriteError:true}),b=await (await f.send(question)).json();
 assert.match(b.response.directAnswer,/Contact an emergency veterinarian or clinic now/);assert.equal(b.persistence.saved,false);assert.match(b.persistence.warning,/could not be confirmed/);
 assert.equal(f.state.calls,0);assert.equal(f.state.credit,null);assert.equal(f.state.userMessages,0);assert.equal(f.state.leaseReleased,1);
});
for(const patch of [{petId:id(99)},{petId:"all"},{conversationId:id(99)}])test("unowned/unsupported emergency chat scope never creates history: "+JSON.stringify(patch),async()=>{
 const f=readOnlyFailureRouteFixture(()=>{throw Error("NO_PROVIDER");},[],{emergency:true}),b=await (await f.send(question,patch)).json();
 assert.match(b.response.directAnswer,/emergency veterinarian or clinic now/);assert.equal(b.persistence.saved,false);assert.equal(f.state.userMessages,0);assert.equal(f.state.calls,0);
});
test("reloaded emergency keeps urgent metadata, zero-provider status and the original stored guidance",async()=>{
 const f=readOnlyFailureRouteFixture(()=>{throw Error("NO_PROVIDER");},[],{emergency:true});const b=await (await f.send(question)).json();assert.equal(b.persistence.saved,true);
 const replay=await f.replayEmergency();assert.equal(replay.safety.level,"urgent");assert.equal(replay.safety.shoppingSuppressed,true);assert.equal(replay.handledWithoutAi,true);
 assert.equal(replay.response.directAnswer,b.response.directAnswer);assert.equal(replay.turn.providerCallCount,0);assert.equal(f.state.emergencyWrites,1);
});
