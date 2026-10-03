import { independentSelectionPublication } from "./independent-selection-publication.ts";
import { readAuthority } from "../furvise-brain/read-ticket.ts";
import { isResultSelection } from "../furvise-brain/result-selection.ts";
import type { ReadTicket } from "../furvise-brain/read-ticket.ts";
import type { ReadCoverage } from "../furvise-brain/lungs.ts";

// A derived view of organ receipts, never another certificate store.
// This authorizes selected source reports only, not counts, absence,
// comparisons, aggregates, clinical facts or whole-history completeness.
export type SelectionPublication = {
  certificates: Array<{ subjectId: string; clauseId: number; selectedEventIds: string[];
    certified: boolean; lineageClosed: boolean; status: string; blockingReasons: string[];
    needId?: string; sourceSpanId?: string; clause?: NonNullable<ReadTicket["selection"]>["union"][number];
    temporal?: ReadTicket["temporal"] }>;
  transportValid: boolean; complete: boolean; selectedEventIds: string[];
};
export function selectionPublication(ticket: ReadTicket, coverage: ReadCoverage,
  records: readonly { id: string; petId: string }[]): SelectionPublication | null {
  if (!ticket.selection) return independentSelectionPublication(ticket, coverage, records);
  const report = ticket.authority === "stored_report";
  const authorityMatches = readAuthority(ticket) === readAuthority(coverage);
  let transportValid = authorityMatches;
  const resultLevel = isResultSelection(ticket);
  // A subject projection may carry facts only after the entire result receipt
  // proves every competing subject and every required represented selected row.
  const joint = ticket.selection.union.map((clause, clauseId) => {
    if (!resultLevel) return null;
    const receipt = coverage.resultSelection?.[clauseId];
    const subjects = [...ticket.subjects.petIds].sort();
    const same = (a: readonly string[], b: readonly string[]) => JSON.stringify(a) === JSON.stringify(b);
    const shape = authorityMatches && !!receipt && readAuthority(receipt) === readAuthority(ticket) && coverage.resultSelection?.length === ticket.selection!.union.length
      && receipt.clauseId === clauseId && receipt.direction === clause.orderBy[0].direction
      && receipt.count === clause.take.count && same(receipt.subjectIds, subjects)
      && receipt.selectedIds.length <= clause.take.count && new Set(receipt.selectedIds).size === receipt.selectedIds.length
      && receipt.cutoff?.id === receipt.selectedIds.at(-1)
      && same((coverage.groups || []).map(g => g.petId).sort(), subjects)
      && same((coverage.groups || []).flatMap(g => g.clauses[clauseId]?.ids || []).sort(), [...receipt.selectedIds].sort())
      && receipt.frontiers.length === subjects.length
      && same(receipt.frontiers.map(f => f.petId).sort(), subjects);
    const proven = !!shape && !!receipt?.certified && !receipt.blocked
      && ["complete", "complete_empty"].includes(receipt.status)
      && receipt.frontiers.every(f => {
        const streams = coverage.effectiveStream?.filter(s => s.petId === f.petId);
        const group = coverage.groups?.find(g => g.petId === f.petId);
        const closed = report ? streams?.length === 1 && streams[0].storedReportsCertified === true
          : streams ? streams.length === 1 && streams[0].lineageClosed && streams[0].replacementSeedsExhausted : !!group?.exhausted;
        const frontierCertified = report ? f.storedReportsCertified === true : f.lineageClosed && f.replacementSeedsExhausted;
        return closed && f.acquired && !f.failed && frontierCertified
          && f.cutoffCovered && f.direction === receipt.direction
          && (f.exhausted || receipt.selectedIds.length === receipt.count && !!receipt.cutoff && !!f.frontier
            && (f.direction === "desc" ? Date.parse(receipt.cutoff.eventAt) > Date.parse(f.frontier.eventAt)
              : Date.parse(receipt.cutoff.eventAt) < Date.parse(f.frontier.eventAt)));
      });
    const represented = !!receipt && receipt.selectedIds.every(id => {
      const owners = coverage.groups?.filter(g => g.clauses[clauseId]?.ids.includes(id)) || [];
      const owner = owners.length === 1 ? owners[0] : undefined;
      const stream = coverage.effectiveStream?.find(s => s.petId === owner?.petId);
      return !!owner && owner.selectedIds.includes(id) && owner.retainedIds.includes(id)
        && receipt.retainedIds.includes(id) && coverage.selection?.retainedIds.includes(id)
        && (!stream || stream.effectiveIds.includes(id) && stream.certifiedSelectedIds.includes(id))
        && records.filter(r => r.id === id && r.petId === owner.petId).length === 1;
    });
    if (proven && !represented) transportValid = false;
    return { certified: proven && represented, selectedIds: receipt?.selectedIds || [],
      reasons: [...(receipt?.reasons || []), ...(!shape ? ["result_receipt_mismatch"] : []),
        ...(!proven ? ["result_selection_not_certified"] : []), ...(!represented ? ["selected_record_not_represented"] : [])] };
  });
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
      const sourceCertified = report ? stream?.storedReportsCertified === true : stream?.storedReportsCertified === undefined && lineageClosed;
      const organCertified = authorityMatches && (!resultLevel || joint[clauseId]?.certified === true) && !!shape && !group?.blocked && sourceCertified
        && !["anchor_missing", "unavailable"].includes(coverage.status)
        && (stream ? receipt?.certified === true && ["complete", "complete_empty"].includes(group?.selectionStatus || "")
          : !!group?.exhausted && receipt?.certified !== false)
        && (report || !coverage.sourceLineage?.some(s => selectedEventIds.includes(s.eventId)));
      const represented = selectedEventIds.every(id => group?.selectedIds.includes(id)
        && group.retainedIds.includes(id) && coverage.selection?.retainedIds.includes(id)
        && (!stream || stream.effectiveIds.includes(id) && stream.certifiedSelectedIds.includes(id))
        && records.filter(r => r.id === id && r.petId === subjectId).length === 1);
      if (organCertified && !represented) transportValid = false;
      const certified = organCertified && represented;
      return { subjectId, clauseId, selectedEventIds: [...selectedEventIds], certified, lineageClosed,
        status: certified ? selectedEventIds.length ? "complete" : "complete_empty" : "partial",
        blockingReasons: certified ? [] : [...(group?.reasons || []), ...(resultLevel ? joint[clauseId]?.reasons || [] : []),
          ...(!shape ? ["selection_receipt_mismatch"] : []),
          ...(!lineageClosed ? ["lineage_not_closed"] : []),
          ...(!represented ? ["selected_record_not_represented"] : []),
          ...(!organCertified ? ["selection_not_certified"] : [])] };
    });
  });
  // No winning row for a subject is not a claim of no matching history.
  // Source obligations are only the ownership projections of the joint result.
  const projected = resultLevel ? certificates.filter(c => !c.certified || c.selectedEventIds.length
    || joint[c.clauseId]?.selectedIds.length === 0) : certificates;
  return { certificates: projected, transportValid,
    complete: projected.length > 0 && projected.every(c => c.certified),
    selectedEventIds: [...new Set(projected.filter(c => c.certified).flatMap(c => c.selectedEventIds))] };
}
