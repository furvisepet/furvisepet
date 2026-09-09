type Failure = { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
export function transientClaimFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Failure;
  // Do not retry credentials, schema/SQL errors, conflicts, or invalid payloads.
  if (typeof e.code === "string" && /^(?:22|23|28|42|PGRST)/.test(e.code)) return false;
  return [502,503,504].includes(Number(e.status))
    || ["ECONNRESET","ETIMEDOUT","ECONNREFUSED","UND_ERR_CONNECT_TIMEOUT"].includes(String(e.code))
    || ["AbortError","TimeoutError"].includes(String(e.name))
    || /^(?:TypeError: )?fetch failed\b/i.test(String(e.message));
}
/** Retry admission only with the same key/payload. An ambiguous successful
 * first claim must return in_progress, never bypass its lease or run the work. */
export async function recoverTransientClaim<T>(claim: () => Promise<T>): Promise<T> {
  try { return await claim(); }
  catch (error) {
    if (!transientClaimFailure(error)) throw error;
    return await claim();
  }
}
