# Historical task-writer recovery — 2026-11-16

The original full replay at e471f6c7 failed with SQLSTATE P0001 in
20261004233000_guard_canonical_task_writers.sql because apply_ask_task_v2 was absent.
The original guard remains unchanged.

## Provenance and scope

Restored supabase/migrations/20260919083800_ask_task_note_span_v2.sql byte for byte
from commit d5513439577eb109e2075466acfa3b02291b41f6 (2026-10-18).
SHA-256: f353a44bd72fdfcfaaabcc69206a79e54d5a7c8a62a19cfcd9fe287c0a25f071; 7,584 bytes.
Read-only Supabase migration history version 20260919083800, name ask_task_note_span_v2,
contains precisely those bytes. The older 8d04a940 commit contains the earlier timestamped
migration; this recovery uses the actual installed version, not guessed SQL or a bulk
cherry-pick of either branch. Alternate ancestry was inspected, not modified.

The restored CREATE OR REPLACE and grants are idempotent at their historical position,
after task tables/service-role admission and before the canonical writer guard.
The migration is ALREADY APPLIED in production. Do not run it manually, backfill with
--include-all, or rerun it after the canonical guard: that would restore an obsolete
pre-guard definition. There is no new live DDL or rollback SQL in this repair.
Git revert is the source rollback before deployment; production function rollback is
neither necessary nor authorized. The disposable replay is destroyed on close.

## Exact comparison

Pre-guard V2 body SHA-256:
9f2c87b6662c434ba4e9b168090bb32375ddc17be13e2eee76aaab9306ac53ca

Pre-guard emitted-definition SHA-256:
d8708ff8f15a62b19dabf3b96463fb4afa314f9f10bab9079dde2ff721753a10

Post-guard/live V2 body SHA-256:
82d9c2841051260b3945c0a16f1c79b71b78dd7c96b23e062805a7eb294d28f3

Post-guard/live emitted-definition SHA-256:
c11e687c88b11c68158e66c671a7b39c01e80dcf558af5d85e107e0f0ae2fdf2

Read-only production catalog: postgres owner, SECURITY DEFINER, empty search_path,
postgres and service_role EXECUTE only; anon/authenticated denied. The source validates
service-role admission, current conversation/message/source ownership, exact source text,
note substring, current pet ownership, revision/stale-turn checks and replay identity.
The canonical guard changes the source lock to FOR UPDATE and rejects legacy semantics
for canonical sources. Private ask_tasks has RLS and no client grants. The owner-scoped
public table policies remain unchanged. No grant/owner/RLS prerequisite was invented.

## Disposable evidence

- Fresh PGlite 0.5.8: 141 repository migrations applied; the pre-existing documented
  pg_cron/pg_net hosted scheduler exclusion remains. This is not a full hosted platform clone.
- 15 recovery assertions: exact source, pre/post/live hash parity, repeated historical
  CREATE OR REPLACE without catalog change, owner/search_path/ACL/RLS, two PT409 stale
  raises and idempotent final PT409 reconciliation.
- Existing full-schema continuation contract: 31 assertions for V1 and 31 for V2,
  including wrong-owner pet rejection, source mismatch, stale revision, transport replay,
  cancellation, supersession, persistence and completion rollback.
- Windows checkout CRLF initially tripped the existing exact V1 hash guard. The disposable
  loader now normalizes checkout CRLF to canonical Git LF; no SQL hashes or guard predicates
  were relaxed. Migration failures include the filename and SQLSTATE.
- CI now runs the same disposable checks serially on the existing trusted runner.
  Actual remote status is recorded in PR #536; local results do not imply remote success.

## CI and UI gate distinctions

Fresh GitHub inspection: main/release branch protection API returns 404 (unprotected),
repository rulesets empty. Original check names remain verify and ask-database-contract.
The new Trusted release checks status does not replace either original check. Original
hosted checks are billing-blocked, not passed. Trusted self-hosted execution is supported
and is not an exception to billing policy. A bounded unfiltered source-suite step adds
coverage, without renaming statuses or changing branch policies.

Runner ID 27 remains the sole runner; no listener/container configuration changes.
Trusted actor/repository/branch, no PR/fork event, read-only token, immutable action SHAs,
serial concurrency and 3 GiB/2 CPU cgroup checks remain.

Signed-in preview UI remains unverified: the connected-tab inventory on this turn still
contains only the older Ask preview. The exact candidate tab must be opened and explicitly
connected; the previous cross-origin rejection is not bypassed. No login failure is claimed.

Functional Mini Ask remains a separate V1 launch requirement. No model prompts or paid
provider calls are part of this recovery. Beta removal is candidate-only, V1 notes are
draft/unpublished, and production remains NO-GO pending all launch gates.


## Additional live readiness drift — recovered from reviewed source

Read-only ledger inventory found 132 installed records; the October 5 release batches
multiple source files. The October 24 qualify_source_semantics_readiness record was
missing from the candidate migration chain. The first exact live-ledger trial rejected
the repository preimage with SQLSTATE P0001, SOURCE_SEMANTICS_READINESS_BASE_MISMATCH.
That failure and SQL remain retained under ignored release-evidence.

Wider all-path Git history recovered the reviewed original in commit
5a0257e7b4d998cf5220aa2e9d8cd9279fc36cd9:
20261024184310_qualify_source_semantics_readiness.sql, 18,520 bytes,
SHA-256 86730be127b4834cb60cc65dfc036ea82f3388a51bc456bc25e4aaea4f4ef52d.
Its only differences from the live-ledger SQL are an explanatory comment and the
already-reviewed two exact preimage hashes: deployed 2876a1af35c7dd1f549c81e1d47754d3,
repository c21d27cd9806e80731ceee492337be8b. No new accepted hash was invented.

Restore that Git migration and original source-semantics-readiness.sql.mjs unchanged.
Restore the same commit's required migration-name entry in app readiness. The original
audit passes: no compatibility failures, all four readers authenticated-only, an unknown
browser-callable definer and altered reader denied in rollback-only test transactions.
The resulting qualified function has MD5 16d10be55a3d87bfad9fc2213fd8fcfc, exactly live.

Final disposable chain: 142 repository migrations, with the documented hosted scheduler
exclusion; 16 recovery/hash/privilege/PT409 assertions plus the original readiness audit.
Live migration identity is 20261024184418 / qualify_source_semantics_readiness; recovered
Git identity is 20261024184310 / the same name. This is documented historical timestamp
drift, not permission to backfill/rerun it on production. Do not use --include-all or
automatically apply restored history: the deployed final definition already matches.
The other unmatched ledger labels are the version-prefixed memory-semantic-integrity
name and the documented October 5 batched release. No additional unmatched migration
name remains. This scoped comparison does not claim a complete hosted platform clone.

## Native test worker crash

Trusted run 43853735416 at 2f3ba1cf stopped in release tests with SIGSEGV in the mobile
navigation and password-capability workers. TypeScript passed; subsequent checks were
skipped. This was a native worker crash, not a reported assertion failure or proven OOM.
Test-only wrappers now use Node --jitless to avoid JIT compilation; 14 affected tests
and the full 319-test release selection passed locally with that runtime mode. This is
a mitigation under qualification, not a proven hardware/V8 root cause. App builds and
PGlite keep their normal runtime; no test is removed, weakened or retried automatically.
Database checks run before app tests so a later independent worker crash cannot hide
the replay result. The bounded unfiltered source suite has a 600-second hard timeout.


Trusted run 43854525252 at 2215a19e confirmed the repaired fresh replay remotely:
31 minimal V1, 31 full-schema V1, 31 full-schema V2 and 15 recovery assertions passed.
319 release tests, 162 security tests, TypeScript, lint and audit passed. Next compiled
successfully, then its separate type-check worker exited with only “Failed to type check”
and no diagnostic; standalone TypeScript had passed. No OOM or compiler root cause is proven.
The next finite CI attempt applies --jitless to the build step only, preserving all type
checks and normal production/Vercel runtime. PGlite retains normal WebAssembly support.
The independent full source suite runs after an earlier build failure too, but cannot turn
a failed job green. There is no automatic retry loop or swallowed exit status.
