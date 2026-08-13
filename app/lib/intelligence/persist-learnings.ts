import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeMemoryValue } from "./memory-policy";
import type { CarePersistenceResult, GovernedCanonicalEvent, IntelligenceCareAction, IntelligenceLearning, IntelligencePersistenceSummary } from "./types";
import { logIntelligenceError } from "./logging";
import { normalizeKnownPreferenceMemory, planPreferenceSupersession } from "./preference-semantics";

export class IntelligencePersistenceError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "IntelligencePersistenceError";
  }
}

export async function persistIntelligenceLearnings({
  careActions,
  semanticEvents = [],
  learnings,
  petId,
  sourceMessageId,
  supabase,
  userId,
}: {
  careActions: IntelligenceCareAction[];
  semanticEvents?: GovernedCanonicalEvent[];
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
  const resolutionAction = careActions.find((action) => action.action === "resolve_concern" && Boolean(action.relatedRecordId));
  const semanticEvent = semanticEvents.find((item) => item.destinations.some((destination) =>
    destination === "care_event" || destination === "episode_current_state" || destination === "state_only"));
  const carePersistence = resolutionAction
    ? await persistCanonicalCareAction({ action: resolutionAction, petId, sourceMessageId, supabase, userId })
    : semanticEvent
    ? await persistCanonicalSemanticEvent({ event: semanticEvent, petId, sourceMessageId, supabase, userId })
    : careActions[0]
      ? await persistCanonicalCareAction({ action: careActions[0], petId, sourceMessageId, supabase, userId })
    : skippedCarePersistence();
  const persistenceRows: Record<string, unknown>[] = [];
  if (normalizedLearnings.length) {
    for (const [targetPetId, group] of groupLearningsByPersistencePet(normalizedLearnings, petId)) {
      const { data, error } = await supabase.rpc("persist_furvise_intelligence", {
        p_care_actions: [],
        p_learnings: group,
        p_pet_id: targetPetId,
        p_source_message_id: sourceMessageId,
      });
      if (error && !careActions.length && !semanticEvent) throw new IntelligencePersistenceError("Furvise could not persist approved learnings.", error);
      if (error) {
        logIntelligenceError("memory_persistence_after_care", error, {
          sourceMessageIdPresent: Boolean(sourceMessageId), petIdPresent: Boolean(targetPetId),
        });
      } else {
        const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
        if (row) persistenceRows.push(row);
      }
    }
    await suppressExplicitlyReplacedPreferences({
      learnings: normalizedLearnings, sourceMessageId, supabase, userId,
    });
  }
  const memoryIds = normalizedLearnings.length
    ? await findConfirmedMemoryIds({ learnings: normalizedLearnings, supabase, userId })
    : [];
  const persistedCareEntryId = carePersistence.careEntryIds[0] || null;
  const persistedConcernId = carePersistence.concernIds[0] || null;
  return {
    careEntriesCreated: carePersistence.status === "persisted" && !carePersistence.alreadyPersisted ? carePersistence.careEntryIds.length : 0,
    concernsResolved: carePersistence.status === "persisted" && carePersistence.concernIds.length > 0 && careActions[0]?.action === "resolve_concern" ? 1 : 0,
    memoriesCreated: persistenceRows.reduce((total, row) => total + numberValue(row.memories_created), 0),
    memoriesSuperseded: persistenceRows.reduce((total, row) => total + numberValue(row.memories_superseded), 0),
    memoryIds,
    rejectedLearnings: 0,
    careActionPresent: carePersistence.status === "persisted" && carePersistence.careEntryIds.length > 0,
    persistedCareEntryId,
    persistedConcernId,
    persistenceMode: carePersistence.status === "persisted" && persistedCareEntryId ? "automatic" : "none",
    carePersistence: { ...carePersistence, memoryIds },
  };
}

async function persistCanonicalSemanticEvent({ event, petId, sourceMessageId, supabase, userId }: {
  event: GovernedCanonicalEvent;
  petId: string;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<CarePersistenceResult> {
  const proposal = event.event;
  const { data, error } = await supabase.rpc("persist_furvise_semantic_event", {
    p_event: {
      subject: { type: proposal.subject.type, name: proposal.subject.name },
      domain: proposal.domain,
      topic: proposal.normalizedTopic,
      eventTitle: proposal.eventTitle,
      transition: proposal.transition,
      state: proposal.state,
      temporal: proposal.temporal,
      importance: proposal.importance,
      confidence: proposal.confidence,
      sourceExcerpt: proposal.sourceExcerpt,
    },
    p_pet_id: petId,
    p_source_message_id: sourceMessageId,
    p_user_id: userId,
  });
  if (error) {
    logIntelligenceError("semantic_event_persistence", error, {
      sourceMessageIdPresent: Boolean(sourceMessageId), petIdPresent: Boolean(petId),
      domain: proposal.domain, transition: proposal.transition,
    });
    return { status: "failed", careEntryIds: [], concernIds: [], errorCode: "SEMANTIC_EVENT_PERSISTENCE_FAILED", currentSafetyState: null, alreadyPersisted: false };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const entryId = typeof row?.care_entry_id === "string" ? row.care_entry_id : null;
  if (!entryId || row?.persistence_status !== "persisted") {
    return { status: "failed", careEntryIds: [], concernIds: [], errorCode: "SEMANTIC_EVENT_PERSISTENCE_UNCONFIRMED", currentSafetyState: null, alreadyPersisted: false };
  }
  return { status: "persisted", careEntryIds: [entryId], concernIds: [], errorCode: null,
    currentSafetyState: proposal.state === "resolved" ? "recently_resolved" : proposal.importance === "urgent" ? "urgent" : "routine",
    alreadyPersisted: row.already_persisted === true };
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

async function findConfirmedMemoryIds({ learnings, supabase, userId }: {
  learnings: Array<IntelligenceLearning & { normalizedValue: string }>;
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
      && row.pet_id === (learning.subjectType === "pet" ? learning.subjectId : null)
      && row.normalized_value === learning.normalizedValue
  )).map((row) => row.id);
}

function groupLearningsByPersistencePet<T extends IntelligenceLearning>(learnings: T[], fallbackPetId: string) {
  const groups = new Map<string, T[]>();
  for (const learning of learnings) {
    const targetPetId = learning.subjectType === "pet" ? learning.subjectId : fallbackPetId;
    if (!targetPetId) continue;
    groups.set(targetPetId, [...(groups.get(targetPetId) || []), learning]);
  }
  return [...groups.entries()];
}

async function suppressExplicitlyReplacedPreferences({ learnings, sourceMessageId, supabase, userId }: {
  learnings: Array<IntelligenceLearning & { normalizedValue: string }>;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const correctionPetIds = new Set<string>();
  for (const learning of learnings) {
    if (learning.subjectType !== "pet" || !learning.subjectId) continue;
    const semantic = normalizeKnownPreferenceMemory({
      subjectType: learning.subjectType, subjectId: learning.subjectId, factKey: learning.factKey,
      factValue: learning.factValue, canonicalConceptKey: learning.canonicalConceptKey,
    });
    if (!semantic) continue;
    if (semantic.polarity === "avoid" || /\b(?:actually|instead|correction|no longer|not anymore)\b/i.test(learning.sourceExcerpt)) {
      correctionPetIds.add(learning.subjectId);
    }
  }
  for (const targetPetId of correctionPetIds) {
    const { data, error } = await supabase.from("furvise_memories")
      .select("id,fact_key,fact_value,source_id")
      .eq("user_id", userId)
      .eq("pet_id", targetPetId)
      .eq("subject_type", "pet")
      .eq("status", "active")
      .neq("source_id", sourceMessageId)
      .limit(40);
    if (error) {
      logIntelligenceError("corrected_preference_projection", error, { sourceMessageIdPresent: true, petIdPresent: true });
      continue;
    }
    const supersededIds = new Set(planPreferenceSupersession(
      learnings.map((learning) => ({ ...learning, petName: null })),
      (data || []).map((row) => ({
        id: String(row.id), subjectType: "pet" as const, subjectId: targetPetId,
        factKey: String(row.fact_key), factValue: row.fact_value,
      })),
    ));
    for (const row of data || []) {
      if (!supersededIds.has(String(row.id))) continue;
      const { error: suppressError } = await supabase.rpc("manage_furvise_memory", {
        p_memory_id: row.id, p_action: "forget", p_fact_value: null,
      });
      if (suppressError) logIntelligenceError("corrected_preference_suppression", suppressError, {
        sourceMessageIdPresent: true, petIdPresent: true,
      });
    }
  }
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
