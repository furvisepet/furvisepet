import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from '../scripts/audits/helpers/lifetime-harness.mjs';
import { care, ownerId, pets } from '../scripts/audits/fixtures/ask-lifetime-history.mjs';

test('three-pet explicit-month episode comparison completes without unrelated-month obligations', async t => {
  clock(t);
  const cohort=[
    {...pets[0],id:'bramble',name:'Bramble',user_id:ownerId},
    {...pets[0],id:'dune',name:'Dune',user_id:ownerId},
    {...pets[0],id:'echo',name:'Echo',user_id:ownerId},
  ];
  const rows=[
    care('bramble-apr','bramble','2022-04-15','general','Bramble urinary frequency increased for one day and returned to normal after veterinary evaluation. No ongoing urinary change was recorded afterward.'),
    care('bramble-feb','bramble','2026-02-15','general','Bramble routine activity remained normal.'),
    care('dune-oct','dune','2021-10-15','general','Dune stool was firmer than usual for two days and then returned to the usual pattern. Water intake appeared unchanged.'),
    care('dune-feb','dune','2026-02-15','general','Dune routine activity remained normal.'),
    care('echo-feb','echo','2026-02-15','general','Echo had one episode of soft stool after a new treat; it resolved by the next day and the new treat was not repeated.'),
  ];
  const q="Compare these three temporary episodes: Bramble's April 2022 urinary-frequency change, Dune's October 2021 firmer stool, and Echo's February 2026 soft stool. For each, give the duration or resolution timing and whether it persisted afterward.";
  const needs=[
    {quote:"Bramble's April 2022 urinary-frequency change",sourceTurnId:null,terms:['urinary','frequency'],petNames:['Bramble'],order:'context'},
    {quote:"Dune's October 2021 firmer stool",sourceTurnId:null,terms:['firmer','stool'],petNames:['Dune'],order:'context'},
    {quote:"Echo's February 2026 soft stool",sourceTurnId:null,terms:['soft','stool'],petNames:['Echo'],order:'context'},
  ];
  const answer="Bramble's urinary-frequency change lasted one day and returned to normal, with no ongoing urinary change recorded afterward. Dune's firmer stool lasted two days and then returned to the usual pattern. Echo's soft stool resolved by the next day and the treat was not repeated.";
  const run=await exercise(q,{
    fixturePets:cohort,petId:'bramble',conversationPetId:'bramble',rows,messages:[],history:true,
    interpretationProposal:{scope:'named',petNames:['Bramble','Dune','Echo'],operation:'comparison',selection:'comparison',from:null,to:null,temporalScope:'historical',topic:'temporary episodes',terms:[],evidenceNeeds:needs,episodeTopic:null,ordinal:null},
    providerOverrides:{answer,historyNarrative:{sentences:[
      {text:"Bramble's urinary-frequency change lasted one day and returned to normal, with no ongoing urinary change recorded afterward.",sourceIds:['care:bramble-apr'],calculations:[]},
      {text:"Dune's firmer stool lasted two days and then returned to the usual pattern.",sourceIds:['care:dune-oct'],calculations:[]},
      {text:"Echo's soft stool resolved by the next day and the treat was not repeated.",sourceIds:['care:echo-feb'],calculations:[]},
    ]}},
    reviewResponse:{approved:true},expectedReviewCalls:1,
  });

  assert.equal(run.result.answerValidation.assessment.outcome,'complete');
  assert.doesNotMatch(run.result.reasoning.answer.summary,/couldn't finish|partial answer/i);
  assert.match(run.result.reasoning.answer.summary,/Bramble/);
  assert.match(run.result.reasoning.answer.summary,/Dune/);
  assert.match(run.result.reasoning.answer.summary,/Echo/);
});
