import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createIdempotencyAdminClient } from "../security/idempotency/admin-client.ts";
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

/** Creates the only mutation authority. response_data receives only the returned display id. */
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
  for (const action of input.actions) {
    // Continuations carry the original opaque capability id. Never mint a
    // second capability for that logical lifecycle action or bind it to a
    // different assistant message. The original trusted card remains available.
    if (UUID.test(action.id)) continue;
    if (action.mutationClass !== "mutation") { display.push(action); continue; }
    // Planner/display failures and every other terminal state are presentation
    // only. They must never be canonicalized back into executable authority.
    if (!isExecutableSourceAction(action)) { display.push(action); continue; }
    const authoritativeAction = canonicalCapabilityAction(action, input.sourceMessageId);
    const targetId = await bindTarget(authoritativeAction, input.targetBindings?.[action.id] || null, input.supabase, input.userId);
    // A proposed edit/remove/concern action with no exact target must never be executable.
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
      // Idempotent retries and concurrent duplicate preparation keep the first
      // immutable authority instead of changing semantics or losing the card.
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

export async function executeActionCapability(input: {
  capabilityId: string;
  assistantMessageId: string;
  userId: string;
  mode: "confirm" | "cancel" | "auto";
  correctionSourceMessageId?: string;
}) {
  const admin = createIdempotencyAdminClient();
  const { data, error } = await admin.rpc("execute_ask_action_capability", {
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

function canonicalCapabilityAction(action: FurviseApplicationAction, sourceMessageId: string): FurviseApplicationAction {
  if (!isExecutableSourceAction(action)) throw new Error("ACTION_CAPABILITY_SOURCE_NOT_EXECUTABLE");
  const policy = getFurviseActionPolicy(action.kind);
  if (policy.mutationClass !== "mutation") throw new Error("ACTION_CAPABILITY_KIND_NOT_MUTABLE");
  return {
    ...action,
    ...policy,
    sourceMessageId,
    status: policy.confirmationPolicy === "always" ? "confirmation_required" : "proposed",
    resultMessage: null,
    errorMessage: null,
  };
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
    const statuses = action.kind === "care_state.resolve" ? ["active", "monitoring", "reopened"] : ["resolved"];
    const { data, error } = await supabase.from("pet_concerns").select("id").eq("id", targetId)
      .eq("user_id", userId).eq("pet_profile_id", action.petId).in("status", statuses).maybeSingle<{ id: string }>();
    if (error) throw new Error("ACTION_CAPABILITY_TARGET_LOOKUP_FAILED");
    return data?.id || null;
  }
  return null;
}
