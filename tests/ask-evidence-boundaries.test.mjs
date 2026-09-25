import * as C from "./helpers/canonical-calculation-retirement.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
const { missingExactRecordText } = await import('../app/lib/intelligence/exact-record-text.ts');
const { reviewObligationCompletion, historyTaskCompleted } = await import('../app/lib/intelligence/history-obligations.ts');
const note='May 4, 2025: ate 28 g of "usual" food.';
test('canonical slots bind sources through Lungs instead of provider literals',async()=>{
 const f=await C.certified("difference",["23 minutes","14 minutes"],"minute",9,{unit:"minute"});
 const result=f.response.calculationLabs.execution.results[0];
 assert.deepEqual(result.operands.map(o=>o.recordId),["source-0","source-1"]);
 assert.deepEqual(result.operands.map(o=>o.slot.field),["measurement","measurement"]);
 C.rejects(c=>c.operands[0].sourceId="foreign");
});
test('review schema only permits indexes in the submitted draft and cards',async()=>{
 const {boundedTaskHistoryReviewSchema,parseRepairableTaskHistoryReview}=await import('../app/lib/intelligence/history-review-selection.ts');
 const s=boundedTaskHistoryReviewSchema(1,4,0);
 assert.equal(s.properties.retainedSentenceIndexes.items.maximum,0);
 assert.equal(s.properties.obligations.minItems,4);
 assert.equal(s.properties.obligations.items.properties.index.maximum,3);
 assert.equal(s.properties.obligations.items.properties.actionIndexes.maxItems,0);
 assert.throws(()=>parseRepairableTaskHistoryReview({approved:true,retainedSentenceIndexes:[0],rejectionReason:null,
  obligations:[{index:0,status:'answered',sentenceIndexes:[1],actionIndexes:[]}]},1,1,0));
});
test('a prepared replacement quotation is an artifact, never independent numeric evidence',async()=>{
 const {historyNarrativeAnchorsSupported}=await import('../app/lib/intelligence/history-narrative-facts.ts');
 const original={text:'June 2, 2025: walked for 10 minutes.',occurredAt:'2025-06-02T00:00:00Z'};
 const request={text:'Correct the June 2 walk from 10 minutes to 12 minutes.'};
 const proposed='June 2, 2025: walked for 12 minutes.';
 const text='Proposed replacement: "'+proposed+'". Please confirm.';
 const check=(sources,proposals)=>historyNarrativeAnchorsSupported(text,sources,request.text,[],false,[],undefined,false,proposals);
 assert.equal(check([original,request],[]),false);
 assert.equal(check([original,request],[proposed]),true);
 assert.equal(check([original],[proposed]),false,'proposal text cannot supply unsupported quantities');
 assert.equal(check([original,request],[proposed.replace('12','18')]),false);
});
test('generation and repair schemas constrain citations and mutation targets independently',async()=>{
 const {sourceBoundSchema}=await import('../app/lib/intelligence/source-bound-schema.ts');
 const base={type:'object',properties:{sourceIds:{type:'array',items:{type:'string'}},targetSourceId:{type:['string','null']},calculation:{properties:{sourceId:{type:'string'}}}}};
 const bound=sourceBoundSchema(base,[{sourceId:'care:a',sourceType:'care_update'},{sourceId:'request:current',sourceType:'current_request'},{sourceId:'lookup:need:p',sourceType:'lookup_receipt'}]);
 assert.deepEqual(bound.properties.sourceIds.items.enum,['care:a','request:current','lookup:need:p']);
 assert.deepEqual(bound.properties.calculation.properties.sourceId.enum,bound.properties.sourceIds.items.enum);
 assert.deepEqual(bound.properties.targetSourceId.enum,['care:a',null]);
 assert.equal(base.properties.sourceIds.items.enum,undefined,'shared schema stays immutable across users');
});
test('whole-task fulfillment remains separate from explained clinical evidence limits',()=>{
 const completion=[{index:0,status:'answered',sentenceIndexes:[0,1],sourceIds:[]},{index:1,status:'limited',sentenceIndexes:[1],sourceIds:[]}];
 assert.equal(historyTaskCompleted(completion),true);
 for(const status of ['limited','missing','action_ready','needs_information'])
  assert.equal(historyTaskCompleted([{...completion[0],status},completion[1]]),false);
 assert.equal(historyTaskCompleted([completion[0],{...completion[1],status:'missing'}]),false);
 assert.equal(historyTaskCompleted([]),false);
});
test('only an owned exhausted empty query creates citable lookup evidence',async()=>{
 const {eligibleAnswerSources}=await import('../app/lib/intelligence/ask-evidence.ts');
 const e={scope:{authorizedPetIds:['p'],readOnlyRecall:true,requestText:'Which records document limping?'},sources:[],represented:[],losses:[],petNames:{p:'Juniper'},
  interpretation:{request:{evidenceNeeds:[{id:'need:0',quote:'Which records document limping?',terms:['limping'],petIds:['p'],window:{from:'2023-05-01',to:'2023-06-01'}}]}},
  history:{needs:[{needId:'need:0',petId:'p',status:'unknown',exhausted:true,candidateIds:[]}]}};
 const receipt=eligibleAnswerSources(e)[0];
 assert.equal(receipt.sourceId,'lookup:need:0:p'); assert.equal(receipt.sourceType,'lookup_receipt');
 assert.match(receipt.text,/2023-05-01 inclusive to 2023-06-01 exclusive/);
 assert.match(receipt.text,/does not establish that the event never happened/);
 for(const change of [{exhausted:false},{status:'unavailable'},{reason:'need_query_budget'},{candidateIds:['care:x']},{petId:'foreign'}])
  assert.deepEqual(eligibleAnswerSources({...e,history:{needs:[{...e.history.needs[0],...change}]}}).filter(source=>source.sourceType==='lookup_receipt'),[]);
});
const evidence={scope:{requestText:'Return the exact text of the saved note.',authorizedPetIds:['p']},losses:[],sources:[{petId:'p',status:'loaded',loadedIds:['care:a']}],
 represented:[{petId:'p',sourceId:'care:a',sourceType:'care_update',field:'value',start:0,end:note.length,text:note}]};
test('exact record text cannot silently become an exact substring',()=>{
 assert.equal(missingExactRecordText(evidence,'ate 28 g of "usual" food.',['care:a']).length,1);
 for(const text of [note,JSON.stringify({note}), '"'+note.replaceAll('"','""')+'"']) assert.deepEqual(missingExactRecordText(evidence,text,['care:a']),[]);
 assert.deepEqual(missingExactRecordText({...evidence,scope:{...evidence.scope,requestText:'Give a short quote with exact wording.'}},'ate 28 g',['care:a']),[]);
});
const sources=[{sourceId:'a',text:'Started on 2022-05-06.',occurredAt:'2022-05-06T00:00:00+00:00'},{sourceId:'b',text:'Stopped on 2022-05-10.',occurredAt:'2022-05-10T00:00:00+00:00'}];
function calculation(field,literals) {return [{operation:'elapsed_days',operands:literals.map((literal,i)=>({sourceId:i?'b':'a',field,literal})),value:4,unit:'days'}];}
test("elapsed days use certified event instants rather than provider literal dates",async()=>{
 await C.certified("elapsed_days",["event","event"],"day",4,{days:[6,10]});C.rejects(c=>c.operands[0].literal="2022-05-05");
});
test('an inventory covers only its owned counted interval, independently of observation timestamps',()=>{
 const obligation={index:0,petId:'p',window:{from:'2025-05-01',to:'2025-06-01'}};
 const review={index:0,status:'answered',sentenceIndexes:[0]};
 const sources=[{sourceId:'record-inventory:p',petId:'p',occurredAt:null}];
 const sentences=[{sourceIds:['record-inventory:p']}];
 const inventory=[{petId:'p',count:4,from:'2025-05-01T00:00:00Z',to:'2025-06-01T00:00:00Z',checkedAt:'2025-06-02'}];
 assert.deepEqual(reviewObligationCompletion([obligation],[review],sentences,sources,[],inventory).failures,[]);
 assert.equal(reviewObligationCompletion([{...obligation,petId:'foreign'}],[review],sentences,sources,[],inventory).failures.length,1);
 assert.equal(reviewObligationCompletion([{...obligation,window:{from:'2025-04-01',to:'2025-06-01'}}],[review],sentences,sources,[],inventory).failures.length,1);
});
test('a cited empty lookup grounds its exact need and window without pretending to be a dated observation',()=>{
 const window={from:'2025-02-01',to:'2025-03-01'};
 const o={index:1,needId:'need:0',petId:'p',availability:'no_candidate_match',window};
 const source={sourceId:'lookup:need:0:p',petId:'p',sourceType:'lookup_receipt',occurredAt:null,lookupScope:{needId:'need:0',window}};
 const review=[{index:1,status:'answered',sentenceIndexes:[0]}],sentences=[{sourceIds:[source.sourceId]}];
 assert.deepEqual(reviewObligationCompletion([o],review,sentences,[source]).failures,[]);
 for(const change of [{petId:'foreign'},{needId:'need:1'},{window:{from:'2025-01-01',to:'2025-02-01'}},{availability:'query_unavailable'}])
  assert.equal(reviewObligationCompletion([{...o,...change}],review,sentences,[source]).failures.length,1);
 assert.equal(reviewObligationCompletion([o],review,[{sourceIds:[]}],[source]).failures.length,1);
});
test('a correction outage withholds clinical sources without erasing independent profile facts',async()=>{
 const {eligibleAnswerSources}=await import('../app/lib/intelligence/ask-evidence.ts');
 const profile={sourceId:'profile:p:species',petId:'p',sourceType:'profile',field:'value',start:0,end:3,text:'dog'};
 const e={...evidence,history:{corrections:'unavailable',provenance:[]},represented:[...evidence.represented,profile],sources:[...evidence.sources,{petId:'p',source:'profile',status:'loaded',loadedIds:['p']}]};
 assert.deepEqual(eligibleAnswerSources(e).map(s=>s.sourceId),['profile:p:species']);
});
test("elapsed-day authority rejects changed rendered duration",async()=>{
 const f=await C.certified("elapsed_days",["event","event"],"day",4,{days:[6,10]});f.response.answer.summary="The gap is 9 calendar days.";assert.ok(C.calculationPublicationFailure(f.response));
});


test('exact wording about a fact does not require every cited note in full',()=>{
 for(const requestText of [
  "Quote the exact wording about when the saved plan was meant to start, and explain the date.",
  "What was the exact wording about food intake?",
 ]) assert.deepEqual(missingExactRecordText({...evidence,scope:{...evidence.scope,requestText}},'ate 28 g',['care:a']),[]);
 for(const requestText of ["Return the full original note.","Show the exact wording of the saved note.","Give the notes verbatim."])
  assert.equal(missingExactRecordText({...evidence,scope:{...evidence.scope,requestText}},'ate 28 g',['care:a']).length,1);
});
