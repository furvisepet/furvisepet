# Furvise Safe Load Test

This helper is for local or staging smoke load only. It does not simulate 1000 real concurrent browser users, does not call Ask Furvise POST, and does not call OpenAI.

Default read-only local run:

```bash
node scripts/load-test/safe-local-load.mjs
```

Larger local read test:

```bash
TOTAL_REQUESTS=1000 CONCURRENCY=50 node scripts/load-test/safe-local-load.mjs
```

Staging requires an explicit target and confirmation:

```bash
BASE_URL=https://your-staging.example.com CONFIRM_NON_LOCAL=true TOTAL_REQUESTS=1000 CONCURRENCY=50 node scripts/load-test/safe-local-load.mjs
```

Optional authenticated page reads:

```bash
INCLUDE_PROTECTED=true AUTH_BEARER_TOKEN=... node scripts/load-test/safe-local-load.mjs
```

Optional write smoke is limited to account country detection and requires a test account token:

```bash
ALLOW_WRITES=true AUTH_BEARER_TOKEN=... TOTAL_REQUESTS=10 CONCURRENCY=2 node scripts/load-test/safe-local-load.mjs
```

Use production only with explicit approval and conservative limits. Next dev performance is not representative of Vercel production performance.
