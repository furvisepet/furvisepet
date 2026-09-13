import test from 'node:test';
import assert from 'node:assert/strict';
import { vetBriefSearchVocabulary } from '../app/lib/vet-brief/appointment-plan.ts';

test('search-language hints are bounded and isolated to the selected pet', () => {
  const entries = [{ pet_profile_id: 'other', title: 'Do not include', note: 'foreign pet' }, ...Array.from({ length: 20 }, (_, index) => ({ pet_profile_id: 'selected', title: `Record ${index}`, note: 'a'.repeat(500) }))];
  const result = vetBriefSearchVocabulary(entries, 'selected');
  assert.equal(result.length, 8);
  assert.ok(result.every(value => value.length <= 240 && !value.includes('foreign pet')));
  assert.deepEqual(vetBriefSearchVocabulary(entries, 'missing'), []);
});
