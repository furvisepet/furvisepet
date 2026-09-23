import {readBoundRemoveJob, removeJobActionMatches} from "../furvise-brain/remove-job.ts";
import { readBoundReplaceJob, replaceJobActionMatches } from "../furvise-brain/replace-job.ts";
import { readBoundStateTransitionJob, stateTransitionActionMatches } from "../furvise-brain/state-transition-job.ts";
import { fieldMutationActionMatches, fieldMutationActionValue, readBoundFieldMutationJob } from "../furvise-brain/field-mutation-job.ts";
import { readBoundAppendJob } from "../furvise-brain/append-job.ts";
import { FURVISE_ACTION_KINDS, parseStoredFurviseActionKind, type FurviseActionInput, type FurviseApplicationAction, type ModelApplicationAction } from "./types.ts";

export const modelApplicationActionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "input", "evidence", "explicitIntent", "targetSourceId"],
  properties: {
    targetSourceId: nullableString(160),
    kind: { type: "string", enum: [...FURVISE_ACTION_KINDS] },
    input: {
      type: "object",
      additionalProperties: false,
      required: ["field", "value", "title", "detail", "category", "target"],
      properties: {
        field: nullableString(80),
        value: nullableString(500),
        title: nullableString(120),
        detail: nullableString(1000),
        category: nullableString(80),
        target: { anyOf: [{ type: "string", enum: ["selected", "last", "specified"] }, { type: "null" }] },
      },
    },
    evidence: { type: "string", minLength: 1, maxLength: 240 },
    explicitIntent: { type: "boolean" },
  },
} as const;

export function parseModelApplicationActions(value: unknown, sourceMessage: string): ModelApplicationAction[] {
  if (!Array.isArray(value)) return [];
  const source = normalize(sourceMessage);
  const seen = new Set<string>();
  return value.slice(0, 3).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const draft = candidate as Record<string, unknown>;
    if (!FURVISE_ACTION_KINDS.includes(draft.kind as never) || typeof draft.evidence !== "string" || typeof draft.explicitIntent !== "boolean") return [];
    const evidence = clean(draft.evidence, 240);
    if (!evidence || !source.includes(normalize(evidence))) return [];
    const input = parseInput(draft.input);
    if (!input) return [];
    const key = `${draft.kind}:${JSON.stringify(input)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const targetSourceId = nullableValue(draft.targetSourceId, 160);
    return [{ kind: draft.kind as ModelApplicationAction["kind"], input, evidence, explicitIntent: draft.explicitIntent,
      ...(targetSourceId ? { targetSourceId } : {}) }];
  });
}

export function parseStoredApplicationActions(value: unknown): FurviseApplicationAction[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const draft = candidate as Record<string, unknown>;
    const kind = parseStoredFurviseActionKind(draft.kind);
    if (typeof draft.id !== "string" || typeof draft.petId !== "string" || !kind) return [];
    const appendJob = draft.appendJob === undefined ? undefined : readBoundAppendJob(draft.appendJob);
    if (draft.appendJob !== undefined && (!appendJob || kind !== "care_history.add" || appendJob.petId !== draft.petId || appendJob.sourceMessageId !== draft.sourceMessageId)) return [];
    const fieldMutationJob = draft.fieldMutationJob === undefined ? undefined : readBoundFieldMutationJob(draft.fieldMutationJob);
    if (draft.fieldMutationJob !== undefined && (!fieldMutationJob || appendJob
      || fieldMutationJob.sourceMessageId !== draft.sourceMessageId || draft.explicitIntent !== false)) return [];
    const stateTransitionJob = draft.stateTransitionJob === undefined ? undefined : readBoundStateTransitionJob(draft.stateTransitionJob);
    if (draft.stateTransitionJob !== undefined && (!stateTransitionJob || appendJob || fieldMutationJob)) return [];
    if (stateTransitionJob && !stateTransitionActionMatches(stateTransitionJob, draft as unknown as FurviseApplicationAction)) return [];
    const replaceJob = draft.replaceJob === undefined ? undefined : readBoundReplaceJob(draft.replaceJob);
    if (draft.replaceJob !== undefined && (!replaceJob || appendJob || fieldMutationJob || stateTransitionJob
      || !replaceJobActionMatches(replaceJob, draft as unknown as FurviseApplicationAction))) return [];
    if (kind === "care_history.edit" && !replaceJob) return [];
    const removeJob = draft.removeJob === undefined ? undefined : readBoundRemoveJob(draft.removeJob);
    if(draft.removeJob !== undefined && (!removeJob || appendJob || replaceJob || fieldMutationJob || stateTransitionJob
      || !removeJobActionMatches(removeJob,draft as unknown as FurviseApplicationAction)))return [];
    if(kind === "care_history.remove" && !removeJob)return [];
    const input = parseInput(draft.input);
    // Compare RAW input above; generic model cleanup must never redefine a bound value.
    if (replaceJob && input) input.detail = replaceJob.body.text;
    if (fieldMutationJob && input) {
      const raw = draft.input as Record<string, unknown>;
      if (!fieldMutationActionMatches(fieldMutationJob, { kind, petId: draft.petId,
        sourceMessageId: draft.sourceMessageId as string, input: raw as typeof input })) return [];
      input.field = fieldMutationJob.field;
      input.value = fieldMutationActionValue(fieldMutationJob);
    }
    if (!input || typeof draft.evidence !== "string" || typeof draft.explicitIntent !== "boolean") return [];
    if (!["READ_ONLY", "LOW_RISK_REVERSIBLE", "CONFIRMATION_REQUIRED", "DESTRUCTIVE"].includes(String(draft.safetyClass))) return [];
    if (!["read", "mutation", "navigation"].includes(String(draft.mutationClass))) return [];
    if (!["none", "explicit_intent", "always"].includes(String(draft.confirmationPolicy))) return [];
    if (!["owned_pet", "owned_user", "owned_care_record", "owned_concern", "authenticated_user"].includes(String(draft.authorizationScope))) return [];
    if (!["proposed", "confirmation_required", "succeeded", "failed", "cancelled"].includes(String(draft.status))) return [];
    return [{
      id: draft.id, petId: draft.petId, kind, input, evidence: draft.evidence,
      ...(appendJob ? { appendJob } : {}),
      ...(removeJob ? {removeJob,targetSourceId:draft.targetSourceId as string} : {}),
      ...(replaceJob ? { replaceJob, targetSourceId: draft.targetSourceId as string } : {}),
      ...(fieldMutationJob ? { fieldMutationJob } : {}),
      ...(stateTransitionJob ? { stateTransitionJob } : {}),
      sourceMessageId: typeof draft.sourceMessageId === "string" ? draft.sourceMessageId : null,
      explicitIntent: draft.explicitIntent, safetyClass: draft.safetyClass, mutationClass: draft.mutationClass,
      confirmationPolicy: draft.confirmationPolicy, authorizationScope: draft.authorizationScope,
      status: draft.status, label: typeof draft.label === "string" ? draft.label : "Furvise action",
      description: typeof draft.description === "string" ? draft.description : "",
      href: typeof draft.href === "string" ? draft.href : null,
      resultMessage: typeof draft.resultMessage === "string" ? draft.resultMessage : null,
      errorMessage: typeof draft.errorMessage === "string" ? draft.errorMessage : null,
    } as FurviseApplicationAction];
  });
}

function parseInput(value: unknown): FurviseActionInput | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Record<string, unknown>;
  const keys = Object.keys(draft);
  if (keys.some((key) => !["field", "value", "title", "detail", "category", "target"].includes(key))) return null;
  const target = draft.target === null || draft.target === undefined ? null : draft.target;
  if (target !== null && target !== "selected" && target !== "last" && target !== "specified") return null;
  return {
    field: nullableValue(draft.field, 80),
    value: nullableValue(draft.value, 500),
    title: nullableValue(draft.title, 120),
    detail: nullableValue(draft.detail, 1000),
    category: nullableValue(draft.category, 80),
    target,
  };
}

function nullableValue(value: unknown, max: number) {
  return typeof value === "string" ? clean(value, max) || null : null;
}

function nullableString(maxLength: number) {
  return { anyOf: [{ type: "string", maxLength }, { type: "null" }] } as const;
}

function clean(value: string, max: number) { return value.replace(/\s+/g, " ").trim().slice(0, max); }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
