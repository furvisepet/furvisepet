import { readAuthority } from "../furvise-brain/read-ticket.ts";
import type { ReadTicket } from "../furvise-brain/read-ticket.ts";
import type { ReadCoverage } from "../furvise-brain/lungs.ts";

/** Validate the existing organ receipt against its represented result, without
 * selecting facts or recalculating completeness in the publication layer.
 */
export function resultSetSnapshotMatches(ticket: ReadTicket, coverage: ReadCoverage,
  records: readonly { id: string; petId: string }[]): boolean {
  if (readAuthority(ticket) !== readAuthority(coverage)) return false;
  const report = ticket.authority === "stored_report";
  const proof = coverage.resultSet;
  if (!proof) return true;
  if (readAuthority(ticket) !== readAuthority(proof)) return false;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const ids = records.map(r => r.id), subjects = [...ticket.subjects.petIds].sort();
  if (ticket.selection || ticket.outputs.strategy != null
    || !same(proof.subjectIds, subjects) || !same(proof.subjects.map(s => s.petId), subjects)
    || !same(proof.predicates, ticket.predicates) || !same(proof.temporal, ticket.temporal)
    || !same(proof.windows, coverage.windows) || proof.ordering !== ticket.outputs.ordering
    || !same(ids, proof.retainedIds) || new Set(ids).size !== ids.length
    || !same(proof.matchingIds, coverage.selection?.matchedIds)
    || !same(proof.retainedIds, coverage.selection?.retainedIds)
    || !same(proof.omittedIds, coverage.selection?.omittedIds)
    || !same(proof.omittedIds, proof.matchingIds.filter(id => !ids.includes(id)))
    || new Set(proof.matchingIds).size !== proof.matchingIds.length
    || ids.some(id => !proof.matchingIds.includes(id))) return false;
  if (!same(proof.subjects.flatMap(s => s.matchingIds).sort(), [...proof.matchingIds].sort())) return false;
  for (const subject of proof.subjects) {
    const stream = coverage.effectiveStream?.find(s => s.petId === subject.petId);
    if (!same(subject.retainedIds, records.filter(r => r.petId === subject.petId).map(r => r.id))
      || !same(subject.omittedIds, subject.matchingIds.filter(id => !subject.retainedIds.includes(id)))
      || subject.matchingSetComplete !== (subject.exhausted && (report ? stream?.storedReportsCertified === true : subject.lineageClosed))
      || subject.representationComplete !== (subject.omittedIds.length === 0)
      || subject.certified !== (subject.matchingSetComplete && subject.representationComplete)
      || subject.exhausted && coverage.continuation.some(c => c.petId === subject.petId)) return false;
    if (report && (!stream || new Set(coverage.effectiveStream?.map(s => s.petId)).size !== coverage.effectiveStream?.length)) return false;
    if (!report && stream?.storedReportsCertified !== undefined) return false;
    if (stream && (subject.lineageClosed !== (stream.lineageClosed && stream.replacementSeedsExhausted)
      || subject.matchingIds.some(id => !stream.effectiveIds.includes(id)))) return false;
  }
  return proof.matchingSetComplete === proof.subjects.every(s => s.matchingSetComplete)
    && proof.representationComplete === proof.subjects.every(s => s.representationComplete)
    && proof.certified === proof.subjects.every(s => s.certified)
    && (!["complete", "complete_empty"].includes(coverage.status) || proof.certified);
}

/** Reuse the organ receipt and exact transport check; never infer completeness here. */
export function certifiedResultSetMatches(ticket: ReadTicket, coverage: ReadCoverage,
  records: readonly { id: string; petId: string }[]): boolean {
  return !!coverage.resultSet?.certified && ["complete", "complete_empty"].includes(coverage.status)
    && resultSetSnapshotMatches(ticket, coverage, records);
}
