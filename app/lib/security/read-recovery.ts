import { transientClaimFailure } from "./idempotency/claim-recovery.ts";

/** Read-only recovery: at most one retry, with the same owner and lookup key.
 * Never use this for a mutation or turn a failed read into an empty result. */
export async function recoverTransientRead<T extends { error: unknown }>(read: () => PromiseLike<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await read();
      if (!attempt && transientClaimFailure(result.error)) continue;
      return result;
    } catch (error) {
      if (attempt || !transientClaimFailure(error)) throw error;
    }
  }
}
