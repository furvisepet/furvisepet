import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createIdempotencyAdminClient } from "./security/idempotency/admin-client.ts";
import { createCanonicalCareAuthorityClient } from "./intelligence/care-authority-client.ts";
import { parseStoredFurviseActionKind } from "./application-actions/types.ts";
import { getFurviseActionPolicy } from "./application-actions/policy.ts";
import { enforceVerifiedStateClaims } from "./application-actions/state-claims.ts";
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
  const authority = stale.length ? createCanonicalCareAuthorityClient() : null;
  await Promise.all(stale.map((item) => authority!.from("ai_update_suggestions").update({
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

export function toConversationDetail(row: AskConversationRow, messages: AskMessageRow[], suggestions: AskSuggestionRow[] = [], automaticPersistenceByMessage = new Map<string, Extract<StoredAskMessage, { role: "furvise" }>["carePersistence"]>(), capabilityActions = new Map<string, unknown[]>()): AskConversationDetail {
  const canonicalMessages = deduplicateLegacyRetriedMessages(messages);
  const assistantRequests = new Set(canonicalMessages.filter((item) => item.role === "furvise" && item.request_id).map((item) => item.request_id));
  const byMessage = new Map(suggestions.filter((item) => item.source_message_id).map((item) => [item.source_message_id, item]));
  return { ...toConversationSummary(row), messages: canonicalMessages.map((message) => toStoredMessage(message, byMessage.get(message.id) || null, automaticPersistenceByMessage.get(message.id) || null, assistantRequests, capabilityActions.get(message.id) || [])) };
}

function toStoredMessage(row: AskMessageRow, suggestion: AskSuggestionRow | null, automaticPersistence: Extract<StoredAskMessage, { role: "furvise" }>["carePersistence"] = null, assistantRequests = new Set<string | null | undefined>(), trustedActions: unknown[] = []): StoredAskMessage {
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
    response: presentationOnlyAskResponse(row.response_data, trustedActions),
    saveMetadata: row.save_metadata,
    contextUsed: row.context_used,
    suggestion,
    automaticSaveConfirmation: automaticPersistence?.status === "persisted" && automaticPersistence.careEntryIds.length ? "Added to care history" : null,
    carePersistence: mergedPersistence,
    createdAt: row.created_at,
  };
}

// Do not render historically tenant-authored presentation receipts as completed after a reload.
// A terminal claim is returned only by the capability confirmation endpoint.
export function presentationOnlyAskResponse(value: unknown, trustedActions: unknown[]) {
  if (!value || typeof value !== "object") return value;
  const response = value as Record<string, unknown>;
  const raw = Array.isArray(response.applicationActions) ? response.applicationActions : [];
  const mutationCapable = trustedActions.length > 0 || raw.some((action) => {
    if (!action || typeof action !== "object") return false;
    const kind = parseStoredFurviseActionKind((action as Record<string, unknown>).kind);
    return Boolean(kind && getFurviseActionPolicy(kind).mutationClass === "mutation");
  });
  const nonMutation = raw.flatMap((action) => {
    if (!action || typeof action !== "object") return [];
    const draft = action as Record<string, unknown>;
    const kind = parseStoredFurviseActionKind(draft.kind);
    if (!kind) return [];
    const policy = getFurviseActionPolicy(kind);
    if (policy.mutationClass === "mutation") return [];
    return [{ ...draft, kind, ...policy, status: "proposed", resultMessage: null, errorMessage: null }];
  });
  const applicationActions = [...nonMutation, ...trustedActions];
  const trustedStatus = trustedActions.some((action) => action && typeof action === "object" && (action as Record<string, unknown>).status === "succeeded")
    ? "action_success"
    : trustedActions.some((action) => action && typeof action === "object" && ["failed", "cancelled"].includes(String((action as Record<string, unknown>).status)))
      ? "action_failure"
      : applicationActions.length ? "action_confirmation" : null;
  const untrustedInteractionMode = ["action_confirmation", "action_success", "action_failure"].includes(String(response.interactionMode))
    ? "normal"
    : response.interactionMode;
  const summary = scrubUntrustedMutationClaim(response.summary, "I can help with that.");
  return {
    ...response,
    title: scrubUntrustedMutationClaim(response.title, "Furvise"),
    summary,
    directAnswer: summary,
    // Tenant-owned response_data cannot carry Furvise-authored mutation-success
    // prose. Trusted terminal wording lives only in capability receipts/cards.
    supportingText: mutationCapable ? null : response.supportingText,
    sections: Array.isArray(response.sections) ? response.sections.map((section) => scrubUntrustedSection(section)).filter(Boolean) : response.sections,
    interactionMode: trustedStatus || untrustedInteractionMode,
    applicationActions,
  };
}

function scrubUntrustedSection(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const section = value as Record<string, unknown>;
  const heading = scrubUntrustedMutationClaim(section.heading, "");
  const items = Array.isArray(section.items)
    ? section.items.map((item) => scrubUntrustedMutationClaim(item, "")).filter(Boolean)
    : [];
  return heading && items.length ? { ...section, heading, items } : null;
}

const untrustedTerminalMutationClaim = /\b(?:profile|history|record|entry|preference|concern|pet|update|change)\s+(?:is\s+|has\s+been\s+|was\s+)?(?:saved|deleted|removed|forgotten|changed|updated|archived|recorded|completed|marked)\b/i;
function scrubUntrustedMutationClaim(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const governed = enforceVerifiedStateClaims(value, false);
  const safe = governed.split(/(?<=[.!?])\s+/).filter((sentence) => !untrustedTerminalMutationClaim.test(sentence)).join(" ").trim();
  return safe || fallback;
}

export async function loadActionCapabilitiesForMessages(userId: string, messageIds: string[]) {
  const result = new Map<string, unknown[]>();
  if (!messageIds.length) return result;
  const admin = createIdempotencyAdminClient();
  const { data, error } = await admin.from("ask_action_capabilities")
    .select("id,assistant_message_id,source_message_id,action_kind,pet_profile_id,action_payload,receipt,status,expires_at")
    .eq("user_id", userId)
    .in("assistant_message_id", messageIds)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) return result;
  for (const row of data || []) {
    const payload = row.receipt || row.action_payload;
    if (!payload || typeof payload !== "object") continue;
    const kind = parseStoredFurviseActionKind(row.action_kind);
    if (!kind) continue;
    const policy = getFurviseActionPolicy(kind);
    const expired = row.status === "pending" && Date.parse(row.expires_at) <= Date.now();
    const action = {
      ...(payload as Record<string, unknown>),
      ...policy,
      id: row.id,
      kind,
      petId: row.pet_profile_id,
      sourceMessageId: row.source_message_id,
      status: expired ? "failed" : row.status === "pending" ? policy.confirmationPolicy === "always" ? "confirmation_required" : "proposed" : row.status,
      ...(expired
        ? { resultMessage: null, errorMessage: "That action expired before it was confirmed." }
        : row.status === "pending" ? { resultMessage: null, errorMessage: null } : {}),
    };
    result.set(row.assistant_message_id, [...(result.get(row.assistant_message_id) || []), action]);
  }
  return result;
}
