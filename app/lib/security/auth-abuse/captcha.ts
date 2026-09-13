import "server-only";

import { isCaptchaDevelopmentBypassAllowed } from "./config";
import { resolveLoginCaptchaPolicy, validateCaptchaToken } from "./login-captcha";

export function requireCaptchaToken(value: unknown, env: Record<string, string | undefined> = process.env) {
  if (isCaptchaDevelopmentBypassAllowed(env) && (value === undefined || value === null || value === "")) {
    console.warn("[Furvise auth] CAPTCHA development bypass active", { production: false });
    return { allowed: true as const, bypassed: true as const, token: undefined };
  }
  return validateCaptchaToken(value);
}

export function resolveLoginCaptcha(
  input: Record<string, unknown>,
  challengeRequired: boolean,
  env: Record<string, string | undefined> = process.env,
) {
  return resolveLoginCaptchaPolicy(input, challengeRequired, (value) => requireCaptchaToken(value, env));
}

export function isCaptchaAuthError(error: unknown) {
  const code = authErrorCode(error);
  return code === "captcha_failed" || code === "captcha_expired" || code === "captcha_verification_failed";
}

export function authErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "unknown";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const status = "status" in error && typeof error.status === "number" ? error.status : 0;
  if (code) return code.slice(0, 80);
  return status >= 500 ? "provider_unavailable" : status === 429 ? "provider_rate_limited" : "auth_rejected";
}
