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
  eventCandidateIds?: string[];
  sourceLineage?: ReadSourceLineage[];
  reservedIds?: string[];
  needs?: Array<{ petId: string; needId: string; candidateIds: string[]; exhausted: boolean; status: "complete" | "partial" | "unavailable"; reason?: string }>;
  targets?: Array<{ petId: string; day: string; candidateIds: string[]; retainedIds: string[]; exhausted: boolean; status: "complete" | "partial" | "unavailable" }>;
};
export type ReadResult = { records: CareEntryRow[]; coverage: ReadCoverage };
export type ReadScope = { userId: string; ownedPetIds: readonly string[]; from: string; to: string; asOf: string };
export type ReadStore = {
  page(input: { petId: string; from: string; to: string; offset: number; limit: number }): Promise<CareEntryRow[]>;
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
  // Anchor discovery must precede applying the requested interval. A correction
  // may also move an event across that boundary, so resolve lineage first.
  const candidates: CareEntryRow[] = [];
  let pageCount = 0;
  try {
    for (const petId of ticket.subjects.petIds) {
      let offset = 0, exhausted = false;
      while (pageCount < LUNGS_LIMITS.pages) {
        const rows = await store.page({ petId, from: new Date(accessibleFrom).toISOString(),
          to: new Date(accessibleTo).toISOString(), offset, limit: LUNGS_LIMITS.pageSize });
        pageCount++;
        if (rows.length > LUNGS_LIMITS.pageSize || rows.some(row => row.user_id !== scope.userId || row.pet_profile_id !== petId
          || row.deleted_at || !Number.isFinite(Date.parse(row.occurred_at))
          || Date.parse(row.occurred_at) < accessibleFrom || Date.parse(row.occurred_at) >= accessibleTo)) {
          return result("unavailable", "invalid_page_scope");
        }
        if (rows.some(row => candidates.some(prior => prior.id === row.id))) return result("partial", "page_changed_during_read");
        candidates.push(...rows);
        offset += rows.length;
        if (rows.length < LUNGS_LIMITS.pageSize) { exhausted = true; break; }
      }
      if (!exhausted) coverage.continuation.push({ petId, offset });
    }
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
    const selected: CareEntryRow[] = [];
    for (const petId of ticket.subjects.petIds) {
      let from = Math.max(accessibleFrom, ticket.temporal.from ? Date.parse(ticket.temporal.from) : -Infinity);
      let to = Math.min(accessibleTo, ticket.temporal.to ? Date.parse(ticket.temporal.to) : Infinity);
      let anchorTime: number | null = null;
      const anchor = ticket.temporal.anchor;
      if (anchor) {
        const anchors = rows.filter(row => row.pet_profile_id === petId && matchesAnchor(row, anchor.concept));
        if (anchors.some(row => uncertainIds.has(row.id))) return result("partial", "anchor_lineage_unresolved");
        // A partial scan cannot certify which anchor is intended. Ambiguity
        // also fails closed; no earliest/latest choice is inferred from prose.
        if (coverage.continuation.length) return result("partial", "anchor_search_not_exhausted");
        if (anchors.length !== 1) return result("anchor_missing", anchors.length ? "anchor_ambiguous" : "anchor_not_found");
        anchorTime = Date.parse(anchors[0].occurred_at);
        coverage.anchors.push({ petId, eventId: anchors[0].id, eventAt: anchors[0].occurred_at });
        if (anchor.relation === "before") to = Math.min(to, anchorTime);
        else from = Math.max(from, anchorTime);
      }
      if (ticket.temporal.calendar === "oldest_year") {
        // The calendar is resolved from effective, accessible event time, not
        // from the access start year or from search words.
        if (coverage.continuation.length) return result("partial", "calendar_search_not_exhausted");
        const first = rows.filter(row => row.pet_profile_id === petId
          && Date.parse(row.occurred_at) >= from && Date.parse(row.occurred_at) < to).sort(chronological)[0];
        if (first) {
          const year = new Date(first.occurred_at).getUTCFullYear();
          from = Math.max(from, Date.UTC(year, 0, 1));
          to = Math.min(to, Date.UTC(year + 1, 0, 1));
        }
      }
      coverage.windows.push({ petId, from: new Date(from).toISOString(), to: new Date(to).toISOString(), relation: anchor?.relation || null });
      selected.push(...rows.filter(row => row.pet_profile_id === petId && Date.parse(row.occurred_at) >= from
        && Date.parse(row.occurred_at) < to
        && !(anchor?.relation === "after" && Date.parse(row.occurred_at) === anchorTime)
        && ticket.predicates.every(predicate => predicate.terms.some(term => matches(row, term)))));
    }
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
    if (ticket.outputs.limit !== null) requested = requested.slice(0, ticket.outputs.limit);
    const records: CareEntryRow[] = [];
    let chars = 0;
    for (const row of requested) {
      const size = (row.note?.length || 0) + (row.title?.length || 0);
      if (records.length >= LUNGS_LIMITS.records) break;
      if (chars + size > LUNGS_LIMITS.chars) { if (strategy) continue; break; }
      chars += size; records.push(row);
    }
    records.sort(order);
    const retained = new Set(records.map(row => row.id));
    coverage.selection = { scannedIds: candidates.map(row => row.id), matchedIds: selected.map(row => row.id),
      retainedIds: [...retained], omittedIds: selected.filter(row => !retained.has(row.id)).map(row => row.id) };
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
    if (coverage.continuation.length || records.length !== requested.length || limited)
      return result("partial", "read_budget_or_limit", records);
    if (hints.length || uncertainIds.size) return result("partial", undefined, records);
    return result(records.length ? "complete" : "complete_empty", undefined, records);
  } catch {
    return result("unavailable", "read_failed");
  }
}
