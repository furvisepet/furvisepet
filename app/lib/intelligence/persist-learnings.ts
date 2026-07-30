import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeMemoryValue } from "./memory-policy";
import type { CarePersistenceResult, IntelligenceCareAction, IntelligenceLearning, IntelligencePersistenceSummary } from "./types";
import { logIntelligenceError } from "./logging";

export class IntelligencePersistenceError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "IntelligencePersistenceError";
  }
}

export async function persistIntelligenceLearnings({
  careActions,
  learnings,
  petId,
  sourceMessageId,
  supabase,
  userId,
}: {
  careActions: IntelligenceCareAction[];
  learnings: IntelligenceLearning[];
  petId: string;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<IntelligencePersistenceSummary> {
  const normalizedLearnings = learnings.map((learning) => ({
    ...learning,
    normalizedValue: normalizeMemoryValue(learning.factValue),
  }));
  const carePersistence = careActions[0]
    ? await persistCanonicalCareAction({ action: careActions[0], petId, sourceMessageId, supabase, userId })
    : skippedCarePersistence();
  let row: Record<string, unknown> | null = null;
  if (normalizedLearnings.length) {
    const { data, error } = await supabase.rpc("persist_furvise_intelligence", {
      p_care_actions: [],
      p_learnings: normalizedLearnings,
      p_pet_id: petId,
      p_source_message_id: sourceMessageId,
    });
    if (error && !careActions.length) throw new IntelligencePersistenceError("Furvise could not persist approved learnings.", error);
    if (error) {
      logIntelligenceError("memory_persistence_after_care", error, {
        sourceMessageIdPresent: Boolean(sourceMessageId), petIdPresent: Boolean(petId),
      });
    } else {
      row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    }
  }
  const memoryIds = normalizedLearnings.length
    ? await findConfirmedMemoryIds({ learnings: normalizedLearnings, petId, supabase, userId })
    : [];
  const persistedCareEntryId = carePersistence.careEntryIds[0] || null;
  const persistedConcernId = carePersistence.concernIds[0] || null;
  return {
    careEntriesCreated: carePersistence.status === "persisted" && !carePersistence.alreadyPersisted ? carePersistence.careEntryIds.length : 0,
    concernsResolved: carePersistence.status === "persisted" && careActions[0]?.action === "resolve_concern" ? 1 : 0,
    memoriesCreated: numberValue(row?.memories_created),
    memoriesSuperseded: numberValue(row?.memories_superseded),
    memoryIds,
    rejectedLearnings: 0,
    careActionPresent: carePersistence.status === "persisted" && carePersistence.careEntryIds.length > 0,
    persistedCareEntryId,
    persistedConcernId,
    persistenceMode: carePersistence.status === "persisted" && persistedCareEntryId ? "automatic" : "none",
    carePersistence: { ...carePersistence, memoryIds },
  };
}

export async function persistFeatureIntelligenceLearnings({
  careActions,
  feature,
  learnings,
  petId,
  requestId,
  supabase,
}: {
  careActions: IntelligenceCareAction[];
  feature: "product_question" | "product_query" | "safety_followup" | "vet_brief";
  learnings: IntelligenceLearning[];
  petId: string;
  requestId: string;
  supabase: SupabaseClient;
}): Promise<IntelligencePersistenceSummary> {
  const normalizedLearnings = learnings.map((learning) => ({ ...learning, normalizedValue: normalizeMemoryValue(learning.factValue) }));
  const { data, error } = await supabase.rpc("persist_furvise_feature_intelligence", {
    p_care_actions: careActions, p_learnings: normalizedLearnings,
    p_pet_id: petId, p_request_id: requestId, p_source_type: feature,
  });
  if (error) throw new IntelligencePersistenceError("Furvise could not persist feature learnings.", error);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    careEntriesCreated: numberValue(row?.care_entries_created), concernsResolved: numberValue(row?.concerns_resolved),
    memoriesCreated: numberValue(row?.memories_created), memoriesSuperseded: numberValue(row?.memories_superseded), rejectedLearnings: 0,
    memoryIds: [],
    careActionPresent: numberValue(row?.care_entries_created) > 0,
    persistedCareEntryId: null, persistedConcernId: null,
    persistenceMode: numberValue(row?.care_entries_created) > 0 ? "automatic" : "none",
    carePersistence: numberValue(row?.care_entries_created) > 0
      ? { status: "persisted", careEntryIds: [], concernIds: [], errorCode: null, currentSafetyState: null, alreadyPersisted: false }
      : skippedCarePersistence(),
  };
}

async function findConfirmedMemoryIds({ learnings, petId, supabase, userId }: {
  learnings: Array<IntelligenceLearning & { normalizedValue: string }>;
  petId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const keys = [...new Set(learnings.map((item) => normalizeFactKey(item.factKey)).filter(Boolean))];
  if (!keys.length) return [];
  const { data, error } = await supabase.from("furvise_memories")
    .select("id, subject_type, pet_id, fact_key, normalized_value")
    .eq("user_id", userId).eq("status", "active").in("fact_key", keys);
  if (error) throw new IntelligencePersistenceError("Furvise could not confirm persisted memories.", error);
  return (data || []).filter((row) => learnings.some((learning) =>
    row.fact_key === normalizeFactKey(learning.factKey)
      && row.subject_type === learning.subjectType
      && row.pet_id === (learning.subjectType === "pet" ? petId : null)
      && row.normalized_value === learning.normalizedValue
  )).map((row) => row.id);
}

function normalizeFactKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }

async function persistCanonicalCareAction({ action, petId, sourceMessageId, supabase, userId }: {
  action: IntelligenceCareAction;
  petId: string;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<CarePersistenceResult> {
  const { data, error } = await supabase.rpc("persist_furvise_care_event", {
    p_care_action: action,
    p_pet_id: petId,
    p_source_message_id: sourceMessageId,
    p_suggestion_id: null,
    p_user_id: userId,
  });
  if (error) {
    logIntelligenceError("care_persistence", error, {
      sourceMessageIdPresent: Boolean(sourceMessageId), petIdPresent: Boolean(petId), action: action.action,
      relatedRecordIdPresent: Boolean(action.relatedRecordId),
    });
    return { status: "failed", careEntryIds: [], concernIds: [], errorCode: "CARE_PERSISTENCE_FAILED", currentSafetyState: null, alreadyPersisted: false };
  }
  const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const careEntryIds = stringArray(result?.care_entry_ids);
  const concernIds = stringArray(result?.concern_ids);
  if (!result || result.persistence_status !== "persisted" || !careEntryIds.length) {
    return { status: "failed", careEntryIds: [], concernIds: [], errorCode: "CARE_PERSISTENCE_UNCONFIRMED", currentSafetyState: null, alreadyPersisted: false };
  }
  const currentSafetyState = ["routine", "recently_resolved", "urgent"].includes(String(result.current_safety_state))
    ? result.current_safety_state as CarePersistenceResult["currentSafetyState"] : null;
  return { status: "persisted", careEntryIds, concernIds, errorCode: null, currentSafetyState, alreadyPersisted: result.already_persisted === true };
}

function skippedCarePersistence(): CarePersistenceResult {
  return { status: "skipped", careEntryIds: [], concernIds: [], errorCode: null, currentSafetyState: null, alreadyPersisted: false };
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
}

function numberValue(value: unknown) { return typeof value === "number" ? value : Number(value) || 0; }
