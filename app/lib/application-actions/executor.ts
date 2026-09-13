import type { SupabaseClient } from "@supabase/supabase-js";
import { actionCanAutoExecute } from "./policy.ts";
import type { FurviseActionExecutionResult, FurviseApplicationAction } from "./types.ts";
import { normalizeSingletonPreferenceKey } from "./memory-scopes.ts";
import { buildConfirmedLossCareAction } from "../ai/pet-loss.ts";
import { prepareTypedMemoryCandidate } from "../intelligence/memory-integrity.ts";
import type { IntelligenceLearning } from "../intelligence/types.ts";

export async function executeFurviseApplicationAction(input: {
  action: FurviseApplicationAction;
  confirmed: boolean;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<FurviseActionExecutionResult> {
  const { action } = input;
  if (action.confirmationPolicy === "always" && !input.confirmed) return result(action, "confirmation_required", false, "allowed");
  if (action.mutationClass === "navigation") return result({ ...action, status: "succeeded", resultMessage: "Ready to open." }, "succeeded", false, "allowed");
  const owned = await ownsPet(input.supabase, input.userId, action.petId);
  if (!owned) return failure(action, "This action is not available for that pet.", "denied");
  try {
    switch (action.kind) {
      case "memory.set_preference": return await setPreference(input);
      case "memory.forget_preference": return await forgetPreference(input);
      case "pet.update_profile": return await updateProfile(input);
      case "pet.mark_deceased": return await updateLifecycle(input, "deceased");
      case "pet.mark_active": return await updateLifecycle(input, "active");
      case "pet.archive": return await updateLifecycle(input, "archived");
      case "pet.delete_permanently": return await deletePet(input);
      case "care_history.add": return await addHistory(input);
      case "care_history.edit": return await editHistory(input);
      case "care_history.remove": return await removeHistory(input);
      case "care_state.resolve": return await updateConcern(input, "resolved");
      case "care_state.reopen": return await updateConcern(input, "reopened");
      default: return failure(action, "That action is not available yet.");
    }
  } catch {
    return failure(action, safeFailure(action));
  }
}

export function shouldAutoExecuteAction(action: FurviseApplicationAction) {
  return actionCanAutoExecute(action.kind, action.explicitIntent);
}

async function setPreference({ action, sourceMessageId, supabase, userId }: Parameters<typeof executeFurviseApplicationAction>[0]) {
  const factKey = normalizeSingletonPreferenceKey(action.input.field || "");
  const value = action.input.value?.trim();
  if (!factKey || !value) return failure(action, "That preference is incomplete.");
  const learning: IntelligenceLearning = {
    subjectType: "owner", subjectId: null, category: "communication_preference", factKey,
    factValue: value, confidence: 1, importance: "high", durability: "durable", action: "update",
    sourceExcerpt: action.evidence,
  };
  const governed = prepareTypedMemoryCandidate(learning, action.evidence, [action.petId]);
  if (!governed.accepted) return failure(action, "That preference is not a durable remembered detail.");
  const { data, error } = await supabase.rpc("persist_furvise_intelligence", {
    p_pet_id: action.petId,
    p_source_message_id: sourceMessageId,
    p_care_actions: [],
    p_learnings: [{ ...governed.learning, normalizedValue: normalizeValue(String(governed.learning.factValue)) }],
  });
  if (error) return failure(action, "That preference could not be changed.");
  const row = Array.isArray(data) ? data[0] : data;
  const changed = Number(row?.memories_created || 0) > 0 || Number(row?.memories_superseded || 0) > 0;
  const verified = await supabase.from("furvise_memories").select("id").eq("user_id", userId).eq("subject_type", "owner")
    .eq("fact_key", factKey).eq("normalized_value", normalizeValue(value)).eq("status", "active").limit(1).maybeSingle<{ id: string }>();
  if (verified.error || !verified.data) return failure(action, "That preference could not be verified.");
  const conflictsSuperseded = await supersedeConflictingSingletonMemories({ factKey, keepId: verified.data.id, petId: action.petId, supabase, userId });
  if (!conflictsSuperseded) return failure(action, "That preference could not be changed consistently.");
  return success(action, changed, preferenceSuccess(factKey, value));
}

async function forgetPreference({ action, supabase, userId }: Parameters<typeof executeFurviseApplicationAction>[0]) {
  const factKey = normalizeSingletonPreferenceKey(action.input.field || "");
  if (!factKey) return failure(action, "That preference could not be identified.");
  const canonical = await findSingletonMemories({ factKey, supabase, userId });
  const ids = canonical.map((row) => row.id);
  const canonicalUpdate = ids.length ? await supabase.from("furvise_memories").update({ status: "rejected", updated_at: new Date().toISOString() }).in("id", ids).eq("user_id", userId).select("id") : { data: [], error: null };
  const legacy = await findLegacySingletonMemories({ factKey, supabase, userId });
  const legacyIds = legacy.map((row) => row.id);
  const legacyUpdate = legacyIds.length ? await supabase.from("dog_memories").update({ status: "rejected" }).in("id", legacyIds).eq("user_id", userId).select("id") : { data: [], error: null };
  if (canonicalUpdate.error || legacyUpdate.error) return failure(action, "That preference could not be forgotten.");
  const changed = Boolean(canonicalUpdate.data?.length || legacyUpdate.data?.length);
  return success(action, changed, changed ? "That preference was forgotten." : "That preference was already absent.");
}

async function updateProfile({ action, supabase, userId }: Parameters<typeof executeFurviseApplicationAction>[0]) {
  const field = normalizeKey(action.input.field);
  const value = action.input.value?.trim() || "";
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (field === "weight") {
    const match = value.match(/^(\d+(?:\.\d+)?)\s*(kg|kgs?|kilograms?|lb|lbs?|pounds?)$/i);
    if (!match || Number(match[1]) <= 0) return failure(action, "Use a positive weight with kg or lb.");
    update.weight_value = Number(match[1]);
    update.weight_unit = /^k/i.test(match[2]) ? "kg" : "lb";
  } else if (["name", "current_food", "routine_note", "breed"].includes(field)) update[field] = value.slice(0, 500);
  else if (field === "sex" && ["female", "male", "not_sure"].includes(normalizeKey(value))) update.sex = normalizeKey(value);
  else return failure(action, "That profile field cannot be changed from Ask.");
  const { data, error } = await supabase.from("dog_profiles").update(update).eq("id", action.petId).eq("user_id", userId).select("id").maybeSingle<{ id: string }>();
  if (error || !data) return failure(action, "That profile change could not be verified.");
  return success(action, true, "The pet profile was updated.");
}

async function updateLifecycle({ action, sourceMessageId, supabase, userId }: Parameters<typeof executeFurviseApplicationAction>[0], status: "active" | "deceased" | "archived") {
  const now = new Date().toISOString();
  const update = {
    lifecycle_status: status,
    updated_at: now,
    ...(status === "deceased" ? { deceased_at: now } : {}),
  };
  const { data, error } = await supabase.from("dog_profiles").update(update)
    .eq("id", action.petId).eq("user_id", userId).select("id,name,lifecycle_status,lifecycle_changed_at,deceased_at").maybeSingle<{ id: string; name: string | null; lifecycle_status: string; lifecycle_changed_at: string | null; deceased_at: string | null }>();
  if (error || !data || data.lifecycle_status !== status) return failure(action, "This lifecycle change needs the approved lifecycle schema before it can be saved.");
  if (!data.lifecycle_changed_at || (status === "deceased" && !data.deceased_at)) return failure(action, "This lifecycle change could not be verified.");
  if (status === "deceased") {
    const historyRecorded = await persistConfirmedDeathHistory({ action, petName: data.name || "the pet", sourceMessageId, supabase, userId });
    if (!historyRecorded) {
      return failure(action, "The profile was marked as passed away, but the confirmed history entry could not be recorded. Retry this action to finish recording it.");
    }
  }
  return success(action, true, status === "deceased" ? "The profile was marked as passed away. Its history was preserved." : status === "archived" ? "The pet profile was archived." : "The pet profile was marked active.");
}

async function persistConfirmedDeathHistory({ action, petName, sourceMessageId, supabase, userId }: {
  action: FurviseApplicationAction;
  petName: string;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const existing = await findConfirmedDeathHistory({ action, sourceMessageId, supabase, userId });
  if (existing) return true;
  const careAction = buildConfirmedLossCareAction({ message: action.evidence, petName });
  if (!careAction) return false;
  const persisted = await supabase.rpc("persist_furvise_intelligence", {
    p_pet_id: action.petId,
    p_source_message_id: sourceMessageId,
    p_care_actions: [careAction],
    p_learnings: [],
  });
  if (!persisted.error) return Boolean(await findConfirmedDeathHistory({ action, sourceMessageId, supabase, userId }));
  return Boolean(await findConfirmedDeathHistory({ action, sourceMessageId, supabase, userId }));
}

async function findConfirmedDeathHistory({ action, sourceMessageId, supabase, userId }: {
  action: FurviseApplicationAction;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { data } = await supabase.from("pet_care_entries").select("id")
    .eq("user_id", userId).eq("pet_profile_id", action.petId)
    .eq("intelligence_source_message_id", sourceMessageId)
    .is("deleted_at", null).limit(1).maybeSingle<{ id: string }>();
  return data || null;
}

async function deletePet({ action, supabase, userId }: Parameters<typeof executeFurviseApplicationAction>[0]) {
  const { data, error } = await supabase.from("dog_profiles").delete().eq("id", action.petId).eq("user_id", userId).select("id").maybeSingle<{ id: string }>();
  if (error || !data) return failure(action, "The pet profile could not be permanently deleted.");
  return success(action, true, "The pet profile was permanently deleted.");
}

async function addHistory({ action, sourceMessageId, supabase, userId }: Parameters<typeof executeFurviseApplicationAction>[0]) {
  const existing = await supabase.from("pet_care_entries").select("id").eq("user_id", userId).eq("pet_profile_id", action.petId)
    .eq("intelligence_source_message_id", sourceMessageId).limit(1).maybeSingle<{ id: string }>();
  if (existing.data) return success(action, false, "That update was already in care history.");
  const detail = action.input.detail?.trim();
  if (!detail) return failure(action, "That care-history update is incomplete.");
  const { data, error } = await supabase.rpc("persist_furvise_intelligence", {
    p_pet_id: action.petId,
    p_source_message_id: sourceMessageId,
    p_learnings: [],
    p_care_actions: [{
      action: "create_entry",
      category: normalizeCategory(action.input.category),
      confidence: 1,
      details: detail.slice(0, 1000),
      severity: null,
      title: action.input.title?.trim().slice(0, 120) || "Care update",
    }],
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || Number(row?.care_entries_created || 0) < 1) {
    const replay = await supabase.from("pet_care_entries").select("id").eq("user_id", userId).eq("pet_profile_id", action.petId)
      .eq("intelligence_source_message_id", sourceMessageId).limit(1).maybeSingle<{ id: string }>();
    if (!replay.data) return failure(action, "That update could not be added to care history.");
    return success(action, false, "That update was already in care history.");
  }
  return success(action, true, "The update was added to care history.");
}

async function removeHistory({ action, supabase, userId }: Parameters<typeof executeFurviseApplicationAction>[0]) {
  const targetId = (action as FurviseApplicationAction & { boundTargetId?: string | null }).boundTargetId;
  if (!targetId) return failure(action, "The original history update is no longer available.");
  const entry = await supabase.from("pet_care_entries").select("id").eq("id", targetId).eq("user_id", userId).eq("pet_profile_id", action.petId)
    .is("deleted_at", null).maybeSingle<{ id: string }>();
  if (entry.error || !entry.data) return failure(action, "There is no matching history update to remove.");
  const removed = await supabase.rpc("remove_my_care_entry", { p_entry_id: entry.data.id, p_stop_tracking: true });
  if (removed.error) return failure(action, "That history update could not be removed.");
  return success(action, true, "The history update was removed.");
}

async function editHistory({ action, supabase, userId }: Parameters<typeof executeFurviseApplicationAction>[0]) {
  const targetId = (action as FurviseApplicationAction & { boundTargetId?: string | null }).boundTargetId;
  if (!targetId) return failure(action, "The original history update is no longer available.");
  const entry = await supabase.from("pet_care_entries").select("id,category,title,note,severity,occurred_at,updated_at")
    .eq("id", targetId).eq("user_id", userId).eq("pet_profile_id", action.petId)
    .is("deleted_at", null).maybeSingle<{
      id: string; category: string; title: string | null; note: string; severity: string | null;
      occurred_at: string; updated_at: string;
    }>();
  const detail = action.input.detail?.trim();
  if (entry.error || !entry.data || !detail) return failure(action, "There is no matching history update to edit.");
  const update = await supabase.rpc("update_my_care_entry", {
    p_entry_id: entry.data.id,
    p_pet_profile_id: action.petId,
    p_expected_updated_at: entry.data.updated_at,
    p_category: action.input.category ? normalizeCategory(action.input.category) : entry.data.category,
    p_title: action.input.title ? action.input.title.slice(0, 120) : entry.data.title,
    p_note: detail.slice(0, 1000),
    p_severity: entry.data.severity,
    p_occurred_at: entry.data.occurred_at,
  });
  if (update.error || !(update.data as unknown[] | null)?.length) return failure(action, "That history update could not be edited.");
  return success(action, true, "The history update was edited.");
}

async function updateConcern({ action, supabase, userId }: Parameters<typeof executeFurviseApplicationAction>[0], status: "resolved" | "reopened") {
  const targetId = (action as FurviseApplicationAction & { boundTargetId?: string | null }).boundTargetId;
  if (!targetId) return failure(action, "The original concern is no longer available.");
  const query = supabase.from("pet_concerns").select("id,status").eq("id", targetId).eq("user_id", userId).eq("pet_profile_id", action.petId)
    .in("status", status === "resolved" ? ["active", "monitoring", "reopened"] : ["resolved"]);
  const concern = await query.maybeSingle<{ id: string; status: string }>();
  if (concern.error || !concern.data) return failure(action, "There is no matching concern to update.");
  const now = new Date().toISOString();
  const update = status === "resolved" ? { status, resolved_at: now, updated_at: now } : { status, resolved_at: null, updated_at: now };
  const changed = await supabase.from("pet_concerns").update(update).eq("id", concern.data.id).eq("user_id", userId).select("id").maybeSingle<{ id: string }>();
  if (changed.error || !changed.data) return failure(action, "That concern could not be updated.");
  return success(action, true, status === "resolved" ? "The concern was marked resolved." : "The concern was reopened.");
}

async function ownsPet(supabase: SupabaseClient, userId: string, petId: string) {
  const { data, error } = await supabase.from("dog_profiles").select("id").eq("id", petId).eq("user_id", userId).maybeSingle<{ id: string }>();
  return !error && Boolean(data);
}

function success(action: FurviseApplicationAction, changed: boolean, message: string) {
  return result({ ...action, status: "succeeded", resultMessage: message, errorMessage: null }, "succeeded", changed, "allowed");
}
function failure(action: FurviseApplicationAction, message: string, authorization: "allowed" | "denied" = "allowed") {
  return result({ ...action, status: "failed", resultMessage: null, errorMessage: message }, "failed", false, authorization);
}
function result(action: FurviseApplicationAction, outcome: FurviseActionExecutionResult["audit"]["outcome"], changed: boolean, authorization: "allowed" | "denied"): FurviseActionExecutionResult {
  return { action, changed, audit: { actionKind: action.kind, authorization, mutationClass: action.mutationClass, outcome, petIdPresent: Boolean(action.petId) } };
}
function safeFailure(action: FurviseApplicationAction) { return action.safetyClass === "DESTRUCTIVE" ? "The destructive action was not completed." : "That Furvise action could not be completed."; }
function normalizeKey(value: string | null) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function normalizeValue(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function normalizeCategory(value: string | null) { const category = normalizeKey(value); return ["symptom", "food", "medication", "activity", "grooming", "vet_visit", "behavior", "general"].includes(category) ? category : "general"; }
function preferenceSuccess(key: string, value: string) { return key === "preferred_language" ? `The preferred language was changed to ${value}.` : "The preference was updated."; }

async function supersedeConflictingSingletonMemories(input: { factKey: string; keepId: string; petId: string; supabase: SupabaseClient; userId: string }) {
  const canonical = (await findSingletonMemories(input)).filter((row) => row.id !== input.keepId);
  if (canonical.length) {
    const updated = await input.supabase.from("furvise_memories").update({ status: "superseded", superseded_by: input.keepId, updated_at: new Date().toISOString() })
      .in("id", canonical.map((row) => row.id)).eq("user_id", input.userId).eq("status", "active").select("id");
    if (updated.error || updated.data?.length !== canonical.length) return false;
  }
  const legacy = await findLegacySingletonMemories(input);
  if (legacy.length) {
    const updated = await input.supabase.from("dog_memories").update({ status: "superseded" })
      .in("id", legacy.map((row) => row.id)).eq("user_id", input.userId).eq("status", "active").select("id");
    if (updated.error || updated.data?.length !== legacy.length) return false;
  }
  return true;
}

async function findSingletonMemories(input: { factKey: string; supabase: SupabaseClient; userId: string }) {
  const { data } = await input.supabase.from("furvise_memories").select("id,fact_key,category")
    .eq("user_id", input.userId).eq("status", "active").limit(100);
  return (data || []).filter((row) => sameSingletonPreference(input.factKey, String(row.fact_key), String(row.category)));
}

async function findLegacySingletonMemories(input: { factKey: string; supabase: SupabaseClient; userId: string }) {
  const { data } = await input.supabase.from("dog_memories").select("id,type,text")
    .eq("user_id", input.userId).eq("status", "active").limit(100);
  return (data || []).filter((row) => sameSingletonPreference(input.factKey, String(row.type || ""), String(row.text || "")));
}

function sameSingletonPreference(target: string, key: string, categoryOrText: string) {
  const text = `${key} ${categoryOrText}`.toLowerCase().replace(/[_-]+/g, " ");
  if (target === "preferred_language") return /\b(?:language|speak|respond in|answer in)\b/.test(text);
  if (target === "preferred_units") return /\b(?:unit|metric|imperial|kilogram|pound)\b/.test(text);
  if (target === "communication_style") return /\b(?:communication|writing|response)\b[\s\S]{0,30}\b(?:style|tone|format)\b/.test(text);
  return normalizeKey(key) === target;
}
