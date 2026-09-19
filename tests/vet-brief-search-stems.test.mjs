import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVetBriefAppointmentPlan, vetBriefLiteralStem } from '../app/lib/vet-brief/appointment-plan.ts';

test('literal anchors retrieve changed word endings without changing evidence or adding query terms', () => {
  const pairs = [['vaccine', 'vaccination'], ['creatinine', 'creatinina'], ['prednisone', 'prednisona'], ['disease', 'diseases']];
  for (const [query, record] of pairs) assert.ok(record.includes(vetBriefLiteralStem(query)));
  for (const word of ['CBC', 'dose', 'osteoarthritis', 'picazón']) assert.equal(vetBriefLiteralStem(word), word);
  const plan = { focus: 'Review', from: null, to: '2026-09-13', topics: [{ label: 'History', terms: ['vaccine'] }], questionsToResolve: [] };
  assert.deepEqual(parseVetBriefAppointmentPlan(plan, '2026-09-13').topics[0].terms, ['vaccin']);
  assert.equal(parseVetBriefAppointmentPlan({ ...plan, topics: [{ label: 'History', terms: ['vaccine reaction'] }] }, '2026-09-13'), null);
});
