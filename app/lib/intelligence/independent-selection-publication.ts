import { hasIndependentSelections, independentSelectionTicket } from "../furvise-brain/independent-selections.ts";
import { selectionPublication, type SelectionPublication } from "./selection-publication.ts";
import type { ReadTicket } from "../furvise-brain/read-ticket.ts";
import type { ReadCoverage } from "../furvise-brain/lungs.ts";
import type { AskEvidenceContract } from "./ask-evidence.ts";

export const isSelectedRead = (ticket: ReadTicket) => !!ticket.selection || hasIndependentSelections(ticket);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Advisory evidence facets cannot inherit a certificate by proximity or position. */
export function independentNeedsMatch(evidence: AskEvidenceContract): boolean {
  const request = evidence.interpretation?.request, ticket = request?.readTicket;
  if (!hasIndependentSelections(ticket)) return false;
  const needs = request?.evidenceNeeds || [];
  return needs.length === ticket!.needs!.length && new Set(needs.map(n => n.id)).size === needs.length
    && needs.every(need => {
      const typed = ticket!.needs!.find(n => n.id === need.id);
      return !!typed && same([...(need.petIds?.length ? need.petIds : ticket!.subjects.petIds)].sort(), [...typed.petIds].sort())
        && (typed.from && typed.to ? need.window?.from === typed.from && need.window?.to === typed.to : !need.window)
        && need.order === (typed.ordering === "asc" ? "earliest" : "latest");
    });
}

/** Project existing child certificates; never mint endpoint authority from probes. */
export function independentSelectionPublication(ticket: ReadTicket, coverage: ReadCoverage,
  records: readonly { id: string; petId: string }[]): SelectionPublication | null {
  if (!hasIndependentSelections(ticket)) return null;
  const parts = coverage.independentSelections || [], access = coverage.independentAccessWindow;
  let transportValid = coverage.authority === "effective_fact" && ticket.authority !== "stored_report"
    && parts.length === ticket.needs!.length && new Set(parts.map(p => p.needId)).size === parts.length;
  const certificates: SelectionPublication["certificates"] = [];
  for (const need of ticket.needs!) {
    const child = independentSelectionTicket(ticket, need);
    const part = parts.find(p => p.needId === need.id);
    const shape = !!access && !!part && part.sourceSpanId === need.sourceSpanId && same(part.ticket, child)
      && part.coverage.asOf === coverage.asOf && part.coverage.windows.length === need.petIds.length
      && need.petIds.every(petId => {
        const windows = part.coverage.windows.filter(w => w.petId === petId);
        return windows.length === 1 && windows[0].relation === null
          && Date.parse(windows[0].from) === Math.max(Date.parse(access.from), need.from ? Date.parse(need.from) : -Infinity)
          && Date.parse(windows[0].to) === Math.min(Date.parse(access.to), need.to ? Date.parse(need.to) : Infinity);
      });
    const selected = shape ? selectionPublication(child, part!.coverage, records)! : null;
    transportValid &&= !!selected?.transportValid;
    for (const petId of need.petIds) for (const [clauseId, clause] of need.selection!.union.entries()) {
      const c = selected?.certificates.find(c => c.subjectId === petId && c.clauseId === clauseId);
      // A lexical miss still cannot certify semantic absence.
      const stream = part?.coverage.effectiveStream?.find(s => s.petId === petId);
      const emptyAllowed = !need.predicates!.length || !!stream && stream.lineageClosed
        && stream.replacementSeedsExhausted && stream.effectiveIds.length === 0;
      const certified = !!c?.certified && (!!c.selectedEventIds.length || emptyAllowed);
      certificates.push({ subjectId: petId, clauseId, selectedEventIds: c?.selectedEventIds || [],
        certified, lineageClosed: c?.lineageClosed ?? false,
        status: certified ? c!.status : "partial",
        blockingReasons: certified ? [] : [...(c?.blockingReasons || []), "independent_selection_not_certified"],
        needId: need.id, sourceSpanId: need.sourceSpanId, clause, temporal: child.temporal });
    }
  }
  const selectedEventIds = [...new Set(certificates.filter(c => c.certified).flatMap(c => c.selectedEventIds))];
  transportValid &&= records.every(row => selectedEventIds.includes(row.id)
    && certificates.some(c => c.certified && c.subjectId === row.petId && c.selectedEventIds.includes(row.id)));
  return { certificates, transportValid, selectedEventIds,
    complete: transportValid && certificates.length > 0 && certificates.every(c => c.certified) };
}
