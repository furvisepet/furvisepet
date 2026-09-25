import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingUpdateSuggestion } from "../ai/concern-engine.ts";

/** Legacy prose suggestions are diagnostic only. Canonical persistence uses a capability identity. */
export async function persistPendingSuggestion(_input: {
  createCanonicalCareAuthorityClient: () => SupabaseClient;
  logAskServerError: (stage: string, error: unknown, context: Record<string, unknown>, status: number) => void;
  assistantMessageId: string; conversationId: string; petId: string; petName: string;
  sourceMessage: string; suggestion: PendingUpdateSuggestion; supabase: SupabaseClient; userId: string;
}): Promise<{ careEntryId: null; concernId: null; effectAlreadyPresent: false; errorCode: string;
  suggestion: (PendingUpdateSuggestion & { id: string }) | null }> {
  return { careEntryId: null, concernId: null, effectAlreadyPresent: false,
    errorCode: "CANONICAL_SUGGESTION_REQUIRED", suggestion: null };
}
