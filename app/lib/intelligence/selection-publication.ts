import type { ReadTicket } from "../furvise-brain/read-ticket.ts";
import type { ReadCoverage } from "../furvise-brain/lungs.ts";

// A derived view of organ receipts, never another certificate store.
// This authorizes selected source reports only, not counts, absence,
// comparisons, aggregates, clinical facts or whole-history completeness.
export function selectionPublication(ticket: ReadTicket, coverage: ReadCoverage,
  records: readonly { id: string; petId: string }[]) {
  if (!ticket.selection) return null;
  let transportValid = true;
  const certificates = ticket.subjects.petIds.flatMap(subjectId => {
    const groups = coverage.groups?.filter(g => g.petId === subjectId) || [];
    const group = groups.length === 1 ? groups[0] : undefined;
    const streams = coverage.effectiveStream?.filter(s => s.petId === subjectId) || [];
    const stream = streams.length === 1 ? streams[0] : undefined;
    return ticket.selection!.union.map((clause, clauseId) => {
      const receipt = group?.clauses[clauseId], selectedEventIds = receipt?.ids || [];
      const lineageClosed = stream ? stream.lineageClosed && stream.replacementSeedsExhausted
        : !coverage.effectiveStream && !!group?.exhausted;
      const shape = group?.clauses.length === ticket.selection!.union.length
        && receipt?.direction === clause.orderBy[0].direction && receipt?.count === clause.take.count
        && selectedEventIds.length <= clause.take.count
        && new Set(selectedEventIds).size === selectedEventIds.length;
      const organCertified = !!shape && !group?.blocked && lineageClosed
        && !["anchor_missing", "unavailable"].includes(coverage.status)
        && (stream ? receipt?.certified === true && ["complete", "complete_empty"].includes(group?.selectionStatus || "")
          : !!group?.exhausted && receipt?.certified !== false)
        && !coverage.sourceLineage?.some(s => selectedEventIds.includes(s.eventId));
      const represented = selectedEventIds.every(id => group?.selectedIds.includes(id)
        && group.retainedIds.includes(id) && coverage.selection?.retainedIds.includes(id)
        && (!stream || stream.effectiveIds.includes(id) && stream.certifiedSelectedIds.includes(id))
        && records.filter(r => r.id === id && r.petId === subjectId).length === 1);
      if (organCertified && !represented) transportValid = false;
      const certified = organCertified && represented;
      return { subjectId, clauseId, selectedEventIds: [...selectedEventIds], certified, lineageClosed,
        status: certified ? selectedEventIds.length ? "complete" : "complete_empty" : "partial",
        blockingReasons: certified ? [] : [...(group?.reasons || []),
          ...(!shape ? ["selection_receipt_mismatch"] : []),
          ...(!lineageClosed ? ["lineage_not_closed"] : []),
          ...(!represented ? ["selected_record_not_represented"] : []),
          ...(!organCertified ? ["selection_not_certified"] : [])] };
    });
  });
  return { certificates, transportValid,
    complete: certificates.length > 0 && certificates.every(c => c.certified),
    selectedEventIds: [...new Set(certificates.filter(c => c.certified).flatMap(c => c.selectedEventIds))] };
}
