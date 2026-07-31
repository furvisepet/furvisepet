import { PRIVATE_CACHE_HEADERS } from "../private-routes";

export function rateLimitResponse(input: {
  code: "RATE_LIMITED" | "RATE_LIMIT_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT";
  requestId: string;
  retryAfterSeconds: number;
}) {
  const messages = {
    IDEMPOTENCY_CONFLICT: "That request identifier was already used for different information.",
    RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
    RATE_LIMIT_UNAVAILABLE: "This action is temporarily unavailable. Please try again shortly.",
  } as const;
  return Response.json({
    code: input.code,
    error: messages[input.code],
    requestId: input.requestId,
    retryAfterSeconds: input.retryAfterSeconds,
  }, {
    headers: {
      ...PRIVATE_CACHE_HEADERS,
      ...(input.retryAfterSeconds > 0 ? { "Retry-After": String(input.retryAfterSeconds) } : {}),
    },
    status: input.code === "IDEMPOTENCY_CONFLICT" ? 409 : input.code === "RATE_LIMITED" ? 429 : 503,
  });
}

export function concurrencyResponse(input: { requestId: string; retryAfterSeconds: number }) {
  return Response.json({
    code: "AI_REQUEST_ALREADY_ACTIVE",
    error: "Furvise is still working on your previous request. Please wait a moment.",
    requestId: input.requestId,
    retryAfterSeconds: input.retryAfterSeconds,
  }, {
    headers: { ...PRIVATE_CACHE_HEADERS, "Retry-After": String(input.retryAfterSeconds) },
    status: 409,
  });
}
