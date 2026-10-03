import { bindCompositionalReadTicket, type ReadSelection } from "./read-selection.ts";
import type { ReadPredicate } from "./read-ticket.ts";
/** Source identity is bound by the request boundary; organs only receive typed dimensions. */
export type ReadNeedBinding = { id: string; petIds: readonly string[]; sourceSpanId: string };
export type ReadNeed = Readonly<ReadNeedBinding & {
  from: string | null; to: string | null; target: string | null;
  termGroups: readonly (readonly string[])[]; ordering: "asc" | "desc";
  selection?: ReadSelection; predicates?: readonly ReadPredicate[];
}>;
export { readNeedsSchema } from "./read-needs-schema.ts";
export function bindReadNeeds(value: unknown, bindings: readonly ReadNeedBinding[], petIds: readonly string[]): readonly ReadNeed[] | null | undefined {
  if (value == null) return value as null | undefined;
  const fail = (field: string, rule: string): never => { throw new Error("ASK_REQUEST_INVALID:read_needs", { cause: { field, rule } }); };
  if (!Array.isArray(value) || value.length > 4) return fail("needs", "array_max_4");
  const seen = new Set<string>();
  return Object.freeze(value.map((item, index) => {
    const field = `needs[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)
      || !["from,needId,ordering,target,termGroups,to", "from,needId,ordering,predicates,selection,target,termGroups,to"]
        .includes(Object.keys(item).sort().join())) return fail(field, "fields");
    const bound = bindings.find(bound => bound.id === item.needId);
    if (!bound) return fail(`${field}.needId`, "grounded_binding_required");
    if (seen.has(bound.id)) return fail(`${field}.needId`, "unique_need_id");
    if (!bound.sourceSpanId || !bound.petIds.length || bound.petIds.some(id => !petIds.includes(id))) return fail(`${field}.needId`, "grounded_owned_subjects_required");
    seen.add(bound.id);
    for (const key of ["from", "to"]) { const at = item[key]; if (at !== null && (typeof at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(at)
      || !Number.isFinite(Date.parse(at)) || new Date(`${at.slice(0,10)}T00:00:00.000Z`).toISOString().slice(0,10) !== at.slice(0,10))) return fail(`${field}.${key}`, "instant_or_null"); }
    if (item.from && item.to && Date.parse(item.from) >= Date.parse(item.to)) return fail(field, "from_before_to");
    if (!["asc", "desc"].includes(item.ordering)) return fail(`${field}.ordering`, "enum");
    if (!Array.isArray(item.termGroups) || !item.termGroups.length || item.termGroups.length > 4
      || item.termGroups.some((group: unknown) => !Array.isArray(group) || group.length > 6
        || group.some(term => typeof term !== "string" || term.length < 3 || term.length > 32 || !/^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term))))
      return fail(`${field}.termGroups`, "bounded_lexical_groups");
    if (item.target !== null) {
      if (typeof item.target !== "string" || !/^\d{4}-\d{2}(?:-\d{2})?$/.test(item.target) || !item.from || !item.to) return fail(`${field}.target`, "dated_window_required");
      const start = new Date(item.target.length === 7 ? item.target + "-01T00:00:00.000Z" : item.target + "T00:00:00.000Z");
      if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0,item.target.length) !== item.target) return fail(`${field}.target`, "calendar_day_or_month");
      const end = new Date(start); if (item.target.length === 7) end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCDate(end.getUTCDate() + 1);
      if (Date.parse(item.from) !== start.getTime() || Date.parse(item.to) !== end.getTime()) return fail(`${field}.target`, "matches_window");
    }
    const selected = Object.hasOwn(item, "selection") ? bindCompositionalReadTicket({
      authority: "effective_fact", operation: "read",
      temporal: { from: item.from, to: item.to, anchor: null },
      predicates: item.predicates, selection: item.selection,
      outputs: { completeness: "sufficient", ordering: item.ordering, limit: null },
    }, bound.petIds) : null;
    if (selected && selected.selection!.groupBy.length !== 1) return fail(field, "independent_group_selection_required");
    return Object.freeze({ ...(selected ? { selection: selected.selection, predicates: selected.predicates } : {}), ...bound, petIds: Object.freeze([...bound.petIds]), from: item.from, to: item.to, target: item.target,
      termGroups: Object.freeze(item.termGroups.map((group: string[]) => Object.freeze([...group]))), ordering: item.ordering }) as ReadNeed;
  }));
}
