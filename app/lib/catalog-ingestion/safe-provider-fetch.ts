export type SafeProviderFetchOptions = {
  allowedContentTypes: string[];
  allowedHostnames: string[];
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  maxAttempts: number;
  maxRetryAfterMs?: number;
  maxResponseBytes: number;
  timeoutMs: number;
};

export async function safeProviderFetch(urlValue: string, options: SafeProviderFetchOptions) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || !options.allowedHostnames.includes(url.hostname)) {
    throw new Error("Provider URL is not allowlisted.");
  }
  const fetchImpl = options.fetchImpl || fetch;
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: options.allowedContentTypes.join(", "), ...(options.headers || {}) },
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) throw new Error(`Provider returned HTTP ${response.status}.`);
        throw new RetryableProviderError(`Provider returned HTTP ${response.status}.`, retryDelay(response, options.maxRetryAfterMs));
      }
      const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
      if (!options.allowedContentTypes.includes(contentType)) throw new Error("Provider response content type is not allowed.");
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > options.maxResponseBytes) throw new Error("Provider response is too large.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > options.maxResponseBytes) throw new Error("Provider response is too large.");
      return { bytes, contentType, url: url.toString() };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof RetryableProviderError || (error instanceof Error && error.name === "AbortError");
      if (!retryable || attempt === options.maxAttempts) break;
      const retryAfterMs = error instanceof RetryableProviderError ? error.retryAfterMs : null;
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs ?? Math.min(50 * 2 ** (attempt - 1), 200)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Provider request failed after ${options.maxAttempts} attempt(s).`, { cause: lastError });
}

class RetryableProviderError extends Error {
  readonly retryAfterMs: number | null;
  constructor(message: string, retryAfterMs: number | null) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

function retryDelay(response: Response, maximum = 2_000) {
  if (response.status !== 429) return null;
  const seconds = Number(response.headers.get("retry-after"));
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1_000, maximum);
}
