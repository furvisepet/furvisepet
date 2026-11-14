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
 assert.equal(data.draft,'');assert.deepEqual(data.SOURCE_CATALOG,input.SOURCE_CATALOG);assert.equal(wire.input.at(-1).role,"user");assert.equal(wire.input.at(-1).content,input.context.question);assert.equal(data.context.question,undefined);
 assert.throws(()=>buildReadOnlyProviderRequest('model',{...input,instructions:'i'.repeat(65000)},'read_answer',2400,policy),{code:'ASK_READ_INPUT_BUDGET'});
});
test('request diagnostics allow only known admission reasons and never private error prose or getters',()=>{
 assert.equal(safeReadAdmissionDiagnostic({code:'something',reason:'private note'}),null);
 assert.deepEqual(safeReadAdmissionDiagnostic({code:'AI_PROVIDER_BUDGET_EXHAUSTED',reason:'feature_token_budget_exceeded'}),{category:'provider_admission',reason:'feature_token_budget_exceeded'});
 assert.equal(safeReadAdmissionDiagnostic({code:'AI_PROVIDER_BUDGET_EXHAUSTED',reason:'private note'}).reason,'unclassified_budget_denial');
 assert.equal(safeReadAdmissionDiagnostic({get code(){throw Error('private');}}),null);
});

test("native chronological roles end with the actual current request without duplicating dialogue in the packet",()=>{
 const context={question:"Revise the latest routine to three silent minutes.",dialogue:[{role:"user",text:"How do I enter a photo note?"},{role:"assistant",text:"Open Today."},{role:"user",text:"Create a seven-minute settling routine."},{role:"assistant",text:"Here is the seven-minute mat routine."}],pets:[],ownerStatementRefs:[{ref:"owner1",question:true}]};
 const input={instructions:"Previous messages are context; answer the last user request.",context,draft:"",TOOL_DATA:[],SOURCE_CATALOG:[],schema:{}};
 for(const phase of ["read_selection","read_answer"]){
  const wire=buildReadOnlyProviderRequest("model",input,phase,2400,policy);
  assert.equal(wire.input.at(-1).role,"user");assert.equal(wire.input.at(-1).content,context.question);
  assert.deepEqual(wire.input.slice(1,-1).map(m=>m.role),["user","assistant","user","assistant"]);
  assert.match(wire.input.at(-2).content,/Prior dialogue \[3\].*|Prior dialogue \[3\]:/);
  assert.ok(wire.input.at(-2).content.endsWith(context.dialogue[3].text));
  const packet=JSON.parse(wire.input[0].content),packed=phase==="read_selection"?packet:packet.context;
  assert.equal(packed.dialogue,undefined);assert.equal(packed.question,undefined);
  assert.equal(context.dialogue.length,4);assert.equal(context.question,input.context.question);
 }
});

test("four-goal request keeps all evidence and owner coverage while omitting transport diagnostics",()=>{
 const source={source:"s1",kind:"history",pet:"Maple",body:"Maple weighed 10 kg. Appetite stayed normal.",eventAt:"2024-01-15T12:00:00Z",recordedAt:"2024-01-16T12:00:00Z",measurements:[{handle:"s1:m1",value:10,unit:"kg",metric:"body_weight"}]};
 const row={call:"c1",scope:{pet:"Maple",petHandle:"p1",kind:"history",goal:"comparison",from:"2024-01-01",to:"2024-12-31",orderBy:"event",evidenceRole:"scoped"},sources:[source],inspected:36,omitted:4,total:36,hasMore:false,truncated:true,queryScopeExhausted:true,scopeExhausted:false,semanticRecallVerified:false,sourceMeaning:"historical_saved_report",status:"partial",unmet:["evidence_omitted"],omittedRange:{axis:"event",from:"2024-09-01",to:"2024-12-31"},discovery:{internalTrace:"transport-only ".repeat(50)},batchAcquisition:{internalTrace:"same executor statistics ".repeat(50)},continuationValidation:{internalTrace:"anchor validation ".repeat(50)}};
 const input={instructions:"bounded rules ".repeat(3500),context:{question:"Compare the original measured weights."},draft:"",SOURCE_CATALOG:[source],TOOL_DATA:Array.from({length:4},(_,i)=>({...row,call:"c"+i})),schema:{type:"object"},CLINICAL_CONSTRAINTS:{medicationIntent:"none"}};
 const before=structuredClone(input),wire=buildReadOnlyProviderRequest("model",input,"read_answer",2400,policy),data=JSON.parse(wire.input[0].content);
 assert.deepEqual(input,before);assert.deepEqual(data.SOURCE_CATALOG,[source]);assert.equal(data.TOOL_DATA.length,4);
 for(const packed of data.TOOL_DATA){for(const k of ["discovery","batchAcquisition","continuationValidation"])assert.equal(Object.hasOwn(packed,k),false);for(const k of ["scope","inspected","omitted","total","hasMore","truncated","queryScopeExhausted","scopeExhausted","semanticRecallVerified","sourceMeaning","status","unmet","omittedRange"])assert.deepEqual(packed[k],row[k]);}
 assert.deepEqual(data.CLINICAL_CONSTRAINTS,input.CLINICAL_CONSTRAINTS);assert.ok(describeReadRequest(wire).estimatedInputTokens<=20000);
});
