import { bindReadTicket, type ReadTicket } from "./read-ticket.ts";
import type { CareEntryRow } from "../supabase.ts";
import type { ReadScope, ReadStore } from "./lungs.ts";

/** Typed selection language. Result-level take is server-only; the existing
 * provider schema continues to expose grouped selections only. */
export type ReadSelection = Readonly<{
  groupBy: readonly ["subject"] | readonly [];
  /** Set union of independently ordered selections; duplicate event IDs collapse. */
  union: readonly Readonly<{
    orderBy: readonly [Readonly<{ field: "event_at"; direction: "asc" | "desc" }>];
    take: Readonly<{ count: number; per: "group" | "result" }>;
  }>[];
}>;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).sort().join() === [...names].sort().join();

/** Deterministic semantic binding; does not expand provider emission. */
export function bindCompositionalReadTicket(value: unknown, petIds: readonly string[]): ReadTicket {
  const fail = (field: string, rule: string): never => {
    throw new Error("ASK_REQUEST_INVALID:read_ticket", { cause: { field, rule } });
  };
  if (!object(value)) return fail("readTicket", "object");
  const { selection, ...legacy } = value;
  const ticket = bindReadTicket(legacy, petIds);
  if (!ticket) return fail("readTicket", "required");
  if (!object(selection) || !keys(selection, ["groupBy", "union"])) return fail("selection", "fields");
  if (!Array.isArray(selection.groupBy) || selection.groupBy.length > 1 || selection.groupBy.length === 1 && selection.groupBy[0] !== "subject")
    return fail("selection.groupBy", "subject");
  if (!Array.isArray(selection.union) || !selection.union.length || selection.union.length > 8)
    return fail("selection.union", "array_1_to_8");
  const per = selection.groupBy.length ? "group" : "result";
  const clauses = selection.union.map((clause, i) => {
    if (!object(clause) || !keys(clause, ["orderBy", "take"])) return fail(`selection.union[${i}]`, "fields");
    if (!Array.isArray(clause.orderBy) || clause.orderBy.length !== 1 || !object(clause.orderBy[0])
      || !keys(clause.orderBy[0], ["field", "direction"]) || clause.orderBy[0].field !== "event_at"
      || !["asc", "desc"].includes(String(clause.orderBy[0].direction))) return fail(`selection.union[${i}].orderBy`, "event_at_direction");
    if (!object(clause.take) || !keys(clause.take, ["count", "per"]) || clause.take.per !== per
      || !Number.isInteger(clause.take.count) || Number(clause.take.count) < 1 || Number(clause.take.count) > 100)
      return fail(`selection.union[${i}].take`, per === "group" ? "group_count_1_to_100" : "result_count_1_to_100");
    return Object.freeze({ orderBy: Object.freeze([Object.freeze({ ...clause.orderBy[0] })]),
      take: Object.freeze({ ...clause.take }) });
  });
  if (ticket.needs?.length || ticket.episode || ticket.outputs.strategy != null)
    return fail("selection", "incompatible_with_legacy_selector");
  // Semantic anchors are resolved by the temporal phase, not by the binder.
  // Calendar selection compatibility remains outside this cut.
  if (ticket.temporal.calendar) return fail("selection", "unresolved_window");
  return Object.freeze({ ...ticket, selection: Object.freeze({ groupBy: Object.freeze([...selection.groupBy]),
    union: Object.freeze(clauses) }) }) as ReadTicket;
}

export const eventOrder = (a: CareEntryRow, b: CareEntryRow) =>
  Date.parse(a.occurred_at) - Date.parse(b.occurred_at)
  || Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);

export function selectReadGroups(ticket: ReadTicket, rows: CareEntryRow[]) {
  return [...ticket.subjects.petIds].sort().map(petId => {
    const group = rows.filter(row => row.pet_profile_id === petId);
    const clauses = ticket.selection!.union.map(clause => {
      const direction = clause.orderBy[0].direction;
      const selected = [...group].sort((a, b) => direction === "asc" ? eventOrder(a, b) : eventOrder(b, a))
        .slice(0, clause.take.count);
      return { direction, count: clause.take.count, ids: selected.map(row => row.id) };
    });
    return { petId, clauses, selectedIds: [...new Set(clauses.flatMap(clause => clause.ids))] };
  });
}

/** Fair acquisition uses the existing total row envelope (pages * pageSize).
 * Each subject gets one page before any gets another. Canonical subject order
 * makes bounded results invariant to proposal order. Bidirectional tasks share
 * each subject's allocation. Raw boundaries are candidates, never certificates:
 * an unseen correction may change a record's predicate or event time.
 */
export async function acquireReadCandidates(ticket: ReadTicket, scope: ReadScope, store: ReadStore,
  from: number, to: number, limits: { pages: number; pageSize: number }) {
  const directions = ticket.selection
    ? [...new Set(ticket.selection.union.map(clause => clause.orderBy[0].direction))].sort()
    : ["asc" as const];
  const subjects = [...ticket.subjects.petIds].sort();
  const tasks = directions.flatMap(ordering => subjects.map(petId => ({
    petId, ordering, offset: 0, exhausted: false, failed: false, reason: "",
    seen: new Set<string>(), last: null as CareEntryRow | null,
  })));
  const candidates = new Map<string, CareEntryRow>();
  let remaining = limits.pages * limits.pageSize;
  // Refuse an unrepresentable cohort before spending the budget on a prefix.
  if (tasks.length > remaining) return { candidates: [], continuation: subjects.map(petId => ({ petId, offset: 0 })),
    failures: subjects.map(petId => ({ petId, reason: "subject_opportunity_budget" })) };
  while (remaining > 0) {
    const active = tasks.filter(task => !task.exhausted && !task.failed);
    if (!active.length) break;
    const share = Math.min(limits.pageSize, Math.floor(remaining / active.length));
    if (!share) break;
    for (const task of active) {
      if (task.exhausted) continue;
      remaining -= share;
      try {
        const rows = await store.page({ petId: task.petId, from: new Date(from).toISOString(),
          to: new Date(to).toISOString(), offset: task.offset, limit: share,
          ...(ticket.selection ? { ordering: task.ordering } : {}) });
        if (rows.length > share || new Set(rows.map(row => row.id)).size !== rows.length
          || rows.some(row => row.user_id !== scope.userId || row.pet_profile_id !== task.petId || row.deleted_at
            || !Number.isFinite(Date.parse(row.occurred_at)) || Date.parse(row.occurred_at) < from || Date.parse(row.occurred_at) >= to))
          throw new Error("invalid_page_scope");
        if (ticket.selection && rows.some((row, i) => i > 0
          && (task.ordering === "asc" ? eventOrder(rows[i - 1], row) : eventOrder(row, rows[i - 1])) > 0))
          throw new Error("invalid_page_order");
        if (rows.some(row => task.seen.has(row.id))) throw new Error("page_changed_during_read");
        if (ticket.selection && task.last && rows.length
          && (task.ordering === "asc" ? eventOrder(task.last, rows[0]) : eventOrder(rows[0], task.last)) >= 0)
          throw new Error("page_changed_during_read");
        for (const row of rows) {
          const prior = candidates.get(row.id);
          if (prior && JSON.stringify(prior) !== JSON.stringify(row)) throw new Error("page_changed_during_read");
          // Opposite directions may legitimately encounter the same row.
          if (prior && directions.length === 1) throw new Error("page_changed_during_read");
        }
        for (const row of rows) { candidates.set(row.id, row); task.seen.add(row.id); }
        task.last = rows.at(-1) ?? task.last;
        task.offset += rows.length;
        task.exhausted = rows.length < share;
        // Exhausting either direction covers this subject's whole raw window.
        if (task.exhausted) tasks.filter(other => other.petId === task.petId).forEach(other => { other.exhausted = true; });
      } catch (error) {
        task.failed = true;
        task.reason = error instanceof Error ? error.message : "read_failed";
      }
    }
  }
  const failures = tasks.filter(task => task.failed).map(task => ({ petId: task.petId, reason: task.reason }));
  return { candidates: [...candidates.values()],
    continuation: subjects.filter(petId => tasks.some(task => task.petId === petId && (!task.exhausted || task.failed)))
      .map(petId => ({ petId, offset: Math.max(...tasks.filter(task => task.petId === petId).map(task => task.offset)) })),
    failures };
}
