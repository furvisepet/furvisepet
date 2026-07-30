import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

const EXPORT_ROW_LIMIT = 5_000;
// Kept below the canonical idempotency response ceiling; larger accounts use the support-assisted workflow.
export const MAX_EXPORT_BYTES = 96 * 1024;

const USER_TABLES = [
  ["user_profiles", "accountPreferences"], ["dog_profiles", "pets"], ["pet_care_entries", "careHistory"],
  ["pet_care_episodes", "careEpisodes"], ["pet_current_state", "currentState"], ["pet_concerns", "concerns"],
  ["dog_memories", "legacyMemories"], ["furvise_memories", "memories"], ["ask_conversations", "conversations"],
  ["ask_conversation_messages", "conversationMessages"], ["ai_update_suggestions", "suggestions"],
  ["dog_product_feedback", "productFeedback"], ["vet_visit_briefs", "vetBriefs"],
] as const;

const OMITTED_FIELDS = new Set(["context_used", "dedupe_key", "idempotency_key", "intelligence_debug", "owner_token", "payload_hash", "provider_response", "response_body", "source_excerpt"]);

export async function buildUserDataExport(admin: SupabaseClient, user: User) {
  const sections: Record<string, unknown[]> = {};
  for (const [table, section] of USER_TABLES) {
    const { data, error } = await admin.from(table).select("*").eq("user_id", user.id).limit(EXPORT_ROW_LIMIT + 1);
    if (error) throw new Error(`EXPORT_QUERY_FAILED_${table.toUpperCase()}`);
    if ((data?.length || 0) > EXPORT_ROW_LIMIT) throw new Error("EXPORT_TOO_LARGE");
    sections[section] = (data || []).map(sanitizeRecord);
  }
  const { data: usage, error: usageError } = await admin.from("ai_usage_events").select("feature,status,credits_used,period_start,created_at,completed_at").eq("user_id", user.id).limit(EXPORT_ROW_LIMIT + 1);
  if (usageError) throw new Error("EXPORT_QUERY_FAILED_AI_USAGE");
  if ((usage?.length || 0) > EXPORT_ROW_LIMIT) throw new Error("EXPORT_TOO_LARGE");
  const document = {
    account: { confirmedAt: user.email_confirmed_at || null, createdAt: user.created_at, email: user.email || null, id: user.id },
    aiUsage: usage || [], exportedAt: new Date().toISOString(), formatVersion: 1, ...sections,
  };
  const body = JSON.stringify(document, null, 2);
  if (Buffer.byteLength(body, "utf8") > MAX_EXPORT_BYTES) throw new Error("EXPORT_TOO_LARGE");
  return body;
}

function sanitizeRecord(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !OMITTED_FIELDS.has(key) && !/(token|secret|password|prompt)/i.test(key)));
}
