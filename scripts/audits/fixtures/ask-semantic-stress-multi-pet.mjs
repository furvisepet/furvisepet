import { care, ownerId } from './ask-lifetime-history.mjs';
import { pets, rows as multiYearRows } from './ask-multi-year-multi-pet.mjs';

export { pets };

const semanticRows = [
  care('milo-itch-2019-wrong', 'milo', '2019-06-02', 'symptom', 'Milo was licking and itching his front paws.'),
  care('milo-med-date-wrong', 'milo', '2017-09-14', 'medication', 'Milo completed the prescribed ear medication course.'),
  care('luna-weight-2018-conflict', 'luna', '2018-11-09', 'weight', 'Luna weighed 5.4 kg.'),
  care('pepper-old-deleted', 'pepper', '2020-02-02', 'symptom', 'Pepper had an old paw irritation note.', { deleted_at: '2021-01-01T00:00:00Z' }),
  care('pepper-restored-active', 'pepper', '2020-02-03', 'symptom', 'Pepper had mild paw irritation that was later restored as the active record.'),
];

export const rows = [...multiYearRows, ...semanticRows];

const importedClaim = (id, subjectId, occurredAt, note) => ({
  id, user_id: ownerId, subject_type: 'pet', subject_id: subjectId, claim_kind: 'event',
  operation_type: 'assert', concept_key: 'semantic_stress', canonical_concept_key: 'semantic_stress',
  concept_resolution_status: 'canonical', persistence_destination: 'history', knowledge_status: 'effective',
  occurred_at: occurredAt, recorded_at: occurredAt.replace('12:00:00Z', '12:01:00Z'),
  provenance_classification: 'imported_legacy', structured_value: { title: null, note, severity: null },
});
const wrongPet = importedClaim('wrong-pet-claim', 'milo', '2019-06-02T12:00:00Z', 'Milo was licking and itching his front paws.');
const correctedPet = { ...wrongPet, id: 'corrected-pet-claim', subject_id: 'pepper', operation_type: 'correct',
  recorded_at: '2026-08-30T12:00:00Z', structured_value: { title: null, note: 'Pepper was licking and itching her front paws, not Milo.', severity: null } };
export const petReassignmentGraph = {
  claims: [wrongPet, correctedPet],
  relations: [{ id: 'pet-reassign-edge', user_id: ownerId, from_claim_id: correctedPet.id, to_claim_id: wrongPet.id, relation_type: 'corrects' }],
  lineage: [{ user_id: ownerId, claim_id: wrongPet.id, legacy_row_id: 'milo-itch-2019-wrong', legacy_table: 'pet_care_entries', claim_role: 'primary' }],
  sources: [semanticRows.find(row => row.id === 'milo-itch-2019-wrong')],
};

const wrongDate = importedClaim('wrong-date-claim', 'milo', '2017-09-14T12:00:00Z', 'Milo completed the prescribed ear medication course.');
const correctedDate = { ...wrongDate, id: 'corrected-date-claim', operation_type: 'correct', occurred_at: '2018-09-14T12:00:00Z',
  recorded_at: '2026-08-30T12:00:00Z', structured_value: { title: null, note: 'Milo completed the prescribed ear medication course on September 14, 2018, not 2017.', severity: null } };
export const dateCorrectionGraph = {
  claims: [wrongDate, correctedDate],
  relations: [{ id: 'date-correction-edge', user_id: ownerId, from_claim_id: correctedDate.id, to_claim_id: wrongDate.id, relation_type: 'corrects' }],
  lineage: [{ user_id: ownerId, claim_id: wrongDate.id, legacy_row_id: 'milo-med-date-wrong', legacy_table: 'pet_care_entries', claim_role: 'primary' }],
  sources: [semanticRows.find(row => row.id === 'milo-med-date-wrong')],
};
