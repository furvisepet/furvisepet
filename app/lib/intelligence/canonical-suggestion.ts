import { isDeepStrictEqual } from "node:util";
import { readBoundAppendJob } from "../furvise-brain/append-job.ts";
import { readBoundReplaceJob } from "../furvise-brain/replace-job.ts";
import { readBoundStateTransitionJob } from "../furvise-brain/state-transition-job.ts";
import { readBoundFieldMutationJob } from "../furvise-brain/field-mutation-job.ts";
import type { FurviseApplicationAction } from "../application-actions/types.ts";

export type CanonicalSuggestionPayload = Readonly<{
  version: 1; kind: "append" | "replace" | "state_transition" | "owner_preference";
  capabilityId: string; sourceMessageId: string; targetId: string | null;
  targetUpdatedAt: string | null; job: NonNullable<FurviseApplicationAction["appendJob"]
    | FurviseApplicationAction["replaceJob"] | FurviseApplicationAction["stateTransitionJob"]
    | FurviseApplicationAction["fieldMutationJob"]>;
}>;
export type SuggestionCapability = {
  id: string; user_id: string; pet_profile_id: string; assistant_message_id: string;
  source_message_id: string; target_id: string | null; target_updated_at: string | null;
  action_payload: FurviseApplicationAction; status: string; receipt: FurviseApplicationAction | null;
  terminal_at: string | null;
};
export type CanonicalSuggestionRow = {
  id: string; user_id: string; pet_profile_id: string; conversation_id: string | null;
  source_message_id: string | null; canonical_capability_id: string | null;
  canonical_payload: unknown; invalidated_at: string | null;
  type: "history" | "memory" | "concern_resolution" | "concern_opening";
  title: string; details: string | null; status: "pending" | "saved" | "dismissed";
  concern_id?: string | null; care_entry_id?: string | null; applied_at?: string | null;
};
export function canonicalSuggestionJob(action: FurviseApplicationAction) {
  const jobs = [action.appendJob, action.replaceJob, action.stateTransitionJob, action.fieldMutationJob].filter(Boolean);
  if (jobs.length !== 1) return null;
  if (action.kind === "care_history.add" && readBoundAppendJob(action.appendJob))
    return { kind: "append" as const, job: action.appendJob! };
  if (action.kind === "care_history.edit" && readBoundReplaceJob(action.replaceJob))
    return { kind: "replace" as const, job: action.replaceJob! };
  if (["care_state.resolve", "care_state.reopen"].includes(action.kind) && readBoundStateTransitionJob(action.stateTransitionJob))
    return { kind: "state_transition" as const, job: action.stateTransitionJob! };
  if (["memory.set_preference", "memory.forget_preference"].includes(action.kind)
    && readBoundFieldMutationJob(action.fieldMutationJob)?.domain === "owner_preference")
    return { kind: "owner_preference" as const, job: action.fieldMutationJob! };
  return null;
}
/** The immutable capability remains authority; the suggestion is exact transport. */
export function suggestionMatchesCapability(s: CanonicalSuggestionRow, c: SuggestionCapability, ownerId: string) {
  const bound = canonicalSuggestionJob(c.action_payload);
  return Boolean(bound && !s.invalidated_at && s.user_id === ownerId && c.user_id === ownerId
    && s.pet_profile_id === c.pet_profile_id && s.source_message_id === c.assistant_message_id
    && s.canonical_capability_id === c.id && isDeepStrictEqual(s.canonical_payload, {
      version: 1, kind: bound.kind, job: bound.job, capabilityId: c.id,
      sourceMessageId: c.source_message_id, targetId: c.target_id, targetUpdatedAt: c.target_updated_at,
    }));
}
export function canonicalSuggestionSucceeded(s: CanonicalSuggestionRow, c: SuggestionCapability, ownerId: string) {
  if (!suggestionMatchesCapability(s, c, ownerId) || c.status !== "succeeded" || !c.receipt
    || !c.terminal_at || c.receipt.id !== c.id || c.receipt.status !== "succeeded") return false;
  const meaning = ({ id, status, resultMessage, errorMessage, ...rest }: FurviseApplicationAction) => {
    void id; void status; void resultMessage; void errorMessage; return rest;
  };
  return isDeepStrictEqual(meaning(c.receipt), meaning(c.action_payload));
}
