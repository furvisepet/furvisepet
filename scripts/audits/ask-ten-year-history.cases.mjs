import test from 'node:test';
import assert from 'node:assert/strict';
import {exercise,clock,ASK_PROMPT_CONTEXT_CHAR_BUDGET} from './helpers/lifetime-harness.mjs';
import {rows,routine,stressPets,start,end} from './fixtures/ask-ten-year-history.mjs';
import {emptyProposedSemanticFrame} from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
const plan={operation:'recall',readOperation:'recall',selection:'summary',subject:'explicit',petNames:['Milo'],topic:'history',terms:[],from:null,to:null,ordinal:null,episodeTopic:null,frame:emptyProposedSemanticFrame()};
async function run(t,q,p={},extra={}) {
 clock(t);
 const r=await exercise(q,{history:true,fixturePets:stressPets,rows,messages:[],interpretationProposal:{...plan,...p},expectedProviderCalls:null,expectedReviewCalls:null,...extra});
 assert.ok(r.serialized.length<=ASK_PROMPT_CONTEXT_CHAR_BUDGET);
 assert.deepEqual(r.result.acceptedCareActions,[]);assert.deepEqual(r.result.acceptedLearnings,[]);assert.deepEqual(r.result.acceptedSemanticEvents,[]);
 assert.equal(r.result.reasoning.proposedHistoryUpdate.shouldOffer,false);
 assert.ok(r.queries.length<80,'bounded retrieval query count');
 t.diagnostic(JSON.stringify({rows:(extra.rows || rows).length,queries:r.queries.length,promptCharacters:r.serialized.length,question:q}));
 return r;
}
const includes=(r,id)=>assert.ok(r.prompt.contextRecords.some(s=>s.id==='care:'+id),'missing '+id);
test('ten-year fixture has daily records for three pets, including leap years',()=>{
 assert.equal(routine.length,3652*3);assert.equal(rows.length,10968);
 assert.equal(routine[0].occurred_at.slice(0,10),start);assert.equal(routine.at(-1).occurred_at.slice(0,10),end);
 assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
 assert.equal(routine.filter(r=>r.occurred_at.startsWith('2020-02-29')).length,3);
});
test('ten-year history retains oldest and newest weight and computes the difference',async t=>{
 const r=await run(t,'Compare Milo earliest and latest recorded weight.',{operation:'comparison',readOperation:'comparison',terms:['weigh']});
 includes(r,'decade-old-weight');includes(r,'decade-new-weight');assert.match(r.result.reasoning.answer.summary,/0\.6 kg/);
});
for(const operation of ['recall','comparison','overview']) test('old explicit interval survives '+operation+' model routing',async t=>{
 const r=await run(t,"How many days separate Milo's February 3, 2017 and February 9, 2017 notes?",{operation,readOperation:operation,from:'2017-02-03',to:'2017-02-04',terms:['elapsed']});
 includes(r,'decade-stool');includes(r,'decade-stool-end');assert.match(r.result.reasoning.answer.summary,/6 calendar days/);
});
test('old litter source lookup retrieves observed accidents despite a different search noun',async t=>{
 const r=await run(t,"How many accidents are in Luna's April 8, 2018 note?",{operation:'count',readOperation:'count',petNames:['Luna'],terms:['accident'],from:'2018-04-08',to:'2018-04-09'});
 includes(r,'decade-accidents');assert.equal(r.context.askInterpretation.readOperation,'recall');
});
test('cross-pet lookup keeps both old medication and later recurrence evidence',async t=>{
 const r=await run(t,'Compare the recorded medication and stiffness history for Milo and Oscar.',{operation:'comparison',readOperation:'comparison',petNames:['Milo','Oscar'],terms:['medic','stiff']});
 includes(r,'decade-course');includes(r,'decade-stiffness');
 assert.ok(r.prompt.contextRecords.filter(s=>s.sourceType==='care_update').every(s=>['milo','oscar'].includes(s.petId)));
});
test('late unlinked correction remains visible when asking about an old vomiting report',async t=>{
 const r=await run(t,'What did the notes say about Milo vomiting on February 3, 2017?',{terms:['vomit'],from:'2017-02-03',to:'2017-02-04'});
 assert.ok(r.context.askHistory.coverage.reasons.includes('unlinked_correction_uncertain'));
 assert.match(r.result.reasoning.answer.summary,/correction|attribution|uncertain/i);
});
test('missing old medical result never becomes an invented diagnosis',async t=>{
 const r=await run(t,"What was Oscar's diagnosis in 2019?",{petNames:['Oscar'],terms:['diagnos'],from:'2019-01-01',to:'2020-01-01'},{answer:'Oscar had arthritis.'});
 assert.doesNotMatch(r.result.reasoning.answer.summary,/had arthritis/);
});

import {care} from './fixtures/ask-lifetime-history.mjs';
const monthlyWeights=Array.from({length:120},(_,i)=>care('decade-monthly-'+i,'milo',new Date(Date.UTC(2016,8+i,15)).toISOString().slice(0,10),'weight',`Milo weighed ${(28+(i%5)/10).toFixed(1)} kg.`));
const denseRows=[...rows,...monthlyWeights];
const endpointQuestion='Compare Milo earliest and latest recorded weights and calculate the change.';
test('120 intervening monthly weights retain both decade endpoints within existing budgets',async t=>{
 const r=await run(t,endpointQuestion,{operation:'comparison',readOperation:'comparison',terms:['weigh']},{rows:denseRows});
 includes(r,'decade-old-weight');includes(r,'decade-new-weight');
 assert.match(r.result.reasoning.answer.summary,/0\.6 kg lower/);
 assert.equal(r.context.askHistory.coverage.retrieval,'partial');
 assert.match(r.result.reasoning.answer.summary,/retrieved|can't verify/);
 assert.ok(r.context.askHistory.originals.length<=64);assert.ok(r.context.askHistory.coverage.perPet[0].pages<=4);
 assert.ok(r.queries.some(q=>q.table==='read_ask_history_candidates_latest'));
});
test('failure at the newest end cannot manufacture a successful weight delta',async t=>{
 const r=await run(t,endpointQuestion,{operation:'comparison',readOperation:'comparison',terms:['weigh']},{rows:denseRows,failHistoryPage:3});
 assert.equal(r.context.askHistory.coverage.retrieval,'unavailable');
 assert.doesNotMatch(r.result.reasoning.answer.summary,/kg (?:lower|higher)/);
});
test('conflicting tied newest weights remain unsupported',async t=>{
 const conflict=care('decade-latest-conflict','milo',end,'weight','Milo weighed 29.9 kg.');
 const r=await run(t,endpointQuestion,{operation:'comparison',readOperation:'comparison',terms:['weigh']},{rows:[...denseRows,conflict]});
 assert.doesNotMatch(r.result.reasoning.answer.summary,/kg (?:lower|higher)/);
});

test('simpler dated count is computed without paraphrasing unrelated uncertainty',async t=>{
 const q="How many accidents are in Luna's April 8, 2018 note?";
 const r=await run(t,'Say that more simply.',{operation:'recall',readOperation:'recall',subject:'conversation',petNames:[],terms:[]},{messages:[{id:'prior',user_id:'synthetic-owner',conversation_id:'chat',role:'user',user_text:q,sequence_number:1}]});
 assert.equal(r.result.reasoning.answer.summary,'The 2018-04-08 note describes two accidents.');
 const {withinNoteCountAnswer}=await import('../../app/lib/intelligence/within-note-count.ts');
 for(const change of ['lost','foreign','uncertain','correction','episodes','mixed','extra','compound','other-pet']) {
  const c=structuredClone(r.result.reasoning.evidenceContract);
  const source=c.represented.find(s=>s.sourceId==='care:decade-accidents');
  if(change==='lost')c.losses.push({sourceId:source.sourceId,reason:'prompt_budget'});
  if(change==='foreign')source.petId='unowned';
  if(change==='uncertain')source.text=source.text.replace('urinated','may have urinated');
  if(change==='correction')source.text+=' Correction: that observation was mistaken.';
  if(change==='extra')source.text+=' Luna had another accident.';
  if(change==='compound')source.text=source.text.replace('once today.','once today and again later.');
  if(change==='other-pet')source.text=source.text.replace('Luna urinated','Bruno urinated');
  if(['uncertain','correction','extra','compound','other-pet'].includes(change))source.end=source.text.length;
  if(change==='episodes')c.interpretation.referenceQuestion='How many episodes are in Luna April 8, 2018 note?';
  if(change==='mixed')c.interpretation.referenceQuestion=q+' What was the cause?';
  assert.equal(withinNoteCountAnswer(c),null,change);
 }
});
