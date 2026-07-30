# Furvise security Phase S2 plan

## P0 — launch blocking configuration/evidence

1. Run and archive sanitized Supabase Security and Performance Advisor outputs; remediate any RLS, sensitive-column, public-bucket, mutable-search-path, or unintended definer-execute finding; rerun two-user SQL tests.
2. Create a separate production OpenAI project/key; disable input/output sharing; set a hard project budget and alerts; rotate the pre-launch key. Add `FURVISE_AI_ENABLED` and a server-side daily-spend guard interface that fails closed without exposing provider details.
3. Verify Supabase Dashboard: exact Site URL/redirect allowlist, OAuth providers/secrets, password-reset template, email confirmation, anonymous sign-ins disabled, session duration/refresh, leaked-password protection and CAPTCHA decision.
4. Configure deployment secrets independently for preview/production and verify built client chunks contain neither OpenAI nor Supabase server-key values.

## P1 — application controls

1. Shared distributed limiter (Redis/provider KV): Ask 10/min and 60/day/user; product AI 20/min and 100/day/user; Vet Brief 5/hour and 20/day/user; anonymous auth endpoints 10/15 min/IP. Return stable 429 + retry metadata.
2. Concurrent request locks: one active Ask/Vet generation per user/request ID; stale reservation release job; global provider-call cap and daily spend circuit breaker.
3. Move all JSON routes to one strict schema layer, reject unknown keys, apply streamed byte caps, and add idempotency keys for legacy conversation append and Vet Brief confirmation.
4. Replace client-only private-page gates with current Supabase SSR cookie architecture and a Next.js 16 `proxy.ts` optimistic redirect only; authorization remains in data access. Add `Cache-Control: private, no-store` for private HTML/API responses.
5. Security headers rollout: `poweredByHeader: false`; `nosniff`; strict referrer and permissions policies; production HSTS; CSP Report-Only first with exact Supabase/OpenAI/image/script origins and no production `unsafe-eval`, then enforce after auth/page QA.
6. Centralize all logs through the S1 redactor; hash IDs where correlation is required; prohibit full conversation/health notes/provider output. Add tests using a capture logger.

## P1 — database/operations

1. Fix four `db lint` repair-function type warnings with explicit UUID/UUID-array casts; test dry-run and apply paths in staging.
2. Review direct update/delete grants on immutable care history. Prefer append-only correction events while retaining necessary user deletion/account-erasure behavior.
3. Run Advisor-index review; add only demonstrated missing FK/ownership indexes, remove duplicate indexes only after workload evidence.
4. Add backup/restore drill, incident/key-rotation runbook, audit retention, alerting for auth spikes, credit anomalies, RPC denials, and provider failures.

## P2 — supply chain and platform

1. Upgrade Next.js and `eslint-config-next` together from 16.2.9 to at least the patched 16.2.12 line after regression/build QA; update Tailwind/PostCSS from 4.3.1 to a fixed release. Re-run `npm audit`: the S1 snapshot had 0 critical, 6 high (Next/PostCSS/Sharp runtime or build paths; brace-expansion/js-yaml development tooling), and 448 total dependency nodes. Do not use `npm audit fix --force`.
2. Enable Dependabot, GitHub secret scanning/push protection, protected main branch, required CI, signed/reviewed production deploys, and minimal workflow permissions (`contents: read` by default).
3. Add CI jobs for lint, TypeScript, unit tests, production build, secret scan, `npm audit --omit=dev`, migration lint, and disposable Supabase RLS/RPC tests.
4. If uploads are introduced: private bucket, owner UUID first path segment, 5 MiB image cap, JPEG/PNG/WebP only, server-verified MIME, sanitized filename, 5-minute signed reads, delete cascade job; prohibit SVG/HTML.
