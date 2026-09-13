import { withExecutionDeadline } from "../ai/execution-deadline.ts";
import { transientClaimFailure } from "./idempotency/claim-recovery.ts";

/** Read-only recovery: at most one retry, with the same owner and lookup key.
 * Never use this for a mutation or turn a failed read into an empty result. */
export async function recoverTransientRead<T extends { error: unknown; status?: number }>(read: (signal: AbortSignal) => PromiseLike<T>, options: { attemptTimeoutMs?: number } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = options.attemptTimeoutMs === undefined
        ? await read(new AbortController().signal)
        : await withExecutionDeadline(signal => read(signal), options.attemptTimeoutMs);
      if (!attempt && (transientClaimFailure(result.error) || result.error && typeof result.error === "object"
        && !("code" in result.error && result.error.code)
        && transientClaimFailure({ ...result.error, status: result.status }))) continue;
      return result;
    } catch (error) {
      if (attempt || !transientClaimFailure(error)) throw error;
    }
  }
}
