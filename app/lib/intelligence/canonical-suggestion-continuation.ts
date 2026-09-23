import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDeepStrictEqual } from "node:util";
import { executeActionCapability, rebindCanonicalCapabilityAction } from "../application-actions/capabilities.ts";
import { canonicalSuggestionJob, suggestionMatchesCapability, type CanonicalSuggestionRow, type SuggestionCapability } from "./canonical-suggestion.ts";
import type { FurviseApplicationAction } from "../application-actions/types.ts";

export async function persistCanonicalSuggestions(input: {
  authority: SupabaseClient; userId: string; actions: FurviseApplicationAction[];
}): Promise<CanonicalSuggestionRow[]> {
  const rows: CanonicalSuggestionRow[] = [];
  for (const action of input.actions) {
    if (!canonicalSuggestionJob(action) || !/^[0-9a-f-]{36}$/i.test(action.id)
      || !["proposed", "confirmation_required", "succeeded"].includes(action.status)) continue;
    const { data, error } = await input.authority.rpc("persist_ask_canonical_suggestion", {
      p_user_id: input.userId, p_capability_id: action.id,
    }).single<CanonicalSuggestionRow>();
    if (error || !data) throw Error("CANONICAL_SUGGESTION_PERSISTENCE_FAILED");
    rows.push(data);
  }
  return rows;
}

export async function continueCanonicalSuggestion(input: {
  suggestion: CanonicalSuggestionRow; supabase: SupabaseClient; authority: SupabaseClient; userId: string;
}) {
  const s = input.suggestion;
  if (!s.canonical_payload || !s.canonical_capability_id || s.invalidated_at || s.status === "dismissed")
    throw Error("CANONICAL_SUGGESTION_UNSUPPORTED");
  const capability = await input.authority.from("ask_action_capabilities").select("*")
    .eq("id", s.canonical_capability_id).eq("user_id", input.userId).maybeSingle<SuggestionCapability>();
  const c = capability.data;
  if (capability.error || !c || !suggestionMatchesCapability(s, c, input.userId))
    throw Error("CANONICAL_SUGGESTION_AUTHORITY_MISMATCH");
  const source = await input.supabase.from("ask_conversation_messages").select("user_text,created_at")
    .eq("id", c.source_message_id).eq("conversation_id", s.conversation_id).eq("user_id", input.userId)
    .eq("role", "user").maybeSingle<{ user_text: string; created_at: string }>();
  const subject = await input.supabase.from("dog_profiles").select("name")
    .eq("id", c.pet_profile_id).eq("user_id", input.userId).maybeSingle<{ name: string | null }>();
  if (source.error || !source.data || subject.error || !subject.data)
    throw Error("CANONICAL_SUGGESTION_SOURCE_UNAVAILABLE");
  const rebound = rebindCanonicalCapabilityAction(c.action_payload, c.source_message_id,
    { text: source.data.user_text, createdAt: source.data.created_at }, String(subject.data.name || "your pet"), input.userId);
  if (!isDeepStrictEqual(rebound, c.action_payload)) throw Error("CANONICAL_SUGGESTION_REBIND_MISMATCH");
  // Target identity is already frozen in the capability. Its governed executor
  // rechecks ownership, version, legal state and Checkpoint B replacement safety.
  return executeActionCapability({ capabilityId: c.id, assistantMessageId: c.assistant_message_id,
    userId: input.userId, mode: "confirm", suggestionId: s.id });
}
