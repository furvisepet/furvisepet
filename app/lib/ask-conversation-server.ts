import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateSensitiveRequestOriginResponse } from "./security/headers/origin-policy";
import { deduplicateLegacyRetriedMessages, type AskConversationDetail, type AskConversationSummary, type StoredAskMessage, type StoredAskSuggestion } from "./ask-conversations";

export async function getAskConversationRequestContext(request: Request): Promise<
  | { response: Response }
  | { supabase: SupabaseClient; userId: string }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { response: Response.json({ error: "Authentication required." }, { status: 401 }) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response: Response.json({ error: "Conversation history is temporarily unavailable." }, { status: 503 }) };
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return { response: Response.json({ error: "Your session has expired." }, { status: 401 }) };
  const originResponse = validateSensitiveRequestOriginResponse(request);
  if (originResponse) return { response: originResponse };
  return { supabase, userId: data.user.id };
}

export type AskConversationRow = {
  id: string;
  user_id: string;
  pet_profile_id: string;
  title: string;
  preview: string;
  status: "active" | "archived";
  last_activity_at: string;
  dog_profiles?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

export type AskMessageRow = {
  id: string;
  request_id?: string | null;
  role: "user" | "furvise";
  user_text: string | null;
  response_data: unknown | null;
  save_metadata: unknown | null;
  context_used: unknown | null;
  care_persistence?: unknown | null;
  created_at: string;
};

export type AskSuggestionRow = StoredAskSuggestion & {
  source_message_id: string | null;
  concern_id?: string | null;
  care_entry_id?: string | null;
  applied_at?: string | null;
};

export async function reconcileAskSuggestions(supabase: SupabaseClient, userId: string, suggestions: AskSuggestionRow[]) {
  const suggestionIds = suggestions.map((item) => item.id);
  const { data: entries } = suggestionIds.length
      ? await supabase.from("pet_care_entries").select("id, state_suggestion_id").eq("user_id", userId).in("state_suggestion_id", suggestionIds)
      : { data: [] };
  const entryBySuggestion = new Map((entries || []).filter((item) => item.state_suggestion_id).map((item) => [item.state_suggestion_id, item.id]));
  const reconciled = suggestions.map((suggestion) => {
    const careEntryId = suggestion.care_entry_id || entryBySuggestion.get(suggestion.id) || null;
    const effectAlreadyPresent = Boolean(careEntryId);
    if (suggestion.status === "saved" || effectAlreadyPresent) {
      return { ...suggestion, applyStatus: effectAlreadyPresent && !suggestion.applied_at ? "already_applied" as const : "applied" as const, careEntryId, concernId: suggestion.concern_id || null, status: "saved" as const };
    }
    return { ...suggestion, careEntryId, concernId: suggestion.concern_id || null };
  });
  const stale = reconciled.filter((item, index) => suggestions[index].status === "pending" && item.status === "saved");
  await Promise.all(stale.map((item) => supabase.from("ai_update_suggestions").update({
    actioned_at: new Date().toISOString(), applied_at: new Date().toISOString(), care_entry_id: item.careEntryId || null, status: "saved",
  }).eq("id", item.id).eq("user_id", userId).eq("status", "pending")));
  return reconciled;
}

export function toConversationSummary(row: AskConversationRow): AskConversationSummary {
  const relation = Array.isArray(row.dog_profiles) ? row.dog_profiles[0] : row.dog_profiles;
  return {
    id: row.id,
    petId: row.pet_profile_id,
    petName: relation?.name?.trim() || "Pet",
    title: row.title,
    preview: row.preview,
    status: row.status,
    lastActivityAt: row.last_activity_at,
  };
}

export function toConversationDetail(row: AskConversationRow, messages: AskMessageRow[], suggestions: AskSuggestionRow[] = [], automaticPersistenceByMessage = new Map<string, Extract<StoredAskMessage, { role: "furvise" }>["carePersistence"]>()): AskConversationDetail {
  const canonicalMessages = deduplicateLegacyRetriedMessages(messages);
  const assistantRequests = new Set(canonicalMessages.filter((item) => item.role === "furvise" && item.request_id).map((item) => item.request_id));
  const byMessage = new Map(suggestions.filter((item) => item.source_message_id).map((item) => [item.source_message_id, item]));
  return { ...toConversationSummary(row), messages: canonicalMessages.map((message) => toStoredMessage(message, byMessage.get(message.id) || null, automaticPersistenceByMessage.get(message.id) || null, assistantRequests)) };
}

function toStoredMessage(row: AskMessageRow, suggestion: AskSuggestionRow | null, automaticPersistence: Extract<StoredAskMessage, { role: "furvise" }>["carePersistence"] = null, assistantRequests = new Set<string | null | undefined>()): StoredAskMessage {
  if (row.role === "user") return { id: row.id, role: "user", text: row.user_text || "", createdAt: row.created_at, requestId: row.request_id, failed: Boolean(row.request_id && !assistantRequests.has(row.request_id)) };
  const storedPersistence = row.care_persistence && typeof row.care_persistence === "object"
    ? row.care_persistence as Extract<StoredAskMessage, { role: "furvise" }>["carePersistence"] : null;
  const mergedPersistence = automaticPersistence ? {
    ...storedPersistence,
    ...automaticPersistence,
    memoryIds: storedPersistence?.memoryIds || [],
    profileUpdated: storedPersistence?.profileUpdated || false,
  } : storedPersistence;
  return {
    id: row.id,
    role: "furvise",
    response: row.response_data,
    saveMetadata: row.save_metadata,
    contextUsed: row.context_used,
    suggestion,
    automaticSaveConfirmation: automaticPersistence?.status === "persisted" && automaticPersistence.careEntryIds.length ? "Added to care history" : null,
    carePersistence: mergedPersistence,
    createdAt: row.created_at,
  };
}
