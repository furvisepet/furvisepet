import assert from "node:assert/strict";
import test from "node:test";
import {isReadOnlyResult} from "../app/lib/ask-read-only/core.mjs";
import {buildReadOnlyPublication} from "../app/lib/ask-read-only/publication.ts";
import {readOnlyPublicationFixture as fixture} from "./helpers/ask-read-only-publication.mjs";

test("only an independently reviewed read-only result can enter durable publication",async()=>{
 const f=await fixture();
 assert.equal(isReadOnlyResult(f.readResult),true);
 assert.deepEqual(f.events,["provider:read_selection","provider:read_answer"]);
 const unreviewed=structuredClone(f.readResult);
 assert.deepEqual(unreviewed,f.readResult);
 assert.equal(isReadOnlyResult(unreviewed),false);
 assert.throws(()=>buildReadOnlyPublication(unreviewed,f.ownerId,"Juniper"));
 assert.equal(f.state.row,null);
 const response=await f.run(),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.persistence.saved,true);
 assert.equal(body.turn.actionCount,0);
 assert.equal(f.calls,2);
 assert.equal(f.state.finalizationInputs[0].carePersistence.status,"skipped");
 assert.deepEqual(f.state.finalizationInputs[0].carePersistence.careEntryIds,[]);
 assert.deepEqual(f.state.finalizationInputs[0].carePersistence.concernIds,[]);
});

test("durable read-only answer precedes credit disposition, charge and success publication",async()=>{
 const f=await fixture(),response=await f.run();
 assert.equal(response.status,200);
 const ordered=["provider:read_selection","provider:read_answer","assistant:initial","assistant:terminal","credit:intent","credit:complete","response:publish","lease:release"];
 let previous=-1;
 for(const event of ordered){const index=f.events.indexOf(event);assert.ok(index>previous,event+" after prior stage: "+f.events.join(","));previous=index;}
 assert.equal(f.state.credits,1);assert.equal(f.state.terminalWrites,1);
 assert.equal(f.events.filter(x=>x==="response:publish").length,1);
});

test("already completed owned replay preserves its answer without another terminal write or charge",async()=>{
 const f=await fixture({completedReplay:true}),response=await f.run(),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.response.summary,"Previously saved answer.");
 assert.equal(body.response.directAnswer,"Previously saved answer.");
 assert.equal(body.turn.finalStage,"COMPLETED");
 assert.equal(body.assistantMessageId,f.state.row.id);
 assert.equal(f.state.terminalWrites,0);assert.equal(f.state.credits,0);assert.equal(f.state.released,false);
 assert.ok(f.events.indexOf("assistant:readback")<f.events.indexOf("response:publish"));
 assert.ok(!f.events.includes("credit:intent"));assert.ok(!f.events.includes("credit:complete"));
 assert.equal(f.events.filter(x=>x==="response:publish").length,1);
 assert.equal(f.events.at(-1),"lease:release");assert.equal(f.calls,2);
});
