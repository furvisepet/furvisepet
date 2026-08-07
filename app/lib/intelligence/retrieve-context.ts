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

export class FurviseContextError extends Error {
  constructor(public code: "PET_NOT_FOUND" | "CONVERSATION_NOT_FOUND" | "CONTEXT_UNAVAILABLE", message: string, public cause?: unknown) {
    super(message);
    this.name = "FurviseContextError";
  }
}

export async function buildFurviseContext({
  conversationId = null,
  currentMessage,
  dateRange,
  feature = "ask",
  locale = "en",
  petId,
  supabase,
  userId,
}: {
  conversationId?: string | null;
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
    .eq("pet_profile_id", petId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>() : Promise.resolve({ data: null, error: null });
  const profileQuery = supabase.from("dog_profiles").select("*").eq("id", petId).eq("user_id", userId).maybeSingle<DogProfileRow>();
  let careQuery = supabase.from("pet_care_entries").select("*").eq("pet_profile_id", petId).eq("user_id", userId);
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

  const [conversation, profile, care, legacyMemories, sharedMemories, inactiveMemories, feedback, owner, messages, activeConcerns, resolvedConcerns, episodes, currentState] = await Promise.all([
    conversationQuery, profileQuery, boundedCareQuery, legacyMemoryQuery, sharedMemoryQuery, inactiveMemoryQuery, feedbackQuery, ownerQuery, messagesQuery,
    loadActiveConcerns(supabase, userId, petId), loadRecentlyResolvedConcerns(supabase, userId, petId), episodesQuery, currentStateQuery,
  ]).catch((error) => { throw new FurviseContextError("CONTEXT_UNAVAILABLE", "Furvise could not load live context.", error); });

  if (profile.error || !profile.data) throw new FurviseContextError("PET_NOT_FOUND", "That pet is not available.", profile.error);
  if (conversationId && (conversation.error || !conversation.data)) throw new FurviseContextError("CONVERSATION_NOT_FOUND", "That conversation is not available for this pet.", conversation.error);
  const queryError = care.error || legacyMemories.error || sharedMemories.error || inactiveMemories.error || feedback.error || owner.error || messages.error || episodes.error || currentState.error;
  if (queryError) throw new FurviseContextError("CONTEXT_UNAVAILABLE", "Furvise could not load live context.", queryError);

  const conversationTurns = removeInactiveMemoryClaimsFromConversation([...(messages.data || [])].reverse().map((message) => ({
    id: message.id,
    role: message.role,
    text: message.role === "user" ? message.user_text || "" : responseText(message.response_data),
    createdAt: message.created_at,
  })).filter((message) => message.text.trim()), inactiveMemories.data || []);

  return finalizeFurviseContext({
    feature, locale, currentMessage, currentTimestamp: new Date().toISOString(), conversationId,
    pet: profile.data, owner: { userId, profile: owner.data || null }, careEntries: care.data || [],
    activeConcerns, recentlyResolvedConcerns: resolvedConcerns, legacyPetMemories: legacyMemories.data || [],
    activeEpisodes: (episodes.data || []).filter((episode) => episode.status === "active"),
    monitoringEpisodes: (episodes.data || []).filter((episode) => episode.status === "monitoring"),
    recentlyResolvedEpisodes: (episodes.data || []).filter((episode) => episode.status === "resolved").slice(0, 8),
    currentState: currentState.data || null,
    memories: selectFreshRelevantMemories(sharedMemories.data || [], currentMessage, new Date(), mode.contextPolicy.memoryLimit).map((item) => item.memory),
    productFeedback: feedback.data || [], conversationTurns,
  });
}

function responseText(value: Record<string, unknown> | null) {
  if (!value) return "";
  return typeof value.directAnswer === "string" ? value.directAnswer : typeof value.summary === "string" ? value.summary : "";
}
