# Distributed rate limiting and concurrency (S2B)

## Verified repository implementation

Furvise uses `@upstash/redis` through the single adapter in `app/lib/security/rate-limit/redis-adapter.ts`. Production decisions are stored in Redis; there is no process-local production fallback. The adapter uses atomic Lua operations for rolling-window admission and idempotency fingerprints, `SET NX PX` for leases, and a compare-and-delete Lua script so only the holder can release a lease.

The in-memory adapter is exported only for explicit test injection. Rate limiting defaults to enabled in production and disabled outside production unless `FURVISE_RATE_LIMIT_ENABLED` is explicitly set.

## Route and policy inventory

| Resource | Policy | Notes |
| --- | --- | --- |
| `POST /api/ask` | `ASK_AI` | Applied only at the model-backed boundary; deterministic handling and canonical replay remain available. |
| `POST /api/analyze` | `PRODUCT_GUIDANCE_AI` | Legacy model-backed analysis. |
| `POST /api/safety-followup` | `SAFETY_FOLLOWUP_AI` | Model-backed safety follow-up. |
| `POST /api/shop/interpret-query` | `PRODUCT_GUIDANCE_AI` | Cached and deterministic paths run before the model gate. |
| `POST /api/shop/explain-product-fit` | `PRODUCT_GUIDANCE_AI` | Model-backed explanation. |
| `POST /api/shop/product-question` | `PRODUCT_GUIDANCE_AI` | Off-topic and deterministic responses run before the model gate. |
| `POST /api/vet-briefs/draft` | `VET_BRIEF_AI` | Stricter brief-generation limit. |
| `POST/PATCH/DELETE /api/ask/conversations…` | `CONVERSATION_WRITE` | Owner checked before admission. |
| `PATCH /api/memories/[id]` | `MEMORY_WRITE`; forget uses `DESTRUCTIVE_WRITE` | Canonical memory lifecycle. |
| `POST/DELETE /api/legacy-memories` | `MEMORY_WRITE` / `DESTRUCTIVE_WRITE` | Legacy result memories retained for compatibility. |
| `PATCH /api/ask/suggestions/[id]` | `MEMORY_WRITE`, `CARE_WRITE`, or `DESTRUCTIVE_WRITE` | Selected after owned suggestion is loaded. |
| `POST/PATCH/DELETE /api/pets…` | `PROFILE_WRITE` / `DESTRUCTIVE_WRITE` | Browser writes now cross an authenticated server boundary. |
| `POST/PATCH/DELETE /api/care-entries…` | `CARE_WRITE` / `DESTRUCTIVE_WRITE` | Browser writes now cross an authenticated server boundary. |
| `POST /api/vet-briefs` | `CARE_WRITE` | Confirmed brief persistence. |
| `POST /api/account/detect-country` | `PROFILE_WRITE` | Applied only when a write is required. |
| `POST /api/account/product-country` | `PROFILE_WRITE` | Manual account Product-country write. |
| `POST /api/shop/catalog` | `CATALOG_READ` | High bounded limit; deterministic browsing remains available under normal use and independently of AI credits. |

Reads and private page rendering are not treated as expensive writes. Hosted Supabase Auth endpoints are not intercepted.

## Canonical policies

All windows are rolling 60-second windows. Ask, Product AI, and Safety AI allow 10 requests per user and 30 per IP. Vet Brief AI allows 4 per user and 12 per IP. Memory, profile, care, and conversation writes allow 30 per user and 60 per IP. Catalog reads allow 120 per user and 240 per IP. Destructive writes allow 10 per user and 20 per IP and fail closed.

Environment overrides use `FURVISE_RATE_LIMIT_<POLICY>_USER_PER_MINUTE` and `_IP_PER_MINUTE`. Values are clamped from 1 through five times the compiled default; invalid values retain the default. Numeric values are not duplicated in route handlers.

## Shared concurrency lease

One model-backed Furvise request may be active per authenticated user across Ask, Product AI, Safety Follow-up, and Vet Brief generation. Features deliberately share one hashed user lease key. Standard leases are 65 seconds; Vet Brief leases are 90 seconds. These TTLs exceed current provider timeouts and prevent a crashed worker from creating a permanent lock.

Acquisition is atomic, the lease has a random ownership token, and release succeeds only for that holder. Every integrated provider boundary releases in `finally`, including provider, credit, validation, and persistence failures. A second active request receives HTTP 409 with `AI_REQUEST_ALREADY_ACTIVE`; rate-limit denials use HTTP 429. Both responses include `Retry-After` and private/no-store headers.

## IP trust and privacy

Forwarding headers are trusted only when the runtime declares Vercel (`VERCEL=1`) and the platform marker `x-vercel-id` is present. The resolver prefers `x-vercel-forwarded-for`, then the platform-provided real/forwarded address, rejects ambiguous comma-separated values, validates IPv4/IPv6, and normalizes IPv4-mapped IPv6. Arbitrary non-Vercel forwarding headers are ignored.

User and IP identities are HMAC-SHA-256 keyed by the dedicated `FURVISE_RATE_LIMIT_HASH_SECRET`. Redis and logs receive no raw IP and no full user ID. Logs may include only a short hashed-IP prefix. Rotate the hash secret as a controlled key-space rollover: deploy the new secret during a low-traffic window; existing buckets become unreachable and expire naturally within their TTL.

## Idempotency interaction

When a valid route request/idempotency key is present, Redis stores a keyed operation identity and payload fingerprint for one rate window. An exact retry reuses that logical admission; the same key with a different payload receives `IDEMPOTENCY_CONFLICT`. New keys still consume the user and IP windows. In-flight double submissions are stopped by the shared lease. Canonical completed replay remains owned by each route's existing idempotency implementation; S2B does not invent completion storage for routes that do not yet have it.

## Failure policy

If limiting is enabled but Redis URL, token, or a 32-character hash secret is absent, all model-backed routes fail closed with HTTP 503 `RATE_LIMIT_UNAVAILABLE` before provider execution. Redis has no retries and an abort timeout (800 ms default, bounded to 200–2,000 ms). Profile, memory, care, conversation, and catalog operations fail open with a structured warning because they carry no provider cost and data-entry availability is prioritized. Destructive writes fail closed. No production path silently substitutes the in-memory adapter.

Setting `FURVISE_RATE_LIMIT_ENABLED=false` explicitly disables all S2B admission and concurrency controls. This is an emergency availability control, not the normal Redis-outage response; use it only with operator approval and restore it promptly.

## External setup required (not verified)

1. Create separate Upstash Redis databases or credentials for Preview and Production. Do not reuse development credentials.
2. In each Vercel environment, add `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, a unique random `FURVISE_RATE_LIMIT_HASH_SECRET` of at least 32 characters, and `FURVISE_RATE_LIMIT_ENABLED=true`.
3. Keep all four variables server-only. Never add a `NEXT_PUBLIC_` prefix.
4. Redeploy and verify the variables are present without printing their values.
5. Exercise simultaneous requests against at least two deployed instances and confirm one shared lease and shared counters. Local tests do not prove cross-instance behavior.
6. Simulate an invalid/disabled Redis credential in Preview. Confirm AI returns `RATE_LIMIT_UNAVAILABLE` and no OpenAI call/credit reservation occurs; confirm ordinary profile/care writes follow the documented fail-open policy.
7. Rotate a Redis token by creating the replacement, updating Vercel, redeploying, verifying traffic, then revoking the prior token. Preview and Production must be rotated separately.

No Upstash database, Vercel variable, or real multi-instance behavior was externally verified during repository implementation.

## Later monitoring interface

`RateLimitMetrics.record` is an injectable vendor-neutral interface. Structured logs contain request ID, route, policy, presence of a user, allowed/denied result, limiting dimension, retry interval, elapsed time, and optional hashed-IP prefix. S2B intentionally does not connect a monitoring vendor.
