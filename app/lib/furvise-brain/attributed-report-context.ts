import { completeInstantSchema, isCompleteInstant } from "./complete-instant.ts";
import type { ReadTicket } from "./read-ticket.ts";

export type AttributedReportContext = Readonly<{
  recorded: Readonly<{ from: string; to: string }>;
  target: Readonly<{ from: string; to: string }>;
}>;
const windowSchema = { type: "object", additionalProperties: false, required: ["from", "to"],
  properties: { from: completeInstantSchema, to: completeInstantSchema } };
export const attributedReportContextsSchema = {
  type: ["array", "null"], maxItems: 4,
  description: "Separate explicitly requested later attributed-report obligations. recorded is the report creation-time window; target is the event-time scope it discusses. Both are inclusive-from/exclusive-to. Does not widen the primary read, infer a correction edge, or certify effective truth. Same authorized subjects as the primary stored_report. Null unless the user requests this separate context.",
  items: { type: "object", additionalProperties: false, required: ["recorded", "target"],
    properties: { recorded: windowSchema, target: windowSchema } },
};
export function bindAttributedReportContexts(value: unknown, ticket: Pick<ReadTicket, "authority" | "operation" | "temporal">): readonly AttributedReportContext[] | null {
  const fail = (): never => { throw Error("ASK_REQUEST_INVALID:attributed_report_context"); };
  if (value == null) return null;
  if (!Array.isArray(value) || !value.length || value.length > 4
    || ticket.authority !== "stored_report" || ticket.operation !== "read"
    || ticket.temporal.anchor || ticket.temporal.calendar) return fail();
  const window = (v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail();
    const o = v as Record<string, unknown>;
    if (Object.keys(o).sort().join() !== "from,to"
      || ![o.from, o.to].every(isCompleteInstant)
      || Date.parse(o.from as string) >= Date.parse(o.to as string)) return fail();
    return Object.freeze({ from: o.from as string, to: o.to as string });
  };
  const contexts = value.map(v => {
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join() !== "recorded,target") return fail();
    const recorded = window(v.recorded), target = window(v.target);
    if (Date.parse(recorded.from) < Date.parse(target.to)) return fail();
    return Object.freeze({ recorded, target });
  });
  if (new Set(contexts.map(c => JSON.stringify(c))).size !== contexts.length) return fail();
  return Object.freeze(contexts);
}
