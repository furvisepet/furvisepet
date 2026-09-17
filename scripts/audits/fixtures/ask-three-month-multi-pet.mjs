// SYNTHETIC ONLY. Acceptance fixture for June-August 2026.
import { care, ownerId } from './ask-lifetime-history.mjs';

const profile = (id, name, species, sex) => ({
  id, user_id: ownerId, name, species, sex, lifecycle_status: 'active',
  weight_value: null, weight_unit: 'kg', current_food: null, avoid_ingredients: [],
  created_at: '2024-01-01T00:00:00Z', updated_at: '2026-09-04T18:00:00Z',
});

export const pets = [
  profile('milo', 'Milo', 'dog', 'male'),
  profile('luna', 'Luna', 'cat', 'female'),
  profile('pepper', 'Pepper', 'dog', 'female'),
];

export const rows = [
  care('milo-weight-jun', 'milo', '2026-06-03', 'weight', 'Milo weighed 28.4 kg.'),
  care('milo-stool-open', 'milo', '2026-06-12', 'symptom', 'Milo developed soft stool.'),
  care('milo-stool-resolved', 'milo', '2026-06-14', 'symptom', 'Milo returned to normal stool.'),
  care('milo-food-original', 'milo', '2026-07-08', 'food', 'Milo switched to chicken and rice.'),
  care('milo-energy-jul', 'milo', '2026-07-19', 'general', 'Milo had normal energy on his usual walks.'),
  care('milo-weight-aug', 'milo', '2026-08-20', 'weight', 'Milo weighed 27.8 kg.'),
  care('luna-hiding-jun', 'luna', '2026-06-05', 'symptom', 'Luna started hiding more than usual.'),
  care('luna-hiding-improved', 'luna', '2026-06-12', 'symptom', 'Luna is hiding less but still hides sometimes.'),
  care('luna-weight-jul', 'luna', '2026-07-10', 'weight', 'Luna weighed 4.6 kg.'),
  care('luna-litter-jul', 'luna', '2026-07-15', 'general', 'Luna switched back to unscented litter.'),
  care('luna-vomit-aug', 'luna', '2026-08-25', 'symptom', 'Luna vomited twice.'),
  care('luna-vomit-resolved', 'luna', '2026-08-26', 'symptom', 'Luna had no more vomiting and ate normally.'),
  care('luna-weight-aug', 'luna', '2026-08-28', 'weight', 'Luna weighed 4.5 kg.'),
  care('pepper-itch-jun', 'pepper', '2026-06-02', 'symptom', 'Pepper was licking and itching her front paws.'),
  care('pepper-med-start', 'pepper', '2026-07-01', 'medication', 'Pepper started the prescribed Apoquel course.'),
  care('pepper-med-end', 'pepper', '2026-07-14', 'medication', 'Pepper completed the prescribed Apoquel course.'),
  care('pepper-itch-aug', 'pepper', '2026-08-03', 'symptom', 'Pepper had a mild recurrence of paw licking.'),
  care('pepper-itch-resolved', 'pepper', '2026-08-05', 'symptom', 'Pepper stopped licking her paws and seemed comfortable.'),
  care('pepper-groom-aug', 'pepper', '2026-08-22', 'general', 'Pepper had a routine nail trim.'),
];

export const byId = Object.fromEntries(rows.map(row => [row.id, row]));

const claim = (id, note, extra = {}) => ({
  id, user_id: ownerId, subject_type: 'pet', subject_id: 'milo', claim_kind: 'event',
  operation_type: 'assert', concept_key: 'food_change', canonical_concept_key: 'food_change',
  concept_resolution_status: 'canonical', persistence_destination: 'history', knowledge_status: 'effective',
  occurred_at: '2026-07-08T12:00:00Z', recorded_at: '2026-07-08T12:01:00Z',
  provenance_classification: 'imported_legacy', structured_value: { title: null, note, severity: null },
  ...extra,
});

const oldFood = claim('milo-food-old-claim', byId['milo-food-original'].note);
const correctedFood = claim('milo-food-corrected', 'Milo switched to salmon and rice, not chicken and rice.', {
  operation_type: 'correct', recorded_at: '2026-08-31T12:00:00Z',
});

export const foodCorrectionGraph = {
  claims: [oldFood, correctedFood],
  relations: [{
    id: 'milo-food-correction-edge', user_id: ownerId,
    from_claim_id: correctedFood.id, to_claim_id: oldFood.id, relation_type: 'corrects',
  }],
  lineage: [{
    user_id: ownerId, claim_id: oldFood.id, legacy_row_id: 'milo-food-original',
    legacy_table: 'pet_care_entries', claim_role: 'primary',
  }],
  sources: [byId['milo-food-original']],
};

export const period = { from: '2026-06-01T00:00:00Z', to: '2026-09-01T00:00:00Z' };
