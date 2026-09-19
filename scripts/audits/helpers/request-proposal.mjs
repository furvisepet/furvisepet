/** Build the current provider contract from explicit test dimensions.
 * This fixture builder grants no authority; production validates its result.
 * It never derives an answer, pet identity, topic, or quantity from question wording.
 */
export function requestProposal(spec, question) {
  if (spec.version) return spec;
  const { subject, readOperation, operation = 'recall', ...fields } = spec;
  const update = operation === 'update';
  const op = update ? (readOperation || 'general') : operation;
  const scope = { explicit: 'named', selected: 'selected', conversation: 'conversation', non_pet: 'none', unclear: 'none' }[subject] || 'selected';
  return {
    version: 'ask-request.v2', mode: update ? (readOperation ? 'mixed' : 'update') : op === 'general' && scope === 'none' ? 'conversation' : op === 'clarify' ? 'clarify' : 'read',
    question, requirements: [], referenceTurnIds: [], quantity: op === 'count' || op === 'episode' ? 'episodes' : null,
    evidenceBasis: op === 'general' && scope === 'none' ? 'general' : 'saved_history', outputFormat: 'prose', premiseQuotes: [], excludedPetNames: [],
    projection: null, evidenceNeeds: [], scope, operation: op, selection: fields.from ? 'period' : 'summary', ...fields,
    frame: update ? fields.frame : null,
  };
}
