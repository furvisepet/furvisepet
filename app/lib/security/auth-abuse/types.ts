import type { RateLimitPolicyName } from "../rate-limit";

export type AuthFlow = "signup" | "login" | "password_recovery" | "confirmation_resend" | "confirmation_verify" | "oauth_initiation" | "account_password_change";

export type AuthAbuseStore = {
  check(input: { key: string; limit: number; member: string; nowMs: number; windowMs: number }): Promise<{ allowed: boolean; count: number; retryAfterMs: number }>;
  claim(input: { fingerprint: string; key: string; ttlMs: number }): Promise<"new" | "replay" | "conflict">;
  clear(key: string): Promise<void>;
  state(input: { key: string; nowMs: number; windowMs: number }): Promise<{ count: number; retryAfterMs: number }>;
};

export type AuthLimitPolicyName = Extract<RateLimitPolicyName, `AUTH_${string}`>;
