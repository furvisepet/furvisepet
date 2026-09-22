import assert from 'node:assert/strict';
import test from 'node:test';
import {verifiedCalculationQuantities as verify} from '../app/lib/intelligence/history-calculation.ts';
const sources=[{sourceId:'care:first',text:'Body mass 10 kg; equipment mass 3 kg.',occurredAt:'2026-01-01T00:00:00Z'},{sourceId:'care:last',text:'Body mass 12 kg.',occurredAt:'2026-01-03T00:00:00Z'},{sourceId:'profile:a:weight',text:'14 kg'}];
const operand=(sourceId,literal,field='text')=>({sourceId,literal,field});
const job=(operation,operands,value,unit)=>({operation,operands,value,unit,expression:null});
test('arithmetic-only characterization: historical difference and percent are recomputed',()=>{
 assert.deepEqual(verify([job('difference',[operand('care:last','12 kg'),operand('care:first','10 kg')],2,'kg')],sources),['2:kg']);
 assert.deepEqual(verify([job('percent_change',[operand('care:first','10 kg'),operand('care:last','12 kg')],20,'%')],sources),['20:%']);
});
test('arithmetic-only kernel does not establish profile versus history obligation authority',()=>{
 assert.notEqual(verify([job('difference',[operand('profile:a:weight','14 kg'),operand('care:first','10 kg')],4,'kg')],sources),null);
});
test('matching dimension does not establish measured-object identity',()=>{
 assert.notEqual(verify([job('difference',[operand('care:last','12 kg'),operand('care:first','3 kg')],9,'kg')],sources),null);
});
test('absent source and unsupported literal fail arithmetic binding',()=>{
 assert.equal(verify([job('difference',[operand('care:unknown','12 kg'),operand('care:first','10 kg')],2,'kg')],sources),null);
 assert.equal(verify([job('difference',[operand('care:last','13 kg'),operand('care:first','10 kg')],3,'kg')],sources),null);
});
test('compatible conversion works but incompatible dimension fails',()=>{
 assert.notEqual(verify([job('convert',[operand('care:first','10 kg')],22.04622622,'lb')],sources),null);
 assert.equal(verify([job('convert',[operand('care:first','10 kg')],10,'ml')],sources),null);
});
test('zero-baseline percentage and ratio fail',()=>{
 const zero=[{sourceId:'care:zero',text:'0 kg'},{sourceId:'care:last',text:'12 kg'}];
 for(const op of ['percent_change','ratio'])assert.equal(verify([job(op,[operand('care:zero','0 kg'),operand('care:last','12 kg')],0,op==='ratio'?'':'%')],zero),null);
});
test('mean of cited subset does not establish exhaustive membership',()=>{
 assert.notEqual(verify([job('mean',[operand('care:first','10 kg'),operand('care:last','12 kg')],11,'kg')],sources),null);
});
test('record count verifies distinct supplied records, not exhaustive domain',()=>{
 assert.notEqual(verify([job('count_records',[operand('care:first','care:first'),operand('care:last','care:last')],2,'records')],sources),null);
 assert.equal(verify([job('count_records',[operand('care:first','care:first'),operand('care:first','care:first')],2,'records')],sources),null);
});
test('elapsed days are timestamp difference, not certified illness duration',()=>{
 assert.notEqual(verify([job('elapsed_days',[operand('care:first',sources[0].occurredAt,'occurredAt'),operand('care:last',sources[1].occurredAt,'occurredAt')],2,'days')],sources),null);
});
test('proposal precision permits rounding; no separate precision policy is certified',()=>{
 const rs=[{sourceId:'care:a',text:'10 kg'},{sourceId:'care:b',text:'12.4 kg'}];
 assert.notEqual(verify([job('difference',[operand('care:b','12.4 kg'),operand('care:a','10 kg')],2,'kg')],rs),null);
});
