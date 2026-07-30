# Production environment checklist

Run `node scripts/validate-production-environment.mjs` in a protected production-like environment. It reports names only, never values.

Required: Supabase URL/publishable/secret keys, Upstash URL/token, rate HMAC, Auth-rate HMAC, operations HMAC, readiness secret, and—when AI is enabled—OpenAI key plus daily call/cost ceilings. Feature-required: Turnstile public key plus Dashboard secret, CSP report destination, and later Google OAuth credentials. Development adapters and CAPTCHA bypasses must remain impossible in production.

OpenAI operator evidence must cover a separate production project/key, sharing disabled, model access, current pricing registry review, provider budget/alerts, confirmed Furvise daily ceilings, emergency-switch exercise, rotation before launch, and no development accounting mixture. Provider billing remains authoritative.

The readiness route is not public: send `X-Furvise-Operator-Key` through deployment-protected access. It checks safe configuration state, database/migration snapshot, and Redis with bounded timeouts; it never calls OpenAI or returns IDs, URLs, keys, versions, or table names.
