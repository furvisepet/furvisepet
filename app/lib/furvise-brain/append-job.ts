import { CARE_ENTRY_BODY_MAX } from "./care-entry-limits.ts";
import type { IntelligenceConversationTurn } from "../intelligence/types.ts";
import { ownerDeclinesPersistence } from "../ai/owner-assertion.ts";

export type UserSourceSpan = Readonly<{ id: string; sourceMessageId: string; start: number; end: number; text: string }>;
export type AppendItem = Readonly<{ body: UserSourceSpan; date: UserSourceSpan | null; occurredAt: string | null }>;
export type AppendJob = Readonly<{ operation: "append"; petId: string; sourceMessageId: string; items: readonly AppendItem[]; companion: UserSourceSpan | null }>;
export const appendJobSchema = { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
  required: ["operation", "petName", "items", "companionQuote"], properties: {
    operation: { type: "string", enum: ["append"] }, petName: { type: "string", minLength: 1, maxLength: 100 },
    items: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false,
      required: ["bodyQuote", "dateQuote", "occurredAt"], properties: {
        bodyQuote: { type: "string", minLength: 1, maxLength: CARE_ENTRY_BODY_MAX, description: "Exact independent record span from the current USER turn. Include an explicit date in this span when one applies." },
        dateQuote: { type: ["string", "null"], description: "Exact explicit calendar date within this item's body, or null." },
        occurredAt: { type: ["string", "null"], description: "UTC midnight ISO timestamp matching dateQuote, or null. No inferred or relative dates." },
      } } },
    companionQuote: { type: ["string", "null"], description: "Exact contiguous companion question, or null for a pure append. A saved-history companion also requires readTicket in this SAME planner response." },
  } }] };
export function bindUserSourceSpan(source: Pick<IntelligenceConversationTurn, "id" | "role" | "text">, quote: unknown): UserSourceSpan {
  if (source.role !== "user" || typeof quote !== "string" || !quote.trim() || quote.length > 1200) throw Error("ASK_REQUEST_INVALID:append_span");
  const start = source.text.indexOf(quote);
  if (start < 0 || source.text.indexOf(quote, start + 1) >= 0) throw Error("ASK_REQUEST_INVALID:append_span");
  return Object.freeze({ id: `${source.id}:${start}:${start + quote.length}`, sourceMessageId: source.id, start, end: start + quote.length, text: quote });
}
export function validateAppendJob(value: unknown, source: IntelligenceConversationTurn | undefined, pets: Array<{ id: string; name: string | null; user_id: string }>, userId: string): AppendJob {
  const fail = (): never => { throw Error("ASK_REQUEST_INVALID:append_job"); };
  if (!source || source.role !== "user" || source.recoveredReceiptReference || ownerDeclinesPersistence(source.text) || !value || typeof value !== "object" || Array.isArray(value)) return fail();
  const p = value as Record<string, unknown>;
  const keys = Object.keys(p).sort().join();
  const legacy = keys === "bodyQuote,companionQuote,operation,petName";
  if ((!legacy && keys !== "companionQuote,items,operation,petName") || p.operation !== "append" || typeof p.petName !== "string") return fail();
  const matches = pets.filter(pet => pet.user_id === userId && pet.name === p.petName);
  if (matches.length !== 1) return fail();
  // Compatibility exists only at binding. Canonical jobs never retain bodyQuote.
  const proposed = legacy ? [{ bodyQuote: p.bodyQuote, dateQuote: null, occurredAt: null }] : p.items;
  if (!Array.isArray(proposed) || proposed.length < 1 || proposed.length > 8) return fail();
  const items = proposed.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join() !== "bodyQuote,dateQuote,occurredAt") return fail();
    const body = bindUserSourceSpan(source, value.bodyQuote);
    if (body.text.length > CARE_ENTRY_BODY_MAX) return fail();
    const date = value.dateQuote === null ? null : bindUserSourceSpan(source, value.dateQuote);
    if (date && (date.start < body.start || date.end > body.end)) return fail();
    const occurredAt = bindAppendSourceDate(date?.text ?? null, value.occurredAt);
    if (occurredAt && Date.parse(occurredAt) > Date.parse(source.createdAt)) return fail();
    return Object.freeze({ body, date, occurredAt });
  });
  const companion = p.companionQuote === null ? null : bindUserSourceSpan(source, p.companionQuote);
  const spans = [...items.map(item => item.body), ...(companion ? [companion] : [])].sort((a, b) => a.start - b.start);
  if (spans.some((span, i) => i > 0 && spans[i - 1].end > span.start)) return fail();
  return Object.freeze({ operation: "append", petId: matches[0].id, sourceMessageId: source.id,
    items: Object.freeze(items), companion });
}

/** Validate an explicit source calendar date, never infer a date from a sentence. */
export function bindAppendSourceDate(quote: string | null, proposed: unknown): string | null {
  if (quote === null && proposed === null) return null;
  const fail = (): never => { throw Error("ASK_REQUEST_INVALID:append_date"); };
  if (!quote || typeof proposed !== "string") return fail();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(quote);
  const named = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}),? (\d{4})$/i.exec(quote);
  if (!iso && !named) return fail();
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const year = Number(iso?.[1] ?? named![3]), month = iso ? Number(iso[2]) : months.indexOf(named![1].toLowerCase()) + 1;
  const day = Number(iso?.[3] ?? named![2]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return fail();
  const calendar = `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const canonical = calendar + "T00:00:00.000Z";
  if (!Number.isFinite(Date.parse(canonical)) || new Date(canonical).toISOString() !== canonical
    || ![calendar, canonical, calendar + "T00:00:00Z"].includes(proposed)) return fail();
  return canonical;
}
export function appendJobProposal(job: AppendJob, petName: string) {
  return { operation: "append", petName, companionQuote: job.companion?.text ?? null,
    items: job.items.map(item => ({ bodyQuote: item.body.text, dateQuote: item.date?.text ?? null, occurredAt: item.occurredAt })) };
}

/** Structural validation for server-stored JSON. Execution also rebinds the owned USER source. */
export function readBoundAppendJob(value: unknown): AppendJob | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const job = value as AppendJob;
  if (Object.keys(job).sort().join() !== "companion,items,operation,petId,sourceMessageId"
    || job.operation !== "append" || typeof job.petId !== "string" || !job.petId
    || typeof job.sourceMessageId !== "string" || !job.sourceMessageId
    || !Array.isArray(job.items) || job.items.length < 1 || job.items.length > 8) return null;
  const validSpan = (span: UserSourceSpan | null): span is UserSourceSpan => Boolean(span
    && Object.keys(span).sort().join() === "end,id,sourceMessageId,start,text"
    && span.sourceMessageId === job.sourceMessageId && Number.isInteger(span.start) && span.start >= 0
    && typeof span.text === "string" && span.text.trim() && span.text.length <= 1200
    && span.end === span.start + span.text.length
    && span.id === `${job.sourceMessageId}:${span.start}:${span.end}`);
  try {
    for (const item of job.items) {
      if (!item || Object.keys(item).sort().join() !== "body,date,occurredAt"
        || !validSpan(item.body) || item.body.text.length > CARE_ENTRY_BODY_MAX
        || (item.date !== null && (!validSpan(item.date) || item.date.start < item.body.start
          || item.date.end > item.body.end || item.body.text.slice(item.date.start-item.body.start,item.date.end-item.body.start) !== item.date.text))
        || bindAppendSourceDate(item.date?.text ?? null, item.occurredAt) !== item.occurredAt) return null;
    }
    if (job.companion !== null && !validSpan(job.companion)) return null;
    const spans = [...job.items.map(item => item.body), ...(job.companion ? [job.companion] : [])].sort((a,b)=>a.start-b.start);
    if (spans.some((span,i)=>i > 0 && spans[i-1].end > span.start)) return null;
    return Object.freeze(structuredClone(job));
  } catch { return null; }
}
