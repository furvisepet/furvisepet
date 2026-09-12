import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistoryCalculations, verifiedCalculationQuantities } from '../app/lib/intelligence/history-calculation.ts';
import { canonicalReadPresentation, readPublicationFailure } from '../app/lib/ask-publication.ts';
import { receiptCompletionText } from '../app/lib/intelligence/receipt-completion.ts';
import { readRecordInventory } from '../app/lib/intelligence/record-inventory.ts';

test('aggregations operate over original measurements, with unit conversion and no invented divisor', () => {
  const sources = [10,20,30,40,50,60].map((v,i)=>({sourceId:`care:${i}`,text:`Measured ${v} g.`}));
  const mean = { operation:'mean', expression:null, operands:sources.map(s=>({sourceId:s.sourceId,field:'text',literal:s.text.slice(9,-1)})),value:0.035,unit:'kg' };
  assert.ok(parseHistoryCalculations([mean]));
  assert.deepEqual(verifiedCalculationQuantities([mean],sources),['0.035:kg']);
  assert.equal(verifiedCalculationQuantities([{...mean,value:0.036}],sources),null);
  assert.equal(verifiedCalculationQuantities([mean],sources.slice(1)),null);
  assert.equal(verifiedCalculationQuantities([{...mean,unit:'ml'}],sources),null);
});
test('presentation is compiled before review without disabling mutation-claim rejection', () => {
  const text=canonicalReadPresentation('The recorded total is **140 g**.');
  assert.equal(text,'The recorded total is 140 g.');
  assert.equal(readPublicationFailure(text),null);
  assert.equal(canonicalReadPresentation(text),text);
  assert.notEqual(readPublicationFailure(canonicalReadPresentation('I updated the profile.')),null);
  const json='{"note":"literal **text** and 2.50 g"}';
  assert.equal(canonicalReadPresentation(json),json);
});
test('receipt completion requires every exact requested record and never trusts an assistant answer', () => {
  const requestText='Save two separate notes: January 2, 2026: walked 12 minutes. January 4, 2026: walked 18 minutes.';
  const records=[{id:'one',note:'January 2, 2026: walked 12 minutes.',occurredAt:'2026-01-02T00:00:00Z'}, {id:'two',note:'January 4, 2026: walked 18 minutes.',occurredAt:'2026-01-04T00:00:00Z'}];
  const receipt={sourceMessageId:'turn',petId:'pet',requestText,answerPersisted:true,records};
  assert.match(receiptCompletionText(receipt),/^All 2 requested notes/);
  assert.match(receiptCompletionText({...receipt,records:records.slice(1)}),/^1 of 2/);
  assert.match(receiptCompletionText({...receipt,records:[records[0],records[0]]}),/^1 of 2/);
  assert.match(receiptCompletionText({...receipt,records:[records[0],{...records[1],note:'Changed content'}]}),/^1 of 2/);
  assert.match(receiptCompletionText({...receipt,records:[]}),/^0 of 2/);
});
test('typed inventory selection survives wording variation but rejects content-filtered totals', async () => {
  const message='As of this lookup, enumerate the number of active entries in the specified date interval.';
  const context={owner:{userId:'owner'},eligiblePets:[{id:'pet',user_id:'owner'}],currentMessage:message,
    askInterpretation:{readOnly:true,petIds:['pet'],request:{quantity:'records',recordSelection:{scope:'all_active',quote:message}},history:{from:'2025-02-01T00:00:00Z',to:'2025-03-01T00:00:00Z',terms:['entries']}}};
  const calls=[];const db={};for(const method of ['from','select','eq','is','gte','lt'])db[method]=(...args)=>{calls.push([method,...args]);return db;};db.abortSignal=async()=>({count:9,error:null});
  assert.equal((await readRecordInventory(context,db))[0].count,9);
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='user_id'&&c[2]==='owner'));
  context.askInterpretation.request.recordSelection.scope='content_filtered';
  assert.deepEqual(await readRecordInventory(context,{from(){throw Error('unsafe unfiltered count');}}),[]);
});
