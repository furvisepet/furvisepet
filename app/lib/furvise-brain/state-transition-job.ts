import { bindTransitionAuthorization, type GovernedTransition } from "./governed-transition.ts";
import type { IntelligenceConversationTurn } from "../intelligence/types.ts";

export type ConcernState = "active" | "monitoring" | "reopened" | "resolved";
export type ConcernReference = Readonly<{ ref: string; ownerId: string; petId: string;
  concernId: string; status: ConcernState; title: string }>;
export type StateTransitionJob = GovernedTransition<"care_concern", ConcernState> & Readonly<{
  operation: "transition"; targetRef: string; concernId: string; ownerId: string;
  petId: string; sourceMessageId: string; toState: "resolved" | "reopened";
}>;
const fail = (field: string): never => { throw Error("ASK_REQUEST_INVALID:state_transition", { cause: { field } }); };
export const legalConcernTransition = (from: unknown, to: unknown) =>
  typeof from === "string" && (to === "resolved" ? ["active", "monitoring", "reopened"].includes(from)
    : to === "reopened" && from === "resolved");
export function stateTransitionJobSchema(refs: readonly ConcernReference[] = []) {
  const proposal = { type: "object", additionalProperties: false,
    required: ["domain", "operation", "targetRef", "petName", "toState", "authorizationQuote"],
    properties: { domain: { type: "string", enum: ["care_concern"] },
      operation: { type: "string", enum: ["transition"] }, targetRef: { type: "string", enum: refs.map(r => r.ref) },
      petName: { type: "string", minLength: 1, maxLength: 100 },
      toState: { type: "string", enum: ["resolved", "reopened"] },
      authorizationQuote: { type: "string", minLength: 1, maxLength: 1200 } } };
  return { anyOf: refs.length ? [{ type: "null" }, proposal] : [{ type: "null" }] };
}
export function bindStateTransitionJob(value: unknown, input: {
  source: IntelligenceConversationTurn | undefined; ownerId: string;
  pets: readonly { id: string; user_id: string; name: string | null }[];
  references: readonly ConcernReference[];
}): StateTransitionJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("shape");
  const p = value as Record<string, unknown>;
  if (Object.keys(p).sort().join() !== "authorizationQuote,domain,operation,petName,targetRef,toState"
    || p.domain !== "care_concern" || p.operation !== "transition" || !input.ownerId) return fail("shape");
  const candidates = input.references.filter(r => r.ref === p.targetRef);
  if (candidates.length !== 1) return fail("exact_target");
  const target = candidates[0];
  const pets = input.pets.filter(pet => pet.id === target.petId && pet.user_id === input.ownerId && pet.name === p.petName);
  if (pets.length !== 1 || target.ownerId !== input.ownerId || !target.concernId) return fail("owner_subject");
  if (!legalConcernTransition(target.status, p.toState)) return fail("transition");
  const authorization = bindTransitionAuthorization(input.source, p.authorizationQuote);
  return Object.freeze({ domain: "care_concern", operation: "transition", targetRef: target.ref,
    concernId: target.concernId, ownerId: input.ownerId, petId: target.petId, fromState: target.status,
    toState: p.toState as "resolved" | "reopened", authorization, sourceMessageId: authorization.sourceMessageId });
}
export function stateTransitionProposal(job: StateTransitionJob, petName: string) {
  return { domain: job.domain, operation: job.operation, targetRef: job.targetRef, petName,
    toState: job.toState, authorizationQuote: job.authorization.text };
}
export function readBoundStateTransitionJob(value: unknown): StateTransitionJob | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const j = value as StateTransitionJob, s = j.authorization;
  if (Object.keys(j).sort().join() !== "authorization,concernId,domain,fromState,operation,ownerId,petId,sourceMessageId,targetRef,toState"
    || j.domain !== "care_concern" || j.operation !== "transition" || !legalConcernTransition(j.fromState, j.toState)
    || [j.targetRef,j.concernId,j.ownerId,j.petId,j.sourceMessageId].some(v => typeof v !== "string" || !v)
    || !s || Object.keys(s).sort().join() !== "end,id,sourceMessageId,start,text"
    || s.sourceMessageId !== j.sourceMessageId || !Number.isInteger(s.start) || s.start < 0
    || typeof s.text !== "string" || !s.text.trim() || s.text.length > 1200
    || s.end !== s.start + s.text.length || s.id !== j.sourceMessageId + ":" + s.start + ":" + s.end) return null;
  return Object.freeze(structuredClone(j));
}
export const stateTransitionActionKind = (job: StateTransitionJob) =>
  job.toState === "resolved" ? "care_state.resolve" as const : "care_state.reopen" as const;
export function stateTransitionActionMatches(job: StateTransitionJob, action: {
  kind: string; petId: string; sourceMessageId?: string | null; explicitIntent: boolean;
  input: { field: unknown; value: unknown; target: unknown; title: unknown; detail: unknown; category: unknown };
}, ownerId?: string) {
  return Boolean(readBoundStateTransitionJob(job)) && (ownerId === undefined || ownerId === job.ownerId)
    && action.kind === stateTransitionActionKind(job) && action.petId === job.petId
    && action.sourceMessageId === job.sourceMessageId && action.explicitIntent === true
    && Boolean(action.input) && action.input.target === "specified" && [action.input.field,action.input.value,action.input.title,
      action.input.detail,action.input.category].every(value => value === null);
}
