import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReadOnlyProviderRequest,describeReadRequest,safeReadAdmissionDiagnostic} from '../app/lib/ask-read-only/provider-request.mjs';
const policy={maxInputCharacters:80000,maxInputTokens:20000};
test('wire compacts32-source duplicate metadata without changing any body/provenance/typed operand',()=>{
 const sources=Array.from({length:32},(_,i)=>({source:'s'+(i+1),kind:'history',pet:'Maple',body:'A complete original observation. '.repeat(8),eventAt:'2022-01-15T12:00:00Z',recordedAt:'2022-01-16T12:00:00Z',measurements:[{handle:'s'+(i+1)+':m1',value:5,unit:'kg',metric:'body_weight'}]}));
 const input={instructions:'i'.repeat(19000),context:{taskPlan:[{kind:'saved_content'}]},draft:'draft',SOURCE_CATALOG:sources,TOOL_DATA:[{scope:{pet:'Maple',goal:'complete_set'},sources,inspected:36,omitted:4}],schema:{type:'object'},CLINICAL_CONSTRAINTS:{medicationIntent:'none'}};
 const wire=buildReadOnlyProviderRequest('model',input,'read_answer',2400,policy),data=JSON.parse(wire.input[0].content);
 assert.deepEqual(data.SOURCE_CATALOG,sources);assert.deepEqual(data.TOOL_DATA[0].sources,sources.map(s=>({source:s.source})));assert.equal(data.TOOL_DATA[0].omitted,4);
 assert.equal(data.draft,'draft');assert.ok(describeReadRequest(wire).estimatedInputTokens<20000);assert.equal(wire.max_output_tokens,2400);
});
test('a valid large preliminary draft yields to intact evidence; irreducible over-budget input fails before invocation',()=>{
 const input={instructions:'i'.repeat(55000),context:{question:'A real owner question.'},draft:'d'.repeat(12000),TOOL_DATA:[],SOURCE_CATALOG:[{source:'s1',body:'Unchanged source.'}],schema:{}};
 const wire=buildReadOnlyProviderRequest('model',input,'read_answer',2400,policy),data=JSON.parse(wire.input[0].content);
 assert.equal(data.draft,'');assert.deepEqual(data.SOURCE_CATALOG,input.SOURCE_CATALOG);assert.equal(data.context.question,input.context.question);
 assert.throws(()=>buildReadOnlyProviderRequest('model',{...input,instructions:'i'.repeat(65000)},'read_answer',2400,policy),{code:'ASK_READ_INPUT_BUDGET'});
});
test('request diagnostics allow only known admission reasons and never private error prose or getters',()=>{
 assert.equal(safeReadAdmissionDiagnostic({code:'something',reason:'private note'}),null);
 assert.deepEqual(safeReadAdmissionDiagnostic({code:'AI_PROVIDER_BUDGET_EXHAUSTED',reason:'feature_token_budget_exceeded'}),{category:'provider_admission',reason:'feature_token_budget_exceeded'});
 assert.equal(safeReadAdmissionDiagnostic({code:'AI_PROVIDER_BUDGET_EXHAUSTED',reason:'private note'}).reason,'unclassified_budget_denial');
 assert.equal(safeReadAdmissionDiagnostic({get code(){throw Error('private');}}),null);
});
