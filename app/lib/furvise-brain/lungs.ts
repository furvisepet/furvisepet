import { retrieveEffectiveSelection, type EffectiveWindowInput, type EffectiveWindowResult } from "./effective-selection.ts";
import { acquireReadCandidates, selectReadGroups } from "./read-selection.ts";
import { requiresTemporalHistory, resolveReadWindows, withinReadWindow } from "./read-temporal.ts";
import { retrieveNeedTicket } from "./lungs-needs.ts";
import type { CareEntryRow } from "../supabase.ts";
import type { ReadTicket } from "./read-ticket.ts";

export type ReadSourceLineage = { eventId: string; status: "unlinked" | "uncertain"; authority: "attributed_report" };
export type ReadCoverageStatus = "complete" | "complete_empty" | "partial" | "anchor_missing" | "unavailable";
export type ReadCoverage = {
  status: ReadCoverageStatus;
  reasons: string[];
  /** Complete means exhausted accessible records under the ticket's predicates. */
  matchSemantics: "ticket_text_predicates";
  asOf: string;
  anchors: Array<{ petId: string; eventId: string; eventAt: string }>;
  windows: Array<{ petId: string; from: string; to: string; relation: "from" | "after" | "before" | null }>;
  continuation: Array<{ petId: string; offset: number }>;
  selection?: { scannedIds: string[]; matchedIds: string[]; retainedIds: string[]; omittedIds: string[] };
  periods?: Array<{ petId: string; from: string; to: string; candidateIds: string[]; exhausted: boolean }>;
  chronology?: Array<{ petId: string; boundaryIds: string[]; blocked: boolean }>;
  endpointPairs?: Array<{ petId: string; earliestIds: string[]; latestIds: string[]; blocked: boolean }>;
  groups?: Array<{ petId: string; clauses: Array<{ direction: "asc" | "desc"; count: number; ids: string[]; certified?: boolean }>;
    selectionStatus?: "complete" | "complete_empty" | "partial";
    selectedIds: string[]; retainedIds: string[]; exhausted: boolean; blocked: boolean; status: ReadCoverageStatus; reasons: string[] }>;
  effectiveStream?: Array<{ petId: string; acquiredIds: string[]; effectiveIds: string[]; certifiedSelectedIds: string[];
    lineageClosed: boolean; replacementSeedsExhausted: boolean; graphCalls: number; lineageRows: number }>;
  eventCandidateIds?: string[];
  sourceLineage?: ReadSourceLineage[];
  reservedIds?: string[];
  needs?: Array<{ petId: string; needId: string; candidateIds: string[]; exhausted: boolean; status: "complete" | "partial" | "unavailable"; reason?: string }>;
  targets?: Array<{ petId: string; day: string; candidateIds: string[]; retainedIds: string[]; exhausted: boolean; status: "complete" | "partial" | "unavailable" }>;
};
export type ReadResult = { records: CareEntryRow[]; coverage: ReadCoverage };
export type ReadScope = { userId: string; ownedPetIds: readonly string[]; from: string; to: string; asOf: string };
export type ReadStore = {
  effectiveWindow?(input: EffectiveWindowInput): Promise<EffectiveWindowResult>;
  page(input: { petId: string; from: string; to: string; offset: number; limit: number; ordering?: "asc" | "desc" }): Promise<CareEntryRow[]>;
  needPage?(input: { petId: string; from: string; to: string; terms: readonly string[]; ordering: "asc" | "desc"; limit: number }): Promise<CareEntryRow[]>;
  effective(rows: CareEntryRow[]): Promise<{ records: CareEntryRow[]; reliable: boolean; sourceLineage?: ReadSourceLineage[] }>;
};
export const LUNGS_LIMITS = { pageSize: 64, pages: 4, records: 32, chars: 18000 } as const;
const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const matches = (row: CareEntryRow, concept: string) => {
  const needle = normalized(concept);
  return !!needle && (` ${normalized(`${row.title || ""} ${row.note || ""}`)} `).includes(` ${needle} `);
};
// An anchor concept is a conjunction of literal normalized terms, not an
// exact quotation. This accepts intervening words without a domain word list.
const matchesAnchor = (row: CareEntryRow, concept: string) => {
  const terms = normalized(concept).split(" ").filter(Boolean);
  return terms.length > 0 && terms.every(term => matches(row, term));
};
const chronological = (a: CareEntryRow, b: CareEntryRow) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at)
  || Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);

/** No question, dialogue, pet names or model client crosses this boundary. */
export async function retrieveReadTicket(ticket: ReadTicket, scope: ReadScope, store: ReadStore): Promise<ReadResult> {
  const coverage: ReadCoverage = { status: "unavailable", reasons: [], matchSemantics: "ticket_text_predicates",
    asOf: scope.asOf, anchors: [], windows: [], continuation: [] };
  const result = (status: ReadCoverageStatus, reason?: string, records: CareEntryRow[] = []): ReadResult => {
    coverage.status = status;
    if (reason) coverage.reasons.push(reason);
    return { records, coverage };
  };
  if (!ticket.subjects.petIds.length || ticket.subjects.petIds.some(id => !scope.ownedPetIds.includes(id))) {
    return result("unavailable", "subject_not_authorized");
  }
  const accessibleFrom = Date.parse(scope.from), accessibleTo = Math.min(Date.parse(scope.to), Date.parse(scope.asOf) + 1);
  if (![accessibleFrom, accessibleTo].every(Number.isFinite) || accessibleFrom >= accessibleTo) return result("unavailable", "invalid_access_window");
  if (ticket.needs?.length) return retrieveNeedTicket(ticket, scope, store, LUNGS_LIMITS);
  // Directional acquisition may run immediately only for concrete windows.
  // Ledger-dependent temporal expressions first use the bounded effective-history
  // resolution phase below, shared by every downstream selector.
  if (!requiresTemporalHistory(ticket.temporal) && ticket.selection && store.effectiveWindow)
    return retrieveEffectiveSelection(ticket, scope, store, LUNGS_LIMITS);
  // Anchor discovery must precede applying the requested interval. A correction
  // may also move an event across that boundary, so resolve lineage first.
  try {
    const acquired = await acquireReadCandidates(ticket, scope, store, accessibleFrom, accessibleTo, LUNGS_LIMITS);
    const candidates = acquired.candidates;
    coverage.continuation = acquired.continuation;
    if (acquired.failures.length && !ticket.selection) {
      const reason = acquired.failures[0].reason;
      return result(reason === "page_changed_during_read" ? "partial" : "unavailable", reason);
    }
    coverage.reasons.push(...new Set(acquired.failures.map(failure => failure.reason)));
    const effective = await store.effective(candidates);
    if (!effective.reliable) return result("unavailable", "effective_truth_unavailable");
    // A validated saved report may have an unresolved correction link. Keep
    // the report, but never upgrade it into a verified effective fact or edge.
    const uncertainIds = new Set(effective.sourceLineage?.map(source => source.eventId) || []);
    if (uncertainIds.size) {
      coverage.sourceLineage = effective.sourceLineage;
      coverage.reasons.push("unresolved_source_lineage");
    }
    const rows = effective.records.filter(row => row.user_id === scope.userId && ticket.subjects.petIds.includes(row.pet_profile_id)
      && !row.deleted_at && Date.parse(row.occurred_at) >= accessibleFrom && Date.parse(row.occurred_at) < accessibleTo);
    const temporal = resolveReadWindows(ticket, rows, accessibleFrom, accessibleTo,
      coverage.continuation, uncertainIds, matchesAnchor);
    if (!temporal.ok) return result(temporal.status, temporal.reason);
    coverage.anchors = temporal.anchors;
    coverage.windows = temporal.windows.map(({ excludedTime: _excludedTime, ...window }) => window);
    // Every selector consumes the same resolved effective interval. In particular,
    // take(N) never runs globally and then loses rows to an anchor filter.
    const selected = temporal.windows.flatMap(window => rows.filter(row => withinReadWindow(row, window)
      && ticket.predicates.every(predicate => predicate.terms.some(term => matches(row, term)))));
    const order = (a: CareEntryRow, b: CareEntryRow) => ticket.outputs.ordering === "asc" ? chronological(a, b) : chronological(b, a);
    selected.sort(order);
    const strategy = ticket.outputs.strategy;
    const hints = ticket.searchHints || [];
    const score = (row: CareEntryRow) => hints.filter(hint => matches(row, hint)).length;
    let requested = [...selected];
    if (hints.length) {
      // Hint misses preserve bounded context. This cannot certify that the
      // requested semantic concept never occurred, even after a full scan.
      requested.sort((a, b) => score(b) - score(a) || order(a, b));
      coverage.reasons.push("bounded_period_context_not_semantic_completeness");
    }
    if (strategy === "temporal_endpoints") {
      coverage.endpointPairs = ticket.subjects.petIds.map(petId => {
        const subject = selected.filter(row => row.pet_profile_id === petId).sort(chronological);
        return { petId, earliestIds: subject.slice(0, 1).map(row => row.id), latestIds: subject.slice(-1).map(row => row.id),
          blocked: coverage.continuation.some(cursor => cursor.petId === petId) || !subject.length
            || subject.some(row => uncertainIds.has(row.id)) };
      });
      const endpoints = new Set(coverage.endpointPairs.flatMap(pair => [...pair.earliestIds, ...pair.latestIds]));
      // Reserve both ends for every subject before allocating interior rows.
      requested = [...requested.filter(row => endpoints.has(row.id)), ...requested.filter(row => !endpoints.has(row.id))];
    }
    if (strategy === "calendar_samples") {
      const groups = new Map<string, CareEntryRow[]>();
      for (const row of selected) {
        const key = `${row.pet_profile_id}:${new Date(row.occurred_at).getUTCFullYear()}`;
        groups.set(key, [...(groups.get(key) || []), row]);
      }
      coverage.periods = [...groups.values()].map(group => {
        const petId = group[0].pet_profile_id, year = new Date(group[0].occurred_at).getUTCFullYear();
        const window = coverage.windows.find(window => window.petId === petId)!;
        return { petId, from: new Date(Math.max(Date.parse(window.from), Date.UTC(year, 0, 1))).toISOString(),
          to: new Date(Math.min(Date.parse(window.to), Date.UTC(year + 1, 0, 1))).toISOString(),
          candidateIds: group.map(row => row.id), exhausted: !coverage.continuation.some(cursor => cursor.petId === petId) };
      });
      requested = [...groups.values()].map(group => group[0]).sort(order);
    }
    if (ticket.selection) {
      coverage.groups = selectReadGroups(ticket, selected).map(group => ({ ...group,
        retainedIds: [], exhausted: !coverage.continuation.some(cursor => cursor.petId === group.petId),
        blocked: false, status: "partial", reasons: [] }));
      // Round-robin required selections across subjects, before any optional
      // context. Hint ranking cannot override semantic group order/take.
      const byId = new Map(selected.map(row => [row.id, row]));
      requested = [];
      const width = Math.max(0, ...coverage.groups.map(group => group.selectedIds.length));
      for (let i = 0; i < width; i++) for (const group of coverage.groups) {
        const id = group.selectedIds[i];
        if (id) requested.push(byId.get(id)!);
      }
      coverage.reservedIds = requested.map(row => row.id);
    }
    // Legacy limit keeps its existing meaning; with selection it is only a
    // transport cap. It never changes the per-group semantic obligations.
    if (ticket.outputs.limit !== null) requested = requested.slice(0, ticket.outputs.limit);
    const records: CareEntryRow[] = [];
    let chars = 0;
    for (const row of requested) {
      const size = (row.note?.length || 0) + (row.title?.length || 0);
      if (records.length >= LUNGS_LIMITS.records) break;
      if (chars + size > LUNGS_LIMITS.chars) { if (strategy || ticket.selection) continue; break; }
      chars += size; records.push(row);
    }
    records.sort(order);
    const retained = new Set(records.map(row => row.id));
    coverage.selection = { scannedIds: candidates.map(row => row.id), matchedIds: selected.map(row => row.id),
      retainedIds: [...retained], omittedIds: selected.filter(row => !retained.has(row.id)).map(row => row.id) };
    if (coverage.groups) {
      for (const group of coverage.groups) {
        group.retainedIds = group.selectedIds.filter(id => retained.has(id));
        const failed = acquired.failures.filter(failure => failure.petId === group.petId);
        const uncertain = selected.some(row => row.pet_profile_id === group.petId && uncertainIds.has(row.id));
        const omitted = group.selectedIds.some(id => !retained.has(id));
        if (!group.exhausted) group.reasons.push("subject_scan_not_exhausted");
        if (uncertain) group.reasons.push("unresolved_source_lineage");
        if (omitted) group.reasons.push("required_selection_not_retained");
        group.reasons.push(...failed.map(failure => failure.reason));
        group.blocked = !group.exhausted || uncertain || omitted || !!failed.length;
        // Complete still means exhaustive accessible matching evidence, not
        // merely satisfying take(N). Selecting a subset keeps partial coverage.
        const subset = selected.some(row => row.pet_profile_id === group.petId && !retained.has(row.id));
        if (subset) group.reasons.push("selected_subset");
        if (hints.length) group.reasons.push("bounded_period_context_not_semantic_completeness");
        group.status = failed.length ? "unavailable" : group.blocked || subset || hints.length ? "partial"
          : group.selectedIds.length ? "complete" : "complete_empty";
      }
    }
    if (coverage.endpointPairs) {
      coverage.endpointPairs.forEach(pair => { pair.blocked ||= [...pair.earliestIds, ...pair.latestIds].some(id => !retained.has(id)); });
      if (coverage.selection.omittedIds.length) coverage.reasons.push("bidirectional_endpoint_subset");
    }
    if (records.length !== requested.length) coverage.reasons.push("effective_evidence_budget");
    if (strategy === "chronological") coverage.chronology = ticket.subjects.petIds.map(petId => ({ petId,
      boundaryIds: selected.filter(row => row.pet_profile_id === petId).slice(0, 1).map(row => row.id),
      blocked: coverage.continuation.some(cursor => cursor.petId === petId)
        || selected.some(row => row.pet_profile_id === petId && uncertainIds.has(row.id))
        || !selected.some(row => row.pet_profile_id === petId)
        || selected.filter(row => row.pet_profile_id === petId).slice(0, 1).some(row => !retained.has(row.id)) }));
    if (strategy === "event_candidates") coverage.eventCandidateIds = records.map(row => row.id);
    const limited = requested.length !== selected.length && (ticket.outputs.completeness === "exhaustive" || strategy === "calendar_samples" || strategy === "temporal_endpoints");
    if (coverage.groups?.some(group => group.status === "partial" || group.status === "unavailable"))
      return result("partial", "read_budget_or_limit", records);
    if (coverage.continuation.length || records.length !== requested.length || limited)
      return result("partial", "read_budget_or_limit", records);
    if (hints.length || uncertainIds.size) return result("partial", undefined, records);
    return result(records.length ? "complete" : "complete_empty", undefined, records);
  } catch {
    return result("unavailable", "read_failed");
  }
}
