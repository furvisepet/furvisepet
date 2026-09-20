import type { IntelligenceConversationTurn } from "../intelligence/types.ts";
import { ownerDeclinesPersistence } from "../ai/owner-assertion.ts";

export type UserSourceSpan = Readonly<{ id: string; sourceMessageId: string; start: number; end: number; text: string }>;
export type AppendJob = Readonly<{ operation: "append"; petId: string; sourceMessageId: string; body: UserSourceSpan; companion: UserSourceSpan | null }>;
export const appendJobSchema = { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
  required: ["operation", "petName", "bodyQuote", "companionQuote"], properties: {
    operation: { type: "string", enum: ["append"] }, petName: { type: "string", minLength: 1, maxLength: 100 },
    bodyQuote: { type: "string", minLength: 1, maxLength: 1200, description: "Exact new note text only, excluding save instructions and companion questions." },
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
  if (!source || source.role !== "user" || ownerDeclinesPersistence(source.text) || !value || typeof value !== "object" || Array.isArray(value)) return fail();
  const p = value as Record<string, unknown>;
  if (Object.keys(p).sort().join() !== "bodyQuote,companionQuote,operation,petName" || p.operation !== "append" || typeof p.petName !== "string") return fail();
  const matches = pets.filter(pet => pet.user_id === userId && pet.name === p.petName);
  if (matches.length !== 1) return fail();
  const body = bindUserSourceSpan(source, p.bodyQuote);
  const companion = p.companionQuote === null ? null : bindUserSourceSpan(source, p.companionQuote);
  if (companion && body.start < companion.end && companion.start < body.end) return fail();
  return Object.freeze({ operation: "append", petId: matches[0].id, sourceMessageId: source.id, body, companion });
}
