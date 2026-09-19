/** Semantic proposal only. Ownership and access are bound by the server. */
export type ReadPredicate = Readonly<{ kind: "text_any"; terms: readonly string[] }>;
export type ReadTicket = Readonly<{
  operation: "read" | "read_since_event" | "compare" | "rank";
  subjects: Readonly<{ petIds: readonly string[] }>;
  temporal: Readonly<{ from: string | null; to: string | null;
    anchor: Readonly<{ concept: string; relation: "from" | "after" | "before" }> | null }>;
  predicates: readonly ReadPredicate[];
  outputs: Readonly<{ completeness: "sufficient" | "exhaustive"; ordering: "asc" | "desc"; limit: number | null }>;
}>;

export const readTicketSchema = {
  type: ["object", "null"], additionalProperties: false,
  required: ["operation", "temporal", "predicates", "outputs"],
  properties: {
    operation: { type: "string", enum: ["read", "read_since_event", "compare", "rank"] },
    temporal: { type: "object", additionalProperties: false, required: ["from", "to", "anchor"], properties: {
      from: { type: ["string", "null"], description: "ISO instant or null; never invent the date of the anchor." },
      to: { type: ["string", "null"], description: "Exclusive ISO instant or null." },
      anchor: { type: ["object", "null"], additionalProperties: false, required: ["concept", "relation"], properties: {
        concept: { type: "string", minLength: 1, maxLength: 80, description: "Minimal literal search concept for the event, without pet name or temporal instructions. Code resolves the actual dated event. Never guess its date." },
        relation: { type: "string", enum: ["from", "after", "before"] },
      } },
    } },
    predicates: { type: "array", maxItems: 6, description: "AND across predicates, OR across each predicate's literal terms. Include ordinary synonyms needed for the requested concept; never copy the user's sentence.", items: {
      type: "object", additionalProperties: false, required: ["kind", "terms"], properties: {
        kind: { type: "string", enum: ["text_any"] },
        terms: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 80 } },
      },
    } },
    outputs: { type: "object", additionalProperties: false, required: ["completeness", "ordering", "limit"], properties: {
      completeness: { type: "string", enum: ["sufficient", "exhaustive"] },
      ordering: { type: "string", enum: ["asc", "desc"] },
      limit: { type: ["integer", "null"], minimum: 1, maximum: 100 },
    } },
  },
};

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join() === expected.sort().join();
const term = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 80 && !/[\r\n]/.test(v);
const instant = (v: unknown): v is string | null => v === null || typeof v === "string"
  && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));

export function bindReadTicket(value: unknown, petIds: readonly string[]): ReadTicket | null {
  if (value == null) return null;
  const fail = (): never => { throw new Error("ASK_REQUEST_INVALID:read_ticket"); };
  if (!object(value) || !keys(value, ["operation", "temporal", "predicates", "outputs"])) return fail();
  const { operation, temporal, predicates, outputs } = value;
  if (!["read", "read_since_event", "compare", "rank"].includes(String(operation))
    || !petIds.length || new Set(petIds).size !== petIds.length
    || !object(temporal) || !keys(temporal, ["from", "to", "anchor"])
    || !instant(temporal.from) || !instant(temporal.to)
    || temporal.from && temporal.to && Date.parse(temporal.from) >= Date.parse(temporal.to)
    || !Array.isArray(predicates) || predicates.length > 6
    || predicates.some(p => !object(p) || !keys(p, ["kind", "terms"]) || p.kind !== "text_any"
      || !Array.isArray(p.terms) || !p.terms.length || p.terms.length > 12 || !p.terms.every(term))
    || !object(outputs) || !keys(outputs, ["completeness", "ordering", "limit"])
    || !["sufficient", "exhaustive"].includes(String(outputs.completeness))
    || !["asc", "desc"].includes(String(outputs.ordering))
    || outputs.limit !== null && (!Number.isInteger(outputs.limit) || Number(outputs.limit) < 1 || Number(outputs.limit) > 100)) return fail();
  const anchor = temporal.anchor;
  if (anchor !== null && (!object(anchor) || !keys(anchor, ["concept", "relation"]) || !term(anchor.concept)
    || !["from", "after", "before"].includes(String(anchor.relation)))) return fail();
  if ((operation === "read_since_event") !== (anchor !== null)) return fail();
  return Object.freeze({ operation, subjects: Object.freeze({ petIds: Object.freeze([...petIds]) }),
    temporal: Object.freeze({ ...temporal, anchor: anchor && Object.freeze({ ...anchor }) }),
    predicates: Object.freeze(predicates.map(p => Object.freeze({ ...p, terms: Object.freeze([...p.terms]) }))),
    outputs: Object.freeze({ ...outputs }),
  }) as ReadTicket;
}
