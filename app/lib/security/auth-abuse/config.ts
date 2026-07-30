import "server-only";

import { getRateLimitBackendConfig, isRateLimitEnabled } from "../rate-limit/config";

export function getAuthAbuseConfig(env: Record<string, string | undefined> = process.env) {
  const backend = getRateLimitBackendConfig(env as NodeJS.ProcessEnv);
  const hashSecret = env.FURVISE_AUTH_RATE_LIMIT_HASH_SECRET?.trim() || "";
  return {
    configured: backend.configured && hashSecret.length >= 32,
    enabled: isRateLimitEnabled(env as NodeJS.ProcessEnv),
    hashSecret,
    timeoutMs: backend.timeoutMs,
    token: backend.token,
    url: backend.url,
  };
}

export function isCaptchaDevelopmentBypassAllowed(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== "production" && env.FURVISE_CAPTCHA_DEV_BYPASS === "true";
}

export function getLoginCaptchaMode(env: Record<string, string | undefined> = process.env) {
  return env.FURVISE_AUTH_LOGIN_CAPTCHA_MODE === "always" ? "always" as const : "progressive" as const;
}
