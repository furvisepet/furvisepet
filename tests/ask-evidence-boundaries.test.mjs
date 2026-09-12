import test from 'node:test';
import assert from 'node:assert/strict';
import { missingExactRecordText } from '../app/lib/intelligence/exact-record-text.ts';
import { verifiedCalculationQuantities } from '../app/lib/intelligence/history-calculation.ts';
import { reviewObligationCompletion } from '../app/lib/intelligence/history-obligations.ts';
const note='May 4, 2025: ate 28 g of "usual" food.';
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
