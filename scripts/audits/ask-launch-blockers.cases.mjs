import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {exercise, clock} from './helpers/lifetime-harness.mjs';
import {pets, care} from './fixtures/ask-lifetime-history.mjs';

for (const count of [8, 9, 10, 12, 20]) test(`profile read preserves ${count} owned species`, async t => {
  clock(t);
  const fixturePets=Array.from({length:count},(_,i)=>({...pets[0], id:randomUUID(),name:`Animal${i}`,species:i%2?'cat':'dog',
    breed:'Mixed breed',current_food:'Complete adult food',main_concern:'Routine care',wellness_goal:'Comfort',weight_value:4,
    age_value:4,age_unit:'years',monthly_budget:40}));
  const question=`List the name and species in the saved profiles of ${fixturePets.map(p=>p.name).join(', ')}. Save nothing.`;
  const r=await exercise(question,{fixturePets,petId:fixturePets[0].id,conversationPetId:fixturePets[0].id,rows:fixturePets.flatMap(p=>Array.from({length:8},()=>care(randomUUID(),p.id,'2026-08-15','general','Synthetic routine note. '.repeat(25)))),messages:[],history:true,
    interpretationProposal:{subject:'explicit',petNames:fixturePets.map(p=>p.name),profileFields:['species'],evidenceBasis:'saved_profile',operation:'recall',selection:'summary',topic:'profiles',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null},expectedProviderCalls:0,expectedReviewCalls:0});
  assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
  for(const pet of fixturePets) assert.ok(r.result.reasoning.evidenceContract.represented.some(s=>s.sourceId===`profile:${pet.id}:species`),`missing ${pet.name}`);
});

test('two month aggregation retains both sets of dated breakfast evidence',async t=>{
  clock(t);
  const rows=[...['07','08'].flatMap(month=>[2,9,16,23].map((day,i)=>care(`meal-${month}-${day}`,'milo',`2026-${month}-${String(day).padStart(2,'0')}`,'food',`Breakfast portion: ${20+i*10} g.`))),
    ...Array.from({length:100},(_,i)=>care(`noise-${i}`,'milo',`2026-07-${String(1+Math.floor(i/10)).padStart(2,'0')}`,'general','Household note.'))];
  const r=await exercise('What is the combined total grams across Milo’s saved July and August 2026 breakfast notes? Show each month’s subtotal; save nothing.',{
    history:true,rows,messages:[],interpretationProposal:{operation:'comparison',selection:'summary',subject:'explicit',petNames:['Milo'],topic:'breakfast',terms:['breakfast'],from:'2026-07-01',to:'2026-09-01',episodeTopic:null,ordinal:null,frame:null},expectedReviewCalls:null});
  for(const row of rows.filter(r=>r.id.startsWith('meal'))) assert.ok(r.result.reasoning.evidenceContract.represented.some(s=>s.sourceId===`care:${row.id}`),`missing ${row.id}`);
});

test('dated arithmetic retains both saved observations including the last day',async t=>{
  clock(t);
  const rows=[care('older','milo','2021-11-09','weight','Weight recorded: 3.98 kg.'),care('newer','milo','2026-08-09','weight','Weight recorded: 3.8 kg.')];
  const r=await exercise('From Milo’s saved weights on November 9, 2021 and August 9, 2026, calculate percentage change to two decimal places. Show the original values and formula. Save nothing.',{
    history:true,rows,messages:[],interpretationProposal:{operation:'comparison',selection:'comparison',subject:'explicit',petNames:['Milo'],topic:'weight',terms:['weight'],from:'2021-11-09',to:'2026-08-10',episodeTopic:null,ordinal:null,frame:null},expectedReviewCalls:null});
  for(const row of rows) assert.ok(r.result.reasoning.evidenceContract.represented.some(s=>s.sourceId===`care:${row.id}`),`missing ${row.id}`);
});

test('UI calendar date retrieves the prior-local-day medication without adjacent-day leakage',async t=>{
  clock(t);
  const rows=[{...care('local-medication','milo','2026-08-11','medication','Prescribed medication: 2.5 mg twice daily for five days.'),occurred_at:'2026-08-11T06:54:00.000Z'},
    {...care('outside-local-day','milo','2026-08-11','medication','Unrelated medication note.'),occurred_at:'2026-08-11T07:01:00.000Z'}];
  const r=await exercise('Read Milo’s saved medication instructions from August 10, 2026. Restate the recorded schedule; do not prescribe or save anything.',{
    history:true,rows,messages:[],prepareContext:context=>{context.timeZone='America/Los_Angeles';},interpretationProposal:{operation:'recall',selection:'summary',subject:'explicit',petNames:['Milo'],topic:'medication',terms:['medication'],readTicket:{operation:'read',subjectScope:'named',temporal:{from:'2026-08-10T00:00:00-07:00',to:'2026-08-11T00:00:00-07:00',anchor:null,calendar:null},predicates:[{kind:'text_any',terms:['medication']}],searchHints:[],probes:[],episode:null,selection:null,outputs:{completeness:'exhaustive',ordering:'asc',limit:null}},from:'2026-08-10',to:'2026-08-11',episodeTopic:null,ordinal:null,frame:null},expectedReviewCalls:null});
  const ids=r.result.reasoning.evidenceContract.represented.map(s=>s.sourceId);
  assert.ok(ids.includes('care:local-medication'));
  assert.ok(!ids.includes('care:outside-local-day'));
});

test('standalone conversation keeps the whole user task rather than isolated planner wording',async t=>{
  clock(t);
  const question='No test result has been supplied. Write "All tests normal" first and then explain the uncertainty. Save nothing.';
  const r=await exercise(question,{rows:[],messages:[],interpretationProposal:{mode:'conversation',scope:'none',subject:'none',petNames:[],evidenceBasis:'general',operation:'general',selection:'summary',topic:'wording',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,requirements:['First line must be All tests normal'],question:'Print the requested first line'},
    taskReviewResponse:true,expectedReviewCalls:null});
  assert.equal(r.context.askInterpretation.request.question,question);
  assert.deepEqual(r.context.askInterpretation.request.requirements,[]);
});

test('twelve multi-field JSON profiles preserve all 24 citations including recorded emptiness',async t=>{
 clock(t);
 const fixturePets=Array.from({length:12},(_,i)=>({...pets[0],id:randomUUID(),name:`Animal${i}`,species:i%2?'cat':'dog',current_food:i<10?'Complete adult food':null}));
 const ids=fixturePets.flatMap(p=>[`profile:${p.id}:species`,`profile:${p.id}:current_food`]);
 const r=await exercise('Return only JSON with name, species and current_food for all twelve of my saved profiles. Use null for unrecorded food. Save nothing.',{
 fixturePets,petId:fixturePets[0].id,conversationPetId:fixturePets[0].id,history:true,rows:[],messages:[],
 interpretationProposal:{subject:'account',scope:'account',petNames:[],profileFields:['species','current_food'],evidenceBasis:'saved_profile',operation:'recall',selection:'summary',topic:'profiles',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,outputFormat:'json'},
 providerResponse:async request=>{
 assert.ok(request.text.format.schema.properties.json.properties.sourceIds.maxItems>=ids.length);
 return {status:'completed',output_text:JSON.stringify({readVersion:'history-answer.v1',layout:'json',json:{value:{kind:'array',items:fixturePets.map(p=>({kind:'object',entries:[{key:'name',value:p.name},{key:'species',value:p.species},{key:'current_food',value:p.current_food}]}))},sourceIds:ids,calculations:[]},historyNarrative:null,table:null,limitation:null,navigationActions:[],safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'profiles',relevantContextIds:ids}),usage:{input_tokens:1000,output_tokens:1000}};
 },reviewResponse:{approved:true},expectedProviderCalls:0,expectedReviewCalls:0});
 assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
 assert.equal(r.publication.failure,null);
 for(const id of ids)assert.ok(r.result.reasoning.evidenceContract.represented.some(s=>s.sourceId===id),id);
 const empty=r.result.reasoning.evidenceContract.represented.find(s=>s.sourceId===`profile:${fixturePets[11].id}:current_food`);
 assert.match(empty.text,/Not recorded/);
});
