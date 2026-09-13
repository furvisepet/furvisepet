type Session = { access_token: string; expires_at?: number; user: { id: string } };
type SessionResult = { data: { session: Session | null }; error: unknown };
type Auth = { getSession(): Promise<SessionResult>; refreshSession(): Promise<SessionResult> };

/** Refresh in the browser before a long request captures a fixed bearer token.
 * This is transport preparation only; the server still verifies user and RLS. */
export async function vetBriefSessionToken(auth: Auth | null, minimumLifetimeSeconds = 60) {
  if (!auth) throw new Error("Please sign in again.");
  const initial = await auth.getSession();
  let session = initial.data.session;
  if (initial.error || !session?.access_token || !session.user?.id) throw new Error("Please sign in again.");
  const ownerId = session.user.id;
  const enoughLifetime = (value: Session) => typeof value.expires_at === "number"
    && value.expires_at * 1000 > Date.now() + minimumLifetimeSeconds * 1000;
  if (!enoughLifetime(session)) {
    const refreshed = await auth.refreshSession();
    session = refreshed.data.session;
    if (refreshed.error || !session?.access_token || session.user?.id !== ownerId || !enoughLifetime(session)) {
      throw new Error("Your session could not be refreshed. Please sign in again.");
    }
  }
  return session.access_token;
}
