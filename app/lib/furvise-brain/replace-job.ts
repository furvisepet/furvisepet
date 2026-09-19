import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelApplicationAction } from "../application-actions/types.ts";

export const replaceJobSchema = {
  anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
    required: ["operation", "target", "petName", "instructionQuote", "bodyQuote", "constraints"],
    properties: {
      operation: { type: "string", enum: ["replace"] },
      target: { type: "string", enum: ["last_event_for_subject"] },
      petName: { type: "string", minLength: 1, maxLength: 100 },
      instructionQuote: { type: "string", minLength: 1, maxLength: 1600 },
      bodyQuote: { type: "string", minLength: 1, maxLength: 1600 },
      constraints: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false,
        required: ["kind", "quote"], properties: {
          kind: { type: "string", enum: ["effective_count_one", "no_additional_copy", "no_write"] },
          quote: { type: "string", minLength: 1, maxLength: 1600 },
        } } },
    } }],
};

type SourceSpan = Readonly<{ start: number; end: number; text: string }>;
type ConstraintKind = "effective_count_one" | "no_additional_copy" | "no_write";

/** A source-bound semantic proposal, not permission to execute a capability. */
export type ReplaceJob = Readonly<{
  operation: "replace";
  target: "last_event_for_subject";
  petId: string;
  sourceMessageId: string;
  asOf: string;
  body: SourceSpan;
  constraints: Readonly<{
    effectiveCount: 1;
    allowAdditionalCopy: false;
    spans: readonly Readonly<SourceSpan & { kind: ConstraintKind }>[];
  }>;
}>;

export function validateReplaceJob(value: unknown, source: { id: string; text: string; createdAt: string },
  subject: { id: string; name: string }) : ReplaceJob {
  const fail = (field: string): never => { throw new Error("ASK_REQUEST_INVALID:write_job", { cause: { field: `writeJob.${field}` } }); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("shape");
  const p = value as Record<string, unknown>;
  if (Object.keys(p).sort().join() !== "bodyQuote,constraints,instructionQuote,operation,petName,target") return fail("fields");
  if (p.operation !== "replace") return fail("operation");
  if (p.target !== "last_event_for_subject") return fail("target");
  if (p.petName !== subject.name) return fail("petName");
  if (p.instructionQuote !== source.text.trim()) return fail("instructionQuote");
  if (typeof p.bodyQuote !== "string" || !p.bodyQuote.trim() || p.bodyQuote.length > 1600) return fail("bodyQuote");
  if (!Array.isArray(p.constraints) || p.constraints.length > 8) return fail("constraints");
  if (!source.id) return fail("sourceMessageId");
  if (!subject.id) return fail("petId");
  if (!Number.isFinite(Date.parse(source.createdAt))) return fail("asOf");
  const span = (quote: unknown, field: string): SourceSpan => {
    if (typeof quote !== "string" || !quote.trim() || quote.length > 1600) return fail(field);
    const start = source.text.indexOf(quote);
    if (start < 0 || source.text.indexOf(quote, start + 1) >= 0) return fail(field);
    return Object.freeze({ start, end: start + quote.length, text: source.text.slice(start, start + quote.length) });
  };
  const body = span(p.bodyQuote, "bodyQuote.sourceSpan");
  const spans = p.constraints.map((value: unknown, index: number) => {
    const field = `constraints[${index}]`;
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail(field);
    const c = value as Record<string, unknown>;
    if (Object.keys(c).sort().join() !== "kind,quote"
      || !["effective_count_one", "no_additional_copy", "no_write"].includes(String(c.kind))) return fail(field);
    const constraint = span(c.quote, `${field}.quote.sourceSpan`);
    // The model labels semantics; code certifies disjoint source spans and refuses prohibited writes.
    if (constraint.start < body.end && body.start < constraint.end || c.kind === "no_write") return fail(field);
    return Object.freeze({ ...constraint, kind: c.kind as ConstraintKind });
  });
  return Object.freeze({ operation: "replace", target: "last_event_for_subject", petId: subject.id,
    sourceMessageId: source.id, asOf: source.createdAt, body,
    constraints: Object.freeze({ effectiveCount: 1, allowAdditionalCopy: false, spans: Object.freeze(spans) }) });
}

/** Resolve the typed selector against owned effective state, never answer text.
 * The source-turn cutoff prevents a later concurrent append becoming the target. */
export async function resolveReplaceJob(job: ReplaceJob, supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("pet_care_entries").select("id")
    .eq("user_id", userId).eq("pet_profile_id", job.petId).is("deleted_at", null)
    .lte("created_at", job.asOf).order("created_at", { ascending: false })
    .order("id", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (error) throw new Error("REPLACE_TARGET_UNAVAILABLE");
  if (!data) throw new Error("REPLACE_TARGET_MISSING");
  const target = { id: `care:${data.id}`, petId: job.petId, sourceType: "care_update" as const };
  const proposal: ModelApplicationAction = { kind: "care_history.edit", targetSourceId: target.id,
    input: { field: null, value: null, title: null, detail: job.body.text, category: null, target: "specified" },
    evidence: job.body.text, explicitIntent: false };
  return { target, proposal };
}

/** Diagnostics preserve proposed semantics without copying patient text into logs.
 * Source spans can be reconstructed from the durable user message. */
export function brainProposalDiagnostic(value: unknown, sourceMessageId?: string) {
  const p = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const task = p.task && typeof p.task === "object" ? p.task as Record<string, unknown> : {};
  const job = p.writeJob && typeof p.writeJob === "object" ? p.writeJob as Record<string, unknown> : {};
  return { sourceMessageId, mode: p.mode, operation: p.operation, mutationIntent: p.mutationIntent,
    taskIntent: task.intent ?? null, evidenceBasis: p.evidenceBasis,
    writeJob: p.writeJob ? { operation: job.operation, target: job.target,
      bodyLength: typeof job.bodyQuote === "string" ? job.bodyQuote.length : null } : null };
}
