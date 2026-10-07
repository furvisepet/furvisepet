/** Offline fixture migration only. Copy explicit planner dimensions; never
 * interpret question text, infer synonyms, change ownership, or grant writes.
 * Cases needing omitted semantics must supply a ticket in the case itself.
 */
export function ticketedProposal(proposal) {
  proposal = idFreeFixture(proposal);
  if (Object.hasOwn(proposal, 'readTicket') || proposal.mode !== 'read'
      || proposal.evidenceBasis !== 'saved_history') return proposal;
  const boundary = ['earliest', 'latest'].includes(proposal.selection);
  const instant = day => day == null ? null : /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00.000Z` : day;
  return { ...proposal, readTicket: {
    operation: proposal.operation === 'comparison' ? 'compare' : 'read',
    temporal: { from: instant(proposal.from), to: instant(proposal.to), anchor: null },
    predicates: proposal.terms?.length ? [{ kind: 'text_any', terms: [...proposal.terms] }] : [],
    ...(boundary ? {selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:proposal.selection==='latest'?'desc':'asc'}],take:{count:1,per:'group'}}]}} : {}),
    outputs: { completeness: 'sufficient',
      ordering: proposal.selection === 'latest' ? 'desc' : 'asc', limit: null },
  } };
}

/** Translate explicit old offline fixture dimensions into the ID-free provider
 * shape. No question parsing, ID semantics, or production normalization. */
function idFreeFixture(proposal) {
  const ticket = proposal.readTicket;
  if (!ticket?.needs?.length) return proposal;
  const evidence = proposal.evidenceNeeds;
  if (!Array.isArray(evidence) || evidence.length !== ticket.needs.length)
    throw Error('Multi-need fixture must supply one explicit source binding per probe');
  const { needs, ...read } = ticket;
  const probes = needs.map((need,index) => {
    if (need.needId !== 'need:' + index) throw Error('Fixture identity mismatch');
    const {needId:_id,...dimensions}=need;
    const source=evidence[index];
    return {quote:source.quote,sourceTurnId:source.sourceTurnId,petNames:source.petNames || [],...dimensions};
  });
  return {...proposal,evidenceNeeds:[],readTicket:{...read,probes}};
}
