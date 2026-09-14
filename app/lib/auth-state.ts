import type { User } from "@supabase/supabase-js";

type AuthState = { status: "loading" | "signedIn" | "signedOut"; user: User | null };

// Supabase re-emits SIGNED_IN on tab focus. Preserve React identity when the
// confirmed user is unchanged so page effects do not reload the conversation.
// Compare all user fields: account switches and metadata changes must propagate.
export function reconcileAuthState(previous: AuthState, next: AuthState): AuthState {
  return previous.status === next.status
    && JSON.stringify(previous.user) === JSON.stringify(next.user) ? previous : next;
}
