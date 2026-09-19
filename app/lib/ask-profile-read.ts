/** Only for the read-only ownership query before Ask reserves a turn/credit.
 * The query factory must disable SDK retries so the two layers never multiply.
 * Error text is inspected locally and never returned in diagnostics. */
type ReadResult<T> = { data: T | null; error: unknown; status: number };
type FailureClass = "none" | "network" | "timeout" | "cancelled" | "gateway" | "authorization" | "database" | "unknown";

function safeDatabaseCodes(error: unknown) {
  const e = error as { code?: unknown; details?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const text = [e?.details, e?.message].filter(v => typeof v === "string").join(" ");
  return {
    databaseCode: /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code) ? code : null,
    networkCode: text.match(/\b(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_SOCKET)\b/)?.[0] ?? null,
  };
}

export function classifyAskDatabaseFailure(error: unknown, status: number, signal?: AbortSignal): FailureClass {
  if (!error) return "none";
  if (signal?.aborted) return signal.reason?.name === "TimeoutError" ? "timeout" : "cancelled";
  const e = error as { code?: unknown; message?: unknown; name?: unknown; details?: unknown };
  const code = typeof e?.code === "string" ? e.code : "";
  if (status === 401 || status === 403 || code === "42501" || code.startsWith("28") || code === "PGRST301") return "authorization";
  if (code === "57014") return "database"; // Do not repeat server-cancelled SQL.
  if (code) return /^(08\w{3}|PGRST00[0-3])$/.test(code) ? "gateway" : "database";
  if ([502, 503, 504, 520, 521, 522, 523, 524].includes(status)) return "gateway";
  const name = typeof e?.name === "string" ? e.name : "";
  const message = typeof e?.message === "string" ? e.message : "";
  if (name === "AbortError" || /^AbortError:/.test(message)) return "cancelled";
  if (name === "TimeoutError" || /^TimeoutError:/.test(message)) return "timeout";
  if (status === 0 && /(?:fetch failed|failed to fetch|network error|networkerror|ECONNRESET|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT)/i.test(message)) return "network";
  return "unknown";
}

export async function readAskProfiles<T>(
  query: (signal: AbortSignal) => PromiseLike<ReadResult<T>>,
  options: { signal?: AbortSignal; budgetMs?: number; attemptMs?: number; backoffMs?: number } = {},
) {
  const started = performance.now();
  if ([options.budgetMs, options.attemptMs].some(value => value !== undefined && (!Number.isFinite(value) || value < 1))
    || options.backoffMs !== undefined && (!Number.isFinite(options.backoffMs) || options.backoffMs < 0)) throw new Error("INVALID_PROFILE_READ_BUDGET");
  const deadline = started + Math.min(8_000, Math.max(1, options.budgetMs ?? 8_000));
  let result: ReadResult<T> = { data: null, error: new DOMException("Read cancelled", "AbortError"), status: 0 };
  let failureClass: FailureClass = "cancelled";
  let firstFailure: FailureClass = "none";
  let codes = safeDatabaseCodes(null);
  let attempts = 0;
  while (attempts < 3 && performance.now() < deadline && !options.signal?.aborted) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new DOMException("Profile read timed out", "TimeoutError")),
      Math.max(1, Math.min(options.attemptMs ?? 3_000, deadline - performance.now())));
    const signal = options.signal ? AbortSignal.any([timeout.signal, options.signal]) : timeout.signal;
    attempts++;
    let abort: (() => void) | undefined;
    try {
      result = await new Promise<ReadResult<T>>((resolve, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) { abort(); return; }
        // Observe both outcomes even after local cancellation; a late transport
        // cannot publish data or produce an unhandled rejection.
        Promise.resolve().then(() => { signal.throwIfAborted(); return query(signal); }).then(resolve, reject);
      });
    }
    catch (error) { result = { data: null, error, status: 0 }; }
    finally { clearTimeout(timer); if (abort) signal.removeEventListener("abort", abort); }
    failureClass = options.signal?.aborted ? "cancelled" : classifyAskDatabaseFailure(result.error, result.status, signal);
    // Never trust data arriving after cancellation/deadline, even if a custom fetch ignores abort.
    if (signal.aborted && !result.error) {
      result = { data: null, error: signal.reason, status: 0 };
      failureClass = options.signal?.aborted ? "cancelled" : "timeout";
    }
    if (failureClass === "none") break;
    codes = safeDatabaseCodes(result.error);
    if (firstFailure === "none") firstFailure = failureClass;
    if (!["network", "gateway", "timeout"].includes(failureClass) || attempts === 3) break;
    const delay = Math.min((options.backoffMs ?? 200) * attempts, deadline - performance.now());
    if (delay > 0) await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", finish); resolve(); };
      const timer = setTimeout(finish, delay);
      options.signal?.addEventListener("abort", finish, { once: true });
      if (options.signal?.aborted) finish();
    });
  }
  if (options.signal?.aborted) {
    result = { data: null, error: options.signal.reason, status: 0 };
    failureClass = "cancelled";
  }
  return { ...result, diagnostic: { attempts, elapsedMs: Math.round(performance.now() - started), failureClass, firstFailure, ...codes, status: result.status, recovered: !result.error && attempts > 1 } };
}
