import assert from 'node:assert/strict';
import test from 'node:test';
import {exercise,clock} from './helpers/lifetime-harness.mjs';
import {care} from './fixtures/ask-lifetime-history.mjs';
const {planHistoricalQuery}=await import('../../app/lib/intelligence/history-retrieval.ts');
test('stomach summary retrieves old digestive source through actual callback',async t=>{
 clock(t);
 const row=care('old-stool','milo','2011-02-01','symptom','Milo had soft stool for two days.');
 const r=await exercise('Summarize his stomach history.',{history:true,rows:[row],messages:[]});
 assert.ok(r.context.askHistory?.entries.some(e=>e.id===row.id));
 assert.doesNotMatch(r.result.reasoning.answer.summary,/supported historical topic|specify a topic and a single year/i);
});
test('digestive aliases and overlapping symptoms stay within query bounds',()=>{
 for(const message of ['Summarize his stomach history.','Review digestive history.','Summarize gastrointestinal history.','Summarize stomach history and vomiting.']) {
  const plan=planHistoricalQuery(message);assert.ok(plan,message);assert.ok(plan.terms.includes('stool'));assert.ok(plan.terms.includes('vomit'));assert.ok(plan.terms.length<=6);
 }
 assert.equal(planHistoricalQuery('Save this: Milo has stomach pain.'),null);
});
test('topicless count asks for symptom, never a displayed ordinal',async t=>{
 clock(t);const r=await exercise('How many separate episodes are recorded?',{history:true,messages:[]});
 assert.match(r.result.reasoning.answer.summary,/symptom|vomiting|soft stool/i);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/which displayed episode|identify the pet/i);
 assert.equal(r.context.episodeResult.exactTotal,null);
});
test('second episode without a verified list still cannot select a record',async t=>{
 clock(t);const r=await exercise('What happened in the second episode?',{history:true,messages:[]});
 assert.equal(r.context.episodeResult.referenceStatus,'clarify');assert.equal(r.context.episodeResult.references,undefined);
});
