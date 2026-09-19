import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVetBriefContent } from '../app/lib/vet-brief/content.ts';
const baseline = JSON.parse(readFileSync(new URL('../docs/v1-cleanup/artifacts/vet-brief-complex/sable-final-confirmed.json', import.meta.url))).confirmed_data;

test('diverse observations share neutral history without acquiring symptom or food-change meaning', () => {
  const facts = ['A usual meal was eaten.', 'Weight 3.97 kg without a carrier.', 'A tangle was removed.', 'Owner reports a new cough.', 'Lab result recorded.'];
  const result = parseVetBriefContent({ content: { reasonForVisit: 'Review observations', visitSummary: 'Owner requests review.', events: facts.map(text => ({ kind: 'history', date: '2026-09-12', category: 'Observation', text })), questionsForVeterinarian: ['What should be monitored?'], missingInformation: [] }, sourceRecordIds: ['verified'], confidence: 'medium' }, baseline, ['verified']);
  assert.deepEqual(result.document.relevantCareHistory.map(item => item.text), facts);
  assert.deepEqual(result.document.concernTimeline, []);
  assert.deepEqual(result.document.foodChanges, []);
  assert.deepEqual(result.document.productsUsed, []);
  assert.deepEqual(result.document.medicationsSupplements, []);
});
