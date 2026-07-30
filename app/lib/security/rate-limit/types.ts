export type RateLimitPolicyName =
  | "ASK_AI"
  | "PRODUCT_GUIDANCE_AI"
  | "SAFETY_FOLLOWUP_AI"
  | "VET_BRIEF_AI"
  | "MEMORY_WRITE"
  | "PROFILE_WRITE"
  | "CARE_WRITE"
  | "CONVERSATION_WRITE"
  | "DESTRUCTIVE_WRITE"
  | "CATALOG_READ"
  | "AUTH_SIGNUP"
  | "AUTH_LOGIN"
  | "AUTH_PASSWORD_RECOVERY"
  | "AUTH_CONFIRMATION_RESEND"
  | "AUTH_OAUTH_INITIATION";

export type RateLimitFailurePolicy = "fail_closed" | "fail_open";

export type RateLimitPolicy = {
  concurrencyTtlMs?: number;
  failurePolicy: RateLimitFailurePolicy;
  dailyIp?: { limit: number; windowMs: number };
  email?: { limit: number; windowMs: number };
  ip: { limit: number; windowMs: number };
  modelBacked: boolean;
  name: RateLimitPolicyName;
  user: { limit: number; windowMs: number };
};

export type RateLimitAdapterDecision = {
  allowed: boolean;
  conflict: boolean;
  remaining: number;
  retryAfterMs: number;
  reused: boolean;
};

export type RateLimitAdapter = {
  acquireLease(input: { key: string; ownerToken: string; ttlMs: number }): Promise<{ acquired: boolean; retryAfterMs: number }>;
  check(input: {
    dedupeKey?: string;
    fingerprint?: string;
    key: string;
    limit: number;
    member: string;
    nowMs: number;
    windowMs: number;
  }): Promise<RateLimitAdapterDecision>;
  releaseLease(input: { key: string; ownerToken: string }): Promise<boolean>;
};

export type RateLimitMetric = {
  allowed: boolean;
  dimension: "user" | "ip" | "concurrency" | "backend_unavailable" | "disabled";
  elapsedMs: number;
  policy: RateLimitPolicyName;
  retryAfterSeconds: number;
};

export type RateLimitMetrics = {
  record(metric: RateLimitMetric): void | Promise<void>;
};

export type RateLimitCheckResult =
  | { allowed: true; backendBypassed: boolean; idempotencyReused: boolean }
  | {
      allowed: false;
      code: "RATE_LIMITED" | "RATE_LIMIT_UNAVAILABLE" | "IDEMPOTENCY_CONFLICT";
      dimension: "user" | "ip" | "backend_unavailable";
      retryAfterSeconds: number;
    };

export type ConcurrencyLeaseResult =
  | { acquired: true; lease: ConcurrencyLease }
  | { acquired: false; code: "AI_REQUEST_ALREADY_ACTIVE" | "RATE_LIMIT_UNAVAILABLE"; retryAfterSeconds: number };

export type ConcurrencyLease = {
  feature: RateLimitPolicyName;
  key: string;
  ownerToken: string;
  requestId: string;
  retryAfterSeconds: number;
};
