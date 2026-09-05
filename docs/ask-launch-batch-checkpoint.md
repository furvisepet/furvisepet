# Launch reliability batch

Base c222d4a; worktree C:/Users/gwara/furvise-ask-remaining-reliability, branch codex/ask-remaining-reliability. Exclusive process lock PID7656; release sentinel C:/Users/gwara/furvise-launch-batch.release.

Scope: investigate remaining episode evidence requirements, active legacy memory consumers, Vet Brief request failure, and local launch verification. No live provider, remote migration, push, merge, or deployment.

Current: code shows structured feature calls combine temperature 0.2 with GPT-5 low reasoning. Reproduction and compatible request correction in progress. Historical production error cause remains unproven. The four lifetime requirements still lack source linkage/completeness in fixtures; do not manufacture those guarantees or change expectations.

## Verified changes
- Shared structured request boundary omits temperature when the selected model uses the configured GPT-5 low reasoning. Request copies preserve non-reasoning fallback temperature. Wire tests failed 2/3 before and pass afterward. This is compatibility hardening; original production provider response is unavailable, so historical root cause is not proven.
- Vet Brief rejects unknown/non-string citation IDs rather than silently dropping them. New reproduction failed before correction.
- Vet Brief failure logging uses allowlisted categories and HTTP status; provider messages, payloads, excerpts, arbitrary codes and credentials are excluded. Compatibility validation failures have a distinct category.
- Actual feature runner exercised with a synthetic SDK response through schema and document validation, preserving empty memory/care writes.

Verification: full suite 2,249 passed; typecheck and lint passed (two existing warnings); diff check passed. Subsequent test-only runner/fallback assertions: focused 6/6 passed. Logs C:/Users/gwara/furvise-launch-batch-{full,typecheck,lint}.log and furvise-vet-runner-final.log.

## Local browser smoke
Used separate headless Chrome agent-browser session furvise-launch-batch, local server 127.0.0.1:3107 with synthetic loopback Supabase configuration and no provider key. Homepage rendered with navigation; screenshot C:/Users/gwara/furvise-launch-home.png inspected. Ask and Vet Brief redirect to the login page with their next paths preserved. Both unauthenticated POST endpoints return 401. Browser errors command returned no errors. Browser and owned dev-server process tree were stopped afterward.
This is NOT authenticated paid-feature or production build validation. Real model quality, credit lifecycle and deployment prerequisites remain outside this smoke test.

## Remaining evidence and migration work
Unchanged lifetime audit is last verified 13/4 (not rerun in this provider-only batch). Old prose-list fixture contains no corresponding source rows; unlinked episode fixtures lack membership links; exact total fixture does not establish completeness. No audit assertions or authority gates were weakened.
Active results-page saveDogMemories still writes /api/legacy-memories; profile readers and deletion use dog_memories. Existing canonical save RPC requires an owned persisted Ask suggestion, so routing arbitrary results through it would bypass that authority. Proper migration requires a separate owner-locked, idempotent confirmation operation, reader adaptation and real SQL/rollback tests before removing the old dependency. No schema change was fabricated or marked validated.
