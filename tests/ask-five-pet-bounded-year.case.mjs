import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from '../scripts/audits/helpers/lifetime-harness.mjs';
import { care, ownerId, pets } from '../scripts/audits/fixtures/ask-lifetime-history.mjs';

test('five-pet bounded year recovers the fifth cohort need and exhausts all monthly rows', async t => {
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
  const question="Across Aster, Bramble, Cedar, Dune, and Echo, which pets had a clearly non-routine noteworthy event recorded in 2019? Name the pet, month, and event, and don't invent an event for a pet whose 2019 notes were routine.";
  const quote='which pets had a clearly non-routine noteworthy event recorded in 2019';
  const needs=names.slice(0,4).map(name=>({quote,sourceTurnId:null,terms:[name.toLowerCase(),'event','noteworthy','routine','month'],petNames:[name],order:'context'}));
  const answer='Bramble had more frequent hairballs in August 2019. Echo began a sensitive-stomach food trial in April 2019.';
  const run=await exercise(question,{
    fixturePets:fivePets,petId:'aster',conversationPetId:'aster',rows,messages:[],history:true,
    interpretationProposal:{scope:'named',petNames:names,operation:'overview',selection:'summary',from:'2019-01-01',to:'2020-01-01',
      temporalScope:'historical',topic:'noteworthy event',terms:[],evidenceNeeds:needs,episodeTopic:null,ordinal:null},
    providerOverrides:{answer,historyNarrative:{sentences:[
      {text:'Bramble had more frequent hairballs in August 2019.',sourceIds:['care:q19-bramble-7'],calculations:[]},
      {text:'Echo began a sensitive-stomach food trial in April 2019.',sourceIds:['care:q19-echo-3'],calculations:[]},
    ]}},
    reviewResponse:{approved:true},expectedReviewCalls:1,
  });
  assert.equal(run.context.askInterpretation.request.evidenceNeeds.length,5);
  assert.deepEqual(new Set(run.context.askInterpretation.request.evidenceNeeds.flatMap(need=>need.petIds||[])),new Set(fivePets.map(p=>p.id)));
  assert.equal(run.context.askHistory.entries.length,60);
  assert.equal(run.context.askHistory.coverage.perPet.length,5);
  assert.ok(run.context.askHistory.coverage.perPet.every(p=>p.rows===12&&p.exhausted&&p.status!=='unavailable'));
  assert.equal(run.context.askHistory.coverage.continuation.length,0);
  assert.equal(run.context.askHistory.coverage.reasons.includes('effective_evidence_budget'),false);
  const represented=run.result.reasoning.evidenceContract.represented.filter(span=>span.sourceType==='care_update');
  assert.equal(new Set(represented.map(span=>span.sourceId)).size,60);
  assert.equal(run.result.answerValidation.assessment.outcome,'complete');
});
