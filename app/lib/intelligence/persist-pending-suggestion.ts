import type { SupabaseClient } from "@supabase/supabase-js";
import { buildResolutionSuggestion, isPendingUpdateSuggestionGrounded, type PendingUpdateSuggestion, type PetConcern } from "../ai/concern-engine.ts";

export async function persistPendingSuggestion({
  createCanonicalCareAuthorityClient,
  logAskServerError,
  assistantMessageId,
  conversationId,
  petId,
  petName,
  sourceMessage,
  suggestion,
  supabase,
  userId,
}: {
  createCanonicalCareAuthorityClient: () => SupabaseClient;
  logAskServerError: (stage: string, error: unknown, context: Record<string, unknown>, status: number) => void;
  assistantMessageId: string;
  conversationId: string;
  petId: string;
  petName: string;
  sourceMessage: string;
  suggestion: PendingUpdateSuggestion;
  supabase: SupabaseClient;
  userId: string;
}): Promise<{
  careEntryId?: string | null;
  concernId?: string | null;
  effectAlreadyPresent: boolean;
  errorCode: string | null;
  suggestion: (PendingUpdateSuggestion & { id: string }) | null;
}> {
  let activeConcerns: PetConcern[] = [];
  let authoritativeConcern: PetConcern | null = null;
  if (suggestion.type === "concern_resolution") {
    const { data, error } = await supabase.from("pet_concerns")
      .select("*")
      .eq("user_id", userId)
      .eq("pet_profile_id", petId)
      .in("status", ["active", "monitoring", "reopened"])
      .is("resolved_at", null)
      .returns<PetConcern[]>();
    if (error) {
      logAskServerError("suggestion_concern_authority_lookup", error, { conversationId, petId }, 200);
      return { careEntryId: null, concernId: null, effectAlreadyPresent: false, errorCode: "HISTORY_SUGGESTION_AUTHORITY_UNAVAILABLE", suggestion: null };
    }
    activeConcerns = (data || []).filter((concern) => concern.user_id === userId && concern.pet_profile_id === petId);
    authoritativeConcern = activeConcerns.find((concern) => concern.id === suggestion.concernId) || null;
  }
  if (!isPendingUpdateSuggestionGrounded({
    suggestion,
    message: sourceMessage,
    hasActiveConcern: suggestion.type === "concern_resolution",
    concern: authoritativeConcern,
    activeConcerns,
    petId,
    petName,
  })) {
    return { careEntryId: null, concernId: null, effectAlreadyPresent: false, errorCode: null, suggestion: null };
  }
  if (suggestion.type === "concern_resolution" && suggestion.concernId) {
    // Neither model titles nor model notes/keys are authoritative persisted data.
    suggestion = buildResolutionSuggestion({ concern: authoritativeConcern!, message: sourceMessage, petName });
    const { data: pendingForConcern } = await supabase.from("ai_update_suggestions").select("id")
      .eq("user_id", userId).eq("type", suggestion.type).eq("concern_id", suggestion.concernId).eq("status", "pending")
      .limit(1).maybeSingle<{ id: string }>();
    if (pendingForConcern) return { effectAlreadyPresent: false, errorCode: null, suggestion: null };
  }
  const semanticTopic = textPayloadValue(suggestion.payload.semanticTopic);
  const semanticDomain = textPayloadValue(suggestion.payload.semanticDomain);
  const semanticTransition = textPayloadValue(suggestion.payload.semanticTransition);
  if (suggestion.type === "history" && semanticTopic && semanticDomain
    && ["improved", "resolved", "corrected"].includes(semanticTransition || "")) {
    const { data: prior, error: priorError } = await supabase.from("ai_update_suggestions")
      .select("id,title,details,payload").eq("user_id", userId).eq("pet_profile_id", petId).eq("conversation_id", conversationId)
      .eq("type", "history").eq("status", "pending")
      .contains("payload", { semanticDomain, semanticTopic })
      .order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string; title: string; details: string | null; payload: Record<string, unknown> }>();
    if (priorError) logAskServerError("suggestion_reconciliation_lookup", priorError, { conversationId, requestId: assistantMessageId }, 200);
    if (prior) {
      const { error: updateError } = await createCanonicalCareAuthorityClient().from("ai_update_suggestions").update({
        details: suggestion.details || null,
        payload: suggestion.payload,
        source_message_id: assistantMessageId,
        title: suggestion.title,
      }).eq("id", prior.id).eq("user_id", userId).eq("status", "pending");
      if (updateError) {
        logAskServerError("suggestion_reconciliation_update", updateError, { conversationId, requestId: assistantMessageId }, 200);
        return { effectAlreadyPresent: false, errorCode: "HISTORY_SUGGESTION_RECONCILIATION_FAILED", suggestion: {
          ...suggestion, id: prior.id, title: prior.title, details: prior.details || undefined, payload: prior.payload,
        } };
      }
      return { effectAlreadyPresent: false, errorCode: null, suggestion: { ...suggestion, id: prior.id } };
    }
  }
  let existingQuery = supabase.from("ai_update_suggestions")
    .select("id").eq("user_id", userId).eq("source_message_id", assistantMessageId).eq("type", suggestion.type)
    .eq("status", "pending");
  existingQuery = suggestion.concernId ? existingQuery.eq("concern_id", suggestion.concernId) : existingQuery.is("concern_id", null);
  const { data: existing } = await existingQuery.maybeSingle<{ id: string }>();
  if (existing) return { effectAlreadyPresent: false, errorCode: null, suggestion: { ...suggestion, id: existing.id } };
  const { data, error } = await createCanonicalCareAuthorityClient()
    .from("ai_update_suggestions")
    .insert({
      concern_id: suggestion.concernId || null,
      conversation_id: conversationId,
      details: suggestion.details || null,
      payload: suggestion.payload,
      pet_profile_id: petId,
      source_message_id: assistantMessageId,
      status: "pending",
      title: suggestion.title,
      type: suggestion.type,
      user_id: userId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    logAskServerError("suggestion_persistence_failed", error, { conversationId }, 200);
    if (error?.code === "23505") {
      const { data: duplicate } = await supabase.from("ai_update_suggestions").select("id")
        .eq("user_id", userId).eq("source_message_id", assistantMessageId).eq("type", suggestion.type)
        .eq("status", "pending").maybeSingle<{ id: string }>();
      if (duplicate) return { effectAlreadyPresent: false, errorCode: null, suggestion: { ...suggestion, id: duplicate.id } };
    }
    return { effectAlreadyPresent: false, errorCode: "HISTORY_SUGGESTION_PERSISTENCE_FAILED", suggestion: null };
  }
  return { effectAlreadyPresent: false, errorCode: null, suggestion: { ...suggestion, id: data.id } };
}

function textPayloadValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
