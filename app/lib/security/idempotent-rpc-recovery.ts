import { transientClaimFailure } from "./idempotency/claim-recovery.ts";

/** Only for RPCs that atomically serialize and replay the same request key.
 * Callers must capture an unchanged payload. Never wrap an ordinary insert. */
export async function recoverIdempotentRpc<T extends { error: unknown }>(invoke: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await invoke();
      if (!attempt && transientClaimFailure(result.error)) continue;
      return result;
    } catch (error) {
      if (attempt || !transientClaimFailure(error)) throw error;
    }
  }
}
