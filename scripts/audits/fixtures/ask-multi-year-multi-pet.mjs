// SYNTHETIC ONLY. Extends the accepted Milo/Luna/Pepper June-August 2026 fixture across years.
import { care, ownerId } from './ask-lifetime-history.mjs';
import { pets, rows as recentRows } from './ask-three-month-multi-pet.mjs';

export { pets };

export const oldRows = [
  care('milo-weight-1926', 'milo', '1926-04-18', 'weight', 'Milo archival test record: 31.9 kg.'),
  care('milo-weight-2012', 'milo', '2012-04-18', 'weight', 'Milo weighed 31.2 kg.'),
  care('milo-food-2013-original', 'milo', '2013-05-10', 'food', 'Milo switched to beef and rice.'),
  care('milo-med-2017', 'milo', '2017-09-14', 'medication', 'Milo completed the prescribed ear medication course.'),
  care('luna-litter-2014', 'luna', '2014-03-04', 'general', 'Luna switched to unscented litter.'),
  care('luna-weight-2018', 'luna', '2018-11-09', 'weight', 'Luna weighed 5.1 kg.'),
  care('pepper-itch-2019', 'pepper', '2019-06-02', 'symptom', 'Pepper was licking and itching her front paws.'),
  care('pepper-itch-resolved-2019', 'pepper', '2019-06-06', 'symptom', 'Pepper stopped licking her front paws.'),
];

export const rows = [...oldRows, ...recentRows];

const oldFoodClaim = {
  id: 'milo-food-2013-old-claim', user_id: ownerId, subject_type: 'pet', subject_id: 'milo', claim_kind: 'event',
  operation_type: 'assert', concept_key: 'food_change', canonical_concept_key: 'food_change', concept_resolution_status: 'canonical',
  persistence_destination: 'history', knowledge_status: 'effective', occurred_at: '2013-05-10T12:00:00Z', recorded_at: '2013-05-10T12:01:00Z',
  provenance_classification: 'imported_legacy', structured_value: { title: null, note: 'Milo switched to beef and rice.', severity: null },
};const correctedFoodClaim = {
  ...oldFoodClaim,
  id: 'milo-food-2013-corrected', operation_type: 'correct', recorded_at: '2026-08-31T12:00:00Z',
  structured_value: { title: null, note: 'Milo switched to turkey and rice, not beef and rice.', severity: null },
};

export const lateFoodCorrectionGraph = {
  claims: [oldFoodClaim, correctedFoodClaim],
  relations: [{
    id: 'milo-food-2013-correction-edge', user_id: ownerId,
    from_claim_id: correctedFoodClaim.id, to_claim_id: oldFoodClaim.id, relation_type: 'corrects',
  }],
  lineage: [{
    user_id: ownerId, claim_id: oldFoodClaim.id, legacy_row_id: 'milo-food-2013-original',
    legacy_table: 'pet_care_entries', claim_role: 'primary',
  }],
  sources: [oldRows.find(row => row.id === 'milo-food-2013-original')],
};

export function denseNoise(petId, count, startYear = 2020) {
  return Array.from({ length: count }, (_, index) => {
    const year = startYear + (index % 6);
    const month = String((index % 12) + 1).padStart(2, '0');
    const day = String((index % 27) + 1).padStart(2, '0');
    return care(`dense-${petId}-${index}`, petId, `${year}-${month}-${day}`, 'general', `Routine observation ${index}: normal household activity.`);
  });
}
