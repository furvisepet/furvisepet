import { bindReadNeeds, readNeedsSchema, type ReadNeed, type ReadNeedBinding } from "./read-needs.ts";
/** Semantic proposal only. Ownership and access are bound by the server. */
export type ReadPredicate = Readonly<{ kind: "text_any"; terms: readonly string[] }>;
export type EpisodeReadObligation = Readonly<{
  operation: "count" | "membership";
  referent: Readonly<{
    basis: "displayed_list" | "scoped_register";
    topic: "vomiting" | "soft stool" | "breathing" | null;
    ordinal: "first" | "second" | "third" | "fourth" | "fifth" | "sixth" | "seventh" | "eighth" | "last" | "that" | null;
  }> | null;
}>;
export type ReadTicket = Readonly<{
  operation: "read" | "read_since_event" | "compare" | "rank";
  subjects: Readonly<{ petIds: readonly string[] }>;
  temporal: Readonly<{ from: string | null; to: string | null;
    anchor: Readonly<{ concept: string; relation: "from" | "after" | "before" }> | null;
    calendar?: "oldest_year" | null }>;
  predicates: readonly ReadPredicate[];
  /** Proposed episode selection, never membership evidence or a certified count. */
  episode?: EpisodeReadObligation | null;
  needs?: readonly ReadNeed[] | null;
  /** Ranking hints never exclude records or certify semantic completeness. */
  searchHints?: readonly string[] | null;
  outputs: Readonly<{ completeness: "sufficient" | "exhaustive"; ordering: "asc" | "desc"; limit: number | null;
    strategy?: "chronological" | "temporal_endpoints" | "calendar_samples" | "event_candidates" | null }>;
}>;

export const readTicketSchema = {
  type: ["object", "null"], additionalProperties: false,
  required: ["operation", "temporal", "predicates", "outputs", "searchHints", "episode", "needs"],
  properties: {
    needs: readNeedsSchema,
    operation: { type: "string", enum: ["read", "read_since_event", "compare", "rank"] },
    episode: { type: ["object", "null"], additionalProperties: false, required: ["operation", "referent"],
      description: "Null for ordinary records even if legacy fields mention episodes. For actual episode counts or membership, propose the target here. A missing target requires clarification; the server must revalidate membership and stored references.",
      properties: {
        operation: { type: "string", enum: ["count", "membership"] },
        referent: { type: ["object", "null"], additionalProperties: false, required: ["basis", "topic", "ordinal"], properties: {
          basis: { type: "string", enum: ["displayed_list", "scoped_register"] },
          topic: { type: ["string", "null"], enum: ["vomiting", "soft stool", "breathing", null] },
          ordinal: { type: ["string", "null"], enum: ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "last", "that", null] },
        } },
      } },
    temporal: { type: "object", additionalProperties: false, required: ["from", "to", "anchor", "calendar"], properties: {
      calendar: { type: ["string", "null"], enum: ["oldest_year", null], description: "Resolve the oldest accessible calendar year from effective records, never from a guessed year." },
      from: { type: ["string", "null"], description: "ISO instant or null; never invent the date of the anchor." },
      to: { type: ["string", "null"], description: "Exclusive ISO instant or null." },
      anchor: { type: ["object", "null"], additionalProperties: false, required: ["concept", "relation"], properties: {
        concept: { type: "string", minLength: 1, maxLength: 80, description: "Minimal search concept for the event, without pet name or temporal instructions. Every normalized term must occur in the record; terms need not be adjacent. Code resolves the actual dated event. Never guess its date." },
        relation: { type: "string", enum: ["from", "after", "before"] },
      } },
    } },
    searchHints: { type: ["array", "null"], maxItems: 12, items: { type: "string", minLength: 1, maxLength: 80 }, description: "Advisory literal search hints. They rank bounded context but never filter it; only predicates are mandatory." },
    predicates: { type: "array", maxItems: 6, description: "AND across predicates, OR across each predicate's literal terms. Include ordinary synonyms needed for the requested concept; never copy the user's sentence.", items: {
      type: "object", additionalProperties: false, required: ["kind", "terms"], properties: {
        kind: { type: "string", enum: ["text_any"] },
        terms: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 80 } },
      },
    } },
    outputs: { type: "object", additionalProperties: false, required: ["completeness", "ordering", "limit", "strategy"], properties: {
      strategy: { type: ["string", "null"], enum: ["chronological", "temporal_endpoints", "calendar_samples", "event_candidates", null], description: "Chronological boundary, both endpoints per subject, one sample per UTC calendar year, or mandatory event-candidate lookup. Null retains ordinary ordered retrieval." },
      completeness: { type: "string", enum: ["sufficient", "exhaustive"] },
      ordering: { type: "string", enum: ["asc", "desc"] },
      limit: { type: ["integer", "null"], minimum: 1, maximum: 100 },
    } },
  },
};

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join() === expected.sort().join();
const optionalKeys = (v: Record<string, unknown>, required: string[], optional: string[]) =>
  required.every(key => Object.hasOwn(v, key)) && Object.keys(v).every(key => [...required, ...optional].includes(key));
const term = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 80 && !/[\r\n]/.test(v);
const instant = (v: unknown): v is string | null => v === null || typeof v === "string"
  && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));

export function bindReadTicket(value: unknown, petIds: readonly string[], needBindings: readonly ReadNeedBinding[] = []): ReadTicket | null {
  if (value == null) return null;
  const fail = (): never => { throw new Error("ASK_REQUEST_INVALID:read_ticket"); };
  if (!object(value) || !optionalKeys(value, ["operation", "temporal", "predicates", "outputs"], ["searchHints", "episode", "needs"])) return fail();
  const { operation, temporal, predicates, outputs, searchHints, episode } = value;
  if (!["read", "read_since_event", "compare", "rank"].includes(String(operation))
    || !petIds.length || new Set(petIds).size !== petIds.length
    || !object(temporal) || !optionalKeys(temporal, ["from", "to", "anchor"], ["calendar"])
    || temporal.calendar != null && temporal.calendar !== "oldest_year"
    || searchHints != null && (!Array.isArray(searchHints) || searchHints.length > 12 || !searchHints.every(term))
    || !instant(temporal.from) || !instant(temporal.to)
    || temporal.from && temporal.to && Date.parse(temporal.from) >= Date.parse(temporal.to)
    || !Array.isArray(predicates) || predicates.length > 6
    || predicates.some(p => !object(p) || !keys(p, ["kind", "terms"]) || p.kind !== "text_any"
      || !Array.isArray(p.terms) || !p.terms.length || p.terms.length > 12 || !p.terms.every(term))
    || !object(outputs) || !optionalKeys(outputs, ["completeness", "ordering", "limit"], ["strategy"])
    || outputs.strategy != null && !["chronological", "temporal_endpoints", "calendar_samples", "event_candidates"].includes(String(outputs.strategy))
    || !["sufficient", "exhaustive"].includes(String(outputs.completeness))
    || !["asc", "desc"].includes(String(outputs.ordering))
    || outputs.limit !== null && (!Number.isInteger(outputs.limit) || Number(outputs.limit) < 1 || Number(outputs.limit) > 100)) return fail();
  const anchor = temporal.anchor;
  if (anchor !== null && (!object(anchor) || !keys(anchor, ["concept", "relation"]) || !term(anchor.concept)
    || !["from", "after", "before"].includes(String(anchor.relation)))) return fail();
  if ((operation === "read_since_event") !== (anchor !== null)) return fail();
  if (anchor && temporal.calendar || outputs.strategy === "temporal_endpoints" && operation !== "compare"
    || outputs.strategy === "event_candidates" && (!predicates.length || operation !== "read")
    || outputs.strategy === "calendar_samples" && outputs.completeness !== "sufficient") return fail();
  if (episode != null) {
    if (!object(episode) || !keys(episode, ["operation", "referent"])
      || !["count", "membership"].includes(String(episode.operation)) || operation !== "read"
      || temporal.calendar != null || predicates.length || searchHints?.length || outputs.strategy != null
      || outputs.limit !== null) return fail();
    const referent = episode.referent;
    if (referent !== null && (!object(referent) || !keys(referent, ["basis", "topic", "ordinal"])
      || !["displayed_list", "scoped_register"].includes(String(referent.basis))
      || !["vomiting", "soft stool", "breathing", null].includes(referent.topic as string | null)
      || !["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "last", "that", null].includes(referent.ordinal as string | null))) return fail();
    if (episode.operation === "count" && referent && (referent.basis !== "scoped_register" || referent.ordinal !== null)) return fail();
  }
  const needs = bindReadNeeds(value.needs, needBindings, petIds);
  if (needs?.length && (episode || operation === "read_since_event" || temporal.calendar != null
    || predicates.length || searchHints?.length || outputs.strategy != null || outputs.limit !== null)) return fail();
  return Object.freeze({ ...(needs !== undefined ? { needs } : {}), ...(episode !== undefined ? { episode: episode === null ? null : Object.freeze({ ...episode as EpisodeReadObligation,
      referent: (episode as EpisodeReadObligation).referent && Object.freeze({ ...(episode as EpisodeReadObligation).referent }) }) } : {}),
    ...(searchHints !== undefined ? { searchHints: searchHints === null ? null : Object.freeze([...(searchHints as string[])]) } : {}), operation, subjects: Object.freeze({ petIds: Object.freeze([...petIds]) }),
    temporal: Object.freeze({ ...temporal, anchor: anchor && Object.freeze({ ...anchor }) }),
    predicates: Object.freeze(predicates.map(p => Object.freeze({ ...p, terms: Object.freeze([...p.terms]) }))),
    outputs: Object.freeze({ ...outputs }),
  }) as ReadTicket;
}
