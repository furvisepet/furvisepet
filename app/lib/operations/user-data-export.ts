import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

const EXPORT_ROW_LIMIT = 5_000;
// Kept below the canonical idempotency response ceiling; larger accounts use the support-assisted workflow.
export const MAX_EXPORT_BYTES = 96 * 1024;

const USER_TABLES = [
  ["user_profiles", "accountPreferences"], ["dog_profiles", "pets"], ["pet_care_entries", "careHistory"],
  ["pet_care_episodes", "careEpisodes"], ["pet_current_state", "currentState"], ["pet_concerns", "concerns"],
  ["pet_care_episode_events", "careEpisodeEvents"],
  ["pet_profile_lifecycle_events", "petLifecycleEvents"],
  ["dog_memories", "legacyMemories"], ["furvise_memories", "memories"], ["ask_conversations", "conversations"],
  ["ask_conversation_messages", "conversationMessages"], ["ai_update_suggestions", "suggestions"],
  ["dog_product_feedback", "productFeedback"], ["vet_visit_briefs", "vetBriefs"],
] as const;

const OMITTED_FIELDS = new Set(["context_used", "dedupe_key", "idempotency_key", "intelligence_debug", "owner_token", "payload_hash", "provider_response", "response_body", "source_excerpt"]);

export async function buildUserDataExport(admin: SupabaseClient, user: User) {
  const sections: Record<string, unknown[]> = {};
  for (const [table, section] of USER_TABLES) {
    sections[section] = await readExportSection(admin, user, table, "*");
  }
  const usage = await readExportSection(admin, user, "ai_usage_events", "feature,status,credits_used,period_start,created_at,completed_at");
  const document = {
    account: { confirmedAt: user.email_confirmed_at || null, createdAt: user.created_at, email: user.email || null, id: user.id },
    aiUsage: usage || [], exportedAt: new Date().toISOString(), formatVersion: 1, ...sections,
  };
  const body = JSON.stringify(document, null, 2);
  if (Buffer.byteLength(body, "utf8") > MAX_EXPORT_BYTES) throw new Error("EXPORT_TOO_LARGE");
  return body;
}

async function readExportSection(admin: SupabaseClient, user: User, table: string, columns: string) {
  const rows: Record<string, unknown>[] = [];
  const key = table === "user_profiles" ? "user_id" : table === "pet_current_state" ? "pet_profile_id" : "id";
  let expectedTotal: number | null = null;
  do {
    const { data, error, count } = await admin.from(table)
      .select(columns, { count: "exact" }).eq("user_id", user.id)
      .order(key, { ascending: true }).range(rows.length, rows.length + 499);
    if (error) throw new Error(`EXPORT_QUERY_FAILED_${table.toUpperCase()}`);
    if (count === null || !Number.isSafeInteger(count) || count < 0) throw new Error("EXPORT_COUNT_UNAVAILABLE");
    if (count > EXPORT_ROW_LIMIT) throw new Error("EXPORT_TOO_LARGE");
    if (expectedTotal !== null && count !== expectedTotal) throw new Error("EXPORT_CHANGED_DURING_READ");
    expectedTotal = count;
    // A short page may be the API's configured cap, not the end of the table.
    if (!data?.length && rows.length < count) throw new Error("EXPORT_INCOMPLETE");
    rows.push(...((data || []) as unknown as Record<string, unknown>[]).map(sanitizeRecord));
    if (rows.length > count) throw new Error("EXPORT_CHANGED_DURING_READ");
    if (Buffer.byteLength(JSON.stringify(rows), "utf8") > MAX_EXPORT_BYTES) throw new Error("EXPORT_TOO_LARGE");
  } while (rows.length < expectedTotal);
  return rows;
}

function sanitizeRecord(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !OMITTED_FIELDS.has(key) && !/(token|secret|password|prompt)/i.test(key)));
}
