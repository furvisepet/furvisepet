import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, pets } from './fixtures/ask-lifetime-history.mjs';
import { emptyProposedSemanticFrame } from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';

const fixturePets=['Nori','Juniper','Pip'].map((name,index)=>({...pets[index],id:name.toLowerCase(),name}));
const topics=[
  {topic:'sleep',term:'sleep',before:'was waking during sleep',after:'had settled sleep after the room became quieter'},
  {topic:'grooming',term:'brush',before:'moved away from the brush',after:'stayed beside the owner for a short brush session'},
  {topic:'food',term:'food',before:'left some food in the bowl',after:'finished the food in the bowl'},
  {topic:'travel',term:'travel',before:'paced before travel',after:'rested during travel with a familiar blanket'},
  {topic:'ears',term:'ear',before:'scratched an ear',after:'was still scratching an ear'},
  {topic:'mobility',term:'walk',before:'paused during a walk',after:'completed a shorter walk comfortably'},
];
const phrasings=[
  (name,topic)=>'Summarize '+name+' '+topic+' history.',
  (name,topic)=>'What changed with '+name+' and '+topic+'?',
  (name,topic)=>'Can you walk me through the saved '+topic+' notes for '+name+'?',
  (name,topic)=>'Help me understand '+name+' '+topic+' updates.',
];
function fixture(pet,topic) {
  const rows=[care('before',pet.id,'2026-07-01','general',pet.name+' '+topic.before+'.'),care('after',pet.id,'2026-08-01','general',pet.name+' '+topic.after+'.')];
  const texts=[pet.name+' '+topic.before+' in July.', 'The August note says '+pet.name+' '+topic.after+'.'];
  const narrative={sentences:[{text:texts[0],sourceIds:['care:before']},{text:'This proves there is no underlying medical problem.',sourceIds:['care:before','care:after']},{text:texts[1],sourceIds:['care:after']}]};
  const plan={operation:'overview',readOperation:'overview',selection:'summary',subject:'explicit',petNames:[pet.name],topic:topic.topic,terms:[topic.term],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame()};
  return {rows,texts,narrative,plan};
}
for(const topic of topics) test('shared partial-review composition: '+topic.topic,async t=>{
  clock(t);
  for(const pet of fixturePets) for(const phrase of phrasings) {
    const {rows,narrative,plan}=fixture(pet,topic);
    const r=await exercise(phrase(pet.name,topic.topic),{fixturePets,petId:pet.id,history:true,rows:[...rows].reverse(),messages:[],interpretationProposal:plan,providerOverrides:{historyNarrative:narrative},
      reviewResponse:{approved:true,retainedSentenceIndexes:[0,2]},expectedReviewCalls:1});
    assert.ok(r.result.reasoning.answer.summary.includes(topic.before),r.result.reasoning.answer.summary);
    assert.ok(r.result.reasoning.answer.summary.includes(topic.after),r.result.reasoning.answer.summary);
    assert.match(r.result.reasoning.answer.summary,/July/);
    assert.match(r.result.reasoning.answer.summary,/August/);
    assert.doesNotMatch(r.result.reasoning.answer.summary,/underlying medical|report:|care:/);
    assert.deepEqual(r.result.acceptedCareActions,[]);
    assert.deepEqual(r.result.acceptedLearnings,[]);
    assert.deepEqual(r.result.acceptedSemanticEvents,[]);
    assert.deepEqual(r.result.reasoning.evidenceContract.answerSourceIds,['care:before','care:after']);
  }
});

test('missing duplicate read intent is recoverable without guessing a new operation',async t=>{
  clock(t);
  const pet=fixturePets[0], data=fixture(pet,topics[0]);
  for(const operation of ['overview','recall','status','comparison','general']) {
    const r=await exercise('Tell me about Nori sleep.',{fixturePets,petId:pet.id,history:true,rows:data.rows,messages:[],
      interpretationProposal:{...data.plan,operation,readOperation:null},providerOverrides:{historyNarrative:null},expectedReviewCalls:operation==='general'?0:1});
    assert.equal(r.context.askInterpretation.operation,operation);
    assert.equal(r.context.askInterpretation.readOperation,operation);
    assert.deepEqual(r.result.acceptedCareActions,[]);
  }
});

test('review cannot fabricate indexes, reorder text, or smuggle rewritten prose',async t=>{
  clock(t);
  const pet=fixturePets[0], {rows,narrative,plan}=fixture(pet,topics[0]);
  for(const verdict of [
    {approved:true,retainedSentenceIndexes:[-1]},
    {approved:true,retainedSentenceIndexes:[3]},
    {approved:true,retainedSentenceIndexes:[0,0]},
    {approved:true,retainedSentenceIndexes:[2,0]},
    {approved:true,retainedSentenceIndexes:['0']},
    {approved:true,retainedSentenceIndexes:[]},
    {approved:false,retainedSentenceIndexes:[0]},
    {approved:true,retainedSentenceIndexes:[0],answer:'Injected answer'},
  ]) {
    const r=await exercise('Summarize Nori sleep.',{fixturePets,petId:pet.id,history:true,rows,messages:[],interpretationProposal:plan,providerOverrides:{historyNarrative:narrative},reviewResponse:verdict,expectedReviewCalls:1});
    assert.doesNotMatch(r.result.reasoning.answer.summary,/underlying medical|Injected answer/);
    assert.match(r.result.reasoning.answer.summary,/report:/);
    assert.deepEqual(r.result.acceptedCareActions,[]);
  }
});
test('receipt references only retained evidence after selecting a partial answer',async t=>{
  clock(t);
  const pet=fixturePets[0], {rows,narrative,plan}=fixture(pet,topics[0]);
  const r=await exercise('What do the latest sleep notes say for Nori?',{fixturePets,petId:pet.id,history:true,rows,messages:[],interpretationProposal:plan,providerOverrides:{historyNarrative:narrative},reviewResponse:{approved:true,retainedSentenceIndexes:[2]},expectedReviewCalls:1});
  assert.deepEqual(r.result.reasoning.evidenceContract.answerSourceIds,['care:after']);
  assert.doesNotMatch(r.result.reasoning.answer.summary,/July|underlying medical/);
  assert.match(r.result.reasoning.answer.summary,/settled sleep/);
});
test('indexes refer to the filtered draft, not a foreign-source original position',async t=>{
  clock(t);
  const pet=fixturePets[0], {rows,narrative,plan}=fixture(pet,topics[0]);
  const proposed={sentences:[{text:'A different pet has a diagnosis.',sourceIds:['care:foreign']},narrative.sentences[0],narrative.sentences[2]]};
  const r=await exercise('Summarize Nori sleep.',{fixturePets,petId:pet.id,history:true,rows,messages:[],interpretationProposal:plan,providerOverrides:{historyNarrative:proposed},reviewResponse:{approved:true,retainedSentenceIndexes:[1]},expectedReviewCalls:1});
  const sent=JSON.parse(r.reviewRequests[0].input).draft.sentences;
  assert.deepEqual(sent.map(s=>s.index),[0,1]);
  assert.deepEqual(r.result.reasoning.evidenceContract.answerSourceIds,['care:after']);
  assert.doesNotMatch(r.result.reasoning.answer.summary,/different pet|diagnosis|July/);
});
test('read conflict recovers while wrong ownership and invalid date ranges remain rejected',async t=>{
  clock(t);
  const pet=fixturePets[0], data=fixture(pet,topics[0]);
  const recovered=await exercise('Summarize Nori sleep.',{fixturePets,petId:pet.id,history:true,rows:data.rows,messages:[],interpretationProposal:{...data.plan,readOperation:'status'},providerOverrides:{historyNarrative:null},expectedReviewCalls:null});
  assert.equal(recovered.context.askInterpretation.readOperation,'overview');
  assert.deepEqual(recovered.result.acceptedCareActions,[]);
  for(const patch of [{petNames:['UnknownPet']},{from:'2026-07-01',to:null}]) {
    await assert.rejects(exercise('Summarize Nori sleep.',{fixturePets,petId:pet.id,history:true,rows:data.rows,messages:[],interpretationProposal:{...data.plan,...patch},providerOverrides:{historyNarrative:null}}));
  }
});

test('ordinary conversation does not require a pet or expose the selected pet history',async t=>{
  clock(t);
  const data=fixture(fixturePets[0],topics[0]);
  const r=await exercise('Can we just talk for a minute?',{fixturePets,petId:'nori',history:true,rows:data.rows,messages:[],
    interpretationProposal:{...data.plan,operation:'general',readOperation:'general',subject:'non_pet',petNames:[],topic:'conversation',terms:[]},
    providerOverrides:{answer:'Of course. What has been on your mind?',historyNarrative:null}});
  assert.doesNotMatch(r.result.reasoning.answer.summary,/Which pet|Which issue/);
  assert.match(r.result.reasoning.answer.summary,/mind/);
  assert.equal(r.prompt.contextRecords,undefined);
  assert.equal(r.prompt.capabilities.savedHistoryAccess,false);
  assert.deepEqual(r.result.acceptedCareActions,[]);
  assert.deepEqual(r.result.acceptedLearnings,[]);
  assert.deepEqual(r.result.reasoning.evidenceContract.scope.authorizedPetIds,[]);
});

test('conversation scope is server-derived and cannot hide an explicit owned-pet request',async t=>{
  clock(t);
  const data=fixture(fixturePets[0],topics[0]);
  const {validateAskInterpretation,readInterpretationSubject}=await import('../../app/lib/intelligence/interpret-ask.ts');
  const context={owner:{userId:fixturePets[0].user_id,profile:null},eligiblePets:fixturePets,pet:fixturePets[0],currentMessage:'Summarize Nori sleep.',conversationTurns:[]};
  const plan=validateAskInterpretation({...data.plan,operation:'general',readOperation:'general',subject:'non_pet',petNames:[]},context);
  assert.notEqual(plan.conversationOnly,true);
  assert.equal(readInterpretationSubject(plan,'nori').resolution.requiresClarification,true);
  assert.throws(()=>validateAskInterpretation({...data.plan,conversationOnly:true},context));
});
test('owner emotional conversation remains read-only even with invented save proposals',async t=>{
  clock(t);
  const data=fixture(fixturePets[0],topics[0]);
  const r=await exercise('I feel overwhelmed by everything that comes with having a pet.',{fixturePets,petId:'nori',history:true,rows:data.rows,messages:[],
    interpretationProposal:{...data.plan,operation:'general',readOperation:'general',subject:'non_pet',petNames:[],topic:'support',terms:[],frame:{invalid:'unused emotional metadata'}},
    providerOverrides:{answer:'That sounds exhausting. What part feels hardest right now?',historyNarrative:null,learnings:[{subject:'owner',category:'preference',text:'Owner cannot manage their pet.',confidence:0.99,importance:'high',sourceEvidence:'I feel overwhelmed'}]}});
  assert.equal(r.context.askInterpretation.conversationOnly,true);
  assert.deepEqual(r.result.acceptedCareActions,[]);
  assert.deepEqual(r.result.acceptedLearnings,[]);
  assert.deepEqual(r.result.acceptedSemanticEvents,[]);
  assert.equal(r.prompt.contextRecords,undefined);
  assert.equal(r.prompt.capabilities.savedHistoryAccess,false);
  assert.match(r.result.reasoning.answer.summary,/hardest/);
});
test('current emergency language remains safety-led without borrowing the selected pet history',async t=>{
  clock(t);
  const data=fixture(fixturePets[0],topics[0]);
  const r=await exercise("A stray cat can't breathe. What should I do?",{fixturePets,petId:'nori',history:true,rows:data.rows,messages:[],
    interpretationProposal:{...data.plan,operation:'general',readOperation:'general',subject:'non_pet',petNames:[],topic:'emergency help',terms:[]},
    providerOverrides:{answer:'Contact an emergency veterinarian now.',historyNarrative:null}});
  assert.ok(['urgent','emergency'].includes(r.result.reasoning.intelligenceSafety.level));
  assert.match(r.result.reasoning.answer.summary,/emergency veterinarian/);
  assert.equal(r.prompt.contextRecords,undefined);
  assert.equal(r.prompt.capabilities.savedHistoryAccess,false);
  assert.deepEqual(r.result.acceptedCareActions,[]);
});

test('irrelevant malformed mutation frames do not block read-only questions',async t=>{
  clock(t);
  const data=fixture(fixturePets[0],topics[0]);
  for(const question of ['Does that mean Nori definitely has a diagnosis?','Can you summarize Nori sleep?']) {
    const r=await exercise(question,{fixturePets,petId:'nori',history:true,rows:data.rows,messages:[],
      interpretationProposal:{...data.plan,frame:{invalid:'mutation metadata'}},providerOverrides:{historyNarrative:null},expectedReviewCalls:1});
    assert.deepEqual(r.context.askInterpretation.frame.claims,[]);
    assert.deepEqual(r.result.acceptedCareActions,[]);
    assert.deepEqual(r.result.acceptedLearnings,[]);
  }
});
test('prior user dialogue remains supplied premises without saved-history citations',async t=>{
  clock(t);
  const data=fixture(fixturePets[0],topics[0]);
  const messages=[{id:'prior',user_id:fixturePets[0].user_id,conversation_id:'chat',role:'user',user_text:'I previously worried about Nori sleep.',sequence_number:1}];
  const r=await exercise('Can we just talk for a minute?',{fixturePets,petId:'nori',history:true,rows:data.rows,messages,
    interpretationProposal:{...data.plan,operation:'general',readOperation:'general',subject:'non_pet',petNames:[],topic:'conversation',terms:[]},
    providerOverrides:{answer:'Of course. What is on your mind?',historyNarrative:null}});
  assert.equal(r.prompt.contextRecords,undefined);
  assert.equal(r.prompt.capabilities.savedHistoryAccess,false);
  assert.ok(r.prompt.priorUserPremises.some(turn=>turn.text.includes('worried')));
  assert.deepEqual(r.result.acceptedCareActions,[]);
});

test('genuine owner updates still require valid mutation frames',async t=>{
  clock(t);
  const data=fixture(fixturePets[0],topics[0]);
  await assert.rejects(exercise('Nori has been scratching an ear today.',{fixturePets,petId:'nori',history:true,rows:data.rows,messages:[],
    interpretationProposal:{...data.plan,operation:'update',readOperation:null,frame:{invalid:'mutation metadata'}},providerOverrides:{historyNarrative:null}}));
});

test('an explicit saved-history request cannot bypass retrieval through a general label',async t=>{
  clock(t);
  const data=fixture(fixturePets[0],topics[0]);
  const r=await exercise('Does Nori sleep history establish a cause?',{fixturePets,petId:'nori',history:true,rows:data.rows,messages:[],
    interpretationProposal:{...data.plan,operation:'general',readOperation:'general'},
    providerOverrides:{historyNarrative:data.narrative},reviewResponse:{approved:true,retainedSentenceIndexes:[0,2]},expectedReviewCalls:1});
  assert.equal(r.context.askInterpretation.readOperation,'recall');
  assert.ok(r.context.askHistory);
  assert.doesNotMatch(r.result.reasoning.answer.summary,/underlying medical|report:/);
});

test('a plain historical answer still receives source review when the model omits its optional narrative',async t=>{
  clock(t);
  const data=fixture(fixturePets[0],topics[0]);
  const answer='Nori was waking during sleep in July. The August note says Nori had settled sleep after the room became quieter.';
  const r=await exercise('Summarize Nori sleep history.',{fixturePets,petId:'nori',history:true,rows:data.rows,messages:[],
    interpretationProposal:data.plan,providerOverrides:{answer,historyNarrative:null,relevantContextIds:['care:before','care:after']},
    reviewResponse:{approved:true,retainedSentenceIndexes:[0,1]},expectedReviewCalls:1});
  assert.match(r.result.reasoning.answer.summary,/settled sleep/);
  assert.doesNotMatch(r.result.reasoning.answer.summary,/report:/);
  assert.deepEqual(r.result.acceptedCareActions,[]);
});
