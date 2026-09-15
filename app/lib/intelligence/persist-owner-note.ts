import type { OwnerNoteRequest } from "./owner-note-request.ts";
import type { CarePersistenceResult } from "./types.ts";

export async function persistOwnerNote(input: {
  userId: string; petId: string; sourceMessageId: string; requestId: string; note: OwnerNoteRequest;
}, rpc: (name: string, parameters: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>): Promise<CarePersistenceResult> {
  const parameters = { p_user_id: input.userId, p_pet_id: input.petId, p_source_message_id: input.sourceMessageId,
    p_request_id: input.requestId, p_note: input.note.note, p_occurred_at: input.note.occurredAt, p_explicit_time: input.note.explicitTime };
  // Exact replay also recovers a committed write whose acknowledgment was lost.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await rpc("persist_ask_owner_note", parameters);
      const receipt = result.data as { entryId?: string; alreadyPersisted?: boolean } | null;
      if (!result.error && typeof receipt?.entryId === "string" && /^[0-9a-f-]{36}$/i.test(receipt.entryId)) {
        return { status: "persisted", careEntryIds: [receipt.entryId], concernIds: [], memoryIds: [],
          errorCode: null, currentSafetyState: null, alreadyPersisted: receipt.alreadyPersisted === true };
      }
      if (result.error && typeof result.error === "object" && "code" in result.error && ["42501", "22023"].includes(String(result.error.code))) break;
    } catch { /* Retry the same source-bound transaction, never a new key. */ }
  }
  throw new Error("OWNER_NOTE_SAVE_UNAVAILABLE");
}
