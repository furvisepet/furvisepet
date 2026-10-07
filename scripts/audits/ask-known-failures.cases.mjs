import {stressProposal} from './helpers/current-stress-harness.mjs';
import {assertSourceFreePublication} from './helpers/publication-call-expectations.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {exercise,clock} from './helpers/lifetime-harness.mjs';
import {care,pets} from './fixtures/ask-lifetime-history.mjs';
import {emptyProposedSemanticFrame} from '../../app/lib/intelligence/semantic-frame/extract-frame.ts';
const proposal=(patch={})=>({operation:'recall',readOperation:'recall',selection:'reference',subject:'explicit',petNames:['Milo'],topic:'vomiting',terms:['vomit'],from:'2026-08-19',to:'2026-08-20',episodeTopic:null,ordinal:null,frame:emptyProposedSemanticFrame(),...patch});
test('production callback retrieves Bruno correction with no August 19 original',async t=>{
 clock(t);
 const row=care('next-day','milo','2026-08-20','general',"Correction to yesterday's vomiting note: that was my sister's dog Bruno, not Milo. Milo did not vomit and was acting normally.");
 const run=await exercise('Was the dog who vomited on August 19 Milo or Bruno?',{history:true,expectedReviewCalls:1,expectedProviderCalls:1,fixturePets:pets.filter(p=>p.id!=='bruno'),rows:[row],graph:{sourceSemantics:{'next-day':{classification:'attributed_correction',target:{kind:'scope',from:'2026-08-19T00:00:00Z',to:'2026-08-20T00:00:00Z',conceptKey:null}}}},interpretationProposal:stressProposal({question:'Was the dog who vomited on August 19 Milo or Bruno?',petNames:['Milo'],terms:['vomit'],from:'2026-08-19',to:'2026-08-20'}),answer:'Milo vomited.'});
 assert.ok(JSON.stringify(run.context.askHistory.coverage.ticketCoverage.sourceLineage).includes('next-day'));
 assertSourceFreePublication(run);
 assert.doesNotMatch(JSON.stringify(run.result.reasoning.answer),/Milo vomited[.!]/);
 assert.notEqual(run.result.answerValidation.assessment.outcome,'complete');
 assert.ok(run.context.askHistory.coverage.ticketCoverage.reasons.includes('unlinked_correction_uncertain'));
 assert.deepEqual(run.result.acceptedCareActions,[]);
 assert.deepEqual(run.result.acceptedLearnings,[]);
});
test('historical premise is read-only through generation and governance',async t=>{
 clock(t);
 const run=await exercise('Milo had June and August stool notes. Put those two periods in order without calling June later.',{
 history:true,expectedReviewCalls:1,rows:[care('june','milo','2026-06-15','general','Milo had two soft stools.'),care('aug','milo','2026-08-15','general','Milo had one soft stool.')],
 interpretationProposal:proposal({selection:'summary',topic:'stool',terms:['stool'],from:null,to:null}),answer:'June came before August.'});
 assert.equal(run.context.askInterpretation.readOnly,true);
 assert.deepEqual(run.result.acceptedCareActions,[]);
 assert.deepEqual(run.result.acceptedLearnings,[]);
 assert.deepEqual(run.result.acceptedSemanticEvents,[]);
});
test('general reviewed causality answer preserves simultaneous changes and uncertainty',async t=>{
 clock(t);
 const run=await exercise('Did changing Milo litter prove the scented litter caused the accidents?',{
 history:true,rows:[care('joint','milo','2026-07-05','general',"We moved Milo's litter tray from the spare room to the laundry room and changed to scented litter on the same day.")],
 interpretationProposal:{...stressProposal({question:'Did changing Milo litter prove the scented litter caused the accidents?',petNames:['Milo'],terms:['litter']}),requirements:['Determine whether the litter change proved causation.']},expectedReviewCalls:1,reviewResponse:{approved:true},providerOverrides:{historyNarrative:{sentences:[{text:"The note says Milo's litter tray moved to the laundry room and the litter changed on the same day. This does not isolate the effect of either change.",sourceIds:['care:joint'],calculations:[]}]}}});
 assert.match(run.result.reasoning.answer.summary,/laundry room/);
 assert.equal(run.result.reasoning.labsList.records[0].body,"We moved Milo's litter tray from the spare room to the laundry room and changed to scented litter on the same day.");
 assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);
 assert.equal(run.result.answerValidation.assessment.outcome,'limited');
 assert.doesNotMatch(run.result.reasoning.answer.summary,/proved.*caused|caused.*accidents/);
});
test('general reviewed recurrence answer preserves the dated return',async t=>{
 clock(t);
 const run=await exercise('Has Milo never been stiff again since finishing his medication?',{
 history:true,rows:[care('finish','milo','2026-06-24','general','Milo finished the seven-day medication course today. He seemed more comfortable.'),care('again','milo','2026-08-12','general','Milo seemed stiff again after a longer walk yesterday. This is the first stiffness I have noticed since late June.')],
 interpretationProposal:stressProposal({petNames:['Milo'],selection:'latest',terms:['stiff']}),expectedReviewCalls:1,reviewResponse:{approved:true},providerOverrides:{historyNarrative:{sentences:[{text:'No. Milo finished the medication course on June 24, 2026. The August 12, 2026 note reported stiffness again after a longer walk the previous day.',sourceIds:['care:finish','care:again'],calculations:[]}]}}});
 assert.deepEqual(run.result.reasoning.relevantContextIds,['care:again']);
 assert.equal(run.result.reasoning.labsList.records[0].body,'Milo seemed stiff again after a longer walk yesterday. This is the first stiffness I have noticed since late June.');
 assert.equal(run.requests.length,0);assert.equal(run.reviewRequests.length,0);
 assert.doesNotMatch(run.result.reasoning.answer.summary,/never been stiff again/);
 assert.equal(run.result.answerValidation.assessment.outcome,'complete');
});

