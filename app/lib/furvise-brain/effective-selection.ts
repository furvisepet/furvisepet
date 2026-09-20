import { isResultSelection, selectReadResult, frontierCovers, certifyReadResult, resultGroups, type ResultFrontier } from "./result-selection.ts";
import type { CareEntryRow } from "../supabase.ts";
import type { ReadTicket } from "./read-ticket.ts";
import type { ReadCoverage, ReadResult, ReadScope, ReadSourceLineage, ReadStore } from "./lungs.ts";
import { eventOrder, selectReadGroups } from "./read-selection.ts";

export type EffectiveWindowInput = { petId: string; rows: CareEntryRow[]; from: string; to: string };
/** Store-owned proof, never a model field. Closed seeds include all stored
 * replacement authors for the subject, independently of predicates or dates.
 * Closed lineage includes connected edges and care-root tombstones.
 */
export type EffectiveWindowResult = {
  records: CareEntryRow[]; lineageClosed: boolean; replacementSeedsExhausted: boolean;
  sourceLineage: ReadSourceLineage[]; reasons: string[]; graphCalls: number; lineageRows: number;
};
const normalized = (s: string) => s.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const matching = (ticket: ReadTicket, row: CareEntryRow, from: number, to: number) =>
  Date.parse(row.occurred_at) >= from && Date.parse(row.occurred_at) < to
  && ticket.predicates.every(p => p.terms.some(term =>
    (" " + normalized((row.title || "") + " " + (row.note || "")) + " ").includes(" " + normalized(term) + " ")));

export async function retrieveEffectiveSelection(ticket: ReadTicket, scope: ReadScope, store: ReadStore,
  limits: { pageSize: number; pages: number; records: number; chars: number }): Promise<ReadResult> {
  const from = scope.from, to = new Date(Math.min(Date.parse(scope.to), Date.parse(scope.asOf) + 1)).toISOString();
  const selectedFrom = Math.max(Date.parse(from), ticket.temporal.from ? Date.parse(ticket.temporal.from) : -Infinity);
  const selectedTo = Math.min(Date.parse(to), ticket.temporal.to ? Date.parse(ticket.temporal.to) : Infinity);
  const resultLevel = isResultSelection(ticket);
  const pets = [...ticket.subjects.petIds].sort();
  const empty = (): EffectiveWindowResult => ({ records: [], lineageClosed: false, replacementSeedsExhausted: false,
    sourceLineage: [], reasons: [], graphCalls: 0, lineageRows: 0 });
  const subjects = new Map(pets.map(petId => [petId, { raw: new Map<string, CareEntryRow>(), proof: empty(), failed: false }]));
  const directions = [...new Set(ticket.selection!.union.map(c => c.orderBy[0].direction))].sort();
  const tasks = directions.flatMap(direction => pets.map(petId => ({ petId, direction, offset: 0,
    exhausted: false, done: false, acquired: false, last: null as CareEntryRow | null, seen: new Set<string>(), size: Math.min(limits.pageSize,
      Math.max(2, 1 + Math.max(...ticket.selection!.union.filter(c => c.orderBy[0].direction === direction).map(c => c.take.count)))) })));
  const selected = (petId: string) => selectReadGroups(ticket,
    subjects.get(petId)!.proof.records.filter(row => matching(ticket, row, selectedFrom, selectedTo)))
    .find(group => group.petId === petId)!;
  const certified = (petId: string, direction: "asc" | "desc", count: number, ids: string[]) => {
    const subject = subjects.get(petId)!;
    if (subject.failed || !subject.proof.lineageClosed || !subject.proof.replacementSeedsExhausted || subject.proof.sourceLineage.length) return false;
    if (tasks.some(task => task.petId === petId && task.exhausted)) return true;
    const task = tasks.find(task => task.petId === petId && task.direction === direction)!;
    const last = subject.proof.records.find(row => row.id === ids.at(-1));
    // Strict event-time frontier also protects ties across raw/claim ID spaces.
    // All replacements are already in the closed overlay; unseen ordinary rows
    // cannot outrank this cutoff in the requested semantic direction.
    return ids.length === count && !!last && !!task.last
      && (direction === "desc" ? Date.parse(last.occurred_at) > Date.parse(task.last.occurred_at)
        : Date.parse(last.occurred_at) < Date.parse(task.last.occurred_at));
  };
  const matchedRows = () => [...subjects.values()].flatMap(subject =>
    subject.proof.records.filter(row => matching(ticket, row, selectedFrom, selectedTo)));
  const frontier = (petId: string, direction: "asc" | "desc"): ResultFrontier => {
    const subject = subjects.get(petId)!, task = tasks.find(t => t.petId === petId && t.direction === direction)!;
    return { petId, direction, acquired: task.acquired, exhausted: tasks.some(t => t.petId === petId && t.exhausted),
      frontier: task.last ? { id: task.last.id, eventAt: task.last.occurred_at, createdAt: task.last.created_at } : null,
      lineageClosed: subject.proof.lineageClosed, replacementSeedsExhausted: subject.proof.replacementSeedsExhausted,
      failed: subject.failed || !!subject.proof.sourceLineage.length,
      reasons: [...subject.proof.reasons, ...(subject.proof.sourceLineage.length ? ["unresolved_source_lineage"] : [])] };
  };
  const updateResultFrontiers = () => {
    const selections = selectReadResult(ticket, matchedRows());
    for (const task of tasks) task.done = selections.filter(c => c.direction === task.direction)
      .every(c => frontierCovers(frontier(task.petId, task.direction), c.rows.at(-1), c.rows.length === c.count));
  };
  let budget = limits.pages * limits.pageSize;
  while (budget > 0) {
    const active = tasks.filter(task => !task.done && !subjects.get(task.petId)!.failed);
    if (!active.length || budget < active.length) break;
    const share = Math.floor(budget / active.length);
    for (const task of active) {
      const subject = subjects.get(task.petId)!;
      if (task.done || subject.failed) continue;
      const limit = Math.min(share, task.size);
      budget -= limit;
      try {
        const rows = await store.page({ petId: task.petId, from, to, offset: task.offset, limit, ordering: task.direction });
        if (rows.length > limit || new Set(rows.map(row => row.id)).size !== rows.length || rows.some((row, i) =>
          row.user_id !== scope.userId || row.pet_profile_id !== task.petId || row.deleted_at
          || !Number.isFinite(Date.parse(row.occurred_at)) || !Number.isFinite(Date.parse(row.created_at))
          || Date.parse(row.occurred_at) < Date.parse(from) || Date.parse(row.occurred_at) >= Date.parse(to)
          || task.seen.has(row.id) || i > 0 && (task.direction === "asc" ? eventOrder(rows[i - 1], row) : eventOrder(row, rows[i - 1])) >= 0))
          throw new Error("invalid_directional_page");
        if (task.last && rows.length && (task.direction === "asc" ? eventOrder(task.last, rows[0]) : eventOrder(rows[0], task.last)) >= 0)
          throw new Error("page_changed_during_read");
        for (const row of rows) {
          const prior = subject.raw.get(row.id);
          if (prior && JSON.stringify(prior) !== JSON.stringify(row)) throw new Error("page_changed_during_read");
          subject.raw.set(row.id, row); task.seen.add(row.id);
        }
        task.acquired = true;
        task.offset += rows.length; task.last = rows.at(-1) ?? task.last; task.exhausted = rows.length < limit;
        const proof = await store.effectiveWindow!({ petId: task.petId, rows: [...subject.raw.values()], from, to });
        if (proof.records.some(row => row.user_id !== scope.userId || row.pet_profile_id !== task.petId || row.deleted_at
          || !Number.isFinite(Date.parse(row.occurred_at)) || !Number.isFinite(Date.parse(row.created_at))
          || Date.parse(row.occurred_at) < Date.parse(from) || Date.parse(row.occurred_at) >= Date.parse(to)))
          throw new Error("invalid_effective_scope");
        subject.proof = !proof.lineageClosed || !proof.replacementSeedsExhausted ? { ...proof, records: [] } : proof;
        if (!proof.lineageClosed || !proof.replacementSeedsExhausted || proof.sourceLineage.length) {
          subject.failed = true; continue;
        }
        if (resultLevel) updateResultFrontiers();
        else {
          const group = selected(task.petId);
          for (const same of tasks.filter(t => t.petId === task.petId))
            same.done = group.clauses.filter(c => c.direction === same.direction).every(c => certified(task.petId, c.direction, c.count, c.ids));
        }
        task.size = Math.min(limits.pageSize, task.size * 2);
      } catch (error) {
        subject.failed = true; subject.proof = { ...empty(), reasons: [error instanceof Error ? error.message : "effective_read_failed"] };
      }
    }
  }
  const coverage: ReadCoverage = { status: "partial", reasons: [], matchSemantics: "ticket_text_predicates", asOf: scope.asOf,
    anchors: [], windows: [], continuation: [], groups: [], effectiveStream: [] };
  const matched: CareEntryRow[] = [], requested: CareEntryRow[] = [];
  for (const petId of pets) {
    const subject = subjects.get(petId)!;
    const exhausted = tasks.some(task => task.petId === petId && task.exhausted);
    if (!resultLevel) {
      const group = selected(petId);
      const clauses = group.clauses.map(c => ({ ...c, certified: certified(petId, c.direction, c.count, c.ids) }));
      coverage.groups!.push({ ...group, clauses, retainedIds: [], exhausted, blocked: clauses.some(c => !c.certified),
        status: "partial", selectionStatus: "partial", reasons: [...subject.proof.reasons] });
    }
    coverage.windows.push({ petId, from: new Date(selectedFrom).toISOString(), to: new Date(selectedTo).toISOString(), relation: null });
    if (!exhausted) coverage.continuation.push({ petId, offset: Math.max(...tasks.filter(t => t.petId === petId).map(t => t.offset)) });
    matched.push(...subject.proof.records.filter(row => matching(ticket, row, selectedFrom, selectedTo)));
    coverage.effectiveStream!.push({ petId, acquiredIds: [...subject.raw.keys()], effectiveIds: subject.proof.records.map(row => row.id),
      certifiedSelectedIds: [], lineageClosed: subject.proof.lineageClosed, replacementSeedsExhausted: subject.proof.replacementSeedsExhausted,
      graphCalls: subject.proof.graphCalls, lineageRows: subject.proof.lineageRows });
    if (subject.proof.sourceLineage.length) coverage.sourceLineage = [...(coverage.sourceLineage || []), ...subject.proof.sourceLineage];
  }
  const byId = new Map(matched.map(row => [row.id, row]));
  if (resultLevel) requested.push(...new Map(selectReadResult(ticket, matched).flatMap(c => c.rows).map(r => [r.id, r])).values());
  else {
    const width = Math.max(0, ...coverage.groups!.map(g => g.selectedIds.length));
    for (let i = 0; i < width; i++) for (const group of coverage.groups!)
      if (group.selectedIds[i]) requested.push(byId.get(group.selectedIds[i])!);
  }
  coverage.reservedIds = requested.map(row => row.id);
  const records: CareEntryRow[] = [];
  let chars = 0;
  for (const row of requested) {
    if (records.length >= Math.min(limits.records, ticket.outputs.limit ?? Infinity)) break;
    const size = (row.note?.length || 0) + (row.title?.length || 0);
    if (chars + size > limits.chars) continue;
    records.push(row); chars += size;
  }
  const retained = new Set(records.map(row => row.id));
  if (resultLevel) {
    coverage.resultSelection = certifyReadResult(ticket, matched, tasks.map(t => frontier(t.petId, t.direction)), retained);
    coverage.groups = resultGroups(ticket, matched, coverage.resultSelection);
  }
  for (const group of coverage.groups!) {
    group.retainedIds = group.selectedIds.filter(id => retained.has(id));
    if (group.retainedIds.length !== group.selectedIds.length) {
      group.blocked = true; group.reasons.push("required_selection_not_retained");
    }
    const certifiedIds = group.clauses.filter(c => c.certified).flatMap(c => c.ids).filter(id => retained.has(id));
    coverage.effectiveStream!.find(p => p.petId === group.petId)!.certifiedSelectedIds = [...new Set(certifiedIds)];
    group.selectionStatus = group.blocked ? "partial" : group.selectedIds.length ? "complete" : "complete_empty";
    const omitted = matched.some(row => row.pet_profile_id === group.petId && !retained.has(row.id));
    group.status = group.blocked || !group.exhausted || omitted || ticket.searchHints?.length ? "partial"
      : group.selectedIds.length ? "complete" : "complete_empty";
    if (group.blocked) group.reasons.push("effective_selection_uncertified");
    if (!group.exhausted) group.reasons.push("subject_scan_not_exhausted");
    coverage.reasons.push(...group.reasons);
  }
  coverage.selection = { scannedIds: coverage.effectiveStream!.flatMap(p => p.acquiredIds), matchedIds: matched.map(row => row.id),
    retainedIds: [...retained], omittedIds: matched.filter(row => !retained.has(row.id)).map(row => row.id) };
  coverage.reasons = [...new Set(coverage.reasons)];
  if (coverage.groups!.every(g => g.status === "complete" || g.status === "complete_empty"))
    coverage.status = records.length ? "complete" : "complete_empty";
  const presentationOrder = resultLevel && ticket.selection!.union.length === 1
    ? ticket.selection!.union[0].orderBy[0].direction : ticket.outputs.ordering;
  records.sort((a, b) => presentationOrder === "asc" ? eventOrder(a, b) : eventOrder(b, a));
  return { records, coverage };
}
