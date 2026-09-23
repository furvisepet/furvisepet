import { isDeepStrictEqual } from "node:util";
import { bindUserSourceSpan, type UserSourceSpan } from "./append-job.ts";
import { isWritableOwnerPreferenceValue } from "../intelligence/memory-integrity.ts";
import type { IntelligenceConversationTurn } from "../intelligence/types.ts";

export const writableProfileFields = ["name", "weight", "current_food", "routine_note", "sex", "breed"] as const;
export type ProfileMutationField = typeof writableProfileFields[number];
export type ProfileMutationValue =
  | Readonly<{ kind: "weight"; value: number; unit: "kg" | "lb" }>
  | Readonly<{ kind: "sex"; value: "female" | "male" | "not_sure" }>
  | Readonly<{ kind: "text"; value: string }>;
export const ownerPreferenceFields = ["preferred_language", "preferred_units", "communication_style"] as const;
export type OwnerPreferenceField = typeof ownerPreferenceFields[number];
export type ProfileFieldMutationJob = Readonly<{
  domain: "pet_profile"; operation: "set_field"; petId: string; sourceMessageId: string; field: ProfileMutationField;
  instruction: UserSourceSpan; valueSource: UserSourceSpan; value: ProfileMutationValue;
 }>;
export type OwnerPreferenceMutationJob = Readonly<{
  domain: "owner_preference"; operation: "set_field" | "clear_field"; ownerId: string;
  sourceMessageId: string; field: OwnerPreferenceField; instruction: UserSourceSpan;
  valueSource: UserSourceSpan | null; value: Readonly<{ kind: "text"; value: string }> | null;
}>;
export type FieldMutationJob = ProfileFieldMutationJob | OwnerPreferenceMutationJob;
export const fieldMutationJobSchema = { anyOf: [{ type: "null" }, {
  type: "object", additionalProperties: false,
  required: ["domain", "operation", "petName", "field", "instructionQuote", "valueQuote"],
  properties: {
    domain: { type: "string", enum: ["pet_profile"] },
    operation: { type: "string", enum: ["set_field"] },
    petName: { type: "string", minLength: 1, maxLength: 100 },
    field: { type: "string", enum: [...writableProfileFields] },
    instructionQuote: { type: "string", minLength: 1, maxLength: 1200 },
    valueQuote: { type: "string", minLength: 1, maxLength: 500 },
  },
}, ...(["set_field", "clear_field"] as const).map(operation => ({
  type: "object", additionalProperties: false,
  required: ["domain", "operation", "petName", "field", "instructionQuote", "valueQuote"],
  properties: {
    domain: { type: "string", enum: ["owner_preference"] }, operation: { type: "string", enum: [operation] },
    petName: { type: "null" }, field: { type: "string", enum: [...ownerPreferenceFields] },
    instructionQuote: { type: "string", minLength: 1, maxLength: 1200 },
    valueQuote: operation === "clear_field" ? { type: "null" } : { type: "string", minLength: 1, maxLength: 100 },
  },
}))] };
const fail = (field: string): never => { throw Error("ASK_REQUEST_INVALID:profile_mutation", { cause: { field } }); };

/** Field value grammar is storage policy; no command or question interpretation. */
export function profileMutationValue(field: ProfileMutationField, quote: string): ProfileMutationValue {
  if (!quote || quote !== quote.trim() || quote.length > 500) return fail("value");
  if (field === "weight") {
    const match = /^(\d+(?:\.\d+)?)\s*(kg|kgs?|kilograms?|lb|lbs?|pounds?)$/i.exec(quote);
    if (!match || !Number.isFinite(Number(match[1])) || Number(match[1]) <= 0) return fail("weight");
    return Object.freeze({ kind: "weight", value: Number(match[1]), unit: /^k/i.test(match[2]) ? "kg" : "lb" });
  }
  if (field === "sex") {
    const value = quote.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (value !== "female" && value !== "male" && value !== "not_sure") return fail("sex");
    return Object.freeze({ kind: "sex", value });
  }
  if (!writableProfileFields.includes(field)) return fail("field");
  return Object.freeze({ kind: "text", value: quote });
}
export function fieldMutationActionValue(job: FieldMutationJob): string | null {
  if (job.value === null) return null;
  return job.value.kind === "weight" ? `${job.value.value} ${job.value.unit}` : job.value.value;
}
export function bindFieldMutationJob(value: unknown, source: IntelligenceConversationTurn | undefined,
  pets: ReadonlyArray<{ id: string; name: string | null; user_id: string }>, userId: string): FieldMutationJob {
  if (!source || source.role !== "user" || source.recoveredReceiptReference
    || !value || typeof value !== "object" || Array.isArray(value)) return fail("source");
  const p = value as Record<string, unknown>;
  if (Object.keys(p).sort().join() !== "domain,field,instructionQuote,operation,petName,valueQuote") return fail("shape");
  if (p.domain === "owner_preference") {
    if (!userId || p.petName !== null || !ownerPreferenceFields.includes(p.field as OwnerPreferenceField)
      || !["set_field", "clear_field"].includes(String(p.operation))) return fail("owner_scope");
    const instruction = bindUserSourceSpan(source, p.instructionQuote);
    const valueSource = p.operation === "clear_field" ? null : bindUserSourceSpan(source, p.valueQuote);
    if (valueSource ? valueSource.start < instruction.start || valueSource.end > instruction.end
      || !isWritableOwnerPreferenceValue(String(p.field), valueSource.text) : p.valueQuote !== null) return fail("preference_value");
    return Object.freeze({ domain: "owner_preference", operation: p.operation as "set_field" | "clear_field",
      ownerId: userId, sourceMessageId: source.id, field: p.field as OwnerPreferenceField, instruction,
      valueSource, value: valueSource ? Object.freeze({ kind: "text", value: valueSource.text }) : null });
  }
  if (p.domain !== "pet_profile" || p.operation !== "set_field" || typeof p.petName !== "string"
    || !writableProfileFields.includes(p.field as ProfileMutationField)) return fail("shape");
  const matches = pets.filter(pet => pet.user_id === userId && pet.name === p.petName);
  if (matches.length !== 1) return fail("owned_subject");
  const instruction = bindUserSourceSpan(source, p.instructionQuote);
  const valueSource = bindUserSourceSpan(source, p.valueQuote);
  if (valueSource.start < instruction.start || valueSource.end > instruction.end) return fail("value_scope");
  const field = p.field as ProfileMutationField;
  return Object.freeze({ domain: "pet_profile", operation: "set_field", petId: matches[0].id, sourceMessageId: source.id,
    field, instruction, valueSource, value: profileMutationValue(field, valueSource.text) });
}
export function fieldMutationJobProposal(job: FieldMutationJob, petName: string) {
  return { domain: job.domain, operation: job.operation, petName: job.domain === "pet_profile" ? petName : null,
    field: job.field, instructionQuote: job.instruction.text, valueQuote: job.valueSource?.text ?? null };
}
/** Stored JSON is structural authority only; capability minting rebinds the actual owned USER row. */
export function readBoundFieldMutationJob(value: unknown): FieldMutationJob | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const job = value as FieldMutationJob;
  if (typeof job.sourceMessageId !== "string" || !job.sourceMessageId) return null;
  if (job.domain === "pet_profile") {
    if (Object.keys(job).sort().join() !== "domain,field,instruction,operation,petId,sourceMessageId,value,valueSource"
      || job.operation !== "set_field" || typeof job.petId !== "string" || !job.petId
      || !writableProfileFields.includes(job.field)) return null;
  } else if (job.domain === "owner_preference") {
    if (Object.keys(job).sort().join() !== "domain,field,instruction,operation,ownerId,sourceMessageId,value,valueSource"
      || typeof job.ownerId !== "string" || !job.ownerId || !ownerPreferenceFields.includes(job.field)
      || !["set_field", "clear_field"].includes(job.operation)) return null;
  } else return null;
  const validSpan = (s: UserSourceSpan) => s && Object.keys(s).sort().join() === "end,id,sourceMessageId,start,text"
    && s.sourceMessageId === job.sourceMessageId && Number.isInteger(s.start) && s.start >= 0
    && typeof s.text === "string" && s.text.trim() && s.text.length <= 1200
    && s.end === s.start + s.text.length && s.id === `${job.sourceMessageId}:${s.start}:${s.end}`;
  try {
    if (!validSpan(job.instruction)) return null;
    if (job.domain === "owner_preference" && job.operation === "clear_field") {
      return job.valueSource === null && job.value === null ? Object.freeze(structuredClone(job)) : null;
    }
    if (!job.valueSource || !validSpan(job.valueSource)
      || job.valueSource.start < job.instruction.start || job.valueSource.end > job.instruction.end
      || job.instruction.text.slice(job.valueSource.start - job.instruction.start, job.valueSource.end - job.instruction.start) !== job.valueSource.text
      || !(job.domain === "pet_profile"
        ? isDeepStrictEqual(profileMutationValue(job.field, job.valueSource.text), job.value)
        : isWritableOwnerPreferenceValue(job.field, job.valueSource.text)
          && isDeepStrictEqual({ kind: "text", value: job.valueSource.text }, job.value))) return null;
    return Object.freeze(structuredClone(job));
  } catch { return null; }
}

/** An action is a transport of the bound job, never a second semantic plan. */
export function fieldMutationActionKind(job: FieldMutationJob) {
  return job.domain === "pet_profile" ? "pet.update_profile"
    : job.operation === "set_field" ? "memory.set_preference" : "memory.forget_preference";
}
export function fieldMutationActionMatches(job: FieldMutationJob, action: {
  kind: string; petId: string; sourceMessageId?: string | null;
  input: { field: unknown; value: unknown; target: unknown; title: unknown; detail: unknown; category: unknown };
}, ownerId?: string): boolean {
  return Boolean(readBoundFieldMutationJob(job))
    && action.kind === fieldMutationActionKind(job) && action.sourceMessageId === job.sourceMessageId
    && (job.domain === "pet_profile" ? action.petId === job.petId : ownerId === undefined || job.ownerId === ownerId)
    && action.input.field === job.field && action.input.value === fieldMutationActionValue(job)
    && action.input.target === "specified" && action.input.title === null
    && action.input.detail === null && action.input.category === null;
}
