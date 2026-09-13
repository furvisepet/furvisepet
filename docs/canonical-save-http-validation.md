# Local PostgREST verification

Base ad14e61700b73cb8f3809e3d873272c500a24061. Existing uncommitted recovery notes preserved.

PostgREST 16.1 was extracted from an already-cached image and executed inside furvise-stage2-db-2788f0b, bound only to 127.0.0.1:3099. Network remained none and no host port was exposed. The probe used a temporary NOINHERIT login with role memberships and generated short-lived test JWTs; no production credential was used or printed.

The first attempt after container start correctly failed before fixtures because PostgreSQL was starting. After pg_isready succeeded, the corrected byte-mode Python harness passed:
- anon HTTP 401
- authenticated HTTP 403
- service_role save HTTP 200, followed by already_applied retry with the same memory ID
- exactly one canonical memory
- temporary role/user removed, temporary secret files removed, zero remaining database sessions verified

The nine running containers labelled com.docker.compose.project=furvise were stopped with explicit user authorization. Their data was not removed. The disposable test container was stopped after verification and the startup monitor was signalled to stop Docker Desktop.

This verifies local PostgREST RPC exposure and role switching, not a browser-to-Next.js-to-production gateway flow. The previous actual-PATCH tests use mocked boundaries. Production schema cache, environment and end-to-end UI remain unverified. No application code changed; previous full-suite/typecheck/lint results were not rerun. No remote migrations, live provider calls, push, merge or deployment.
