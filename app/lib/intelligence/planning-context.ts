import { loadStoredReadReferences } from "../furvise-brain/stored-read-organ.ts";
import { loadReplaceReferences } from "./replace-reference-context.ts";
import { randomUUID } from "node:crypto";
import type { PetConcern } from "../ai/concern-engine.ts";
import type { ConcernReference } from "../furvise-brain/state-transition-job.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DogProfileRow } from "../supabase.ts";
import type { FurviseLiveContext } from "./types.ts";
import { FurviseContextError } from "./retrieve-context.ts";
import { ownerNoteSourceSpans } from "./owner-note-request.ts";
import { loadActionCapabilitiesForMessages } from "../ask-conversation-server.ts";
import { parseStoredApplicationActions } from "../application-actions/contracts.ts";

/** Planning sees owned target metadata and dialogue; neither authorizes factual publication. */
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
  // Opaque handles expose exact owned state targets to Brain, never a factual read result.
  const concerns = await supabase.from("pet_concerns").select("id,user_id,pet_profile_id,title,status,severity,normalized_key,opened_at,updated_at,resolved_at,resolution_note,source_care_entry_id")
    .eq("user_id", userId).in("pet_profile_id", eligiblePets.map(p => p.id))
    .in("status", ["active", "monitoring", "reopened", "resolved"]);
  const ownedConcerns = (concerns.error ? [] : concerns.data || []).filter(row => row.user_id === userId
    && eligiblePets.some(p => p.id === row.pet_profile_id && p.user_id === userId)) as PetConcern[];
  const concernReferences: ConcernReference[] = ownedConcerns.flatMap(row =>
    row.user_id === userId && eligiblePets.some(p => p.id === row.pet_profile_id && p.user_id === userId)
      ? [{ ref: randomUUID(), ownerId: userId, petId: row.pet_profile_id, concernId: row.id,
        status: row.status as ConcernReference["status"], title: row.title }] : []);
  // Lookup failure supplies no mutation handles; unrelated Ask remains available.
  // Pending lifecycle authority comes only from owner-scoped capabilities.
  const assistantIds = (messages.data || []).filter(row => row.role === "furvise").map(row => row.id as string);
  const capabilities = assistantIds.length ? await loadActionCapabilitiesForMessages(userId, assistantIds) : null;
  const lifecycleActionState = { ownerId: userId, complete: capabilities?.complete ?? !assistantIds.length,
    actions: capabilities ? parseStoredApplicationActions([...capabilities.values()].flat()) : [] };
  // Assistant text is not factual authority. Only USER dialogue is needed to bind sources.
  const conversationTurns = (messages.data || []).filter(row => row.role === "user").reverse().map(row => ({
    id: row.id as string, role: "user" as const, text: row.user_text as string, createdAt: row.created_at as string,
  }));
  const currentTurn = conversationTurns.find(turn => turn.id === input.sourceMessageId);
  if (!currentTurn || currentTurn.text !== input.currentMessage) throw new FurviseContextError("CONTEXT_UNAVAILABLE", "The request source could not be verified.");
  const replaceReferences = await loadReplaceReferences(userId, eligiblePets.map(p => p.id), currentTurn.createdAt);
  const storedReadReferences = await loadStoredReadReferences(userId);
  return { storedReadReferences, replaceReferences, feature: "ask", locale: input.locale, timeZone: input.timeZone, currentMessage: input.currentMessage, currentTimestamp: new Date().toISOString(),
    conversationId, pet, eligiblePets, owner: { userId, profile: null }, currentTurn, conversationTurns, lifecycleActionState, concernReferences,
    ownerNoteSpans: ownerNoteSourceSpans(input.currentMessage, input.sourceMessageId),
    careEntries: [], selectedCareEntries: [], activeConcerns: ownedConcerns.filter(row => row.status !== "resolved"),
    recentlyResolvedConcerns: ownedConcerns.filter(row => row.status === "resolved"), activeEpisodes: [], monitoringEpisodes: [],
    recentlyResolvedEpisodes: [], currentState: null, legacyPetMemories: [], memories: [], productFeedback: [], contextRecovery: { unavailableSources: [] } };
}
