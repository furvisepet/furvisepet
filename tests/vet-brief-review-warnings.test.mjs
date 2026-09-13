import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareReviewedVetBrief, vetBriefReviewChecks } from '../app/lib/vet-brief/review.ts';
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

test('every non-duplication failure remains blocking even alongside a cosmetic failure', async () => {
  for (const key of vetBriefReviewChecks.filter(key => key !== 'noDuplication')) {
    await assert.rejects(prepareReviewedVetBrief({
      generate: async () => ({ value: { document: structuredClone(original) } }),
      review: async () => ({ ...duplicate, [key]: false }),
    }), { name: 'FeatureValidationError' }, key);
  }
  for (const verdict of [null, { ...duplicate, factualIssueCodes: undefined }, { ...duplicate, factualIssueCodes: ['source_scope:history'] }]) {
    await assert.rejects(prepareReviewedVetBrief({ generate: async () => ({ value: { document: structuredClone(original) } }), review: async () => verdict }), { name: 'FeatureValidationError' });
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
