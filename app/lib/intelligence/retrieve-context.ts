import "server-only";
import { enforceAskHistoryAccess, type AskHistoryAccess } from "./history-access.ts";
import { episodePresentation } from "./episode-presentation.ts";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadActiveConcerns, loadRecentlyResolvedConcerns } from "../ai/context-builder";
import type { CareEntryRow, DogProductFeedbackRow, DogProfileRow, UserProfileRow } from "../supabase";
import { finalizeFurviseContext } from "./build-context";
import { evidenceSource } from "./ask-evidence.ts";
import { getIntelligenceFeatureMode } from "./feature-modes";
import type { FurviseLiveContext, IntelligenceFeature } from "./types";
import type { CareEpisode } from "./episodes/types";
import type { PetCurrentStateRow } from "./pet-state/types";
import { loadMemorySources, selectMemorySources } from "./memory-sources.ts";
import { removeInactiveMemoryClaimsFromConversation } from "./memory-lifecycle/filter-conversation";
import { isKnownConversationalCareNoise, isLongitudinalCareHistoryEntry } from "./care-history-policy.ts";
import { featureRequiresActivePet, getPetLifecycleStatus } from "../pet-lifecycle.ts";
import { parseStoredApplicationActions } from "../application-actions/contracts.ts";
import { recoverOptionalQuery, recoverOptionalValue } from "./context-recovery.ts";
import { loadActionCapabilitiesForMessages, presentationOnlyAskResponse } from "../ask-conversation-server.ts";

export class FurviseContextError extends Error {
  constructor(public code: "PET_NOT_FOUND" | "PET_INACTIVE" | "CONVERSATION_NOT_FOUND" | "CONTEXT_UNAVAILABLE", message: string, public cause?: unknown) {
    super(message);
    this.name = "FurviseContextError";
  }
}

export async function buildFurviseContext({
  conversationId = null,
  conversationPetId = null,
  currentMessage,
  dateRange,
  historyAccess,
  feature = "ask",
  locale = "en",
  petId,
  supabase,
  userId,
}: {
  conversationId?: string | null;
  conversationPetId?: string | null;
  currentMessage: string;
  dateRange?: { from: string; to: string };
  historyAccess?: AskHistoryAccess;
  feature?: IntelligenceFeature;
  locale?: string;
  petId: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<FurviseLiveContext> {
  const mode = getIntelligenceFeatureMode(feature);
  const conversationQuery = conversationId ? supabase
    .from("ask_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("pet_profile_id", conversationPetId || petId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>() : Promise.resolve({ data: null, error: null });
  const profileQuery = supabase.from("dog_profiles").select("*").eq("id", petId).eq("user_id", userId).maybeSingle<DogProfileRow>();
  const eligiblePetsQuery = supabase.from("dog_profiles").select("*").eq("user_id", userId).returns<DogProfileRow[]>();
  let careQuery = supabase.from("pet_care_entries").select("*").eq("pet_profile_id", petId).eq("user_id", userId).is("deleted_at", null);
  if (historyAccess) careQuery = careQuery.gte("occurred_at", historyAccess.from).lt("occurred_at", historyAccess.to);
  if (dateRange) careQuery = careQuery.gte("occurred_at", `${dateRange.from}T00:00:00.000Z`).lte("occurred_at", `${dateRange.to}T23:59:59.999Z`);
  const boundedCareQuery = careQuery.order("occurred_at", { ascending: false }).order("created_at", { ascending: false })
    .limit(mode.contextPolicy.careEntryLimit).returns<CareEntryRow[]>();
  const feedbackQuery = supabase.from("dog_product_feedback").select("*").eq("dog_profile_id", petId).eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(80).returns<DogProductFeedbackRow[]>();
  const ownerQuery = supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle<UserProfileRow>();
  const messagesQuery = conversationId ? supabase.from("ask_conversation_messages")
    .select("id, request_id, role, user_text, response_data, created_at")
    .eq("conversation_id", conversationId).eq("user_id", userId)
    .order("sequence_number", { ascending: false }).limit(mode.contextPolicy.conversationLimit)
    .returns<Array<{ id: string; request_id: string | null; role: "user" | "furvise"; user_text: string | null; response_data: Record<string, unknown> | null; created_at: string }>>()
    : Promise.resolve({ data: [], error: null });
  const episodesQuery = supabase.from("pet_care_episodes").select("*").eq("user_id", userId).eq("pet_profile_id", petId)
    .in("status", ["active", "monitoring", "resolved"]).order("last_event_at", { ascending: false }).limit(20).returns<CareEpisode[]>();
  const currentStateQuery = supabase.from("pet_current_state").select("*").eq("user_id", userId).eq("pet_profile_id", petId).maybeSingle<PetCurrentStateRow>();

  const [conversation, profile, eligiblePets] = await Promise.all([
    conversationQuery, profileQuery, eligiblePetsQuery,
  ]).catch((error) => { throw new FurviseContextError("CONTEXT_UNAVAILABLE", "Furvise could not load live context.", error); });

  if (profile.error || !profile.data) throw new FurviseContextError("PET_NOT_FOUND", "That pet is not available.", profile.error);
  const selectedProfile = profile.data;
  if (featureRequiresActivePet(feature) && getPetLifecycleStatus(selectedProfile) !== "active") {
    throw new FurviseContextError("PET_INACTIVE", "Routine product and care-plan guidance is not available for this retained profile.");
  }
  if (conversationId && (conversation.error || !conversation.data)) throw new FurviseContextError("CONVERSATION_NOT_FOUND", "That conversation is not available for this pet.", conversation.error);
  if (eligiblePets.error) throw new FurviseContextError("CONTEXT_UNAVAILABLE", "Furvise could not verify eligible pets.", eligiblePets.error);

  const [care, memorySources, feedback, owner, messages, activeConcerns, resolvedConcerns, episodes, currentState] = await Promise.all([
    recoverOptionalQuery("care_entries", boundedCareQuery, [] as CareEntryRow[]),
    loadMemorySources({ supabase, userId, petId, limit: mode.contextPolicy.memoryLimit, now: new Date() }),
    recoverOptionalQuery("product_feedback", feedbackQuery, [] as DogProductFeedbackRow[]),
    recoverOptionalQuery("owner_profile", ownerQuery, null as UserProfileRow | null),
    recoverOptionalQuery("conversation_messages", messagesQuery, [] as Array<{ id: string; request_id: string | null; role: "user" | "furvise"; user_text: string | null; response_data: Record<string, unknown> | null; created_at: string }>),
    recoverOptionalValue("active_concerns", loadActiveConcerns(supabase, userId, petId), [] as Awaited<ReturnType<typeof loadActiveConcerns>>),
    recoverOptionalValue("resolved_concerns", loadRecentlyResolvedConcerns(supabase, userId, petId), [] as Awaited<ReturnType<typeof loadRecentlyResolvedConcerns>>),
    recoverOptionalQuery("care_episodes", episodesQuery, [] as CareEpisode[]),
    recoverOptionalQuery("current_state", currentStateQuery, null as PetCurrentStateRow | null),
  ]);
  const { legacyMemories, sharedMemories, inactiveMemories } = memorySources;
  const unavailableSources = [care, legacyMemories, sharedMemories, inactiveMemories, feedback, owner, messages, activeConcerns, resolvedConcerns, episodes, currentState]
    .filter((result) => result.unavailable)
    .map((result) => result.source);
  const capabilityActions = await loadActionCapabilitiesForMessages(userId, messages.data.filter((message) => message.role === "furvise").map((message) => message.id));

  const candidateSourceMessageIds = [...new Set([
    ...messages.data.map((message) => message.id),
    ...sharedMemories.data.flatMap((memory) => memory.source_type === "ask_message" && memory.source_id ? [memory.source_id] : []),
  ])];
  const deletedCareSources = await recoverOptionalQuery("conversation_source_lineage", candidateSourceMessageIds.length ? supabase.from("pet_care_entries")
    .select("id,intelligence_source_message_id,deleted_at,note,occurred_at")
    .eq("user_id", userId).eq("pet_profile_id", petId)
    .in("intelligence_source_message_id", candidateSourceMessageIds)
    .returns<Array<{ deleted_at: string | null; id: string; note: string; occurred_at: string; intelligence_source_message_id: string | null }>>()
    : Promise.resolve({ data: [], error: null }), [] as Array<{ deleted_at: string | null; id: string; note: string; occurred_at: string; intelligence_source_message_id: string | null }>);
  // Fail closed on unverified conversation lineage, not on independent owned
  // profile/history retrieval. No receipt or stale conversation fact is issued.
  if (deletedCareSources.unavailable) unavailableSources.push("conversation_source_lineage");
  const deletedCareEntryIds = new Set((deletedCareSources.data || []).filter((row) => row.deleted_at).map((row) => row.id));
  const suppressedSourceMessageIds = new Set(deletedCareSources.unavailable ? candidateSourceMessageIds
    : deletedCareSources.data.filter(row => row.deleted_at && row.intelligence_source_message_id).map(row => row.intelligence_source_message_id!));

  const selectedMemories = selectMemorySources(memorySources, { currentMessage, suppressedSourceMessageIds, now: new Date(), limit: mode.contextPolicy.memoryLimit });
  const conversationTurns = removeInactiveMemoryClaimsFromConversation([...messages.data]
    .filter((message) => !suppressedSourceMessageIds.has(message.id) && !responseReferencesCareEntry(message.response_data, deletedCareEntryIds))
    .reverse().map((message) => {
      const trustedActions = capabilityActions.get(message.id) || [];
      const trustedResponse = message.role === "furvise"
        ? presentationOnlyAskResponse(message.response_data, trustedActions) as Record<string, unknown> | null
        : null;
      return {
        id: message.id,
        role: message.role,
        text: message.role === "user" ? message.user_text || "" : responseText(trustedResponse),
        createdAt: message.created_at,
        ...(message.role === "user" && message.request_id ? { operationReceipt: {
          sourceMessageId: message.id, petId, requestText: message.user_text || "",
          answerPersisted: messages.data.some(other => other.role === "furvise" && other.request_id === message.request_id),
          records: (deletedCareSources.data || []).filter(row => !row.deleted_at && row.intelligence_source_message_id === message.id)
            .map(row => ({ id: row.id, note: row.note, occurredAt: row.occurred_at })),
        } } : {}),
        ...(message.role === "furvise" ? { applicationActions: parseStoredApplicationActions(trustedActions) } : {}),
      };
    }).filter((message) => message.text.trim()), selectedMemories.inactiveMemoryMarkers);

  const longitudinalCareEntries = care.data.filter(isLongitudinalCareHistoryEntry);
  const longitudinalEpisodes = episodes.data.filter((episode) => !isKnownConversationalCareNoise(
    `${episode.title || ""} ${episode.normalized_key} ${JSON.stringify(episode.summary || {})}`,
  ));
  const longitudinalConcerns = activeConcerns.data.filter((concern) => !isKnownConversationalCareNoise(`${concern.title} ${concern.normalized_key}`));
  const longitudinalResolvedConcerns = resolvedConcerns.data.filter((concern) => !isKnownConversationalCareNoise(`${concern.title} ${concern.normalized_key}`));
  const longitudinalCurrentState = currentState.data && isKnownConversationalCareNoise(JSON.stringify(currentState.data.state)) ? null : currentState.data;

  return enforceAskHistoryAccess(finalizeFurviseContext({
    historyAccess,
    evidenceLoading: {
      dateRange,
      losses: [
        ...messages.data.filter(message => message.role === "furvise" && message.response_data?.sections)
          .map(message => ({ sourceId: `conversation:${message.id}`, reason: "conversation_presentation_projection" })),
        ...episodes.data.map(episode => ({ sourceId: `episode:${episode.id}`, reason: "episode_projection" })),
        ...messages.data.filter(message => message.role === "user" && conversationTurns.find(turn => turn.id === message.id)?.text !== message.user_text)
          .map(message => ({ sourceId: `conversation:${message.id}`, reason: "conversation_policy_filter" })),
        ...(currentState.data ? [{ sourceId: `current_state:${petId}`, reason: "current_state_projection" }] : []),
        ...(owner.data ? [{ sourceId: `owner_profile:${userId}`, reason: "owner_profile_projection" }] : []),
        ...(inactiveMemories.data.length ? [{ sourceId: `inactive_memories:${petId}`, reason: "policy_only_source_not_model_evidence" }] : []),
      ],
      sources: [evidenceSource(petId, "profile", [selectedProfile.id]), ...[
        [care, "care", mode.contextPolicy.careEntryLimit],
        [legacyMemories, "memory", mode.contextPolicy.memoryLimit],
        [sharedMemories, "memory", mode.contextPolicy.memoryLimit * 2],
        [inactiveMemories, "inactive_memory", 40], [feedback, "product-feedback", 80],
        [owner, "owner_profile", null], [messages, "conversation", mode.contextPolicy.conversationLimit],
        [activeConcerns, "concern", null], [resolvedConcerns, "concern", 5],
        [episodes, "episode", 20], [currentState, "current_state", null],
      ].map(([result, prefix, cap]) => {
        const loaded = result as { source: string; unavailable: boolean; data: unknown };
        const rows = (Array.isArray(loaded.data) ? loaded.data : loaded.data ? [loaded.data] : []) as Array<{ id?: string }>;
        const source = evidenceSource(petId, loaded.source, rows.flatMap(row => row.id ? [`${prefix}:${row.id}`] : []), cap as number | null, loaded.unavailable, rows.length);
        if (loaded.source === "care_entries" && dateRange) source.loadedPeriod = dateRange;
        if (loaded.source === "resolved_concerns") source.reasons.push("seven_day_window");
        return source;
      })],
    },
    // Presentation-only sections have not passed memory text redaction. Suppress
    // the hint whenever deleted/forgotten evidence could be reintroduced.
    episodePresentation: deletedCareSources.unavailable || inactiveMemories.unavailable || selectedMemories.inactiveMemoryMarkers.length || deletedCareEntryIds.size ? undefined
      : episodePresentation(messages.data, new Set(conversationTurns.filter(turn => turn.role !== "user"
        || messages.data.find(message => message.id === turn.id)?.user_text === turn.text).map(turn => turn.id)), selectedProfile, eligiblePets.data || [selectedProfile]),
    feature, locale, currentMessage, currentTimestamp: new Date().toISOString(), conversationId,
    pet: selectedProfile,
    eligiblePets: (eligiblePets.data || [selectedProfile]).filter((pet) => pet.id === selectedProfile.id || getPetLifecycleStatus(pet) === "active"),
    owner: { userId, profile: owner.data }, careEntries: longitudinalCareEntries,
    activeConcerns: longitudinalConcerns, recentlyResolvedConcerns: longitudinalResolvedConcerns,
    legacyPetMemories: selectedMemories.legacyPetMemories,
    activeEpisodes: longitudinalEpisodes.filter((episode) => episode.status === "active"),
    monitoringEpisodes: longitudinalEpisodes.filter((episode) => episode.status === "monitoring"),
    recentlyResolvedEpisodes: longitudinalEpisodes.filter((episode) => episode.status === "resolved").slice(0, 8),
    currentState: longitudinalCurrentState || null,
    memories: selectedMemories.memories,
    productFeedback: feedback.data, conversationTurns, contextRecovery: { unavailableSources },
  }));
}

function responseText(value: Record<string, unknown> | null) {
  if (!value) return "";
  return typeof value.directAnswer === "string" ? value.directAnswer : typeof value.summary === "string" ? value.summary : "";
}

function responseReferencesCareEntry(value: Record<string, unknown> | null, deletedCareEntryIds: Set<string>) {
  if (!value || deletedCareEntryIds.size === 0) return false;
  const persistence = value.carePersistence;
  if (!persistence || typeof persistence !== "object" || Array.isArray(persistence)) return false;
  const careEntryIds = (persistence as { careEntryIds?: unknown }).careEntryIds;
  return Array.isArray(careEntryIds) && careEntryIds.some((id) => typeof id === "string" && deletedCareEntryIds.has(id));
}
