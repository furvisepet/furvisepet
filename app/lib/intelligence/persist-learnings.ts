import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeMemoryValue } from "./memory-policy";
import type { CarePersistenceResult, GovernedCanonicalEvent, IntelligenceCareAction, IntelligenceLearning, IntelligencePersistenceSummary } from "./types";
import { logIntelligenceError } from "./logging";
import { historicalPreferenceTargetIdentity, normalizeKnownPreferenceMemory, planPreferenceSupersession, preferenceTargetIdentity } from "./preference-semantics";
import { groupLearningsByPersistencePet } from "./persistence-partition";
import { oneSemanticEventPerPet, persistSemanticEventRpc } from "./semantic-event-persistence";
import type { CareEntryRow } from "../supabase.ts";
import { findEquivalentRecentCareEntry, prepareGovernedCareHistoryEvent } from "./care-history-policy.ts";
import { areMemorySemanticsEquivalent, isEligibleStoredMemory, prepareTypedMemoryCandidate } from "./memory-integrity.ts";
import { createOperationsAdminClient } from "../operations/admin-client.ts";

export class IntelligencePersistenceError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "IntelligencePersistenceError";
  }
}

export async function persistIntelligenceLearnings({
  assistantMessageId,
  authorizedPetIds,
  careActions,
  semanticEvents = [],
  learnings,
  currentMessage,
  operationOwnerToken,
  payloadHash,
  petId,
  requestId,
  sourceMessageId,
  supabase,
  userId,
  recentCareEntries = [],
}: {
  assistantMessageId: string;
  authorizedPetIds: string[];
  careActions: IntelligenceCareAction[];
  semanticEvents?: GovernedCanonicalEvent[];
  learnings: IntelligenceLearning[];
  currentMessage: string;
  operationOwnerToken: string;
  payloadHash: string;
  petId: string;
  requestId: string;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
  recentCareEntries?: CareEntryRow[];
}): Promise<IntelligencePersistenceSummary> {
  const governedLearnings = await preparePersistableLearnings({ authorizedPetIds, currentMessage, learnings, petId, supabase, userId });
  const normalizedLearnings = governedLearnings.map((learning) => ({
    ...learning,
    normalizedValue: normalizeMemoryValue(learning.factValue),
  }));
  const resolutionAction = careActions.find((action) => action.action === "resolve_concern" && Boolean(action.relatedRecordId));
  const persistableSemanticEvents = semanticEvents.filter((item) => item.destinations.some((destination) =>
    destination === "care_event" || destination === "episode_current_state" || destination === "state_only"));
  const semanticEvent = persistableSemanticEvents[0];
  const carePersistence = resolutionAction
    ? await persistCanonicalCareAction({ action: resolutionAction, petId, sourceMessageId, supabase, userId, recentCareEntries })
    : semanticEvent && persistableSemanticEvents.length
    ? await persistCanonicalSemanticEvents({ events: persistableSemanticEvents, petId, sourceMessageId, supabase, userId, recentCareEntries })
    : careActions[0]
      ? await persistCanonicalCareAction({ action: careActions[0], petId, sourceMessageId, supabase, userId, recentCareEntries })
    : skippedCarePersistence();
  const persistenceRows: Record<string, unknown>[] = [];
  if (normalizedLearnings.length) {
    for (const [targetPetId, group] of groupLearningsByPersistencePet(normalizedLearnings, petId)) {
      const authorized = await createOperationsAdminClient().rpc("persist_furvise_ask_intelligence", {
        p_assistant_message_id: assistantMessageId,
        p_authorized_pet_ids: authorizedPetIds,
        p_learnings: group,
        p_operation_owner_token: operationOwnerToken,
        p_payload_hash: payloadHash,
        p_pet_id: targetPetId,
        p_request_id: requestId,
        p_source_message_id: sourceMessageId,
        p_user_id: userId,
      });
      const result = isMissingAskMemoryAuthorityRpc(authorized.error)
        ? await supabase.rpc("persist_furvise_intelligence", {
            p_care_actions: [],
            p_learnings: group,
            p_pet_id: targetPetId,
            p_source_message_id: sourceMessageId,
          })
        : authorized;
      const { data, error } = result;
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
    const crossRepresentationSuperseded = await suppressExplicitlyReplacedPreferences({
      learnings: normalizedLearnings, sourceMessageId, supabase, userId,
    });
    if (crossRepresentationSuperseded > 0) {
      persistenceRows.push({ memories_superseded: crossRepresentationSuperseded });
    }
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

function isMissingAskMemoryAuthorityRpc(error: { code?: string; message?: string } | null) {
  return Boolean(error && error.code === "PGRST202"
    && /persist_furvise_ask_intelligence/i.test(error.message || ""));
}

async function persistCanonicalSemanticEvent({ event, petId, sourceMessageId, supabase, userId, recentCareEntries }: {
  event: GovernedCanonicalEvent;
  petId: string;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
  recentCareEntries: CareEntryRow[];
}): Promise<CarePersistenceResult> {
  const preparedEvent = prepareGovernedCareHistoryEvent(event);
  const proposal = preparedEvent.event;
  const targetPetId = proposal.subject.id || petId;
  const equivalent = findEquivalentRecentCareEntry({
    title: proposal.eventTitle,
    details: proposal.sourceExcerpt,
    severity: proposal.importance,
    transition: proposal.transition,
    entries: recentCareEntries.filter((entry) => entry.pet_profile_id === targetPetId),
  });
  if (equivalent) {
    return { status: "persisted", careEntryIds: [equivalent.id], concernIds: equivalent.concern_id ? [equivalent.concern_id] : [], errorCode: null,
      currentSafetyState: proposal.state === "resolved" ? "recently_resolved" : proposal.importance === "urgent" ? "urgent" : "routine", alreadyPersisted: true };
  }
  const { data, error } = await persistSemanticEventRpc({
    event: preparedEvent, fallbackPetId: petId, sourceMessageId, supabase, userId,
  });
  if (error) {
    logIntelligenceError("semantic_event_persistence", error, {
      sourceMessageIdPresent: Boolean(sourceMessageId), petIdPresent: Boolean(targetPetId),
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

async function persistCanonicalSemanticEvents(input: {
  events: GovernedCanonicalEvent[];
  petId: string;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
  recentCareEntries: CareEntryRow[];
}): Promise<CarePersistenceResult> {
  const results: CarePersistenceResult[] = [];
  for (const event of oneSemanticEventPerPet(input.events, input.petId)) {
    results.push(await persistCanonicalSemanticEvent({ ...input, event }));
  }
  if (results.some((result) => result.status === "failed")) {
    return {
      status: "failed",
      careEntryIds: results.flatMap((result) => result.careEntryIds),
      concernIds: results.flatMap((result) => result.concernIds),
      errorCode: results.find((result) => result.errorCode)?.errorCode || "SEMANTIC_EVENT_PERSISTENCE_FAILED",
      currentSafetyState: null,
      alreadyPersisted: results.every((result) => result.alreadyPersisted),
    };
  }
  return {
    status: results.length ? "persisted" : "skipped",
    careEntryIds: results.flatMap((result) => result.careEntryIds),
    concernIds: results.flatMap((result) => result.concernIds),
    errorCode: null,
    currentSafetyState: results.some((result) => result.currentSafetyState === "urgent") ? "urgent"
      : results.some((result) => result.currentSafetyState === "recently_resolved") ? "recently_resolved"
      : results.some((result) => result.currentSafetyState === "routine") ? "routine" : null,
    alreadyPersisted: results.length > 0 && results.every((result) => result.alreadyPersisted),
  };
}

export async function persistFeatureIntelligenceLearnings({
  careActions,
  feature,
  learnings,
  petId,
  payloadHash,
  requestId,
  operationOwnerToken,
  sourceInput,
  supabase,
  userId,
}: {
  careActions: IntelligenceCareAction[];
  feature: "product_question" | "product_query" | "safety_followup";
  learnings: IntelligenceLearning[];
  petId: string;
  payloadHash: string;
  requestId: string;
  operationOwnerToken: string;
  sourceInput: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<IntelligencePersistenceSummary> {
  const governedLearnings = await preparePersistableLearnings({ currentMessage: sourceInput, learnings, petId, supabase, userId });
  const normalizedLearnings = governedLearnings.map((learning) => ({ ...learning, normalizedValue: normalizeMemoryValue(learning.factValue) }));
  const operationType = feature === "product_question" ? "product.question"
    : feature === "product_query" ? "product.interpret" : "safety.followup";
  const { data, error } = await createOperationsAdminClient().rpc("persist_furvise_feature_intelligence", {
    p_care_actions: careActions, p_learnings: normalizedLearnings,
    p_operation_owner_token: operationOwnerToken, p_operation_type: operationType, p_payload_hash: payloadHash,
    p_pet_id: petId, p_request_id: requestId,
    p_source_input: sourceInput, p_source_type: feature, p_user_id: userId,
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

async function suppressExplicitlyReplacedPreferences({ learnings, sourceMessageId, supabase, userId }: {
  learnings: Array<IntelligenceLearning & { normalizedValue: string }>;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const correctionPetIds = new Set<string>();
  for (const learning of learnings) {
    if (learning.subjectType !== "pet" || !learning.subjectId) continue;
    if (historicalPreferenceTargetIdentity(learning)) {
      correctionPetIds.add(learning.subjectId);
      continue;
    }
    const semantic = normalizeKnownPreferenceMemory({
      subjectType: learning.subjectType, subjectId: learning.subjectId, factKey: learning.factKey,
      factValue: learning.factValue, canonicalConceptKey: learning.canonicalConceptKey,
    });
    if (!semantic) continue;
    if (semantic.polarity === "avoid" || /\b(?:actually|instead|correction|no longer|not anymore)\b/i.test(learning.sourceExcerpt)) {
      correctionPetIds.add(learning.subjectId);
    }
  }
  let supersededCount = 0;
  for (const targetPetId of correctionPetIds) {
    const { data: successorRows, error: successorError } = await supabase.from("furvise_memories")
      .select("id,fact_key,fact_value")
      .eq("user_id", userId)
      .eq("pet_id", targetPetId)
      .eq("subject_type", "pet")
      .eq("status", "active")
      .eq("source_id", sourceMessageId)
      .limit(20);
    if (successorError) {
      logIntelligenceError("corrected_preference_successor", successorError, { sourceMessageIdPresent: true, petIdPresent: true });
      continue;
    }
    const successors = (successorRows || []).flatMap((row) => {
      const semantic = normalizeKnownPreferenceMemory({
        subjectType: "pet", subjectId: targetPetId, factKey: String(row.fact_key),
        factValue: row.fact_value,
      });
      return semantic ? [{ id: String(row.id), semantic }] : [];
    });
    if (!successors.length) continue;
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
      const priorSemantic = normalizeKnownPreferenceMemory({
        subjectType: "pet", subjectId: targetPetId, factKey: String(row.fact_key), factValue: row.fact_value,
      });
      const successor = successors.find((item) => priorSemantic && preferenceTargetIdentity(item.semantic) === preferenceTargetIdentity(priorSemantic))
        || successors.find((item) => item.semantic.polarity === "prefer")
        || successors[0];
      const { data: suppressedRows, error: suppressError } = await supabase.from("furvise_memories")
        .update({ status: "superseded", superseded_by: successor.id, updated_at: new Date().toISOString() })
        .eq("id", row.id).eq("user_id", userId).eq("status", "active").select("id");
      if (suppressError) logIntelligenceError("corrected_preference_suppression", suppressError, {
        sourceMessageIdPresent: true, petIdPresent: true,
      });
      else supersededCount += suppressedRows?.length || 0;
    }
  }
  return supersededCount;
}

function normalizeFactKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }

async function persistCanonicalCareAction({ action, petId, sourceMessageId, supabase, userId, recentCareEntries }: {
  action: IntelligenceCareAction;
  petId: string;
  sourceMessageId: string;
  supabase: SupabaseClient;
  userId: string;
  recentCareEntries: CareEntryRow[];
}): Promise<CarePersistenceResult> {
  const equivalent = findEquivalentRecentCareEntry({
    title: action.title,
    details: action.details,
    severity: action.severity,
    entries: recentCareEntries.filter((entry) => entry.pet_profile_id === petId),
  });
  if (equivalent) {
    return { status: "persisted", careEntryIds: [equivalent.id], concernIds: equivalent.concern_id ? [equivalent.concern_id] : [], errorCode: null,
      currentSafetyState: action.action === "resolve_concern" ? "recently_resolved" : action.severity === "urgent" || action.severity === "emergency" ? "urgent" : "routine", alreadyPersisted: true };
  }
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

async function preparePersistableLearnings({ authorizedPetIds, currentMessage, learnings, petId, supabase, userId }: {
  authorizedPetIds?: string[];
  currentMessage: string | null;
  learnings: IntelligenceLearning[];
  petId: string;
  supabase: SupabaseClient;
  userId: string | null;
}) {
  let verifiedPetIds = [...new Set(authorizedPetIds || [petId])];
  if (userId) {
    let ownershipQuery = supabase.from("dog_profiles").select("id").eq("user_id", userId);
    if (authorizedPetIds) ownershipQuery = ownershipQuery.in("id", verifiedPetIds);
    const { data, error } = await ownershipQuery.returns<Array<{ id: string }>>();
    if (error) throw new IntelligencePersistenceError("Furvise could not verify memory ownership.", error);
    const ownedPetIds = new Set((data || []).map((row) => row.id));
    if (authorizedPetIds && ownedPetIds.size !== verifiedPetIds.length) throw new IntelligencePersistenceError("Furvise could not verify memory ownership.");
    verifiedPetIds = authorizedPetIds ? verifiedPetIds.filter((id) => ownedPetIds.has(id)) : [...ownedPetIds];
  }
  const typed = learnings.flatMap((learning) => {
    const decision = prepareTypedMemoryCandidate(learning, currentMessage || learning.sourceExcerpt, verifiedPetIds);
    return decision.accepted ? [decision.learning] : [];
  });
  if (!typed.length || !userId) return typed;

  const targetPetIds = [...new Set(typed.flatMap((learning) => learning.subjectType === "pet" && learning.subjectId ? [learning.subjectId] : []))];
  let query = supabase.from("furvise_memories")
    .select("category,fact_key,fact_value,pet_id,source_excerpt,subject_type")
    .eq("user_id", userId).eq("status", "active");
  if (targetPetIds.length) query = query.or(`pet_id.in.(${targetPetIds.join(",")}),pet_id.is.null`);
  else query = query.is("pet_id", null);
  const { data: existing, error: existingError } = await query.limit(200).returns<Array<{
    category: string; fact_key: string; fact_value: unknown; pet_id: string | null;
    source_excerpt: string | null; subject_type: "pet" | "owner";
  }>>();
  if (existingError) {
    logIntelligenceError("memory_deduplication_context", existingError, { petIdPresent: Boolean(petId) });
    return [];
  }
  const accepted: IntelligenceLearning[] = [];
  for (const learning of typed) {
    const candidate = {
      category: learning.category, fact_key: learning.factKey, fact_value: learning.factValue,
      pet_id: learning.subjectType === "pet" ? learning.subjectId : null,
      source_excerpt: learning.sourceExcerpt, subject_type: learning.subjectType,
    };
    const duplicate = [...(existing || []), ...accepted.map((item) => ({
      category: item.category, fact_key: item.factKey, fact_value: item.factValue,
      pet_id: item.subjectType === "pet" ? item.subjectId : null,
      source_excerpt: item.sourceExcerpt, subject_type: item.subjectType,
    }))].some((memory) => isEligibleStoredMemory(memory) && memory.fact_key !== candidate.fact_key
      && areMemorySemanticsEquivalent(memory, candidate));
    if (!duplicate) accepted.push(learning);
  }
  return accepted;
}
