/** Cancellation is advisory. Settle locally even if a provider ignores it.
 * Late results remain observed but cannot replace the terminal result. */
export async function withProviderDeadline<T>(invoke: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error("Ask provider timed out."), { name: "TimeoutError", code: "ABORT_ERR" });
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => invoke(controller.signal)), expired]);
  } finally {
    clearTimeout(timer);
  }
}
