import type { ReadTicket } from "../furvise-brain/read-ticket.ts";
import type { ReadSelection } from "../furvise-brain/read-selection.ts";

export type LegacySelectionTranslation = Readonly<{
  ticket: ReadTicket;
  translated: boolean;
  reason: string;
}>;

/** Typed compatibility only: no language, retrieval, facts or authority.
 * Global legacy truncation uses result-level take for multiple subjects.
 * Preserve the original cap separately as transport; never infer per-pet quotas.
 */
export function translateLegacyReadSelection(ticket: ReadTicket, legacyObligations: Readonly<{ evidenceNeedCount: number }> = { evidenceNeedCount: 0 }): LegacySelectionTranslation {
  const unchanged = (reason: string): LegacySelectionTranslation => ({ ticket, translated: false, reason });
  if (ticket.selection) return unchanged("native_selection");
  const strategy = ticket.outputs.strategy;
  if (strategy !== "chronological" && strategy !== "temporal_endpoints")
    return unchanged("strategy_outside_compatibility_cut");
  // A separate legacy evidence obligation is not represented by this ticket.
  // Do not infer that it duplicates the selector or silently drop its authority.
  if (legacyObligations.evidenceNeedCount !== 0) return unchanged("independent_legacy_evidence_obligations");
  if (ticket.needs?.length || ticket.episode) return unchanged("independent_obligation");
  if (ticket.temporal.calendar) return unchanged("calendar_semantics");
  if (strategy === "temporal_endpoints" && ticket.searchHints?.length) return unchanged("legacy_hint_ranking");
  // Chronological hints are advisory only. Keep them for post-selection context;
  // their former relevance ranking is intentionally not a factual selector.
  if (strategy === "temporal_endpoints" && ticket.subjects.petIds.length !== 1) return unchanged("global_limit_not_per_subject");
  if (ticket.outputs.limit === null) {
    if (strategy !== "chronological") return unchanged("unbounded_or_transport_only_limit");
    const { strategy: _legacyStrategy, ...outputs } = ticket.outputs;
    return { translated: true, reason: "equivalent_ordered_result_set",
      ticket: Object.freeze({ ...ticket, outputs: Object.freeze(outputs) }) };
  }
  // Legacy endpoints also transport interior records after reserving boundaries.
  // Only a single subject capped at exactly two cannot include that extra set.
  if (strategy === "temporal_endpoints" && ticket.outputs.limit !== 2)
    return unchanged("endpoint_interior_or_truncation_semantics");
  const resultLevel = strategy === "chronological" && ticket.subjects.petIds.length > 1;
  const clause = (direction: "asc" | "desc", count: number): ReadSelection["union"][number] =>
    Object.freeze({ orderBy: Object.freeze([Object.freeze({ field: "event_at" as const, direction })] as const),
      take: Object.freeze({ count, per: resultLevel ? "result" as const : "group" as const }) });
  const selection: ReadSelection = Object.freeze({ groupBy: resultLevel ? Object.freeze([] as const) : Object.freeze(["subject"] as const),
    union: Object.freeze(strategy === "chronological"
      ? [clause(ticket.outputs.ordering, ticket.outputs.limit)]
      : [clause("asc", 1), clause("desc", 1)]) });
  const { strategy: _legacyStrategy, ...outputs } = ticket.outputs;
  return { translated: true, reason: resultLevel ? "equivalent_result_selection" : "equivalent_single_subject_selection",
    ticket: Object.freeze({ ...ticket, outputs: Object.freeze(outputs), selection }) };
}
