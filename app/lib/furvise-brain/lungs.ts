import type { CareEntryRow } from "../supabase.ts";
import type { ReadTicket } from "./read-ticket.ts";

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
};
export type ReadResult = { records: CareEntryRow[]; coverage: ReadCoverage };
type ReadScope = { userId: string; ownedPetIds: readonly string[]; from: string; to: string; asOf: string };
type ReadStore = {
  page(input: { petId: string; from: string; to: string; offset: number; limit: number }): Promise<CareEntryRow[]>;
  effective(rows: CareEntryRow[]): Promise<{ records: CareEntryRow[]; reliable: boolean }>;
};
export const LUNGS_LIMITS = { pageSize: 64, pages: 4, records: 32, chars: 18000 } as const;
const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const matches = (row: CareEntryRow, concept: string) => {
  const needle = normalized(concept);
  return !!needle && (` ${normalized(`${row.title || ""} ${row.note || ""}`)} `).includes(` ${needle} `);
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
    const rows = effective.records.filter(row => row.user_id === scope.userId && ticket.subjects.petIds.includes(row.pet_profile_id)
      && !row.deleted_at && Date.parse(row.occurred_at) >= accessibleFrom && Date.parse(row.occurred_at) < accessibleTo);
    const selected: CareEntryRow[] = [];
    for (const petId of ticket.subjects.petIds) {
      let from = Math.max(accessibleFrom, ticket.temporal.from ? Date.parse(ticket.temporal.from) : -Infinity);
      let to = Math.min(accessibleTo, ticket.temporal.to ? Date.parse(ticket.temporal.to) : Infinity);
      let anchorTime: number | null = null;
      const anchor = ticket.temporal.anchor;
      if (anchor) {
        const anchors = rows.filter(row => row.pet_profile_id === petId && matches(row, anchor.concept));
        // A partial scan cannot certify which anchor is intended. Ambiguity
        // also fails closed; no earliest/latest choice is inferred from prose.
        if (coverage.continuation.length) return result("partial", "anchor_search_not_exhausted");
        if (anchors.length !== 1) return result("anchor_missing", anchors.length ? "anchor_ambiguous" : "anchor_not_found");
        anchorTime = Date.parse(anchors[0].occurred_at);
        coverage.anchors.push({ petId, eventId: anchors[0].id, eventAt: anchors[0].occurred_at });
        if (anchor.relation === "before") to = Math.min(to, anchorTime);
        else from = Math.max(from, anchorTime);
      }
      coverage.windows.push({ petId, from: new Date(from).toISOString(), to: new Date(to).toISOString(), relation: anchor?.relation || null });
      selected.push(...rows.filter(row => row.pet_profile_id === petId && Date.parse(row.occurred_at) >= from
        && Date.parse(row.occurred_at) < to
        && !(anchor?.relation === "after" && Date.parse(row.occurred_at) === anchorTime)
        && ticket.predicates.every(predicate => predicate.terms.some(term => matches(row, term)))));
    }
    selected.sort((a, b) => ticket.outputs.ordering === "asc" ? chronological(a, b) : chronological(b, a));
    const requested = ticket.outputs.limit === null ? selected : selected.slice(0, ticket.outputs.limit);
    const records: CareEntryRow[] = [];
    let chars = 0;
    for (const row of requested) {
      const size = (row.note?.length || 0) + (row.title?.length || 0);
      if (records.length >= LUNGS_LIMITS.records || chars + size > LUNGS_LIMITS.chars) break;
      chars += size; records.push(row);
    }
    const limited = requested.length !== selected.length && ticket.outputs.completeness === "exhaustive";
    if (coverage.continuation.length || records.length !== requested.length || limited) return result("partial", "read_budget_or_limit", records);
    return result(records.length ? "complete" : "complete_empty", undefined, records);
  } catch {
    return result("unavailable", "read_failed");
  }
}
