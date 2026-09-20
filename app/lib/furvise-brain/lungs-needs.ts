import type { CareEntryRow } from "../supabase.ts";
import type { ReadTicket } from "./read-ticket.ts";
import type { ReadCoverage, ReadResult, ReadScope, ReadStore } from "./lungs.ts";

/** Bounded database probes for source-bound needs. No question or lexical
 * reinterpretation enters here: database hits remain candidates, not facts. */
export async function retrieveNeedTicket(ticket: ReadTicket, scope: ReadScope, store: ReadStore,
  limits: { pages: number; pageSize: number; records: number; chars: number }): Promise<ReadResult> {
  const coverage: ReadCoverage = { status: "partial", reasons: ["bounded_need_candidates_not_semantic_completeness"],
    matchSemantics: "ticket_text_predicates", asOf: scope.asOf, anchors: [], windows: [], continuation: [], needs: [], targets: [] };
  const from = Math.max(Date.parse(scope.from), ticket.temporal.from ? Date.parse(ticket.temporal.from) : -Infinity);
  const to = Math.min(Date.parse(scope.to), Date.parse(scope.asOf) + 1, ticket.temporal.to ? Date.parse(ticket.temporal.to) : Infinity);
  const groups = ticket.needs!.flatMap(need => need.petIds.map(petId => ({ need, petId,
    from: Math.max(from, need.from ? Date.parse(need.from) : -Infinity), to: Math.min(to, need.to ? Date.parse(need.to) : Infinity),
    receipt: { petId, needId: need.id, candidateIds: [] as string[], exhausted: true, status: "complete" as "complete" | "partial" | "unavailable", reason: undefined as string | undefined } })));
  for (const group of groups) if (group.need.from && group.from > Date.parse(group.need.from)
    || group.need.to && group.to < Date.parse(group.need.to)) {
    group.receipt.exhausted = false; group.receipt.status = "partial"; group.receipt.reason = "need_window_clipped";
  }
  const tasks = Array.from({ length: Math.max(...groups.map(group => group.need.termGroups.length)) }, (_, index) =>
    groups.flatMap(group => group.need.termGroups[index] ? [{ group, terms: group.need.termGroups[index] }] : [])).flat();
  const candidates = new Map<string, CareEntryRow>();
  const hitGroups: Array<{ ids: string[]; petId: string; from: number; to: number }> = [];
  let pages = 0, inconsistent = false;
  for (const { group, terms } of tasks) {
    const receipt = group.receipt;
    if (group.from >= group.to) { receipt.status = "unavailable"; receipt.exhausted = false; receipt.reason = "need_window_outside_scope"; continue; }
    const available = limits.pageSize - candidates.size;
    if (pages >= limits.pages || available <= 0) { if (receipt.status !== "unavailable") receipt.status = "partial"; receipt.exhausted = false; receipt.reason ??= "need_query_budget"; continue; }
    const limit = Math.max(1, Math.floor(available / Math.min(tasks.length - pages, limits.pages - pages)));
    pages++;
    try {
      if (!store.needPage) throw new Error("need_query_unavailable");
      const rows = await store.needPage({ petId: group.petId, from: new Date(group.from).toISOString(), to: new Date(group.to).toISOString(),
        terms, ordering: group.need.ordering, limit });
      if (rows.length > limit || rows.some(row => row.user_id !== scope.userId || row.pet_profile_id !== group.petId || row.deleted_at
        || !Number.isFinite(Date.parse(row.occurred_at)) || Date.parse(row.occurred_at) < group.from || Date.parse(row.occurred_at) >= group.to)
        || new Set(rows.map(row => row.id)).size !== rows.length) { inconsistent = true; throw new Error("invalid_need_query_scope"); }
      if (rows.some(row => candidates.has(row.id) && JSON.stringify(candidates.get(row.id)) !== JSON.stringify(row))) {
        inconsistent = true; throw new Error("need_source_changed");
      }
      // Never rerun lexical matching against returned note text: the database
      // may match aliases/stemming. Only ownership, time, and lineage certify state.
      const ids = rows.map(row => row.id);
      receipt.candidateIds = [...new Set([...receipt.candidateIds, ...ids])];
      if (rows.length === limit) { receipt.exhausted = false; if (receipt.status !== "unavailable") receipt.status = "partial"; }
      hitGroups.push({ ids, petId: group.petId, from: group.from, to: group.to });
      for (const row of rows) candidates.set(row.id, row);
    } catch {
      receipt.exhausted = false; receipt.status = "unavailable"; receipt.reason = "need_query_unavailable_or_changed";
    }
  }
  coverage.needs = groups.map(group => group.receipt);
  coverage.windows = [...new Set(groups.map(group => group.petId))].map(petId => ({ petId, from: new Date(from).toISOString(), to: new Date(to).toISOString(), relation: null }));
  const fail = (reason: string): ReadResult => {
    coverage.status = "unavailable"; coverage.reasons.push(reason);
    coverage.needs!.forEach(need => { need.status = "unavailable"; need.exhausted = false; need.reason = reason; });
    return { records: [], coverage };
  };
  if (inconsistent) return fail("need_source_scope_or_revision_changed");
  let effective;
  try { effective = await store.effective([...candidates.values()]); } catch { return fail("effective_truth_unavailable"); }
  if (!effective.reliable) return fail("effective_truth_unavailable");
  const effectiveById = new Map(effective.records.filter(row => row.user_id === scope.userId && ticket.subjects.petIds.includes(row.pet_profile_id) && !row.deleted_at).map(row => [row.id, row]));
  const selectedGroups = hitGroups.map(group => group.ids.flatMap(id => {
    const row = effectiveById.get(id);
    return row && row.pet_profile_id === group.petId && Date.parse(row.occurred_at) >= group.from && Date.parse(row.occurred_at) < group.to ? [row] : [];
  }));
  // Reserve a representative of every actual probe before any group's interior
  // consumes the output budget. A common alias cannot starve a rare alias.
  const ordered = [...new Map([...selectedGroups.flatMap(group => group.slice(0, 1)), ...selectedGroups.flat()].map(row => [row.id, row])).values()];
  const records: CareEntryRow[] = []; let chars = 0;
  for (const row of ordered) {
    const size = (row.note?.length || 0) + (row.title?.length || 0);
    if (records.length >= limits.records) break;
    if (chars + size > limits.chars) continue;
    records.push(row); chars += size;
  }
  records.sort((a,b) => (ticket.outputs.ordering === "asc" ? 1 : -1) * (Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.id.localeCompare(b.id)));
  const retained = new Set(records.map(row => row.id));
  coverage.reservedIds = [...new Set(selectedGroups.flatMap(group => group.slice(0, 1).map(row => row.id)))];
  coverage.selection = { scannedIds: [...candidates.keys()], matchedIds: ordered.map(row => row.id), retainedIds: [...retained], omittedIds: ordered.filter(row => !retained.has(row.id)).map(row => row.id) };
  if (coverage.selection.omittedIds.length) coverage.reasons.push("effective_evidence_budget");
  coverage.targets = groups.filter(group => group.need.target).map(group => ({ petId: group.petId, day: group.need.target!,
    candidateIds: group.receipt.candidateIds, retainedIds: group.receipt.candidateIds.filter(id => retained.has(id)),
    exhausted: group.receipt.exhausted, status: group.receipt.status }));
  // Need probes report their own exhaustion. A pet-level prefix offset cannot
  // resume a lexical/windowed probe, so do not invent a continuation cursor.
  if (!records.length && coverage.needs.every(need => need.status === "unavailable")) coverage.status = "unavailable";
  return { records, coverage };
}
