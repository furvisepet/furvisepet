/** Browser transport recovery only; server getUser remains the auth authority. */
type Session = { access_token: string; expires_at?: number; user: { id: string } };
type SessionResult = { data: { session: Session | null }; error: unknown };
type Auth = { getSession(): Promise<SessionResult>; refreshSession(): Promise<SessionResult> };
export class AskSessionExpiredError extends Error {
  constructor() { super("Your session expired. Sign in again to continue."); this.name = "AskSessionExpiredError"; }
}
async function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
/** At most one post-authentication replay, sharing the caller's immutable
 * payload/idempotency key and deadline. Never replay a timeout or provider error. */
export async function requestAskWithSession(auth: Auth | null, send: (token: string) => Promise<Response>, signal: AbortSignal) {
  if (!auth) throw new AskSessionExpiredError();
  signal.throwIfAborted();
  const initial = await bounded(auth.getSession(), signal);
  let session = initial.data.session;
  if (initial.error || !session?.access_token || !session.user?.id) throw new AskSessionExpiredError();
  const ownerId = session.user.id;
  const refresh = async () => {
    signal.throwIfAborted();
    const current = await bounded(auth.getSession(), signal);
    if (current.error || current.data.session?.user.id !== ownerId) throw new AskSessionExpiredError();
    const result = await bounded(auth.refreshSession(), signal);
    if (result.error || !result.data.session?.access_token || result.data.session.user.id !== ownerId) throw new AskSessionExpiredError();
    signal.throwIfAborted();
    return result.data.session;
  };
  if (session.expires_at !== undefined && session.expires_at * 1000 <= Date.now() + 60_000) session = await refresh();
  signal.throwIfAborted();
  const response = await send(session.access_token);
  if (response.status !== 401) return response;
  const payload = await response.clone().json().catch(() => null);
  if (payload?.code !== "AUTH_REQUIRED") return response;
  session = await refresh();
  return send(session.access_token);
}
