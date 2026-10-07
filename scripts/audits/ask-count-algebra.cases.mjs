import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../tests/helpers/canonical-calculation-retirement.mjs';
for(const format of ['csv','prose'])for(const size of [0,11,32])test(format+' preserves result-set transport authority for '+size+' records',async()=>{
 const f=await C.measured("count_records",Array.from({length:size},(_,i)=>"Recorded observation "+i),"records",{fixture:{format}});
 assert.equal(f.result.coverage.resultSet.certified,true);assert.equal(f.result.records.length,size);
 if(format==="csv"){assert.equal(f.response.model,"server-calculation-unavailable");assert.deepEqual(f.response.relevantContextIds,[]);}
 else{assert.equal(f.response.model,"server-calculation-labs");assert.equal(f.response.calculationLabs.readLabs.records.length,size);assert.equal(f.response.calculationLabs.execution.results[0].value,size);}
 await C.finish(f);
});
test("record counting requires complete effective result-set proof rather than provider operands",async()=>{
 await C.certified("count_records",["first","second"],"records",2);C.rejects(c=>{c.operator="count_records";c.operands=[];c.resultUnit="episodes";});const f=await C.measured("count_records",["first","second"],"records",{fixture:{closed:false}});assert.equal(f.response.model,"server-calculation-unavailable");await C.finish(f);
});
