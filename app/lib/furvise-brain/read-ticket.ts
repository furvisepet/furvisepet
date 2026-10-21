import { units } from "./calculation-units.ts";
import { readNeedsSchema } from "./read-needs-schema.ts";
import { completeInstantSchema, isCompleteInstant } from "./complete-instant.ts";
import { bindAttributedReportContexts, attributedReportContextsSchema, type AttributedReportContext } from "./attributed-report-context.ts";
import type { ReadSelection } from "./read-selection.ts";
import { bindReadNeeds, type ReadNeed, type ReadNeedBinding } from "./read-needs.ts";
/** Semantic proposal only. Ownership and access are bound by the server. */
export type TextReadPredicate=Readonly<{kind:"text_any";terms:readonly string[]}>;
export type ReadSourceReference=Readonly<{sourceTurnId:string;sourceId:string}>;
export type ReadPredicate=TextReadPredicate|Readonly<{kind:"measurement";unit:string;predicateIndexes:readonly number[]}>|Readonly<{kind:"source_ref";sources:readonly ReadSourceReference[]}>;
export type EpisodeReadObligation = Readonly<{
  operation: "count" | "membership";
  referent: Readonly<{
    basis: "displayed_list" | "scoped_register";
    topic: "vomiting" | "soft stool" | "breathing" | null;
    ordinal: "first" | "second" | "third" | "fourth" | "fifth" | "sixth" | "seventh" | "eighth" | "last" | "that" | null;
  }> | null;
}>;
export type ReadAuthority = "effective_fact" | "stored_report";
export const readAuthority = (value: { authority?: ReadAuthority }) => value.authority ?? "effective_fact";
export type ReadTicket = Readonly<{
  /** Requested proposition, not a certificate. Legacy omission requires effective facts. */
  authority?: ReadAuthority;
  attributedContexts?: readonly AttributedReportContext[] | null;
  operation: "read" | "read_since_event" | "compare" | "rank";
  subjectScope?: "selected" | "named" | "conversation" | "account";
  subjects: Readonly<{ petIds: readonly string[] }>;
  temporal: Readonly<{ from: string | null; to: string | null;
    anchor: Readonly<{ concept: string; relation: "from" | "after" | "before" }> | null;
    calendar?: "oldest_year" | null }>;
  predicates: readonly ReadPredicate[];
  /** Generic semantic selection; authority remains server-bound. */
  selection?: ReadSelection;
  /** Proposed episode selection, never membership evidence or a certified count. */
  episode?: EpisodeReadObligation | null;
  needs?: readonly ReadNeed[] | null;
  /** Ranking hints never exclude records or certify semantic completeness. */
  searchHints?: readonly string[] | null;
  outputs: Readonly<{ completeness: "sufficient" | "exhaustive"; ordering: "asc" | "desc"; limit: number | null;
    strategy?: "chronological" | "temporal_endpoints" | "calendar_samples" | "event_candidates" | null }>;
}>;

const temporalInstantSchema = { ...completeInstantSchema, type: ["string", "null"] };

export const readTicketSchema = {
  type: ["object", "null"], additionalProperties: false,
  required: ["authority", "operation", "subjectScope", "temporal", "predicates", "outputs", "searchHints", "episode", "needs", "selection"],
  properties: {
    attributedContexts: attributedReportContextsSchema,
    authority: { type: "string", enum: ["effective_fact", "stored_report"], description: "Requested proposition: stored_report only for exact stored wording, attributed reports or a timeline of statements; it never establishes current/corrected truth or supersession. effective_fact for current, settled, corrected, definitive latest values and every historical calculation. Do not downgrade an effective-fact request because history might conflict. Stored reports support ordinary reads and read_since_event relative to a uniquely resolved saved report, with optional ordered selection. A recorded/reported value relative to a recorded event is still stored_report, not certified effective truth. Its anchor and selected records require independent owned source-version, correction-closure and exhaustive-boundary proofs. Never change an effective-fact request to get a report answer. No calendar, episode, probes, calculations or legacy strategy." },
    subjectScope: { type: "string", enum: ["selected", "named", "conversation", "account"], description: "Requested subject selection. Selected for an unnamed standalone read; conversation for USER-established referents; named for explicit pets; account only for a requested cohort or identity lookup. Overrides legacy scope. The server binds owned IDs; this never grants writes." },
    needs: readNeedsSchema,
    selection: {
      type: ["object", "null"], additionalProperties: false, required: ["groupBy", "union"],
      description: "Independent ordered selection per subject, or null for an ordinary/legacy read. Does not widen subject scope. Compatible with temporal.anchor under the explicit requested authority: effective_fact requires the owned effective event; stored_report requires a uniquely resolved owned saved report and closed source/correction proof. Resolve its temporal boundary before selection. Do not invent dates or choose an ambiguous event. Incompatible with needs, episode, outputs.strategy and calendar selectors.",
      properties: {
        groupBy: { type: "array", minItems: 1, maxItems: 1, items: { type: "string", enum: ["subject"] } },
        union: { type: "array", minItems: 1, maxItems: 8, description: "Set union of independently ordered selections; repeated event IDs collapse.",
          items: { type: "object", additionalProperties: false, required: ["orderBy", "take"], properties: {
            orderBy: { type: "array", minItems: 1, maxItems: 1, items: {
              type: "object", additionalProperties: false, required: ["field", "direction"], properties: {
                field: { type: "string", enum: ["event_at"] },
                direction: { type: "string", enum: ["asc", "desc"] },
              },
            } },
            take: { type: "object", additionalProperties: false, required: ["count", "per"], properties: {
              count: { type: "integer", minimum: 1, maximum: 100 },
              per: { type: "string", enum: ["group"] },
            } },
          } },
        },
      },
    },
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
      from: { ...temporalInstantSchema, description: "Inclusive complete ISO instant (YYYY-MM-DDTHH:mm:ss[.fraction]Z or explicit +/-HH:mm offset), or null. Never emit a date-only value. Brain resolves a requested start calendar day to local midnight in the supplied timeZone. Never invent the date of an anchor. For an as-of cutoff, keep this null unless the user supplied a lower bound." },
      to: { ...temporalInstantSchema, description: "Exclusive complete ISO instant (YYYY-MM-DDTHH:mm:ss[.fraction]Z or explicit +/-HH:mm offset), or null. Never emit a date-only value. Brain resolves an inclusive ending calendar day to the next local midnight in the supplied timeZone, using the offset applicable at that boundary, including calendar and daylight-saving transitions." },
      anchor: { type: ["object", "null"], additionalProperties: false, required: ["concept", "relation"], properties: {
        concept: { type: "string", minLength: 1, maxLength: 80, description: "Literal identifying concept for the referenced saved event. Preserve explicit identifying qualifiers from the USER reference, including a year or quoted title; do not discard them as temporal instructions. Every normalized term must occur in stored title/note; terms need not be adjacent. Code resolves the actual event and date. Never guess an anchor date or resolve multiple matching events by preference." },
        relation: { type: "string", enum: ["from", "after", "before"] },
      } },
    } },
    searchHints: { type: ["array", "null"], maxItems: 12, items: { type: "string", minLength: 1, maxLength: 80 }, description: "Advisory literal terms for optional supporting context only. They cannot select factual records or establish completeness. Encode requested factual topics in predicates, temporal semantics, selection, or grounded probes; never in hints alone." },
    predicates: {type:"array",maxItems:6,description:"AND across explicit conditions. source_ref selects supplied cited identities; text_any retains literal content OR terms. measurement requires one compatible numeric span before ordering; units never certify an entity, attribute or clinical truth. Preserve requested literal restrictions.",items:{anyOf:[
      {type:"object",additionalProperties:false,required:["kind","terms"],properties:{kind:{type:"string",enum:["text_any"]},terms:{type:"array",minItems:1,maxItems:12,items:{type:"string",minLength:1,maxLength:80}}}},
      {type:"object",additionalProperties:false,required:["kind","unit","predicateIndexes"],properties:{kind:{type:"string",enum:["measurement"]},unit:{type:"string",enum:Object.keys(units)},predicateIndexes:{type:"array",maxItems:6,description:"Zero-based absolute positions in this ticket's COMPLETE predicates array, counting BOTH measurement and text_any entries. Reference only positions occupied by text_any predicates; never this measurement or another measurement. These are NOT ordinal indexes within a filtered text_any list. [] means no literal-purpose restriction. Preserve the USER's explicit literal restrictions; do not invent or remove conditions.",items:{type:"integer",minimum:0,maximum:5}}}},
      {type:"object",additionalProperties:false,required:["kind","sources"],description:"Cited source identity only, independent from title/body conditions. Select exact supplied citedSourceReferences pairs. Re-read current owned sources; dialogue is not evidence. sources is OR; separate predicates are AND.",properties:{kind:{type:"string",enum:["source_ref"]},sources:{type:"array",minItems:1,maxItems:6,items:{type:"object",additionalProperties:false,required:["sourceTurnId","sourceId"],properties:{sourceTurnId:{type:"string",minLength:1,maxLength:160},sourceId:{type:"string",pattern:"^care:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"}}}}}}
    ]}},
    outputs: { type: "object", additionalProperties: false, required: ["completeness", "ordering", "limit", "strategy"], properties: {
      strategy: { type: ["string", "null"], enum: ["chronological", "temporal_endpoints", "calendar_samples", "event_candidates", null], description: "Chronological boundary, both endpoints per subject, one sample per UTC calendar year, or mandatory event-candidate lookup. Null retains ordinary ordered retrieval." },
      completeness: { type: "string", enum: ["sufficient", "exhaustive"], description: "Classify the requested proposition, not the amount of stored history. sufficient: task-certified selection, including ordered take per group and union of boundaries, within any explicit or anchor-defined window. exhaustive: the requested claim requires the entire matching set, historical existence/absence, or an exact count over the requested domain. A bounded window restricts the domain; it does not make an exhaustive claim sufficient. sufficient never certifies evidence: organs must independently certify the selected result. Legacy-only selectors retain their existing coverage requirements." },
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
const instant = (v: unknown): v is string | null => v === null || isCompleteInstant(v);

export function bindReadTicket(value: unknown, petIds: readonly string[], needBindings: readonly ReadNeedBinding[] = []): ReadTicket | null {
  if (value == null) return null;
  // Diagnostic keys identify the first existing rejection; they confer no authority.
  const fail = (field: string, rule: string): never => { throw new Error("ASK_REQUEST_INVALID:read_ticket", { cause: { field, rule } }); };
  if (!object(value)) return fail("readTicket", "object");
  if (!optionalKeys(value, ["operation", "temporal", "predicates", "outputs"], ["authority", "subjectScope", "searchHints", "episode", "needs", "attributedContexts"])) return fail("readTicket", "fields");
  const { operation, temporal, predicates, outputs, searchHints, episode } = value;
  if (value.authority !== undefined && !["effective_fact", "stored_report"].includes(String(value.authority))) return fail("authority", "enum");
  if (!["read", "read_since_event", "compare", "rank"].includes(String(operation))) return fail("operation", "enum");
  if (value.subjectScope !== undefined && !["selected", "named", "conversation", "account"].includes(String(value.subjectScope))) return fail("subjectScope", "enum");
  if (!petIds.length || new Set(petIds).size !== petIds.length) return fail("subjects.petIds", "nonempty_unique");
  if (!object(temporal) || !optionalKeys(temporal, ["from", "to", "anchor"], ["calendar"])) return fail("temporal", "fields");
  if (temporal.calendar != null && temporal.calendar !== "oldest_year") return fail("temporal.calendar", "enum");
  if (searchHints != null && (!Array.isArray(searchHints) || searchHints.length > 12 || !searchHints.every(term))) return fail("searchHints", "terms");
  if (!instant(temporal.from)) return fail("temporal.from", "instant_or_null");
  if (!instant(temporal.to)) return fail("temporal.to", "instant_or_null");
  if (temporal.from && temporal.to && Date.parse(temporal.from) >= Date.parse(temporal.to)) return fail("temporal", "from_before_to");
  if (!Array.isArray(predicates) || predicates.length > 6) return fail("predicates", "array_max_6");
  predicates.forEach((p, index) => {
    if(object(p)&&p.kind==="source_ref"){
      if(!keys(p,["kind","sources"])||value.authority!=="stored_report"||operation!=="read"
        ||!Array.isArray(p.sources)||!p.sources.length||p.sources.length>6
        ||p.sources.some(r=>!object(r)||!keys(r,["sourceTurnId","sourceId"])||!term(r.sourceTurnId)
          ||typeof r.sourceId!=="string"||!/^care:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(r.sourceId))
        ||new Set(p.sources.map(r=>r.sourceTurnId+"\0"+r.sourceId)).size!==p.sources.length)return fail("predicates["+index+"]","source_reference");
      return;
    }
    if(object(p)&&p.kind==="measurement"){
      if(!keys(p,["kind","unit","predicateIndexes"])||typeof p.unit!=="string"||!Object.hasOwn(units,p.unit)
        ||!Array.isArray(p.predicateIndexes)||p.predicateIndexes.length>6||new Set(p.predicateIndexes).size!==p.predicateIndexes.length
        ||p.predicateIndexes.some(i=>!Number.isInteger(i)||i<0||!object(predicates[i])||predicates[i].kind!=="text_any"))
        return fail(`predicates[${index}]`,"measurement");
      if(value.authority!=="stored_report"||!["read","read_since_event"].includes(String(operation)))return fail(`predicates[${index}]`,"measurement_report_authority");
      return;
    }
    if (!object(p) || !keys(p, ["kind", "terms"])) return fail(`predicates[${index}]`, "fields");
    if (p.kind !== "text_any") return fail(`predicates[${index}].kind`, "enum");
    if (!Array.isArray(p.terms) || !p.terms.length || p.terms.length > 12 || !p.terms.every(term)) return fail(`predicates[${index}].terms`, "terms");
  });
  if (!object(outputs) || !optionalKeys(outputs, ["completeness", "ordering", "limit"], ["strategy"])) return fail("outputs", "fields");
  if (outputs.strategy != null && !["chronological", "temporal_endpoints", "calendar_samples", "event_candidates"].includes(String(outputs.strategy))) return fail("outputs.strategy", "enum");
  if (!["sufficient", "exhaustive"].includes(String(outputs.completeness))) return fail("outputs.completeness", "enum");
  if (!["asc", "desc"].includes(String(outputs.ordering))) return fail("outputs.ordering", "enum");
  if (outputs.limit !== null && (!Number.isInteger(outputs.limit) || Number(outputs.limit) < 1 || Number(outputs.limit) > 100)) return fail("outputs.limit", "integer_1_to_100_or_null");
  const anchor = temporal.anchor;
  if (anchor !== null) {
    if (!object(anchor) || !keys(anchor, ["concept", "relation"])) return fail("temporal.anchor", "fields");
    if (!term(anchor.concept)) return fail("temporal.anchor.concept", "term");
    if (!["from", "after", "before"].includes(String(anchor.relation))) return fail("temporal.anchor.relation", "enum");
  }
  if ((operation === "read_since_event") !== (anchor !== null)) return fail("temporal.anchor", "anchor_iff_read_since_event");
  if (anchor && temporal.calendar) return fail("temporal.calendar", "incompatible_with_anchor");
  // A single measurement endpoint is not a request for the oldest calendar year.
  // Inspect only the typed ticket predicates, never the owner sentence or pet.
  if (operation === "read" && temporal.calendar === "oldest_year" && outputs.limit === 1
    && predicates.some(p => p.kind==="text_any" && p.terms.some((value: string) => /\b(?:weights?|weigh(?:ed|s|ing)?|body mass|temperatures?|heart rate|pulse|respiratory rate|breathing rate|blood pressure|blood glucose|glucose|body condition score|height|length)\b/i.test(value)))) {
    return fail("temporal.calendar", "calendar_oldest_year_incompatible_with_measurement_limit");
  }
  if (outputs.strategy === "temporal_endpoints" && operation !== "compare") return fail("outputs.strategy", "temporal_endpoints_requires_compare");
  if (outputs.strategy === "event_candidates" && (!predicates.length || operation !== "read")) return fail("outputs.strategy", "event_candidates_requires_read_and_predicates");
  if (outputs.strategy === "calendar_samples" && outputs.completeness !== "sufficient") return fail("outputs.completeness", "calendar_samples_requires_sufficient");
  if (episode != null) {
    if (!object(episode) || !keys(episode, ["operation", "referent"])) return fail("episode", "fields");
    if (!["count", "membership"].includes(String(episode.operation))) return fail("episode.operation", "enum");
    if (operation !== "read") return fail("operation", "episode_requires_read");
    if (temporal.calendar != null) return fail("temporal.calendar", "incompatible_with_episode");
    if (predicates.length) return fail("predicates", "incompatible_with_episode");
    if (searchHints?.length) return fail("searchHints", "incompatible_with_episode");
    if (outputs.strategy != null) return fail("outputs.strategy", "incompatible_with_episode");
    if (outputs.limit !== null) return fail("outputs.limit", "incompatible_with_episode");
    const referent = episode.referent;
    if (referent !== null) {
      if (!object(referent) || !keys(referent, ["basis", "topic", "ordinal"])) return fail("episode.referent", "fields");
      if (!["displayed_list", "scoped_register"].includes(String(referent.basis))) return fail("episode.referent.basis", "enum");
      if (!["vomiting", "soft stool", "breathing", null].includes(referent.topic as string | null)) return fail("episode.referent.topic", "enum");
      if (!["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "last", "that", null].includes(referent.ordinal as string | null)) return fail("episode.referent.ordinal", "enum");
    }
    if (episode.operation === "count" && referent && referent.basis !== "scoped_register") return fail("episode.referent.basis", "count_requires_scoped_register");
    if (episode.operation === "count" && referent && referent.ordinal !== null) return fail("episode.referent.ordinal", "count_requires_null_ordinal");
  }
  const needs = bindReadNeeds(value.needs, needBindings, petIds);
  if (needs?.some(need => need.selection)) {
    if (!needs.every(need => need.selection && need.predicates)) return fail("needs", "mixed_selection_and_advisory_probes");
    if (operation !== "read" || temporal.from !== null || temporal.to !== null || anchor)
      return fail("needs", "independent_selection_owns_window");
  }
  if (needs?.length) {
    if (operation === "read" && outputs.limit === 1 && (predicates.length || outputs.strategy === "chronological"))
      return fail("needs", "needs_incompatible_with_single_measurement_read");
    if (episode) return fail("episode", "incompatible_with_needs");
    if (operation === "read_since_event") return fail("operation", "read_since_event_incompatible_with_needs");
    if (temporal.calendar != null) return fail("temporal.calendar", "incompatible_with_needs");
    if (predicates.length) return fail("predicates", "incompatible_with_needs");
    if (searchHints?.length) return fail("searchHints", "incompatible_with_needs");
    if (outputs.strategy != null) return fail("outputs.strategy", "incompatible_with_needs");
    if (outputs.limit !== null) return fail("outputs.limit", "incompatible_with_needs");
  }
  if (value.authority === "stored_report" && (!["read", "read_since_event"].includes(String(operation)) || temporal.calendar || episode || needs?.length || outputs.strategy != null))
    return fail("authority", "stored_report_requires_ordinary_read");
  const attributedContexts = bindAttributedReportContexts(value.attributedContexts, {
    authority: value.authority as ReadAuthority | undefined, operation: operation as ReadTicket["operation"],
    temporal: temporal as ReadTicket["temporal"],
  });
  return Object.freeze({ ...(value.attributedContexts !== undefined ? { attributedContexts } : {}), ...(value.authority !== undefined ? { authority: value.authority } : {}), ...(value.subjectScope !== undefined ? { subjectScope: value.subjectScope } : {}), ...(needs !== undefined ? { needs } : {}), ...(episode !== undefined ? { episode: episode === null ? null : Object.freeze({ ...episode as EpisodeReadObligation,
      referent: (episode as EpisodeReadObligation).referent && Object.freeze({ ...(episode as EpisodeReadObligation).referent }) }) } : {}),
    ...(searchHints !== undefined ? { searchHints: searchHints === null ? null : Object.freeze([...(searchHints as string[])]) } : {}), operation, subjects: Object.freeze({ petIds: Object.freeze([...petIds]) }),
    temporal: Object.freeze({ ...temporal, anchor: anchor && Object.freeze({ ...anchor }) }),
    predicates: Object.freeze(predicates.map(p=>Object.freeze(p.kind==="measurement"?{...p,predicateIndexes:Object.freeze([...p.predicateIndexes])}:p.kind==="source_ref"?{...p,sources:Object.freeze(p.sources.map((r: ReadSourceReference)=>Object.freeze({...r})))}:{...p,terms:Object.freeze([...p.terms])}))),
    outputs: Object.freeze({ ...outputs }),
  }) as ReadTicket;
}
