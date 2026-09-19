import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReviewedVetBrief, vetBriefReviewChecks } from '../app/lib/vet-brief/review.ts';
import { parseVetBriefPublicationReview } from '../app/lib/vet-brief/publication-review.ts';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('../docs/v1-cleanup/artifacts/vet-brief-complex/sable-final-confirmed.json', import.meta.url)));
const original = fixture.confirmed_data;
const pass = { ...Object.fromEntries(vetBriefReviewChecks.map(k => [k, true])), repairInstructions: '', repairSections: [] };

test('category repair preserves reviewed values and questions despite unrelated rewrite drift, then re-reviews the assembled report', async () => {
  const previous = { ...original, relevantCareHistory: [], concernTimeline: [{ date: '2026-08-28', text: 'Lab: 1.4 mg/dL, interval 0.5–1.6.' }] };
  const repair = { ...previous, visitSummary: 'UNSUPPORTED rewrite', questionsForVeterinarian: ['Does confirmed kidney failure explain this?'], concernTimeline: [], relevantCareHistory: [{ date: '2026-08-28', category: 'Lab', text: 'Lab: 1.4 mg/dL, interval 0.5–1.6.' }] };
  let reviews = 0;
  const result = await prepareReviewedVetBrief({
    generate: async feedback => ({ value: { document: feedback ? repair : previous, sourceRecordIds: feedback ? ['second'] : ['first'] } }),
    review: async document => {
      if (++reviews === 1) return { ...pass, categoriesAccurate: false, repairSections: ['timeline', 'history'], repairInstructions: 'Move the laboratory event to supporting history.' };
      assert.equal(document.visitSummary, previous.visitSummary);
      assert.deepEqual(document.questionsForVeterinarian, previous.questionsForVeterinarian);
      assert.deepEqual(document.concernTimeline, []);
      assert.equal(document.relevantCareHistory[0].text, previous.concernTimeline[0].text);
      return pass;
    },
  });
  assert.equal(reviews, 2);
  assert.deepEqual(result.value.sourceRecordIds, ['first', 'second']);
});

test('scoped repair cannot bypass a second failed factual review', async () => {
  let calls = 0;
  await assert.rejects(prepareReviewedVetBrief({
    generate: async () => ({ value: { document: { ...original } } }),
    review: async () => { calls++; return { ...pass, factsSupported: false, repairSections: ['questions'], repairInstructions: 'Remove the unverified diagnosis premise.' }; },
  }), { name: 'FeatureValidationError' });
  assert.equal(calls, 2);
});

test('publication review rejects missing or invalid repair targets', () => {
  const verdict = { ...pass, factsSupported: false, repairInstructions: 'Correct the premise.', duplicatePairs: [], factualIssues: [] };
  for (const repairSections of [undefined, [], ['metadata'], ['patient text']]) assert.equal(parseVetBriefPublicationReview({ ...verdict, repairSections }, original), null);
  assert.ok(parseVetBriefPublicationReview({ ...verdict, repairSections: ['questions'] }, original));
});

test('a factual correction repairs repeated premises together and still requires a complete second review',async()=>{
 const previous={...original,visitSummary:'The records prove no treatment was given.',missingInformation:['No treatment was given.'],questionsForVeterinarian:['Why was no treatment given?']};
 const replacement={...previous,visitSummary:'Actual administration is not confirmed.',missingInformation:['Confirm what was administered.'],questionsForVeterinarian:['What was actually administered?']};
 let reviews=0;
 const result=await prepareReviewedVetBrief({generate:async feedback=>({value:{document:feedback?replacement:previous}}),review:async document=>{
  if(++reviews===1)return {...pass,factsSupported:false,factualIssueCodes:['source_scope:overview'],repairSections:['overview'],repairInstructions:'Absence in this note does not prove treatment was not administered.'};
  assert.equal(document.visitSummary,replacement.visitSummary);assert.deepEqual(document.missingInformation,replacement.missingInformation);assert.deepEqual(document.questionsForVeterinarian,replacement.questionsForVeterinarian);return pass;
 }});
 assert.equal(reviews,2);assert.equal(result.value.document.visitSummary,replacement.visitSummary);
});

test('new repair regressions restore original sections only after a fresh whole-publication review',async()=>{
 const first={...original,visitSummary:'Administration is not confirmed.',questionsForVeterinarian:['Why was no treatment given?']};
 const repaired={...first,visitSummary:'Medication was administered.',questionsForVeterinarian:['What was actually administered?']};
 for(const allowed of [true,false]){
  let reviews=0;
  const run=prepareReviewedVetBrief({
   generate:async feedback=>({value:{document:structuredClone(feedback?repaired:first),sourceRecordIds:['same-source']}}),
   reserveRecoveryReview:()=>true,
   review:async document=>{
    reviews++;
    if(reviews===1)return {...pass,factsSupported:false,factualIssueCodes:['source_scope:questions'],repairSections:['questions'],repairInstructions:'Remove the unsupported premise.'};
    if(reviews===2)return {...pass,factsSupported:false,factualIssueCodes:['medication_status:overview'],repairSections:['overview'],repairInstructions:'Do not claim administration.'};
    assert.equal(document.visitSummary,first.visitSummary);assert.deepEqual(document.questionsForVeterinarian,repaired.questionsForVeterinarian);
    return allowed?pass:{...pass,factsSupported:false,factualIssueCodes:['source_scope:questions'],repairSections:['questions'],repairInstructions:'Still unsupported.'};
   }
  });
  if(allowed)assert.equal((await run).value.document.visitSummary,first.visitSummary);else await assert.rejects(run,{name:'FeatureValidationError'});
  assert.equal(reviews,3);
 }
});

test('section restoration cannot reuse initially rejected sections or exceed the shared recovery budget',async()=>{
 for(const overlap of [false,true]){
  let reviews=0;
  await assert.rejects(prepareReviewedVetBrief({
   generate:async feedback=>({value:{document:{...original,visitSummary:feedback?'new':'old'}}}),
   reserveRecoveryReview:()=>false,
   review:async()=>{reviews++;const section=reviews===1||overlap?'questions':'overview';return {...pass,factsSupported:false,factualIssueCodes:[`source_scope:${section}`],repairSections:[section],repairInstructions:'Correct the unsupported claim.'};},
  }),{name:'FeatureValidationError'});
  assert.equal(reviews,2);
 }
});
