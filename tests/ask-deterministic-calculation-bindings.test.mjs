import * as C from "./helpers/canonical-calculation-retirement.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';

test("canonical scalar extraction cannot choose among multiple compatible measurements",async()=>{
 const f=await C.measured("difference",["29 minutes and 4 minutes","15 minutes and 2 minutes"],"minute",{unit:"minute"});assert.equal(f.response.model,"server-calculation-unavailable");await C.finish(f);
});

test("ambiguous scalar pairs fail closed without phrase-based reconstruction",async()=>{
 const f=await C.measured("difference",["12 kg and 10 kg","9 kg"],"kg");assert.equal(f.response.model,"server-calculation-unavailable");assert.deepEqual(f.response.relevantContextIds,[]);await C.finish(f);
});

test("provider arithmetic metadata is rejected rather than repaired",async()=>{
 C.rejects(c=>{c.value=999;c.expression=null;});const f=await C.fixture();assert.equal(f.calls(),0);assert.equal(f.response.calculationLabs.execution.results[0].value,.3);await C.finish(f);
});
