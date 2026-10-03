import { retrieveEffectiveSelection } from "./effective-selection.ts";
import type { ReadNeed } from "./read-needs.ts";
import type { ReadTicket } from "./read-ticket.ts";
import type { ReadCoverage, ReadResult, ReadScope, ReadStore } from "./lungs.ts";
import type { CareEntryRow } from "../supabase.ts";

export const hasIndependentSelections = (ticket: ReadTicket | null | undefined): boolean =>
  !!ticket?.needs?.length && ticket.needs.every(need => !!need.selection && !!need.predicates);

export function independentSelectionTicket(parent: ReadTicket, need: ReadNeed): ReadTicket {
  return { authority: "effective_fact", operation: "read", subjects: { petIds: need.petIds },
    temporal: { from: need.from, to: need.to, anchor: null }, predicates: need.predicates!,
    selection: need.selection, outputs: { ...parent.outputs, ordering: need.ordering } };
}

/** Compose existing correction-aware selectors, without interpreting source quotes.
 * Each need gets a fixed fair share of the existing acquisition/publication budget.
 * Receipts stay attached to the full need identity and its exact typed child ticket.
 */
export async function retrieveIndependentSelections(ticket: ReadTicket, scope: ReadScope, store: ReadStore,
  limits: { pageSize: number; pages: number; records: number; chars: number }): Promise<ReadResult> {
  const coverage: ReadCoverage = { authority: "effective_fact", status: "unavailable",
    reasons: [], matchSemantics: "ticket_text_predicates", asOf: scope.asOf,
    windows: [], anchors: [], continuation: [], independentSelections: [],
    independentAccessWindow: { from: scope.from, to: new Date(Math.min(Date.parse(scope.to), Date.parse(scope.asOf) + 1)).toISOString() } };
  if (!hasIndependentSelections(ticket) || !store.effectiveWindow) {
    coverage.reasons.push("independent_selection_store_unavailable"); return { records: [], coverage };
  }
  const needs = [...ticket.needs!].sort((a, b) => a.sourceSpanId.localeCompare(b.sourceSpanId) || a.id.localeCompare(b.id));
  const budget = Math.floor(limits.pages * limits.pageSize / needs.length);
  const pageSize = Math.min(limits.pageSize, budget);
  const share = { pageSize, pages: Math.floor(budget / pageSize),
    records: Math.floor(limits.records / needs.length), chars: Math.floor(limits.chars / needs.length) };
  const rows = new Map<string, CareEntryRow>();
  for (const need of needs) {
    const child = independentSelectionTicket(ticket, need);
    const result = await retrieveEffectiveSelection(child, scope, store, share);
    coverage.independentSelections!.push({ needId: need.id, sourceSpanId: need.sourceSpanId,
      ticket: child, coverage: result.coverage });
    coverage.windows.push(...result.coverage.windows);
    coverage.continuation.push(...result.coverage.continuation);
    coverage.reasons.push(...result.coverage.reasons);
    for (const row of result.records) {
      const prior = rows.get(row.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(row)) {
        coverage.status = "unavailable"; coverage.reasons = ["independent_selection_source_changed"];
        coverage.independentSelections = []; return { records: [], coverage };
      }
      rows.set(row.id, row);
    }
  }
  const records = [...rows.values()];
  coverage.reasons = [...new Set(coverage.reasons)];
  coverage.status = coverage.independentSelections!.every(part => ["complete", "complete_empty"].includes(part.coverage.status))
    ? records.length ? "complete" : "complete_empty" : "partial";
  return { records, coverage };
}
