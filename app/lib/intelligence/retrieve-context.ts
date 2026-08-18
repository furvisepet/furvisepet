import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadActiveConcerns, loadRecentlyResolvedConcerns } from "../ai/context-builder";
import type { CareEntryRow, DogMemoryRow, DogProductFeedbackRow, DogProfileRow, UserProfileRow } from "../supabase";
import { finalizeFurviseContext } from "./build-context";
import { getIntelligenceFeatureMode } from "./feature-modes";
import type { FurviseLiveContext, FurviseMemoryRow, IntelligenceFeature } from "./types";
import type { CareEpisode } from "./episodes/types";
import type { PetCurrentStateRow } from "./pet-state/types";
import { selectFreshRelevantMemories } from "./memory-freshness/select-fresh-memories.ts";
import { removeInactiveMemoryClaimsFromConversation, type InactiveMemoryMarker } from "./memory-lifecycle/filter-conversation";
import { isKnownConversationalCareNoise, isLongitudinalCareHistoryEntry } from "./care-history-policy.ts";
import { featureRequiresActivePet, getPetLifecycleStatus } from "../pet-lifecycle.ts";

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
  if (dateRange) careQuery = careQuery.gte("occurred_at", `${dateRange.from}T00:00:00.000Z`).lte("occurred_at", `${dateRange.to}T23:59:59.999Z`);
  const boundedCareQuery = careQuery.order("occurred_at", { ascending: false }).order("created_at", { ascending: false })
    .limit(mode.contextPolicy.careEntryLimit).returns<CareEntryRow[]>();
  const legacyMemoryQuery = supabase.from("dog_memories").select("*").eq("dog_profile_id", petId).eq("user_id", userId)
    .eq("status", "active").order("created_at", { ascending: false }).limit(mode.contextPolicy.memoryLimit).returns<DogMemoryRow[]>();
  const sharedMemoryQuery = supabase.from("furvise_memories").select("*").eq("user_id", userId).eq("status", "active")
    .or(`pet_id.eq.${petId},pet_id.is.null`).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("last_confirmed_at", { ascending: false }).limit(mode.contextPolicy.memoryLimit * 2).returns<FurviseMemoryRow[]>();
  const inactiveMemoryQuery = supabase.from("furvise_memories").select("fact_key,fact_value,normalized_value,status,updated_at").eq("user_id", userId)
    .in("status", ["resolved", "superseded", "rejected", "expired"]).or(`pet_id.eq.${petId},pet_id.is.null`)
    .order("updated_at", { ascending: false }).limit(40).returns<InactiveMemoryMarker[]>();
  const feedbackQuery = supabase.from("dog_product_feedback").select("*").eq("dog_profile_id", petId).eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(80).returns<DogProductFeedbackRow[]>();
  const ownerQuery = supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle<UserProfileRow>();
  const messagesQuery = conversationId ? supabase.from("ask_conversation_messages")
    .select("id, role, user_text, response_data, created_at")
    .eq("conversation_id", conversationId).eq("user_id", userId)
    .order("sequence_number", { ascending: false }).limit(mode.contextPolicy.conversationLimit)
    .returns<Array<{ id: string; role: "user" | "furvise"; user_text: string | null; response_data: Record<string, unknown> | null; created_at: string }>>()
    : Promise.resolve({ data: [], error: null });
  const episodesQuery = supabase.from("pet_care_episodes").select("*").eq("user_id", userId).eq("pet_profile_id", petId)
    .in("status", ["active", "monitoring", "resolved"]).order("last_event_at", { ascending: false }).limit(20).returns<CareEpisode[]>();
  const currentStateQuery = supabase.from("pet_current_state").select("*").eq("user_id", userId).eq("pet_profile_id", petId).maybeSingle<PetCurrentStateRow>();

  const [conversation, profile, eligiblePets, care, legacyMemories, sharedMemories, inactiveMemories, feedback, owner, messages, activeConcerns, resolvedConcerns, episodes, currentState] = await Promise.all([
    conversationQuery, profileQuery, eligiblePetsQuery, boundedCareQuery, legacyMemoryQuery, sharedMemoryQuery, inactiveMemoryQuery, feedbackQuery, ownerQuery, messagesQuery,
    loadActiveConcerns(supabase, userId, petId), loadRecentlyResolvedConcerns(supabase, userId, petId), episodesQuery, currentStateQuery,
  ]).catch((error) => { throw new FurviseContextError("CONTEXT_UNAVAILABLE", "Furvise could not load live context.", error); });

  if (profile.error || !profile.data) throw new FurviseContextError("PET_NOT_FOUND", "That pet is not available.", profile.error);
  const selectedProfile = profile.data;
  if (featureRequiresActivePet(feature) && getPetLifecycleStatus(selectedProfile) !== "active") {
    throw new FurviseContextError("PET_INACTIVE", "Routine product and care-plan guidance is not available for this retained profile.");
  }
  if (conversationId && (conversation.error || !conversation.data)) throw new FurviseContextError("CONVERSATION_NOT_FOUND", "That conversation is not available for this pet.", conversation.error);
  const queryError = eligiblePets.error || care.error || legacyMemories.error || sharedMemories.error || inactiveMemories.error || feedback.error || owner.error || messages.error || episodes.error || currentState.error;
  if (queryError) throw new FurviseContextError("CONTEXT_UNAVAILABLE", "Furvise could not load live context.", queryError);

  const candidateSourceMessageIds = [...new Set([
    ...(messages.data || []).map((message) => message.id),
    ...(sharedMemories.data || []).flatMap((memory) => memory.source_type === "ask_message" && memory.source_id ? [memory.source_id] : []),
  ])];
  const deletedCareSources = candidateSourceMessageIds.length ? await supabase.from("pet_care_entries")
    .select("id,intelligence_source_message_id,deleted_at")
    .eq("user_id", userId).eq("pet_profile_id", petId)
    .in("intelligence_source_message_id", candidateSourceMessageIds)
    .returns<Array<{ deleted_at: string | null; id: string; intelligence_source_message_id: string | null }>>()
    : { data: [], error: null };
  if (deletedCareSources.error) throw new FurviseContextError("CONTEXT_UNAVAILABLE", "Furvise could not load live context.", deletedCareSources.error);
  const deletedCareEntryIds = new Set((deletedCareSources.data || []).filter((row) => row.deleted_at).map((row) => row.id));
  const suppressedSourceMessageIds = new Set((deletedCareSources.data || []).filter((row) => row.deleted_at && row.intelligence_source_message_id).map((row) => row.intelligence_source_message_id!));

  const conversationTurns = removeInactiveMemoryClaimsFromConversation([...(messages.data || [])]
    .filter((message) => !suppressedSourceMessageIds.has(message.id) && !responseReferencesCareEntry(message.response_data, deletedCareEntryIds))
    .reverse().map((message) => ({
    id: message.id,
    role: message.role,
    text: message.role === "user" ? message.user_text || "" : responseText(message.response_data),
    createdAt: message.created_at,
  })).filter((message) => message.text.trim()), inactiveMemories.data || []);

  const longitudinalCareEntries = (care.data || []).filter(isLongitudinalCareHistoryEntry);
  const longitudinalEpisodes = (episodes.data || []).filter((episode) => !isKnownConversationalCareNoise(
    `${episode.title || ""} ${episode.normalized_key} ${JSON.stringify(episode.summary || {})}`,
  ));
  const longitudinalConcerns = activeConcerns.filter((concern) => !isKnownConversationalCareNoise(`${concern.title} ${concern.normalized_key}`));
  const longitudinalResolvedConcerns = resolvedConcerns.filter((concern) => !isKnownConversationalCareNoise(`${concern.title} ${concern.normalized_key}`));
  const longitudinalCurrentState = currentState.data && isKnownConversationalCareNoise(JSON.stringify(currentState.data.state)) ? null : currentState.data;

  return finalizeFurviseContext({
    feature, locale, currentMessage, currentTimestamp: new Date().toISOString(), conversationId,
    pet: selectedProfile,
    eligiblePets: (eligiblePets.data || [selectedProfile]).filter((pet) => pet.id === selectedProfile.id || getPetLifecycleStatus(pet) === "active"),
    owner: { userId, profile: owner.data || null }, careEntries: longitudinalCareEntries,
    activeConcerns: longitudinalConcerns, recentlyResolvedConcerns: longitudinalResolvedConcerns, legacyPetMemories: legacyMemories.data || [],
    activeEpisodes: longitudinalEpisodes.filter((episode) => episode.status === "active"),
    monitoringEpisodes: longitudinalEpisodes.filter((episode) => episode.status === "monitoring"),
    recentlyResolvedEpisodes: longitudinalEpisodes.filter((episode) => episode.status === "resolved").slice(0, 8),
    currentState: longitudinalCurrentState || null,
    memories: selectFreshRelevantMemories((sharedMemories.data || []).filter((memory) => !(
      memory.source_type === "ask_message" && memory.source_id && suppressedSourceMessageIds.has(memory.source_id)
    )), currentMessage, new Date(), mode.contextPolicy.memoryLimit).map((item) => item.memory),
    productFeedback: feedback.data || [], conversationTurns,
  });
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
