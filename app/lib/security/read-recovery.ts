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
      if (!attempt && isTransientReadFailure(result)) continue;
      return result;
    } catch (error) {
      if (attempt || !transientClaimFailure(error)) throw error;
    }
  }
}

function isTransientReadFailure(result: { error: unknown; status?: number }) {
  if (!result.error || typeof result.error !== "object") return false;
  const error = result.error as { status?: unknown; code?: unknown };
  // Preserve a definitive refusal from either layer. Undefined outer metadata
  // must not erase an inner status, and transport wording cannot override 4xx.
  const refusal = [error.status, result.status].find(status => Number(status) >= 400 && Number(status) < 500);
  if (refusal !== undefined) return false;
  return transientClaimFailure(error) || (!error.code
    && transientClaimFailure({ ...result.error, status: error.status ?? result.status }));
}
