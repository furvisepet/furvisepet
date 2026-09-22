import type { ReadTicket } from "../furvise-brain/read-ticket.ts";
import type { ReadSelection } from "../furvise-brain/read-selection.ts";

// Existing provider fields, inspected before ticket binding discards legacy intent.
// This is transient compatibility input, never a new plan or authority receipt.
export type LegacyReadIntent = Readonly<{
  selection: string; operation: string; quantity: string | null;
  referenceTurnCount: number; requirementCount: number;
  hasProfileFields: boolean; hasProjection: boolean; hasRecordSelection: boolean;
  temporalScope: string | null;
}>;

export type LegacySelectionTranslation = Readonly<{
  ticket: ReadTicket;
  translated: boolean;
  reason: string;
}>;

/** Typed compatibility only: no language, retrieval, facts or authority.
 * Global legacy truncation uses result-level take for multiple subjects.
 * Preserve the original cap separately as transport; never infer per-pet quotas.
 */
export function translateLegacyReadSelection(ticket: ReadTicket, legacyObligations: Readonly<{ evidenceNeedCount: number; readIntent?: LegacyReadIntent }> = { evidenceNeedCount: 0 }): LegacySelectionTranslation {
  const unchanged = (reason: string): LegacySelectionTranslation => ({ ticket, translated: false, reason });
  if (ticket.selection) return unchanged("native_selection");
  const strategy = ticket.outputs.strategy;
  if (strategy !== "chronological" && strategy !== "temporal_endpoints" && strategy !== "event_candidates")
    return unchanged("strategy_outside_compatibility_cut");
  if (strategy === "event_candidates") {
    const intent = legacyObligations.readIntent;
    if (!intent) return unchanged("strategy_outside_compatibility_cut");
    if (intent.selection === "reference" || intent.referenceTurnCount || ticket.temporal.anchor)
      return unchanged("event_reference_requires_resolution");
    if (intent.operation !== "recall" || intent.quantity !== "records" || intent.requirementCount
      || intent.hasProfileFields || intent.hasProjection || intent.hasRecordSelection
      || intent.temporalScope != null && intent.temporalScope !== "historical")
      return unchanged("event_search_independent_semantics");
    if (ticket.operation !== "read" || !ticket.predicates.length)
      return unchanged("event_search_requires_typed_predicates");
    // No downstream language interpretation: only exact existing typed terms
    // can prove a hint is redundant with the factual predicate vocabulary.
    const terms = new Set(ticket.predicates.flatMap(predicate => [...predicate.terms]));
    if (ticket.searchHints?.some(hint => !terms.has(hint)))
      return unchanged("event_search_hint_semantics_not_represented");
    if (ticket.outputs.limit === null) {
      if (ticket.outputs.completeness !== "exhaustive" || !["period", "summary"].includes(intent.selection))
        return unchanged("event_search_cardinality_unresolved");
    } else if (intent.selection !== (ticket.outputs.ordering === "asc" ? "earliest" : "latest"))
      return unchanged("event_search_cardinality_unresolved");
  }
  // A separate legacy evidence obligation is not represented by this ticket.
  // Do not infer that it duplicates the selector or silently drop its authority.
  if (legacyObligations.evidenceNeedCount !== 0) return unchanged("independent_legacy_evidence_obligations");
  if (ticket.needs?.length || ticket.episode) return unchanged("independent_obligation");
  if (ticket.temporal.calendar) return unchanged("calendar_semantics");
  const intent = legacyObligations.readIntent;
  // The typed envelope still carries a finite endpoint when a legacy ticket
  // has no transport cap. Consume it before that envelope is discarded.
  // An explicit cap keeps the existing global top-N compatibility semantics.
  if (strategy === "chronological" && ticket.outputs.limit === null
    && intent?.operation === "recall" && ["records", "measurement"].includes(intent.quantity || "")
    && ["earliest", "latest"].includes(intent.selection)
    && !intent.hasProfileFields && !intent.hasProjection && !intent.hasRecordSelection
    && (intent.temporalScope == null || intent.temporalScope === "historical")) {
    const direction = intent.selection === "earliest" ? "asc" as const : "desc" as const;
    const selection: ReadSelection = Object.freeze({ groupBy: Object.freeze(["subject"] as const),
      union: Object.freeze([Object.freeze({
        orderBy: Object.freeze([Object.freeze({ field: "event_at" as const, direction })] as const),
        take: Object.freeze({ count: 1, per: "group" as const }),
      })]) });
    const { strategy: _legacyStrategy, ...outputs } = ticket.outputs;
    return { translated: true, reason: "typed_finite_endpoint",
      ticket: Object.freeze({ ...ticket, outputs: Object.freeze(outputs), selection }) };
  }
  if (strategy === "temporal_endpoints" && ticket.subjects.petIds.length > 1) {
    const intent = legacyObligations.readIntent;
    // A legacy compare label alone cannot distinguish records from derivation.
    // Consume only the existing typed envelope, before that intent is discarded.
    if (!intent || intent.operation !== "recall" || intent.quantity !== "records"
      || intent.requirementCount || intent.referenceTurnCount || intent.hasProfileFields
      || intent.hasProjection || intent.hasRecordSelection
      || intent.temporalScope != null && intent.temporalScope !== "historical")
      return unchanged("boundary_facts_not_established");
    if (!ticket.predicates.length || ticket.temporal.anchor)
      return unchanged("boundary_scope_not_explicit");
    const directions: readonly ("asc" | "desc")[] = intent.selection === "earliest" ? ["asc"]
      : intent.selection === "latest" ? ["desc"] : intent.selection === "summary" ? ["asc", "desc"] : [];
    if (!directions.length) return unchanged("boundary_cardinality_unresolved");
    // No data-dependent guess that singleton histories will make a small cap fit.
    // Spare capacity is transport only; it never requests factual interior fill.
    if (ticket.outputs.limit !== null && ticket.outputs.limit < directions.length * ticket.subjects.petIds.length)
      return unchanged("boundary_transport_capacity_conflict");
    const selection: ReadSelection = Object.freeze({ groupBy: Object.freeze(["subject"] as const),
      union: Object.freeze(directions.map(direction => Object.freeze({
        orderBy: Object.freeze([Object.freeze({ field: "event_at" as const, direction })] as const),
        take: Object.freeze({ count: 1, per: "group" as const }),
      }))) });
    const { strategy: _legacyStrategy, ...outputs } = ticket.outputs;
    return { translated: true, reason: "pure_grouped_boundary_facts",
      ticket: Object.freeze({ ...ticket, operation: "read", outputs: Object.freeze(outputs), selection }) };
  }
  if (strategy === "temporal_endpoints" && ticket.searchHints?.length) return unchanged("legacy_hint_ranking");
  // Chronological hints are advisory only. Keep them for post-selection context;
  // their former relevance ranking is intentionally not a factual selector.
  if (strategy === "temporal_endpoints" && ticket.subjects.petIds.length !== 1) return unchanged("global_limit_not_per_subject");
  if (ticket.outputs.limit === null) {
    if (strategy === "temporal_endpoints") return unchanged("unbounded_or_transport_only_limit");
    const { strategy: _legacyStrategy, ...outputs } = ticket.outputs;
    return { translated: true, reason: "equivalent_ordered_result_set",
      ticket: Object.freeze({ ...ticket, outputs: Object.freeze(outputs) }) };
  }
  // Legacy endpoints also transport interior records after reserving boundaries.
  // Only a single subject capped at exactly two cannot include that extra set.
  if (strategy === "temporal_endpoints" && ticket.outputs.limit !== 2)
    return unchanged("endpoint_interior_or_truncation_semantics");
  const resultLevel = strategy !== "temporal_endpoints" && ticket.subjects.petIds.length > 1;
  const clause = (direction: "asc" | "desc", count: number): ReadSelection["union"][number] =>
    Object.freeze({ orderBy: Object.freeze([Object.freeze({ field: "event_at" as const, direction })] as const),
      take: Object.freeze({ count, per: resultLevel ? "result" as const : "group" as const }) });
  const selection: ReadSelection = Object.freeze({ groupBy: resultLevel ? Object.freeze([] as const) : Object.freeze(["subject"] as const),
    union: Object.freeze(strategy !== "temporal_endpoints"
      ? [clause(ticket.outputs.ordering, ticket.outputs.limit)]
      : [clause("asc", 1), clause("desc", 1)]) });
  const { strategy: _legacyStrategy, ...outputs } = ticket.outputs;
  return { translated: true, reason: resultLevel ? "equivalent_result_selection" : "equivalent_single_subject_selection",
    ticket: Object.freeze({ ...ticket, outputs: Object.freeze(outputs), selection }) };
}
