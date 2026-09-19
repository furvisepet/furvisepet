type Session = { access_token: string; expires_at?: number; user: { id: string } };
type SessionResult = { data: { session: Session | null }; error: unknown };
type Auth = { getSession(): Promise<SessionResult>; refreshSession(): Promise<SessionResult> };
export class VetBriefSessionError extends Error {
  readonly code = "VET_BRIEF_AUTH_REQUIRED";
  constructor(message = "Your session could not be refreshed. Sign in again to continue with your appointment note.") { super(message); }
}
function transientSessionError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const detail = error as { name?: string; status?: number; message?: string };
  return detail.name === "AuthRetryableFetchError" || [502, 503, 504].includes(Number(detail.status)) || /^(?:TypeError: )?(?:fetch failed|failed to fetch|network request failed)\b/i.test(detail.message || "");
}

/** Refresh in the browser before a long request captures a fixed bearer token.
 * This is transport preparation only; the server still verifies user and RLS. */
export async function vetBriefSessionToken(auth: Auth | null, minimumLifetimeSeconds = 60) {
  return (await checkedSession(auth, minimumLifetimeSeconds)).access_token;
}

async function checkedSession(auth: Auth | null, minimumLifetimeSeconds: number, forceRefresh = false, expectedOwner?: string) {
  if (!auth) throw new VetBriefSessionError("Please sign in again.");
  const initial = await auth.getSession();
  let session = initial.data.session;
  if (initial.error || !session?.access_token || !session.user?.id) throw new VetBriefSessionError("Please sign in again.");
  const ownerId = session.user.id;
  if (expectedOwner && ownerId !== expectedOwner) throw new Error("The signed-in account changed. Please reopen this brief.");
  const enoughLifetime = (value: Session) => typeof value.expires_at === "number"
    && value.expires_at * 1000 > Date.now() + minimumLifetimeSeconds * 1000;
  if (forceRefresh || !enoughLifetime(session)) {
    const originalToken = session.access_token;
    for (let attempt = 0; attempt < 2; attempt++) {
      let refreshed: SessionResult;
      try { refreshed = await auth.refreshSession(); }
      catch (error) { refreshed = { data: { session: null }, error }; }
      session = refreshed.data.session;
      if (!refreshed.error && session?.access_token && session.user?.id === ownerId && enoughLifetime(session)) return session;
      // Another tab may have completed refresh while this request was pending.
      // Never reuse the rejected token or accept a changed account.
      const latest = await auth.getSession();
      const concurrent = latest.data.session;
      if (!latest.error && concurrent?.access_token && concurrent.access_token !== originalToken && concurrent.user?.id === ownerId && enoughLifetime(concurrent)) return concurrent;
      if (attempt || !transientSessionError(refreshed.error)) throw new VetBriefSessionError();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new VetBriefSessionError();
  }
  return session;
}

/** A known pre-operation rejection may refresh once. Never retry a completed or
 * ambiguous mutation, and never carry an in-flight request into another account. */
export async function vetBriefAuthenticatedFetch(auth: Auth | null, init: RequestInit, send: (init: RequestInit) => Promise<Response>, minimumLifetimeSeconds = 60) {
  let session = await checkedSession(auth, minimumLifetimeSeconds);
  const ownerId = session.user.id;
  let authRetried = false;
  let readRetried = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    const response = await send({ ...init, headers });
    if (response.status !== 401 && response.status !== 503) return response;
    const payload = await response.clone().json().catch(() => null);
    if (response.status === 503 && !readRetried && (init.method || "GET").toUpperCase() === "GET" && payload?.code === "VET_BRIEF_READ_UNAVAILABLE") {
      readRetried = true;
      await new Promise(resolve => setTimeout(resolve, 200));
      session = await checkedSession(auth, minimumLifetimeSeconds, false, ownerId);
      continue;
    }
    if (response.status !== 401 || authRetried || payload?.code !== 'VET_BRIEF_AUTH_REQUIRED') return response;
    authRetried = true;
    session = await checkedSession(auth, minimumLifetimeSeconds, true, ownerId);
  }
  throw new Error('Sign-in verification could not be completed.');
}
