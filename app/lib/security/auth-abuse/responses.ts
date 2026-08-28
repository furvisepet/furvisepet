import "server-only";

import { PRIVATE_CACHE_HEADERS } from "../private-routes";

export const SIGNUP_NEUTRAL_MESSAGE = "Enter the code from your email to continue. If you already have an account, sign in or reset your password.";
export const RECOVERY_NEUTRAL_MESSAGE = "If an account exists for that email, a recovery link will be sent.";
export const RESEND_NEUTRAL_MESSAGE = "If confirmation is still required, a new code will be sent.";

export function authJson(body: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  return Response.json(body, { headers: { ...PRIVATE_CACHE_HEADERS, ...Object.fromEntries(new Headers(headers)) }, status });
}

export function authLimitResponse(requestId: string, retryAfterSeconds: number) {
  return authJson({ code: "AUTH_RATE_LIMITED", error: "Please wait a moment and try again.", requestId, retryAfterSeconds }, 429, { "Retry-After": String(retryAfterSeconds) });
}

export function authUnavailableResponse(requestId: string) {
  return authJson({ code: "AUTH_TEMPORARILY_UNAVAILABLE", error: "Account access is temporarily unavailable. Please try again.", requestId }, 503);
}

export function captchaRequiredResponse(requestId: string) {
  return authJson({ code: "CAPTCHA_REQUIRED", error: "Complete the security check and try again.", requestId }, 403);
}

export function idempotencyConflictResponse(requestId: string) {
  return authJson({ code: "IDEMPOTENCY_CONFLICT", error: "This request could not be reused because its details changed.", requestId }, 409);
}
