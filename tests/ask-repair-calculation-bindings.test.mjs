import * as C from "./helpers/canonical-calculation-retirement.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
test("deterministic arithmetic text cannot be reworded after certification",async()=>{
 const f=await C.fixture();await C.finish(f);f.response.answer.summary="Reworded arithmetic result.";assert.ok(C.calculationPublicationFailure(f.response));assert.equal(f.calls(),0);
});
test("changed removed or foreign operand sources invalidate calculation publication",async()=>{
 for(const mutate of [l=>l.readLabs.records.pop(),l=>l.readLabs.records[0].body="99 kg",l=>l.readLabs.records[0].petId="foreign"]){const f=await C.fixture();mutate(f.response.calculationLabs);assert.ok(C.calculationPublicationFailure(f.response));}
});
test("calculation repair cannot inject arithmetic metadata or change accepted values",async()=>{
 const f=await C.fixture();await C.finish(f);f.response.calculationLabs.execution.results[0].value=141;assert.ok(C.calculationPublicationFailure(f.response));C.rejects(c=>c.value=141);
});
