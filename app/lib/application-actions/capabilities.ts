import "server-only";
import { rebindReplaceJob, replaceJobActionMatches } from "../furvise-brain/replace-job.ts";
import { bindStateTransitionJob, stateTransitionProposal, stateTransitionActionMatches } from "../furvise-brain/state-transition-job.ts";
import { bindFieldMutationJob, fieldMutationActionMatches, fieldMutationJobProposal } from "../furvise-brain/field-mutation-job.ts";
import { appendJobProposal, validateAppendJob } from "../furvise-brain/append-job.ts";
import { isDeepStrictEqual } from "node:util";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createIdempotencyAdminClient } from "../security/idempotency/admin-client.ts";
import { authorizeFurviseActionExecution } from "../furvise-brain/action-organ.ts";
import { careWriteOperation, confirmFurviseWriteReceipt } from "../furvise-brain/write-contract.ts";
import { parseStoredApplicationActions } from "./contracts.ts";
import { getFurviseActionPolicy } from "./policy.ts";
import type { FurviseApplicationAction } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CapabilityRow = {
  id: string;
  assistant_message_id: string;
  action_payload: unknown;
  status: "pending" | "succeeded" | "failed" | "cancelled";
  receipt: unknown | null;
  expires_at: string;
};

/** Creates immutable server capabilities. Creation is not execution authority. */
export async function createActionCapabilities(input: {
  actions: FurviseApplicationAction[];
  assistantMessageId: string;
  sourceMessageId: string;
  supabase: SupabaseClient;
  targetBindings?: Record<string, string>;
  userId: string;
}) {
  const admin = createIdempotencyAdminClient();
  const display: FurviseApplicationAction[] = [];
  let authoritativeSourceMessage: { text: string; createdAt: string } | undefined;
  const authoritativePetNames = new Map<string, string>();
  for (const action of input.actions) {
    if (UUID.test(action.id)) continue;
    if (action.mutationClass !== "mutation") { display.push(action); continue; }
    if (!isExecutableSourceAction(action)) { display.push(action); continue; }
    authoritativeSourceMessage ??= await loadAuthoritativeSourceMessage(input.sourceMessageId, input.supabase, input.userId);
    let authoritativePetName = authoritativePetNames.get(action.petId);
    if (authoritativePetName === undefined) {
      authoritativePetName = await loadAuthoritativePetName(action.petId, input.supabase, input.userId);
      authoritativePetNames.set(action.petId, authoritativePetName);
    }
    const authoritativeAction = rebindCanonicalCapabilityAction(
      action,
      input.sourceMessageId,
      authoritativeSourceMessage,
      authoritativePetName,
      input.userId,
    );
    if (authoritativeAction.replaceJob && action.targetSourceId !== "care:" + input.targetBindings?.[action.id])
      throw Error("REPLACE_CAPABILITY_TARGET_MISMATCH");
    const targetId = await bindTarget(authoritativeAction, authoritativeAction.stateTransitionJob?.concernId || input.targetBindings?.[action.id] || null, input.supabase, input.userId);
    if (requiresBoundTarget(authoritativeAction) && !targetId) {
      display.push({ ...authoritativeAction, status: "failed", errorMessage: "That original target is no longer available.", resultMessage: null });
      continue;
    }
    const existing = await loadExistingCapability({
      sourceActionId: authoritativeAction.id,
      sourceMessageId: input.sourceMessageId,
      userId: input.userId,
    });
    if (existing) {
      if (existing.assistant_message_id !== input.assistantMessageId) throw new Error("ACTION_CAPABILITY_MESSAGE_MISMATCH");
      display.push(capabilityPresentation(existing));
      continue;
    }
    const { data, error } = await admin.from("ask_action_capabilities").insert({
      user_id: input.userId,
      assistant_message_id: input.assistantMessageId,
      source_message_id: input.sourceMessageId,
      action_payload: authoritativeAction,
      source_action_id: action.id,
      action_kind: authoritativeAction.kind,
      pet_profile_id: authoritativeAction.petId,
      target_id: targetId,
      safety_class: authoritativeAction.safetyClass,
      mutation_class: authoritativeAction.mutationClass,
      confirmation_policy: authoritativeAction.confirmationPolicy,
      authorization_scope: authoritativeAction.authorizationScope,
      explicit_intent: authoritativeAction.explicitIntent,
    }).select("id,assistant_message_id,action_payload,status,receipt,expires_at").single<CapabilityRow>();
    if (error || !data) {
      const raced = await loadExistingCapability({
        sourceActionId: authoritativeAction.id,
        sourceMessageId: input.sourceMessageId,
        userId: input.userId,
      });
      if (!raced || raced.assistant_message_id !== input.assistantMessageId) throw new Error("ACTION_CAPABILITY_CREATE_FAILED");
      display.push(capabilityPresentation(raced));
      continue;
    }
    display.push(capabilityPresentation(data));
  }
  return display;
}

/** Every capability execution crosses the canonical Furvise Brain action gate. */
export async function executeActionCapability(input: {
  capabilityId: string;
  assistantMessageId: string;
  userId: string;
  mode: "confirm" | "cancel" | "auto";
  correctionSourceMessageId?: string;
  suggestionId?: string;
}) {
  if (input.suggestionId && (input.mode !== "confirm" || input.correctionSourceMessageId))
    throw Error("CANONICAL_SUGGESTION_CONFIRM_REQUIRED");
  const admin = createIdempotencyAdminClient();
  const capability = await loadExecutionCapability({
    capabilityId: input.capabilityId,
    assistantMessageId: input.assistantMessageId,
    userId: input.userId,
  });
  if (!capability) return null;
  const authoritativeAction = parseStoredApplicationActions([capability.action_payload])[0];
  if (!authoritativeAction) throw new Error("ACTION_CAPABILITY_CORRUPT");
  if (authoritativeAction.fieldMutationJob && !fieldMutationActionMatches(authoritativeAction.fieldMutationJob, authoritativeAction, input.userId))
    throw Error("FIELD_CAPABILITY_SCOPE_MISMATCH");
  if (["care_state.resolve", "care_state.reopen"].includes(authoritativeAction.kind)
    && (!authoritativeAction.stateTransitionJob || !stateTransitionActionMatches(authoritativeAction.stateTransitionJob, authoritativeAction, input.userId)))
    throw Error("TRANSITION_CAPABILITY_SCOPE_MISMATCH");
  if (authoritativeAction.replaceJob && !replaceJobActionMatches(authoritativeAction.replaceJob, authoritativeAction))
    throw Error("REPLACE_CAPABILITY_SCOPE_MISMATCH");
  authorizeFurviseActionExecution({
    action: authoritativeAction,
    capabilityId: capability.id,
    mode: input.mode,
  });

  const { data, error } = await admin.rpc(input.suggestionId ? "execute_ask_canonical_suggestion" : "execute_ask_action_capability", input.suggestionId ? {
    p_user_id: input.userId, p_suggestion_id: input.suggestionId, p_capability_id: input.capabilityId,
  } : {
    p_capability_id: input.capabilityId,
    p_assistant_message_id: input.assistantMessageId,
    p_user_id: input.userId,
    p_mode: input.mode,
    p_correction_source_message_id: input.correctionSourceMessageId || null,
  }).maybeSingle<{ action: unknown; changed: boolean }>();
  if (error) throw new Error("ACTION_CAPABILITY_EXECUTION_FAILED");
  if (!data) return null;
  const action = parseStoredApplicationActions([data.action])[0];
  if (!action) throw new Error("ACTION_CAPABILITY_CORRUPT");
  if (careWriteOperation(authoritativeAction.kind)) {
    const persisted = await loadExecutionCapability(input);
    const receipt = confirmFurviseWriteReceipt({
      operationId: capability.id,
      authorized: authoritativeAction,
      returned: action,
      persistedStatus: persisted?.status || null,
      persistedReceipt: persisted?.receipt ? parseStoredApplicationActions([persisted.receipt])[0] || null : null,
    });
    console.info("[Ask Heart] receipt confirmed", { ...receipt, changed: data.changed });
  }
  return { action, changed: data.changed };
}

export async function cancelActionCapability(input: { capabilityId: string; userId: string; correctionSourceMessageId?: string }) {
  const admin = createIdempotencyAdminClient();
  const { data, error } = await admin.from("ask_action_capabilities").select("assistant_message_id")
    .eq("id", input.capabilityId).eq("user_id", input.userId).maybeSingle<{ assistant_message_id: string }>();
  if (error || !data) return null;
  return executeActionCapability({
    capabilityId: input.capabilityId,
    assistantMessageId: data.assistant_message_id,
    userId: input.userId,
    mode: "cancel",
    correctionSourceMessageId: input.correctionSourceMessageId,
  });
}

export function rebindCanonicalCapabilityAction(
  action: FurviseApplicationAction,
  sourceMessageId: string,
  sourceMessage: { text: string; createdAt: string },
  petName: string,
  userId: string,
): FurviseApplicationAction {
  if (!isExecutableSourceAction(action)) throw new Error("ACTION_CAPABILITY_SOURCE_NOT_EXECUTABLE");
  const policy = getFurviseActionPolicy(action.kind);
  if (policy.mutationClass !== "mutation") throw new Error("ACTION_CAPABILITY_KIND_NOT_MUTABLE");
  if (action.kind === "care_history.edit" && !action.replaceJob) throw Error("REPLACE_CAPABILITY_JOB_REQUIRED");
  if (action.replaceJob) {
    if (action.appendJob || action.fieldMutationJob || action.stateTransitionJob
      || !replaceJobActionMatches(action.replaceJob, action)) throw Error("REPLACE_CAPABILITY_SCOPE_MISMATCH");
    const rebound = rebindReplaceJob(action.replaceJob,
      { id: sourceMessageId, text: sourceMessage.text, createdAt: sourceMessage.createdAt }, { id: action.petId, name: petName }, userId);
    if (!isDeepStrictEqual(rebound, action.replaceJob)) throw Error("REPLACE_CAPABILITY_SOURCE_MISMATCH");
  }
  if (action.appendJob) {
    const rebound = validateAppendJob(appendJobProposal(action.appendJob, petName),
      { id: sourceMessageId, role: "user", text: sourceMessage.text, createdAt: sourceMessage.createdAt },
      [{ id: action.petId, name: petName, user_id: userId }], userId);
    if (action.kind !== "care_history.add" || !isDeepStrictEqual(rebound, action.appendJob)) throw Error("APPEND_CAPABILITY_SOURCE_MISMATCH");
  }
  if (["pet.update_profile", "memory.set_preference", "memory.forget_preference"].includes(action.kind) || action.fieldMutationJob) {
    const job = action.fieldMutationJob;
    if (!job || action.appendJob) throw Error("FIELD_CAPABILITY_JOB_REQUIRED");
    const rebound = bindFieldMutationJob(fieldMutationJobProposal(job, petName),
      { id: sourceMessageId, role: "user", text: sourceMessage.text, createdAt: sourceMessage.createdAt },
      [{ id: action.petId, name: petName, user_id: userId }], userId);
    if (!isDeepStrictEqual(rebound, job)
      || !fieldMutationActionMatches(job, { ...action, sourceMessageId }, userId))
      throw Error("FIELD_CAPABILITY_SOURCE_MISMATCH");
  }
  if (["care_state.resolve", "care_state.reopen"].includes(action.kind) || action.stateTransitionJob) {
    const job = action.stateTransitionJob;
    if (!job || action.appendJob || action.fieldMutationJob || !stateTransitionActionMatches(job, action, userId))
      throw Error("TRANSITION_CAPABILITY_JOB_REQUIRED");
    const rebound = bindStateTransitionJob(stateTransitionProposal(job, petName), {
      source: { id: sourceMessageId, role: "user", text: sourceMessage.text, createdAt: sourceMessage.createdAt },
      ownerId: userId, pets: [{ id: action.petId, name: petName, user_id: userId }],
      references: [{ ref: job.targetRef, ownerId: userId, petId: action.petId, concernId: job.concernId,
        status: job.fromState, title: "" }] });
    if (!isDeepStrictEqual(rebound, job)) throw Error("TRANSITION_CAPABILITY_SOURCE_MISMATCH");
  }
  // Exact source-bound transitions retain their existing policy. All other
  // mutations require confirmation; raw wording never grants auto-execution.
  const explicitIntent = Boolean(action.stateTransitionJob);
  const { targetSourceId, ...capabilityAction } = action;
  void targetSourceId;
  return {
    ...capabilityAction,
    ...(action.replaceJob ? { targetSourceId } : {}),
    ...policy,
    explicitIntent,
    sourceMessageId,
    status: policy.confirmationPolicy === "always" ? "confirmation_required" : "proposed",
    resultMessage: null,
    errorMessage: null,
  };
}

async function loadAuthoritativeSourceMessage(sourceMessageId: string, supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("ask_conversation_messages").select("user_text,created_at")
    .eq("id", sourceMessageId).eq("user_id", userId).eq("role", "user")
    .maybeSingle<{ user_text: string; created_at: string }>();
  if (error || !data?.user_text) throw new Error("ACTION_CAPABILITY_SOURCE_MESSAGE_LOOKUP_FAILED");
  return { text: data.user_text, createdAt: data.created_at };
}

async function loadAuthoritativePetName(petId: string, supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("dog_profiles").select("name")
    .eq("id", petId).eq("user_id", userId).maybeSingle<{ name: string | null }>();
  if (error || !data) throw new Error("ACTION_CAPABILITY_PET_LOOKUP_FAILED");
  return String(data.name || "your pet");
}

function isExecutableSourceAction(action: FurviseApplicationAction) {
  return action.status === "proposed" || action.status === "confirmation_required";
}

function capabilityPresentation(row: CapabilityRow) {
  const payload = row.receipt || row.action_payload;
  const parsed = parseStoredApplicationActions([payload])[0];
  if (!parsed) throw new Error("ACTION_CAPABILITY_CORRUPT");
  const policy = getFurviseActionPolicy(parsed.kind);
  const expired = row.status === "pending" && Date.parse(row.expires_at) <= Date.now();
  const status = expired ? "failed" as const : row.status === "pending"
    ? policy.confirmationPolicy === "always" ? "confirmation_required" as const : "proposed" as const
    : row.status;
  return {
    ...parsed,
    ...policy,
    id: row.id,
    status,
    ...(expired ? { resultMessage: null, errorMessage: "That action expired before it was confirmed." } : {}),
  };
}

async function loadExecutionCapability(input: { capabilityId: string; assistantMessageId: string; userId: string }) {
  const admin = createIdempotencyAdminClient();
  const { data, error } = await admin.from("ask_action_capabilities")
    .select("id,assistant_message_id,action_payload,status,receipt,expires_at")
    .eq("id", input.capabilityId)
    .eq("assistant_message_id", input.assistantMessageId)
    .eq("user_id", input.userId)
    .maybeSingle<CapabilityRow>();
  if (error) throw new Error("ACTION_CAPABILITY_LOOKUP_FAILED");
  return data;
}

async function loadExistingCapability(input: { sourceActionId: string; sourceMessageId: string; userId: string }) {
  const admin = createIdempotencyAdminClient();
  const { data, error } = await admin.from("ask_action_capabilities")
    .select("id,assistant_message_id,action_payload,status,receipt,expires_at")
    .eq("user_id", input.userId)
    .eq("source_message_id", input.sourceMessageId)
    .eq("source_action_id", input.sourceActionId)
    .maybeSingle<CapabilityRow>();
  if (error) throw new Error("ACTION_CAPABILITY_LOOKUP_FAILED");
  return data;
}

function requiresBoundTarget(action: FurviseApplicationAction) {
  return action.kind === "care_history.edit" || action.kind === "care_history.remove" || action.kind === "care_state.resolve" || action.kind === "care_state.reopen";
}

async function bindTarget(action: FurviseApplicationAction, targetId: string | null, supabase: SupabaseClient, userId: string) {
  if (action.kind === "care_history.edit" || action.kind === "care_history.remove") {
    if (!targetId || !UUID.test(targetId)) return null;
    const { data, error } = await supabase.from("pet_care_entries").select("id").eq("id", targetId)
      .eq("user_id", userId).eq("pet_profile_id", action.petId).is("deleted_at", null).maybeSingle<{ id: string }>();
    if (error) throw new Error("ACTION_CAPABILITY_TARGET_LOOKUP_FAILED");
    return data?.id || null;
  }
  if (action.kind === "care_state.resolve" || action.kind === "care_state.reopen") {
    if (!targetId || !UUID.test(targetId)) return null;
    const job = action.stateTransitionJob;
    if (!job || job.concernId !== targetId || !stateTransitionActionMatches(job, action, userId)) return null;
    const statuses = [job.fromState];
    const { data, error } = await supabase.from("pet_concerns").select("id").eq("id", targetId)
      .eq("user_id", userId).eq("pet_profile_id", action.petId).in("status", statuses).maybeSingle<{ id: string }>();
    if (error) throw new Error("ACTION_CAPABILITY_TARGET_LOOKUP_FAILED");
    return data?.id || null;
  }
  return null;
}
