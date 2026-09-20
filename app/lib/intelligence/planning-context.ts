import type { SupabaseClient } from "@supabase/supabase-js";
import type { DogProfileRow } from "../supabase.ts";
import type { FurviseLiveContext } from "./types.ts";
import { FurviseContextError } from "./retrieve-context.ts";
import { ownerNoteSourceSpans } from "./owner-note-request.ts";

/** Planning can see identities and dialogue, never a factual-history projection. */
export async function buildFurvisePlanningContext(input: {
  supabase: SupabaseClient; userId: string; petId: string; conversationId: string; currentMessage: string;
  sourceMessageId: string; locale: string; timeZone?: string;
}): Promise<FurviseLiveContext> {
  const { supabase, userId, petId, conversationId } = input;
  const [pets, conversation, messages] = await Promise.all([
    supabase.from("dog_profiles").select("id,user_id,name,species,lifecycle_status,sex").eq("user_id", userId),
    supabase.from("ask_conversations").select("id").eq("id", conversationId).eq("user_id", userId).eq("pet_profile_id", petId).maybeSingle(),
    supabase.from("ask_conversation_messages").select("id,role,user_text,created_at").eq("conversation_id", conversationId).eq("user_id", userId)
      .order("sequence_number", { ascending: false }).limit(40),
  ]);
  if (pets.error || conversation.error || messages.error || !conversation.data) throw new FurviseContextError("CONTEXT_UNAVAILABLE", "Furvise could not verify the conversation.");
  const eligiblePets = (pets.data || []) as DogProfileRow[];
  const pet = eligiblePets.find(row => row.id === petId && row.user_id === userId);
  if (!pet) throw new FurviseContextError("PET_NOT_FOUND", "That pet is not available.");
  // Assistant text is not factual authority. Only USER dialogue is needed to bind sources.
  const conversationTurns = (messages.data || []).filter(row => row.role === "user").reverse().map(row => ({
    id: row.id as string, role: "user" as const, text: row.user_text as string, createdAt: row.created_at as string,
  }));
  const currentTurn = conversationTurns.find(turn => turn.id === input.sourceMessageId);
  if (!currentTurn || currentTurn.text !== input.currentMessage) throw new FurviseContextError("CONTEXT_UNAVAILABLE", "The request source could not be verified.");
  return { feature: "ask", locale: input.locale, timeZone: input.timeZone, currentMessage: input.currentMessage, currentTimestamp: new Date().toISOString(),
    conversationId, pet, eligiblePets, owner: { userId, profile: null }, currentTurn, conversationTurns,
    ownerNoteSpans: ownerNoteSourceSpans(input.currentMessage, input.sourceMessageId),
    careEntries: [], selectedCareEntries: [], activeConcerns: [], recentlyResolvedConcerns: [], activeEpisodes: [], monitoringEpisodes: [],
    recentlyResolvedEpisodes: [], currentState: null, legacyPetMemories: [], memories: [], productFeedback: [], contextRecovery: { unavailableSources: [] } };
}
