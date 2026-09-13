import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareReviewedVetBrief, vetBriefReviewChecks, vetBriefBlockingReviewChecks } from '../app/lib/vet-brief/review.ts';
import { parseVetBriefPublicationReview } from '../app/lib/vet-brief/publication-review.ts';
import { parseVetBriefDocument } from '../app/lib/vet-brief/schema.ts';
import { vetBriefText } from '../app/lib/vet-brief/report.ts';
const original = JSON.parse(readFileSync(new URL('./fixtures/vet-brief-rich-publication.json', import.meta.url)));
const pass = { ...Object.fromEntries(vetBriefReviewChecks.map(key => [key, true])), repairInstructions: '', repairSections: [], factualIssueCodes: [] };
const duplicate = { ...pass, noDuplication: false, repairSections: ['timeline', 'history'], repairInstructions: 'Remove repeated supporting details.' };

test('only duplication remaining after bounded repair becomes a persistent editing warning', async () => {
  let generations = 0;
  const result = await prepareReviewedVetBrief({
    generate: async () => { generations++; return { value: { document: structuredClone(original) } }; },
    review: async () => duplicate,
  });
  assert.equal(generations, 2);
  assert.deepEqual(result.value.document.reviewWarnings, ['duplicate_details']);
  assert.equal(vetBriefText(result.value.document), vetBriefText(original));
  assert.deepEqual(parseVetBriefDocument(JSON.parse(JSON.stringify(result.value.document))).reviewWarnings, ['duplicate_details']);
});

test('every substantive failure remains blocking even alongside presentation failures', async () => {
  for (const key of vetBriefBlockingReviewChecks) {
    await assert.rejects(prepareReviewedVetBrief({
      generate: async () => ({ value: { document: structuredClone(original) } }),
      review: async () => ({ ...duplicate, [key]: false }),
    }), { name: 'FeatureValidationError' }, key);
  }
  for (const verdict of [null, { ...duplicate, questionsUseful: undefined }, { ...duplicate, factualIssueCodes: undefined }, { ...duplicate, factualIssueCodes: ['source_scope:history'] }]) {
    await assert.rejects(prepareReviewedVetBrief({ generate: async () => ({ value: { document: structuredClone(original) } }), review: async () => verdict }), { name: 'FeatureValidationError' });
  }
});

test('question usefulness and focus become editing advice only after repair, with separate telemetry', async () => {
  const advisory = ['noDuplication', 'questionsUseful', 'visitFocused'];
  const codes = ['duplicate_details', 'question_usefulness', 'visit_focus'];
  for (let mask = 1; mask < 8; mask++) {
    let generations = 0;
    const rejected = [], warned = [];
    const verdict = { ...pass, repairSections: ['overview', 'questions', 'history'], repairInstructions: 'Tailor questions, trim incidental routine prose and remove repetition without removing material facts.' };
    advisory.forEach((key, index) => { if (mask & (1 << index)) verdict[key] = false; });
    const result = await prepareReviewedVetBrief({
      generate: async () => { generations++; return { value: { document: structuredClone(original) } }; },
      review: async () => verdict,
      onRejected: checks => rejected.push(checks),
      onWarning: warnings => warned.push(warnings),
    });
    const expected = codes.filter((_, index) => mask & (1 << index));
    assert.equal(generations, 2);
    assert.equal(rejected.length, 1);
    assert.deepEqual(warned, [expected]);
    assert.deepEqual(result.value.document.reviewWarnings, expected);
    assert.deepEqual(parseVetBriefDocument(JSON.parse(JSON.stringify(result.value.document))).reviewWarnings, expected);
    assert.equal(vetBriefText(result.value.document), vetBriefText(original));
  }
});

test('a successful repair clears stale cosmetic warnings and contradictory factual verdicts cannot pass', async () => {
  let reviews = 0;
  const result = await prepareReviewedVetBrief({
    generate: async () => ({ value: { document: { ...structuredClone(original), reviewWarnings: ['duplicate_details'] } } }),
    review: async () => ++reviews === 1 ? duplicate : pass,
  });
  assert.equal(result.value.document.reviewWarnings, undefined);
  assert.equal(parseVetBriefPublicationReview({ ...pass, duplicatePairs: [], factualIssues: [{ kind: 'diagnosis_or_causation', section: 'history' }] }, original), null);
  assert.equal(parseVetBriefDocument({ ...original, reviewWarnings: ['ignore_diagnosis'] }), null);
});

test('Spanish attribution, source scope, timing and negation survive publication and serialization over eight years', () => {
  const entries = [
    { date: '2018-09-13', text: 'El propietario refirió hinchazón esa tarde después de la vacuna; la causa no está confirmada.' },
    { date: '2018-09-13', text: 'La nota del 13 de septiembre de 2018 no menciona vómitos.' },
    { date: '2026-09-13', text: 'El propietario sospecha enfermedad renal; no hay diagnóstico confirmado en los registros revisados.' },
    { date: '2026-09-13', text: 'Se prescribió prednisona; no se ha confirmado su administración.' },
  ];
  const document = { ...original, concernTimeline: entries, ownerReportedChanges: [], relevantCareHistory: [], dateRange: { from: '2018-09-13', to: '2026-09-13' } };
  const restored = parseVetBriefDocument(JSON.parse(JSON.stringify(document)));
  for (const entry of entries) assert.ok(vetBriefText(restored).includes(entry.text), entry.text);
  assert.deepEqual(restored.concernTimeline, entries);
});

test('overview-only failure may omit the optional synopsis only after repair and successful whole-report re-review', async () => {
  const bad = { ...pass, factsSupported: false, uncertaintyPreserved: false, factualIssueCodes: ['source_scope:overview'], repairSections: ['overview'], repairInstructions: 'Keep the negative claim scoped to the cited note.' };
  let generated = 0, reviewed = 0, reserved = 0;
  const source = { ...structuredClone(original), visitSummary: 'Unsupported global absence claim.' };
  const result = await prepareReviewedVetBrief({
    generate: async () => { generated++; return { value: { document: structuredClone(source), sourceRecordIds: ['unchanged-source'] } }; },
    reserveOverviewReview: () => { reserved++; return true; },
    review: async document => {
      reviewed++;
      if (reviewed < 3) { assert.equal(document.visitSummary, source.visitSummary); return bad; }
      assert.equal(document.visitSummary, '');
      assert.deepEqual({ ...document, visitSummary: source.visitSummary }, source);
      return pass;
    },
  });
  assert.equal(generated, 2);
  assert.equal(reviewed, 3);
  assert.equal(reserved, 1);
  assert.deepEqual(result.value.sourceRecordIds, ['unchanged-source']);
  assert.deepEqual(result.value.document.reviewWarnings, ['overview_omitted']);
});

test('overview omission cannot override missing material history, broader failures, malformed verdicts or exhausted budget', async () => {
  const bad = { ...pass, factsSupported: false, uncertaintyPreserved: false, factualIssueCodes: ['source_scope:overview'], repairSections: ['overview'], repairInstructions: 'Correct the overview claim.' };
  for (const options of [
    { verdict: { ...bad, factualIssueCodes: ['source_scope:overview', 'medication_status:medications'] } },
    { verdict: { ...bad, repairSections: ['overview', 'questions'] } },
    { verdict: { ...bad, importantHistoryPreserved: false } },
    { verdict: { ...bad, factualIssueCodes: [] } },
    { verdict: null },
    { verdict: bad, budget: false },
    { verdict: bad, final: { ...bad, importantHistoryPreserved: false } },
  ]) {
    let reviews = 0;
    await assert.rejects(prepareReviewedVetBrief({
      generate: async () => ({ value: { document: { ...structuredClone(original), visitSummary: 'Only copy of a material clinical fact.' } } }),
      reserveOverviewReview: () => options.budget !== false,
      review: async () => { reviews++; return reviews === 3 ? options.final : options.verdict; },
    }), { name: 'FeatureValidationError' });
    assert.equal(reviews, options.final ? 3 : 2);
  }
});

test('presentation repair generation or review outage returns only the immutable substantively reviewed original', async () => {
  for (const failedStage of ['generate', 'review']) {
    const first = structuredClone(original);
    let calls = 0, reviews = 0;
    const result = await prepareReviewedVetBrief({
      generate: async feedback => {
        calls++;
        if (!feedback) return { value: { document: first, sourceRecordIds: ['original-source'] } };
        // Even an attempted repair mutating its input must not contaminate the snapshot.
        feedback.document.visitSummary = 'UNREVIEWED DIAGNOSIS';
        if (failedStage === 'generate') throw new Error('timeout');
        return { value: { document: { ...first, visitSummary: 'UNREVIEWED DIAGNOSIS' }, sourceRecordIds: ['unreviewed-source'] } };
      },
      review: async () => {
        if (++reviews > 1) throw new Error('timeout');
        return { ...pass, visitFocused: false, repairSections: ['overview'], repairInstructions: 'Trim incidental routine activity.' };
      },
      canUseReviewedDraftOnRepairFailure: error => error.message === 'timeout',
    });
    assert.equal(calls, 2);
    assert.deepEqual(result.value.document, { ...original, reviewWarnings: ['visit_focus', 'repair_unavailable'] });
    assert.deepEqual(result.value.sourceRecordIds, ['original-source']);
    assert.deepEqual(parseVetBriefDocument(JSON.parse(JSON.stringify(result.value.document))).reviewWarnings, ['visit_focus', 'repair_unavailable']);
  }
});

test('repair outages never expose substantively rejected originals or bypass unrelated operation errors', async () => {
  for (const key of [...vetBriefBlockingReviewChecks, 'operation_denied', 'malformed']) {
    let generated = 0;
    const timeout = new Error('timeout');
    await assert.rejects(prepareReviewedVetBrief({
      generate: async () => { if (++generated > 1) throw timeout; return { value: { document: structuredClone(original) } }; },
      review: async () => key === 'malformed' ? null : { ...pass, visitFocused: false, ...(key === 'operation_denied' ? {} : { [key]: false }), repairInstructions: 'Repair the issue.', repairSections: ['overview'] },
      canUseReviewedDraftOnRepairFailure: () => key !== 'operation_denied',
    }), error => error === timeout, key);
  }
});
