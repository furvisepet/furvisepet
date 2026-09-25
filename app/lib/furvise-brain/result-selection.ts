import type { CareEntryRow } from "../supabase.ts";
import type { ReadTicket } from "./read-ticket.ts";
import type { ReadCoverage } from "./lungs.ts";
import { eventOrder } from "./read-selection.ts";

export type ResultFrontier = {
  petId: string; direction: "asc" | "desc"; acquired: boolean; exhausted: boolean;
  frontier: { id: string; eventAt: string; createdAt: string } | null;
  lineageClosed: boolean; replacementSeedsExhausted: boolean; failed: boolean; reasons: string[];
};
export type ResultSelectionCertificate = {
  clauseId: number; subjectIds: string[]; direction: "asc" | "desc"; count: number;
  selectedIds: string[]; retainedIds: string[];
  cutoff: { id: string; eventAt: string; createdAt: string } | null;
  frontiers: Array<ResultFrontier & { cutoffCovered: boolean }>;
  certified: boolean; blocked: boolean; status: "complete" | "complete_empty" | "partial"; reasons: string[];
};
export const isResultSelection = (ticket: ReadTicket) =>
  !!ticket.selection && ticket.selection.groupBy.length === 0
  && ticket.selection.union.every(clause => clause.take.per === "result");

export function selectReadResult(ticket: ReadTicket, rows: readonly CareEntryRow[]) {
  return ticket.selection!.union.map((clause, clauseId) => {
    const direction = clause.orderBy[0].direction;
    const selected = [...rows].sort((a, b) => direction === "asc" ? eventOrder(a, b) : eventOrder(b, a))
      .slice(0, clause.take.count);
    return { clauseId, direction, count: clause.take.count, rows: selected };
  });
}

/** A closed overlay includes every replacement seed, even outside the raw page.
 * Strict event-time comparison deliberately deepens tied raw frontiers: claim
 * IDs and raw IDs occupy different spaces. Exhaustion also proves the boundary.
 * Finding N rows, or certifying just the subjects that won, is never sufficient.
 */
export function frontierCovers(frontier: ResultFrontier, cutoff: CareEntryRow | undefined, full: boolean) {
  if (!frontier.acquired || frontier.failed || !frontier.lineageClosed || !frontier.replacementSeedsExhausted) return false;
  if (frontier.exhausted) return true;
  return full && !!cutoff && !!frontier.frontier
    && (frontier.direction === "desc"
      ? Date.parse(cutoff.occurred_at) > Date.parse(frontier.frontier.eventAt)
      : Date.parse(cutoff.occurred_at) < Date.parse(frontier.frontier.eventAt));
}

export function certifyReadResult(ticket: ReadTicket, rows: readonly CareEntryRow[], frontiers: readonly ResultFrontier[],
  retainedIds: ReadonlySet<string>): ResultSelectionCertificate[] {
  const subjectIds = [...ticket.subjects.petIds].sort();
  return selectReadResult(ticket, rows).map(clause => {
    const selectedIds = clause.rows.map(row => row.id), cutoff = clause.rows.at(-1);
    const proofs = subjectIds.map(petId => {
      const matches = frontiers.filter(f => f.petId === petId && f.direction === clause.direction);
      const frontier: ResultFrontier = matches.length === 1 ? matches[0] : {
        petId, direction: clause.direction, acquired: false, exhausted: false, frontier: null,
        lineageClosed: false, replacementSeedsExhausted: false, failed: true, reasons: ["result_subject_proof_missing"],
      };
      return { ...frontier, cutoffCovered: frontierCovers(frontier, cutoff, selectedIds.length === clause.count) };
    });
    const reasons = [...new Set(proofs.flatMap(proof => [
      ...proof.reasons,
      ...(!proof.acquired ? ["subject_acquisition_missing"] : []),
      ...(!proof.lineageClosed || !proof.replacementSeedsExhausted ? ["lineage_not_closed"] : []),
      ...(!proof.cutoffCovered ? ["result_cutoff_unproven"] : []),
    ]))];
    const retained = selectedIds.filter(id => retainedIds.has(id));
    if (retained.length !== selectedIds.length) reasons.push("required_selection_not_retained");
    const certified = proofs.every(f => f.cutoffCovered) && retained.length === selectedIds.length;
    return { clauseId: clause.clauseId, subjectIds, direction: clause.direction, count: clause.count,
      selectedIds, retainedIds: retained, cutoff: cutoff ? { id: cutoff.id, eventAt: cutoff.occurred_at, createdAt: cutoff.created_at } : null,
      frontiers: proofs, certified, blocked: !certified,
      status: certified ? selectedIds.length ? "complete" as const : "complete_empty" as const : "partial" as const,
      reasons: certified ? [] : [...new Set(reasons)] };
  });
}

/** Compatibility projection of a JOINT receipt, not independent per-pet proof.
 * Existing source authority consumes selected IDs by their actual owner.
 * Empty intersections do not assert that this subject has no matching history.
 */
export function resultGroups(ticket: ReadTicket, rows: readonly CareEntryRow[], receipts: ResultSelectionCertificate[]): NonNullable<ReadCoverage["groups"]> {
  return [...ticket.subjects.petIds].sort().map(petId => {
    const owned = new Set(rows.filter(r => r.pet_profile_id === petId).map(r => r.id));
    const clauses = receipts.map(r => ({ direction: r.direction, count: r.count,
      ids: r.selectedIds.filter(id => owned.has(id)), certified: r.certified }));
    const selectedIds = [...new Set(clauses.flatMap(c => c.ids))];
    const retainedIds = selectedIds.filter(id => receipts.some(r => r.retainedIds.includes(id)));
    const exhausted = receipts.every(r => r.frontiers.find(f => f.petId === petId)?.exhausted);
    const blocked = receipts.some(r => r.blocked);
    const subset = rows.some(r => r.pet_profile_id === petId && !retainedIds.includes(r.id));
    return { petId, clauses, selectedIds, retainedIds, exhausted, blocked,
      selectionStatus: blocked ? "partial" : selectedIds.length ? "complete" : "complete_empty",
      status: blocked || !exhausted || subset ? "partial" : selectedIds.length ? "complete" : "complete_empty",
      reasons: [...new Set(receipts.flatMap(r => r.reasons).concat(!exhausted ? ["subject_scan_not_exhausted"] : []))] };
  });
}
