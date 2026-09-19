/** Offline fixture migration only. Copy explicit planner dimensions; never
 * interpret question text, infer synonyms, change ownership, or grant writes.
 * Cases needing omitted semantics must supply a ticket in the case itself.
 */
export function ticketedProposal(proposal) {
  if (Object.hasOwn(proposal, 'readTicket') || proposal.mode !== 'read'
      || proposal.evidenceBasis !== 'saved_history') return proposal;
  const boundary = ['earliest', 'latest'].includes(proposal.selection);
  const instant = day => day == null ? null : `${day}T00:00:00.000Z`;
  return { ...proposal, readTicket: {
    operation: proposal.operation === 'comparison' ? 'compare' : 'read',
    temporal: { from: instant(proposal.from), to: instant(proposal.to), anchor: null },
    predicates: proposal.terms?.length ? [{ kind: 'text_any', terms: [...proposal.terms] }] : [],
    outputs: { completeness: boundary ? 'exhaustive' : 'sufficient',
      ordering: proposal.selection === 'latest' ? 'desc' : 'asc', limit: boundary ? 1 : null },
  } };
}
