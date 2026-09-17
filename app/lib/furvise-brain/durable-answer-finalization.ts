type MaybePromise<T> = T | Promise<T>;

export type DurableAnswerFinalization<TState> =
  | { kind: "committed" }
  | { kind: "replay"; state: TState };

/**
 * Confirm one durable Ask answer without rerunning turn effects.
 *
 * The finalization RPC gets one retry for a lost acknowledgement. If both
 * acknowledgements fail, only a matching durable readback can recover the
 * already-committed answer. Anything else fails closed through createFailure.
 */
export async function finalizeDurableAskAnswer<TState>({
  attemptFinalize,
  createFailure,
  isMatchingReadback,
  onRecoveredReadback,
  readback,
}: {
  attemptFinalize: () => MaybePromise<boolean>;
  createFailure: (cause: unknown) => unknown;
  isMatchingReadback: (state: TState | null) => boolean;
  onRecoveredReadback?: (cause: unknown, state: TState) => MaybePromise<void>;
  readback: () => MaybePromise<TState | null>;
}): Promise<DurableAnswerFinalization<TState>> {
  let failure: unknown = new Error("ASK_RESPONSE_FINALIZE_FAILED");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (await attemptFinalize()) return { kind: "committed" };
      failure = new Error("ASK_RESPONSE_FINALIZE_FAILED");
    } catch (error) {
      failure = error;
    }
  }

  const durable = await readback();
  if (!isMatchingReadback(durable)) throw createFailure(failure);

  if (onRecoveredReadback) await onRecoveredReadback(failure, durable!);
  return { kind: "replay", state: durable! };
}
