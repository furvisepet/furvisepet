import { acquireConcurrencyLease, releaseConcurrencyLease } from "./concurrency";
import { concurrencyResponse, rateLimitResponse } from "./errors";
import { fingerprintRateLimitPayload } from "./keys";
import { checkRateLimit } from "./rate-limit";
import type { ConcurrencyLease, RateLimitAdapter, RateLimitPolicyName } from "./types";

export class RateLimitRejection extends Error {
  readonly response: Response;

  constructor(response: Response) {
    super("RATE_LIMIT_REJECTED");
    this.name = "RateLimitRejection";
    this.response = response;
  }
}

export async function beginRateLimitedRequest(input: {
  adapter?: RateLimitAdapter;
  enabled?: boolean;
  idempotencyKey?: string;
  ipAddress?: string | null;
  payload?: unknown;
  policy: RateLimitPolicyName;
  request: Request;
  requestId: string;
  route: string;
  userId: string;
}): Promise<
  | { allowed: false; response: Response }
  | { allowed: true; idempotencyReused: boolean; lease: ConcurrencyLease | null; release: () => Promise<boolean> }
> {
  const rate = await checkRateLimit({
    adapter: input.adapter,
    enabled: input.enabled,
    fingerprint: input.payload === undefined ? undefined : fingerprintRateLimitPayload(input.payload),
    idempotencyKey: input.idempotencyKey,
    ipAddress: input.ipAddress,
    policy: input.policy,
    request: input.request,
    requestId: input.requestId,
    route: input.route,
    userId: input.userId,
  });
  if (!rate.allowed) return { allowed: false, response: rateLimitResponse({ code: rate.code, requestId: input.requestId, retryAfterSeconds: rate.retryAfterSeconds }) };

  const modelBacked = input.policy === "ASK_AI" || input.policy === "PRODUCT_GUIDANCE_AI" || input.policy === "SAFETY_FOLLOWUP_AI" || input.policy === "VET_BRIEF_AI";
  if (!modelBacked) return { allowed: true, idempotencyReused: rate.idempotencyReused, lease: null, release: async () => true };

  const concurrency = await acquireConcurrencyLease({ adapter: input.adapter, enabled: input.enabled, feature: input.policy, requestId: input.requestId, route: input.route, userId: input.userId });
  if (!concurrency.acquired) {
    return {
      allowed: false,
      response: concurrency.code === "AI_REQUEST_ALREADY_ACTIVE"
        ? concurrencyResponse({ requestId: input.requestId, retryAfterSeconds: concurrency.retryAfterSeconds })
        : rateLimitResponse({ code: "RATE_LIMIT_UNAVAILABLE", requestId: input.requestId, retryAfterSeconds: concurrency.retryAfterSeconds }),
    };
  }
  return {
    allowed: true,
    idempotencyReused: rate.idempotencyReused,
    lease: concurrency.lease,
    release: () => releaseConcurrencyLease({ adapter: input.adapter, lease: concurrency.lease, route: input.route }),
  };
}

export async function requireRateLimitedRequest(input: Parameters<typeof beginRateLimitedRequest>[0]) {
  const result = await beginRateLimitedRequest(input);
  if (!result.allowed) throw new RateLimitRejection(result.response);
  return result;
}

export * from "./config";
export * from "./concurrency";
export * from "./errors";
export * from "./keys";
export * from "./memory-test-adapter";
export * from "./rate-limit";
export type * from "./types";
