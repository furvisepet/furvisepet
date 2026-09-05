// SYNTHETIC ONLY. These are test inventions, never owner or production records.
export const ownerId = 'synthetic-owner';
export const now = new Date('2026-09-04T18:00:00Z');
export const pets = ['Milo', 'Luna', 'Oscar', 'Bruno'].map((name) => ({
  id: name.toLowerCase(), user_id: ownerId, name, species: name === 'Luna' ? 'cat' : 'dog',
  sex: name === 'Luna' ? 'female' : 'male', lifecycle_status: 'active',
  weight_value: null, weight_unit: 'kg', current_food: null, avoid_ingredients: [],
  created_at: '2010-01-01T00:00:00Z', updated_at: now.toISOString(),
}));
export function care(id, pet, date, category, note, overrides = {}) {
  return { id, user_id: ownerId, pet_profile_id: pet, category, title: null, note,
    severity: null, occurred_at: `${date}T12:00:00Z`, created_at: `${date}T12:01:00Z`,
    updated_at: `${date}T12:01:00Z`, deleted_at: null, ...overrides };
}
export const decisive = [
  care('milo-stool-1', 'milo', '2011-02-01', 'symptom', 'Milo had a soft-stool episode, February 1 to 3.'),
  care('milo-stool-1-end', 'milo', '2011-02-03', 'symptom', 'Milo returned to normal stool after the first episode.'),
  care('milo-stool-2', 'milo', '2014-07-09', 'symptom', 'Milo had a separate soft-stool episode, July 9 to 11.'),
  care('milo-stool-2-end', 'milo', '2014-07-11', 'symptom', 'Milo returned to normal stool after the second episode.'),
  care('milo-vomit-wrong', 'milo', '2014-07-09', 'symptom', 'Milo vomited twice.', { intelligence_source_message_id: 'wrong-source' }),
  care('bruno-correction', 'bruno', '2026-08-20', 'symptom', 'Correction to the July 9, 2014 vomiting report: Bruno vomited, not Milo. Milo only had soft stool.'),
  care('milo-correction', 'milo', '2026-08-20', 'general', 'Correction to the July 9, 2014 vomiting report: that vomiting belonged to Bruno, not Milo.', { intelligence_source_message_id: 'correction-source' }),
  care('milo-weight-1', 'milo', '2011-02-01', 'weight', 'Milo weighed 28.4 kg.'),
  care('milo-weight-2', 'milo', '2014-07-09', 'weight', 'Milo weighed 27.9 kg.'),
  care('milo-weight-3', 'milo', '2026-08-19', 'weight', 'Milo weighed 27.8 kg.'),
  care('milo-food-1', 'milo', '2011-02-01', 'food', 'Milo ate chicken and rice.'),
  care('milo-food-2', 'milo', '2014-07-09', 'food', 'Milo switched to salmon and rice.'),
  care('luna-litter', 'luna', '2012-03-01', 'general', 'Luna switched to scented litter.'),
  care('luna-accidents', 'luna', '2012-03-03', 'symptom', 'Luna had accidents outside the litter box.'),
  care('luna-restored', 'luna', '2012-03-06', 'general', 'The original unscented litter was restored for Luna.'),
  care('luna-improved', 'luna', '2012-03-09', 'symptom', 'Luna had fewer accidents after the original litter was restored.'),
  care('luna-hiding', 'luna', '2026-08-19', 'symptom', 'Luna is hiding less but still hides sometimes; it has not fully resolved.'),
  care('oscar-course', 'oscar', '2013-06-01', 'medication', 'Oscar completed the prescribed medication course.'),
  care('oscar-stiffness-1', 'oscar', '2013-06-10', 'symptom', 'Oscar had morning stiffness.'),
  care('oscar-stiffness-2', 'oscar', '2020-06-10', 'symptom', 'Oscar had recurrent morning stiffness.'),
  care('oscar-improved', 'oscar', '2026-08-19', 'symptom', 'Oscar is moving more easily this week, though occasional stiffness remains.'),
];
// No urine-test result for Luna; no diagnosis for Oscar. Absence is a fixture
// oracle, not a synthetic negative medical finding to add to history.
export function irrelevant(pet, count = 120) {
  return Array.from({ length: count }, (_, i) => care(`noise-${pet}-${i}`, pet, '2026-09-03', 'general',
    `Routine observation ${i}: rested on the porch.`, { created_at: new Date(now.getTime() - i * 1000).toISOString() }));
}
export const conversations = [{ id: 'chat', user_id: ownerId, pet_profile_id: 'milo' }];
export const episodes = [
  { id: 'stool-episode-1', started_at: '2011-02-01T12:00:00Z', last_event_at: '2011-02-03T12:00:00Z', sequence_number: 1, recurrence_of: null },
  { id: 'stool-episode-2', started_at: '2014-07-09T12:00:00Z', last_event_at: '2014-07-11T12:00:00Z', sequence_number: 2, recurrence_of: 'stool-episode-1' },
].map(row => ({ ...row, user_id: ownerId, pet_profile_id: 'milo', status: 'resolved', resolved_at: row.last_event_at,
  title: 'Soft stool', normalized_key: 'soft_stool', episode_type: 'symptom', severity: 'routine', summary: { semanticTopic: 'soft stool' } }));
export const expected = { miloEpisodeCount: 2, miloWeights: [28.4, 27.9, 27.8], miloWeightDeltaKg: -0.6,
  miloVomitingCount: 0, lunaUrineTest: null, lunaHidingResolved: false, oscarDiagnosis: null };
