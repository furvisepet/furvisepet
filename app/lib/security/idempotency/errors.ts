import "server-only";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };

export function idempotencyErrorResponse(code: "IDEMPOTENCY_KEY_REQUIRED" | "IDEMPOTENCY_KEY_INVALID" | "IDEMPOTENCY_CONFLICT" | "REQUEST_IN_PROGRESS" | "IDEMPOTENCY_UNAVAILABLE", requestId: string, retryAfterSeconds = 0) {
  const status = code === "IDEMPOTENCY_KEY_REQUIRED" || code === "IDEMPOTENCY_KEY_INVALID" ? 400 : code === "IDEMPOTENCY_UNAVAILABLE" ? 503 : 409;
  const messages = {
    IDEMPOTENCY_KEY_REQUIRED: "This request needs a valid retry identifier.",
    IDEMPOTENCY_KEY_INVALID: "This request has an invalid retry identifier.",
    IDEMPOTENCY_CONFLICT: "This request could not be reused because its details changed.",
    REQUEST_IN_PROGRESS: "This request is already being processed.",
    IDEMPOTENCY_UNAVAILABLE: "This update is temporarily unavailable. Please try again.",
  } as const;
  const headers = new Headers(PRIVATE_HEADERS);
  if (retryAfterSeconds > 0) headers.set("Retry-After", String(retryAfterSeconds));
  return Response.json({ error: messages[code], code, ...(retryAfterSeconds > 0 ? { retryAfterSeconds } : {}), requestId }, { headers, status });
}

export function replayResponse(status: number | null, body: unknown) {
  const headers = new Headers(PRIVATE_HEADERS);
  headers.set("Idempotency-Replayed", "true");
  if (status === 204) return new Response(null, { headers, status: 204 });
  return Response.json(body ?? {}, { headers, status: status || 200 });
}
