type Verification<T> = { data: { user: T | null }; error: { status?: number; name?: string } | null };

/** Never convert an auth service outage into an expired-session claim.
 * A retry remains an authoritative verification, not a JWT-decoding fallback. */
export async function verifyVetBriefUser<T>(verify: () => Promise<Verification<T>>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let result: Verification<T>;
    try { result = await verify(); }
    catch { result = { data: { user: null }, error: { status: 0 } }; }
    if (!result.error && result.data.user) return { user: result.data.user, failure: null } as const;
    const status = result.error?.status;
    const transient = Boolean(result.error && (!status || status === 429 || status >= 500 || result.error.name === 'AuthRetryableFetchError'));
    if (!transient) return { user: null, failure: 'rejected' } as const;
    if (attempt === 1) return { user: null, failure: 'unavailable' } as const;
  }
  return { user: null, failure: 'unavailable' } as const;
}
