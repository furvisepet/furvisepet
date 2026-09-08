import test from 'node:test';
import assert from 'node:assert/strict';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care } from './fixtures/ask-lifetime-history.mjs';
const question='Compare Milo earliest and latest recorded weight.';
test('actual callback computes a qualified comparison of retrieved dated measurements', async t=>{
 clock(t);const run=await exercise(question,{history:true,answer:'Milo gained 9 kg over his entire lifetime.'});
 const answer=run.result.reasoning.answer.summary;
 assert.match(answer,/0\.6 kg/);
 assert.match(answer,/28\.4 kg/);assert.match(answer,/27\.8 kg/);
 assert.match(answer,/retrieved/i);assert.match(answer,/cannot|can't/i);
 assert.doesNotMatch(answer,/gained 9/);
 assert.deepEqual(run.result.reasoning.evidenceContract.verifiedFacts,[]);
 assert.deepEqual(run.result.acceptedCareActions,[]);
});

const first=care('w1','milo','2011-02-01','general','Milo weighed 28.4 kg.');
const last=care('w2','milo','2026-08-19','general','Milo weighed 27.8 kg.');
for(const note of ['Milo may have weighed 27.8 kg.','Milo weighed 27.8 lb.','Milo did not weigh 27.8 kg.','Bruno weighed 27.8 kg.','Milo weighed 27.8 kg. Correction pending.']) {
 test(`unsupported weight statement does not produce a numeric comparison: ${note}`,async t=>{
  clock(t);const run=await exercise(question,{history:true,rows:[first,{...last,note}]});
  assert.doesNotMatch(run.result.reasoning.answer.summary,/0\.6 kg/);
 });
}
test('conflicting same-instant readings and future dates cannot establish endpoints',async t=>{
 clock(t);
 for(const rows of [[first,last,{...last,id:'conflict',note:'Milo weighed 30 kg.'}], [first,{...last,occurred_at:'2099-08-19T12:00:00Z'}]]) {
  const run=await exercise(question,{history:true,rows});
  assert.doesNotMatch(run.result.reasoning.answer.summary,/0\.6 kg/);
 }
});
test('changed source, missing source and unavailable correction graph retain limitations',async t=>{
 clock(t);
 for(const options of [{graph:{missingSourceIds:['w2']}},{graph:{sources:[{...last,note:'Milo weighed 29 kg.'}]}},{failGraph:true}]) {
  const run=await exercise(question,{history:true,rows:[first,last],...options});
  assert.doesNotMatch(run.result.reasoning.answer.summary,/0\.6 kg/);
  assert.match(run.result.reasoning.answer.summary,/incomplete|unavailable|uncertain/i);
 }
});

test('decimal arithmetic is deterministic for gain and unchanged weight',async t=>{
 clock(t);
 for(const [value,expected] of [['28.401',/0\.001 kg higher/],['28.4',/no change/]]) {
  const run=await exercise(question,{history:true,rows:[first,{...last,note:`Milo weighed ${value} kg.`}]});
  assert.match(run.result.reasoning.answer.summary,expected);
  assert.match(run.result.reasoning.answer.summary,/retrieved reports only/);
 }
});
test('only the authorized pet contributes to the comparison',async t=>{
 clock(t);const run=await exercise(question,{history:true,rows:[first,last,{...first,id:'foreign',user_id:'another-owner',note:'Milo weighed 100 kg.'},{...first,id:'bruno',pet_profile_id:'bruno',note:'Bruno weighed 90 kg.'}]});
 assert.match(run.result.reasoning.answer.summary,/0\.6 kg lower/);
 assert.doesNotMatch(run.result.reasoning.answer.summary,/100 kg|90 kg/);
});

test('a rewritten model answer cannot override the server-scoped comparison',async t=>{
 clock(t);const run=await exercise(question,{history:true,rows:[first,last],afterGeneration(reasoning){
  reasoning.answer.summary='Milo gained 9 kg across his entire lifetime.';
 }});
 assert.match(run.result.reasoning.answer.summary,/0\.6 kg lower/);
 assert.doesNotMatch(run.result.reasoning.answer.summary,/gained 9/);
 assert.match(run.result.reasoning.answer.summary,/can't verify/);
});
test('detached quantity or date metadata cannot override represented source spans',async t=>{
 clock(t);const run=await exercise(question,{history:true,rows:[first,last]});
 const {weightComparisonAnswer}=await import('../../app/lib/intelligence/weight-comparison.ts');
 for(const field of ['grams','at']) {
  const contract=structuredClone(run.result.reasoning.evidenceContract);
  contract.weightComparison.measurements[0][field]=field==='grams'?999999:'2000-01-01T12:00:00Z';
  assert.equal(weightComparisonAnswer(contract),null);
 }
});

test('first and last weigh-ins compute a change without the literal word weight',async t=>{
 clock(t);const run=await exercise('What did Milo weigh at the first and last recorded weigh-ins, and how much did it change?',{history:true,rows:[first,last]});
 assert.match(run.result.reasoning.answer.summary,/0\.6 kg lower/);
});
test('weight table and comparison are rendered from validated measurements',async t=>{
 clock(t);const run=await exercise('Give Milo two saved weights as a date-and-weight table, followed by one sentence comparing them.',{history:true,rows:[first,last]});
 assert.match(run.result.reasoning.answer.summary,/\| Date \| Weight \|/);assert.match(run.result.reasoning.answer.summary,/0\.6 kg lower/);
 assert.deepEqual(run.result.acceptedCareActions,[]);
});

test('table includes a later unambiguous pronoun weight sentence',async t=>{
 clock(t);const run=await exercise('Give Milo saved weights as a date-and-weight table.',{history:true,rows:[first,{...last,note:'Milo is quiet. His appetite is normal. His weight today was 27.8 kg.'}]});
 assert.match(run.result.reasoning.answer.summary,/\| 2026-08-19 \| 27\.8 kg \|/);
});
