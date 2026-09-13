# Launch reliability batch

Base c222d4a; worktree C:/Users/gwara/furvise-ask-remaining-reliability, branch codex/ask-remaining-reliability. Exclusive process lock PID7656; release sentinel C:/Users/gwara/furvise-launch-batch.release.

Scope: investigate remaining episode evidence requirements, active legacy memory consumers, Vet Brief request failure, and local launch verification. No live provider, remote migration, push, merge, or deployment.

Provider and citation repairs committed as 61418b9140fb8ab17d776b0cc9b909906f99a47d. Historical production error cause remains unproven. Older prose-list presentation repair is implemented; final verification is in progress. Do not manufacture source linkage or completeness guarantees.

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
Unchanged lifetime audit now has 14 passes / 3 failures (furvise-presentation-audit.log). An older list's label can be recovered as explicitly unverified conversation context, not as source-backed history. Canonical episode retrieval/ordinal metadata fixtures still lack membership links; exact total fixture does not establish completeness. No audit assertions or authority gates were weakened. Merely serializing unverified indexes to satisfy reachability assertions was considered and not implemented.
Active results-page saveDogMemories still writes /api/legacy-memories; profile readers and deletion use dog_memories. Existing canonical save RPC requires an owned persisted Ask suggestion, so routing arbitrary results through it would bypass that authority. Proper migration requires a separate owner-locked, idempotent confirmation operation, reader adaptation and real SQL/rollback tests before removing the old dependency. No schema change was fabricated or marked validated.

## Older prose-list presentation
The latest owned assistant list and its preceding explicit single-pet episode question can supply bounded navigation labels. Labels never populate supported episode items/counts, source citations or persistent references. Final output quotes the prior wording and explains that source records are needed. Wrong pet/topic, multiple ordinals and stale source-backed references retain their existing protections. Deleted/forgotten markers, unavailable inactive-memory checks and redacted user prompts suppress presentation reuse.
Before: new callback regression failed (8/9 passing). After: 9/9 callback cases, pure helper tests and full 2,250 tests passed; typecheck/lint passed with the same two warnings. Final rerun after the unavailable-marker suppression is recorded below when complete.
No database or Docker work was needed. Browser smoke used synthetic local configuration only. Authenticated paid flow, production provider failure reproduction, legacy writer replacement and rollout validation remain unfinished.

## Final verification and handoff
Final full suite: 2,250 passed, zero failures/skips; typecheck exit 0; lint exit 0 with two existing unused-supabase warnings; git diff --check exit 0. Logs: C:/Users/gwara/furvise-launch-final-{full,typecheck,lint}.log.
Final unchanged lifetime audit: 17 tests, 14 passed / 3 failed, run with node --experimental-transform-types --test scripts/audits/ask-lifetime-history.audit.mjs; log furvise-launch-final-audit.log. Initial direct invocation without transform-types failed to load TypeScript and was corrected; that loader failure is not an audit result.
Next implementation requires source-linked old episode index retrieval and explicit completeness semantics; do not infer exact lifetime totals from bounded/unlinked records. Legacy results memory remains an active dependency requiring an authorized canonical confirmation operation and real SQL validation. Authenticated paid-flow and intended-environment checks remain pending. No background writer should remain after commit and release sentinel; next session must acquire its own process-aware lock.
