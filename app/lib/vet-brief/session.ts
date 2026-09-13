type Session = { access_token: string; expires_at?: number; user: { id: string } };
type SessionResult = { data: { session: Session | null }; error: unknown };
type Auth = { getSession(): Promise<SessionResult>; refreshSession(): Promise<SessionResult> };

/** Refresh in the browser before a long request captures a fixed bearer token.
 * This is transport preparation only; the server still verifies user and RLS. */
export async function vetBriefSessionToken(auth: Auth | null, minimumLifetimeSeconds = 60) {
  return (await checkedSession(auth, minimumLifetimeSeconds)).access_token;
}

async function checkedSession(auth: Auth | null, minimumLifetimeSeconds: number, forceRefresh = false, expectedOwner?: string) {
  if (!auth) throw new Error("Please sign in again.");
  const initial = await auth.getSession();
  let session = initial.data.session;
  if (initial.error || !session?.access_token || !session.user?.id) throw new Error("Please sign in again.");
  const ownerId = session.user.id;
  if (expectedOwner && ownerId !== expectedOwner) throw new Error("The signed-in account changed. Please reopen this brief.");
  const enoughLifetime = (value: Session) => typeof value.expires_at === "number"
    && value.expires_at * 1000 > Date.now() + minimumLifetimeSeconds * 1000;
  if (forceRefresh || !enoughLifetime(session)) {
    const refreshed = await auth.refreshSession();
    session = refreshed.data.session;
    if (refreshed.error || !session?.access_token || session.user?.id !== ownerId || !enoughLifetime(session)) {
      throw new Error("Your session could not be refreshed. Please sign in again.");
    }
  }
  return session;
}

/** A known pre-operation rejection may refresh once. Never retry a completed or
 * ambiguous mutation, and never carry an in-flight request into another account. */
export async function vetBriefAuthenticatedFetch(auth: Auth | null, init: RequestInit, send: (init: RequestInit) => Promise<Response>, minimumLifetimeSeconds = 60) {
  let session = await checkedSession(auth, minimumLifetimeSeconds);
  const ownerId = session.user.id;
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    const response = await send({ ...init, headers });
    if (attempt || response.status !== 401) return response;
    const payload = await response.clone().json().catch(() => null);
    if (payload?.code !== 'VET_BRIEF_AUTH_REQUIRED') return response;
    session = await checkedSession(auth, minimumLifetimeSeconds, true, ownerId);
  }
  throw new Error('Sign-in verification could not be completed.');
}
