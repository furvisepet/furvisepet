/** Source identity is bound by the request boundary; organs only receive typed dimensions. */
export type ReadNeedBinding = { id: string; petIds: readonly string[]; sourceSpanId: string };
export type ReadNeed = Readonly<ReadNeedBinding & {
  from: string | null; to: string | null; target: string | null;
  termGroups: readonly (readonly string[])[]; ordering: "asc" | "desc";
}>;
export const readNeedsSchema = { type: ["array", "null"], maxItems: 4, items: {
  type: "object", additionalProperties: false, required: ["needId", "from", "to", "target", "termGroups", "ordering"], properties: {
    needId: { type: "string", description: "ID of the grounded evidenceNeeds entry, e.g. need:0. Never invent a source or subject." },
    from: { type: ["string", "null"] }, to: { type: ["string", "null"] },
    target: { type: ["string", "null"], description: "Explicit requested ISO day or month matching this window; null otherwise." },
    termGroups: { type: "array", minItems: 1, maxItems: 4, description: "Separate advisory database searches. OR within each group. Separate rare event aliases from common topic terms so they receive an independent bounded probe. An empty group requests dated context without lexical filtering.",
      items: { type: "array", maxItems: 6, items: { type: "string", minLength: 3, maxLength: 32, pattern: "^[A-Za-z][A-Za-z -]*[A-Za-z]$" } } },
    ordering: { type: "string", enum: ["asc", "desc"] },
  },
} };
export function bindReadNeeds(value: unknown, bindings: readonly ReadNeedBinding[], petIds: readonly string[]): readonly ReadNeed[] | null | undefined {
  if (value == null) return value as null | undefined;
  const fail = (): never => { throw new Error("ASK_REQUEST_INVALID:read_needs"); };
  if (!Array.isArray(value) || value.length > 4) return fail();
  const seen = new Set<string>();
  return Object.freeze(value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)
      || Object.keys(item).sort().join() !== "from,needId,ordering,target,termGroups,to") return fail();
    const bound = bindings.find(bound => bound.id === item.needId);
    if (!bound || seen.has(bound.id) || !bound.sourceSpanId || !bound.petIds.length || bound.petIds.some(id => !petIds.includes(id))) return fail();
    seen.add(bound.id);
    for (const at of [item.from, item.to]) if (at !== null && (typeof at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(at)
      || !Number.isFinite(Date.parse(at)) || new Date(`${at.slice(0,10)}T00:00:00.000Z`).toISOString().slice(0,10) !== at.slice(0,10))) return fail();
    if (item.from && item.to && Date.parse(item.from) >= Date.parse(item.to)
      || !["asc", "desc"].includes(item.ordering) || !Array.isArray(item.termGroups) || !item.termGroups.length || item.termGroups.length > 4
      || item.termGroups.some((group: unknown) => !Array.isArray(group) || group.length > 6
        || group.some(term => typeof term !== "string" || term.length < 3 || term.length > 32 || !/^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term)))) return fail();
    if (item.target !== null) {
      if (typeof item.target !== "string" || !/^\d{4}-\d{2}(?:-\d{2})?$/.test(item.target) || !item.from || !item.to) return fail();
      const start = new Date(item.target.length === 7 ? item.target + "-01T00:00:00.000Z" : item.target + "T00:00:00.000Z");
      if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0,item.target.length) !== item.target) return fail();
      const end = new Date(start); if (item.target.length === 7) end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCDate(end.getUTCDate() + 1);
      if (Date.parse(item.from) !== start.getTime() || Date.parse(item.to) !== end.getTime()) return fail();
    }
    return Object.freeze({ ...bound, petIds: Object.freeze([...bound.petIds]), from: item.from, to: item.to, target: item.target,
      termGroups: Object.freeze(item.termGroups.map((group: string[]) => Object.freeze([...group]))), ordering: item.ordering }) as ReadNeed;
  }));
}
