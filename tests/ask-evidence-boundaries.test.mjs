import test from 'node:test';
import assert from 'node:assert/strict';
import { missingExactRecordText } from '../app/lib/intelligence/exact-record-text.ts';
import { verifiedCalculationQuantities } from '../app/lib/intelligence/history-calculation.ts';
import { reviewObligationCompletion, historyTaskCompleted } from '../app/lib/intelligence/history-obligations.ts';
const note='May 4, 2025: ate 28 g of "usual" food.';
test('calculation generation binds each operand to its original source and field',async()=>{
 const {sourceBoundSchema}=await import('../app/lib/intelligence/source-bound-schema.ts');
 const base={properties:{operands:{type:'array',items:{type:'object'}}}};
 const sources=[{sourceId:'care:a',sourceType:'care_update',text:'Walked 23 minutes; rested 6 minutes.',occurredAt:'2025-04-03T00:00:00Z'},
  {sourceId:'care:b',sourceType:'care_update',text:'Played 14 minutes.'}];
 const choices=sourceBoundSchema(base,sources).properties.operands.items.anyOf;
 assert.deepEqual(choices[0].properties.sourceId.enum,['care:a']);
 assert.deepEqual(choices[0].properties.literal.enum,['23 minutes','6 minutes','care:a']);
 assert.deepEqual(choices[1].properties.field.enum,['occurredAt']);
 assert.deepEqual(choices[2].properties.sourceId.enum,['care:b']);
 assert.deepEqual(choices[2].properties.literal.enum,['14 minutes','care:b']);
 assert.equal(base.properties.operands.items.anyOf,undefined);
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
 const e={scope:{authorizedPetIds:['p'],readOnlyRecall:true},sources:[],represented:[],losses:[],petNames:{p:'Juniper'},
  interpretation:{request:{evidenceNeeds:[{id:'need:0',quote:'Which records document limping?',terms:['limping'],petIds:['p'],window:{from:'2023-05-01',to:'2023-06-01'}}]}},
  history:{needs:[{needId:'need:0',petId:'p',status:'unknown',exhausted:true,candidateIds:[]}]}};
 const receipt=eligibleAnswerSources(e)[0];
 assert.equal(receipt.sourceId,'lookup:need:0:p'); assert.equal(receipt.sourceType,'lookup_receipt');
 assert.match(receipt.text,/2023-05-01 inclusive to 2023-06-01 exclusive/);
 assert.match(receipt.text,/not that the event never happened/);
 for(const change of [{exhausted:false},{status:'unavailable'},{reason:'need_query_budget'},{candidateIds:['care:x']},{petId:'foreign'}])
  assert.deepEqual(eligibleAnswerSources({...e,history:{needs:[{...e.history.needs[0],...change}]}}),[]);
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
test('equal instants and explicit source calendar dates support elapsed-day calculations',()=>{
 assert.ok(verifiedCalculationQuantities(calculation('occurredAt',['2022-05-06T00:00:00.000Z','2022-05-10T00:00:00Z']),sources));
 assert.ok(verifiedCalculationQuantities(calculation('text',['2022-05-06','2022-05-10']),sources));
 assert.equal(verifiedCalculationQuantities(calculation('occurredAt',['2022-05-07T00:00:00Z','2022-05-10T00:00:00Z']),sources),null);
 assert.equal(verifiedCalculationQuantities(calculation('text',['2022-05-05','2022-05-09']),sources),null);
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
test('calendar-day units are validated rather than ignored as unrecognized modifiers',async()=>{
 const {historyNarrativeAnchorsSupported}=await import('../app/lib/intelligence/history-narrative-facts.ts');
 const c=calculation('text',['2022-05-06','2022-05-10']); c[0].unit='calendar days';
 const derived=verifiedCalculationQuantities(c,sources); assert.ok(derived);
 assert.equal(historyNarrativeAnchorsSupported('The gap is 4 calendar days.',sources,'',derived,false),true);
 assert.equal(historyNarrativeAnchorsSupported('The gap is 9 calendar days.',sources,'',derived,false),false);
});
