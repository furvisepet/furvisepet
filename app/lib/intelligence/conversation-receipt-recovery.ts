import type { SupabaseClient } from "@supabase/supabase-js";
import type { AskHistoryAccess } from "./history-access.ts";

/** Retrieval hint only. It neither authorizes a save nor proves one happened. */
export function requestsStoredNoteReadback(message: string): boolean {
  return /\b(?:saved?|stored|recorded|logged|receipts?)\b/i.test(message)
    && /\b(?:did|was|were|has|have|show|quote|verify|confirm|exactly|verbatim)\b/i.test(message);
}

export type ReceiptReferenceMessage = { id: string; request_id: string | null; role: "user";
  user_text: string; response_data: null; created_at: string; recoveredReceiptReference: true };

/** One bounded, owned join recovers source identities beyond the dialogue
 * window. The normal fresh lineage read still supplies the actual receipt. */
export async function recoverConversationReceiptReferences(db: SupabaseClient, input: {
  userId: string; petId: string; conversationId: string; historyAccess?: AskHistoryAccess;
}): Promise<ReceiptReferenceMessage[]> {
  let query = db.from("pet_care_entries")
    .select("id,user_id,pet_profile_id,source_message:ask_conversation_messages!intelligence_source_message_id!inner(id,request_id,role,user_text,created_at,user_id,conversation_id)")
    .eq("user_id", input.userId).eq("pet_profile_id", input.petId).is("deleted_at", null)
    .eq("source_message.user_id", input.userId).eq("source_message.conversation_id", input.conversationId)
    .eq("source_message.role", "user");
  if (input.historyAccess) query = query.gte("occurred_at", input.historyAccess.from).lt("occurred_at", input.historyAccess.to);
  const result = await query.order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(4).abortSignal(AbortSignal.timeout(2500));
  if (result.error) throw new Error("receipt_reference_unavailable");
  const messages = new Map<string, ReceiptReferenceMessage>();
  for (const row of result.data || []) {
    const source = row.source_message as unknown as Record<string, unknown> | null;
    if (row.user_id !== input.userId || row.pet_profile_id !== input.petId || !source
      || source.user_id !== input.userId || source.conversation_id !== input.conversationId || source.role !== "user"
      || typeof source.id !== "string" || typeof source.user_text !== "string" || !source.user_text.trim()
      || source.user_text.length > 1200 || typeof source.created_at !== "string" || !Number.isFinite(Date.parse(source.created_at))) continue;
    messages.set(source.id, { id: source.id, request_id: typeof source.request_id === "string" ? source.request_id : null,
      role: "user", user_text: source.user_text, response_data: null, created_at: source.created_at, recoveredReceiptReference: true });
  }
  return [...messages.values()].slice(0, 4);
}
