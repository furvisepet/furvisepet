import test from 'node:test';
import assert from 'node:assert/strict';
import {exercise,clock,ASK_PROMPT_CONTEXT_CHAR_BUDGET} from './helpers/lifetime-harness.mjs';
import {rows,routine,milestones,stressPets,ownerId,start,end} from './fixtures/ask-ten-year-history.mjs';
import {emptyProposedSemanticFrame} from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
const plan={operation:'recall',readOperation:'recall',selection:'summary',subject:'explicit',petNames:['Milo'],topic:'history',terms:[],from:null,to:null,ordinal:null,episodeTopic:null,frame:emptyProposedSemanticFrame()};
async function run(t,q,p={},extra={}) {
 clock(t);
 const r=await exercise(q,{history:true,fixturePets:stressPets,rows,messages:[],interpretationProposal:{...plan,...p},expectedProviderCalls:null,expectedReviewCalls:null,...extra});
 assert.ok(r.serialized.length<=ASK_PROMPT_CONTEXT_CHAR_BUDGET);
 assert.deepEqual(r.result.acceptedCareActions,[]);assert.deepEqual(r.result.acceptedLearnings,[]);assert.deepEqual(r.result.acceptedSemanticEvents,[]);
 assert.equal(r.result.reasoning.proposedHistoryUpdate.shouldOffer,false);
 assert.ok(r.queries.length<80,'bounded retrieval query count');
 t.diagnostic(JSON.stringify({rows:rows.length,queries:r.queries.length,promptCharacters:r.serialized.length,question:q}));
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
