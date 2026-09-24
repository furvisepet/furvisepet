import * as C from "./helpers/canonical-calculation-retirement.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
test("historical difference and percentage are computed only by canonical Muscle",async()=>{
 await C.certified("difference",["12 kg","10 kg"],"kg",2);await C.certified("percent_change",["10 kg","12 kg"],"%",20);
});
test("profile operands cannot enter saved-history arithmetic authority",async()=>{
 C.rejects(c=>c.operands[0]={kind:"profile",subjectId:C.pets[0].id,field:"weight"});C.rejects(c=>c.operands[0].sourceId="profile:a:weight");
});
test("multiple same-dimension measurements remain limited without a generic disambiguation primitive",async()=>{
 const f=await C.measured("convert",["Body 12 kg and carrier 3 kg"],"kg");assert.equal(f.response.model,"server-calculation-unavailable");await C.finish(f);
});
test("missing certified slot and provider literal cannot create an operand",async()=>{
 const f=await C.fixture({sourceRows:[]});assert.equal(f.response.model,"server-calculation-unavailable");await C.finish(f);C.rejects(c=>c.operands[0].literal="12 kg");
});
test("canonical conversion preserves compatible dimensions and rejects incompatible outputs",async()=>{
 await C.certified("convert",["10 kg"],"lb",10*1000/453.59237);C.rejects(c=>c.resultUnit="ml");
});
test("zero baseline makes percentage and ratio source-free limited",async()=>{
 for(const op of ["percent_change","ratio"]){const f=await C.measured(op,["0 kg","12 kg"],op==="ratio"?"scalar":"%");assert.equal(f.response.model,"server-calculation-unavailable");await C.finish(f);}
});
test("selected mean does not upgrade broader matching history to exhaustive",async()=>{
 const f=await C.certified("mean",["10 kg","12 kg"],"kg",11);assert.equal(f.plan.calculations[0].operator,"mean");assert.equal(f.evidence.interpretation.request.readTicket.outputs.completeness,"sufficient");
});
test("record count needs certified complete result-set membership",async()=>{
 const f=await C.certified("count_records",["one","two"],"records",2);assert.equal(f.result.coverage.resultSet.certified,true);const g=await C.measured("count_records",["one","two"],"records",{fixture:{closed:false}});assert.equal(g.response.model,"server-calculation-unavailable");await C.finish(g);
});
test("elapsed-day calculation remains mathematical rather than illness-duration authority",async()=>{
 const f=await C.certified("elapsed_days",["event","event"],"day",2,{days:[1,3]});assert.doesNotMatch(f.response.answer.summary,/illness|symptom|diagnosis/);
});
test("display precision cannot change exact certified arithmetic",async()=>{
 const f=await C.certified("ratio",["3 kg","1 kg"],"scalar",1/3,{precision:2});assert.deepEqual(f.response.calculationLabs.execution.results[0].exact,{numerator:"1",denominator:"3"});assert.match(f.response.answer.summary,/0\.33/);
});
