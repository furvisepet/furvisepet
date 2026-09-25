import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from '../scripts/audits/helpers/lifetime-harness.mjs';
import { care, decisive } from '../scripts/audits/fixtures/ask-lifetime-history.mjs';

const reviewApproved={approved:true};

test('Q1 pet switch does not import prior pet history into Luna', async t=>{
  clock(t);
  const q="I was asking about Milo before. What about Luna—did she ever have soft stool in her saved history?";
  const rows=[...decisive,care('luna-routine','luna','2014-07-09','general','Luna had normal appetite and routine litter use.')];
  const run=await exercise(q,{rows,history:true,petId:'milo',conversationPetId:'milo',
    interpretationProposal:{scope:'named',petNames:['Luna'],operation:'overview',selection:'summary',from:null,to:null,
      temporalScope:'historical',topic:'soft stool',terms:['soft','stool'],
      evidenceNeeds:[{quote:'Luna—did she ever have soft stool in her saved history',sourceTurnId:null,terms:['soft','stool'],petNames:['Luna'],order:'context'}],episodeTopic:null,ordinal:null},
    providerOverrides:{answer:"Luna's supplied saved records here do not establish a soft-stool episode.",
      historyNarrative:{sentences:[{text:"Luna's supplied saved records here do not establish a soft-stool episode.",sourceIds:[],calculations:[]}]}},
    reviewResponse:reviewApproved,expectedReviewCalls:null,expectedProviderCalls:1});
  assert.deepEqual(run.context.askInterpretation.petIds,['luna']);
  assert.ok(run.context.askHistory.entries.every(row=>row.pet_profile_id==='luna'));
  assert.ok(!/Milo had|Milo's soft-stool/i.test(run.result.reasoning.answer.summary));
});

test('Q2 first-across-pets chronology identifies Oscar without inventing other pets', async t=>{
  clock(t);
  const q='Across Milo, Luna, Oscar, and Bruno, which pet had morning stiffness first, and when was it recorded?';
  const run=await exercise(q,{rows:decisive,history:true,petId:'milo',
    interpretationProposal:{scope:'named',petNames:['Milo','Luna','Oscar','Bruno'],operation:'comparison',selection:'comparison',from:null,to:null,
      temporalScope:'historical',topic:'morning stiffness',terms:['morning','stiffness'],
      evidenceNeeds:[{quote:'which pet had morning stiffness first',sourceTurnId:null,terms:['morning','stiffness'],petNames:['Milo','Luna','Oscar'],order:'earliest'}],episodeTopic:null,ordinal:null},
    providerOverrides:{answer:'Oscar had the earliest supplied morning-stiffness record, on June 10, 2013.',
      historyNarrative:{sentences:[{text:'Oscar had the earliest supplied morning-stiffness record, on June 10, 2013.',sourceIds:['care:oscar-stiffness-1'],calculations:[]}]}},
    reviewResponse:reviewApproved,expectedReviewCalls:1});
  assert.equal(run.result.answerValidation.assessment.outcome,'complete');
  assert.match(run.result.reasoning.answer.summary,/Oscar/i);
  assert.match(run.result.reasoning.answer.summary,/2013|June 10/i);
});

test('Q3 unknown versus absence: Luna urine test remains not established, not never', async t=>{
  clock(t);
  const q="Do Luna's saved records establish that she ever had a urine test?";
  const run=await exercise(q,{rows:decisive,history:true,petId:'luna',
    interpretationProposal:{scope:'named',petNames:['Luna'],operation:'overview',selection:'summary',from:null,to:null,
      temporalScope:'historical',topic:'urine test',terms:['urine','test'],
      evidenceNeeds:[{quote:'Luna\'s saved records establish that she ever had a urine test',sourceTurnId:null,terms:['urine','test'],petNames:['Luna'],order:'context'}],episodeTopic:null,ordinal:null},
    providerOverrides:{answer:"The supplied saved records do not establish that Luna had a urine test.",
      historyNarrative:{sentences:[{text:"The supplied saved records do not establish that Luna had a urine test.",sourceIds:[],calculations:[]}]}},
    reviewResponse:reviewApproved,expectedReviewCalls:null});
  const text=run.result.reasoning.answer.summary;
  assert.doesNotMatch(text,/Luna never had|no urine test ever existed|definitely did not/i);
  assert.match(text,/do not establish|could not find|not established|not documented/i);
});

test('Q4 correction wording attributes 2014 vomiting to Bruno, not Milo, without claiming a verified graph edge', async t=>{
  clock(t);
  const q='What do the saved correction notes say about the July 9, 2014 vomiting report—was that Milo or Bruno?';
  const run=await exercise(q,{rows:decisive,history:true,petId:'milo',
    interpretationProposal:{scope:'named',petNames:['Milo','Bruno'],operation:'comparison',selection:'comparison',from:'2014-07-09',to:'2026-09-05',
      temporalScope:'historical',topic:'vomiting correction',terms:['vomit','correction'],
      evidenceNeeds:[
        {quote:'saved correction notes',sourceTurnId:null,terms:['correction','vomit'],petNames:['Milo','Bruno'],order:'latest'},
        {quote:'July 9, 2014 vomiting report',sourceTurnId:null,terms:['vomit'],petNames:['Milo','Bruno'],order:'context'}
      ],episodeTopic:null,ordinal:null},
    providerOverrides:{answer:'The saved correction notes report that the July 9, 2014 vomiting belonged to Bruno, not Milo.',
      historyNarrative:{sentences:[{text:'The saved correction notes report that the July 9, 2014 vomiting belonged to Bruno, not Milo.',
        sourceIds:['care:bruno-correction','care:milo-correction'],calculations:[]}]}},
    reviewResponse:reviewApproved,expectedReviewCalls:1});
  assert.equal(run.result.answerValidation.assessment.outcome,'complete');
  assert.match(run.result.reasoning.answer.summary,/Bruno/i);
  assert.match(run.result.reasoning.answer.summary,/not Milo/i);
  assert.match(run.result.reasoning.answer.summary,/correction notes report|saved correction/i);
});

test('Q5 mixed profile + history arithmetic keeps missing profile weight separate from historical change', async t=>{
  clock(t);
  const q="For Milo, compare the February 1, 2011 saved weight with the latest saved weight, give the exact change in kg, and also tell me whether his current profile has a weight recorded.";
  const run=await exercise(q,{rows:decisive,history:true,petId:'milo',
    interpretationProposal:{scope:'named',petNames:['Milo'],operation:'comparison',selection:'comparison',from:null,to:null,
      temporalScope:'historical_and_current',profileFields:['weight'],topic:'weight',terms:['weight'],
      evidenceNeeds:[
        {quote:'February 1, 2011 saved weight',sourceTurnId:null,terms:['weight'],petNames:['Milo'],order:'context'},
        {quote:'latest saved weight',sourceTurnId:null,terms:['weight'],petNames:['Milo'],order:'latest'}
      ],episodeTopic:null,ordinal:null},
    providerOverrides:{answer:"Milo's saved weight changed from 28.4 kg on February 1, 2011 to 27.8 kg on August 19, 2026, a change of -0.6 kg. His current profile weight is not recorded.",
      historyNarrative:{sentences:[
        {text:"Milo's saved weight changed from 28.4 kg on February 1, 2011 to 27.8 kg on August 19, 2026, a change of -0.6 kg.",
         sourceIds:['care:milo-weight-1','care:milo-weight-3'],calculations:[{operation:'difference',expression:null,operands:[
           {sourceId:'care:milo-weight-3',field:'text',literal:'27.8 kg'},{sourceId:'care:milo-weight-1',field:'text',literal:'28.4 kg'}],value:-0.6,unit:'kg'}]},
        {text:'His current profile weight is not recorded.',sourceIds:['profile:milo:weight'],calculations:[]}
      ]}},
    reviewResponse:reviewApproved,expectedReviewCalls:1});
  const text=run.result.reasoning.answer.summary;
  assert.match(text,/28\.4 kg/i); assert.match(text,/27\.8 kg/i); assert.match(text,/-0\.6 kg/i);
  assert.match(text,/profile weight.*not recorded|current profile.*not recorded/i);
  assert.doesNotMatch(text,/current profile weight.*27\.8/i);
});
