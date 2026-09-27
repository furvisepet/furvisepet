import type { CareEntryRow } from "../supabase.ts";
import type { ReadTicket } from "./read-ticket.ts";
import type { ReadCoverage, ReadScope, ReadStore } from "./lungs.ts";

export const isOrderedResultSet = (ticket: ReadTicket) => !ticket.selection
  && ticket.outputs.strategy == null && ticket.outputs.limit === null
  && !ticket.needs?.length && !ticket.episode && !ticket.temporal.calendar;

export type OrderedResultSetProof = {
  authority?: ReadTicket["authority"];
  subjectIds: string[]; predicates: ReadTicket["predicates"]; temporal: ReadTicket["temporal"];
  windows: ReadCoverage["windows"]; ordering: "asc" | "desc";
  subjects: Array<{ petId: string; exhausted: boolean; lineageClosed: boolean;
    matchingIds: string[]; retainedIds: string[]; omittedIds: string[];
    matchingSetComplete: boolean; representationComplete: boolean; certified: boolean; reasons: string[] }>;
  matchingIds: string[]; retainedIds: string[]; omittedIds: string[];
  matchingSetComplete: boolean; representationComplete: boolean; certified: boolean; reasons: string[];
};

/** The same store-owned closure used for bounded selections. No alternate
 * correction algorithm: keep only closed, owned effective rows from each subject.
 * One subject's closure failure cannot manufacture completeness for the others.
 */
export async function resolveResultSetHistory(ticket: ReadTicket, scope: ReadScope, store: ReadStore,
  candidates: CareEntryRow[], coverage: ReadCoverage, from: number, to: number) {
  const records: CareEntryRow[] = [];
  coverage.effectiveStream = [];
  const sourceLineage: NonNullable<ReadCoverage["sourceLineage"]> = [];
  for (const petId of [...ticket.subjects.petIds].sort()) {
    const raw = candidates.filter(row => row.pet_profile_id === petId);
    let storedReportsCertified = false;
    let effective: CareEntryRow[] = [], lineageClosed = false, replacementSeedsExhausted = false, graphCalls = 0, lineageRows = 0;
    try {
      const proof = await store.effectiveWindow!({ petId, rows: raw, from: new Date(from).toISOString(), to: new Date(to).toISOString() });
      if (new Set(proof.records.map(r => r.id)).size !== proof.records.length || proof.records.some(r =>
        r.user_id !== scope.userId || r.pet_profile_id !== petId || r.deleted_at
        || !Number.isFinite(Date.parse(r.occurred_at)) || !Number.isFinite(Date.parse(r.created_at))
        || Date.parse(r.occurred_at) < from || Date.parse(r.occurred_at) >= to)) throw new Error("invalid_effective_scope");
      storedReportsCertified = ticket.authority === "stored_report" && proof.storedReportsCertified === true;
      lineageClosed = proof.lineageClosed && !proof.sourceLineage.length;
      replacementSeedsExhausted = proof.replacementSeedsExhausted;
      graphCalls = proof.graphCalls; lineageRows = proof.lineageRows;
      sourceLineage.push(...proof.sourceLineage);
      coverage.reasons.push(...proof.reasons);
      // A closed store window may include an attributed unlinked report. Keep
      // that existing provenance policy; it never becomes a verified edge or
      // a complete result-set proof.
      if (ticket.authority === "stored_report" ? storedReportsCertified : proof.lineageClosed && proof.replacementSeedsExhausted) effective = proof.records;
      if (!lineageClosed || !replacementSeedsExhausted) coverage.reasons.push("result_set_lineage_not_closed");
    } catch {
      coverage.reasons.push("result_set_effective_truth_unavailable");
    }
    records.push(...effective);
    coverage.effectiveStream.push({ petId, acquiredIds: raw.map(r => r.id), effectiveIds: effective.map(r => r.id),
      certifiedSelectedIds: [], lineageClosed, replacementSeedsExhausted, graphCalls, lineageRows,
      ...(ticket.authority === "stored_report" ? { storedReportsCertified } : {}) });
  }
  return { records, reliable: true, sourceLineage };
}

/** All IDs here describe the observed EFFECTIVE matching set. Only exhausted,
 * closed subject streams establish that there are no additional matching rows.
 * Representation is a separate, stricter requirement for exhaustive publication.
 */
export function certifyOrderedResultSet(ticket: ReadTicket, coverage: ReadCoverage, matching: readonly CareEntryRow[],
  represented: readonly CareEntryRow[], failures: readonly { petId: string; reason: string }[]): OrderedResultSetProof {
  const retained = new Set(represented.map(r => r.id));
  const subjects = [...ticket.subjects.petIds].sort().map(petId => {
    const exhausted = !coverage.continuation.some(c => c.petId === petId) && !failures.some(f => f.petId === petId);
    const stream = coverage.effectiveStream?.find(s => s.petId === petId);
    const lineageClosed = stream ? stream.lineageClosed && stream.replacementSeedsExhausted
      : exhausted && !coverage.sourceLineage?.length;
    const matchingIds = matching.filter(r => r.pet_profile_id === petId).map(r => r.id);
    const retainedIds = matchingIds.filter(id => retained.has(id)), omittedIds = matchingIds.filter(id => !retained.has(id));
    const matchingSetComplete = exhausted && (ticket.authority === "stored_report" ? stream?.storedReportsCertified === true : lineageClosed);
    const representationComplete = omittedIds.length === 0;
    return { petId, exhausted, lineageClosed, matchingIds, retainedIds, omittedIds, matchingSetComplete, representationComplete,
      certified: matchingSetComplete && representationComplete, reasons: [
        ...(!exhausted ? ["subject_scan_not_exhausted"] : []),
        ...(!lineageClosed ? ["result_set_lineage_not_closed"] : []),
        ...(!representationComplete ? ["matching_records_not_represented"] : []),
        ...failures.filter(f => f.petId === petId).map(f => f.reason),
      ] };
  });
  const matchingIds = matching.map(r => r.id), retainedIds = represented.map(r => r.id);
  return { ...(ticket.authority ? { authority: ticket.authority } : {}), subjectIds: subjects.map(s => s.petId), predicates: ticket.predicates, temporal: ticket.temporal,
    windows: coverage.windows, ordering: ticket.outputs.ordering, subjects, matchingIds, retainedIds,
    omittedIds: matchingIds.filter(id => !retained.has(id)),
    matchingSetComplete: subjects.every(s => s.matchingSetComplete),
    representationComplete: subjects.every(s => s.representationComplete),
    certified: subjects.every(s => s.certified), reasons: [...new Set(subjects.flatMap(s => s.reasons))] };
}
