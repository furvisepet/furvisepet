import {stressProposal} from '../scripts/audits/helpers/current-stress-harness.mjs';
import {assertSourceFreePublication} from '../scripts/audits/helpers/publication-call-expectations.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from '../scripts/audits/helpers/lifetime-harness.mjs';
import { care, ownerId, pets } from '../scripts/audits/fixtures/ask-lifetime-history.mjs';

for(const latest of [false,true])test(latest?'five-pet shared year selector certifies one exact latest report per pet':'five-pet exhaustive year cannot assert noteworthy absence after bounded omission', async t => {
  clock(t);
  const names=['Aster','Bramble','Cedar','Dune','Echo'];
  const fivePets=names.map((name,index)=>({...pets[0],id:name.toLowerCase(),name,
    species:index===1||index===3?'cat':'dog',user_id:ownerId}));
  const rows=fivePets.flatMap(pet=>Array.from({length:12},(_,monthIndex)=>{
    const date=new Date(Date.UTC(2019,monthIndex,15)).toISOString().slice(0,10);
    let note=pet.name+' routine monthly observation; appetite and activity were normal.';
    if(pet.name==='Bramble'&&monthIndex===7) note='Bramble had more frequent hairballs during shedding season; appetite, litter use, and energy remained normal.';
    if(pet.name==='Echo'&&monthIndex===3) note='Echo began a sensitive-stomach food trial with a seven-day transition; appetite stayed normal and stool became more consistent.';
    return care('q19-'+pet.id+'-'+monthIndex,pet.id,date,'general',note);
  }));
  const question=latest?'Show the latest 2019 report for each of Aster, Bramble, Cedar, Dune, and Echo.':"Across Aster, Bramble, Cedar, Dune, and Echo, which pets had a clearly non-routine noteworthy event recorded in 2019? Name the pet, month, and event, and don't invent an event for a pet whose 2019 notes were routine.";
  const quote='which pets had a clearly non-routine noteworthy event recorded in 2019';
  const needs=names.slice(0,4).map(name=>({quote,sourceTurnId:null,terms:[name.toLowerCase(),'event','noteworthy','routine','month'],petNames:[name],order:'context'}));
  const answer='Bramble had more frequent hairballs in August 2019. Echo began a sensitive-stomach food trial in April 2019.';
  const run=await exercise(question,{
    fixturePets:fivePets,petId:'aster',conversationPetId:'aster',rows,messages:[],history:true,
    interpretationProposal:{...stressProposal({question,petNames:names,selection:latest?'latest':'summary',from:'2019-01-01',to:'2020-01-01'}),
      requirements:latest?[]:[quote]},
    providerOverrides:{answer,historyNarrative:{sentences:[
      {text:'Bramble had more frequent hairballs in August 2019.',sourceIds:['care:q19-bramble-7'],calculations:[]},
      {text:'Echo began a sensitive-stomach food trial in April 2019.',sourceIds:['care:q19-echo-3'],calculations:[]},
    ]}},
    reviewResponse:{approved:true},expectedReviewCalls:1,
  });
  const ticket=run.context.askInterpretation.request.readTicket,coverage=run.context.askHistory.coverage.ticketCoverage;
  assert.deepEqual(new Set(ticket.subjects.petIds),new Set(fivePets.map(p=>p.id)));
  assert.equal(run.context.askInterpretation.request.evidenceNeeds?.length||0,0,'homogeneous cohort does not consume one probe per pet');
  assert.equal(run.interpretationRequests.length,1);assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);
  assert.deepEqual(run.result.acceptedCareActions,[]);assert.deepEqual(run.result.acceptedLearnings,[]);assert.deepEqual(run.result.acceptedSemanticEvents,[]);
  if(latest){
    assert.equal(run.result.reasoning.model,'server-labs-list');
    assert.deepEqual(new Set(run.result.reasoning.relevantContextIds),new Set(fivePets.map(p=>'care:q19-'+p.id+'-11')));
    assert.equal(run.result.reasoning.labsList.records.length,5);
    for(const record of run.result.reasoning.labsList.records)assert.equal(record.body,rows.find(row=>row.id===record.id).note);
    assert.equal(coverage.groups.length,5);assert.ok(coverage.groups.every(g=>g.clauses.every(c=>c.certified)));
    assert.equal(run.result.answerValidation.assessment.outcome,'complete');
  }else{
    assertSourceFreePublication(run);
    assert.notEqual(coverage.status,'complete');assert.ok(run.context.askHistory.entries.length<=32);
    assert.ok(coverage.reasons.length>0);
    assert.doesNotMatch(run.result.reasoning.answer.summary,/Bramble had|Echo began|all.*routine/);
  }
});
