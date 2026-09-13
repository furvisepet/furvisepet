# Canonical save concurrency — September 5, 2026

Base: 371c0f46bce8a581a86c3a657f4c168df29903d7. No application or migration change was needed.

Executed scripts/test-canonical-save-races.py against only furvise-stage2-db-2788f0b / stage2_validation using PostgreSQL sessions, service_role saves and synthetic fixtures.

1. Concurrent saves: first transaction inserted the memory and held its transaction open. The second save was observed in a PostgreSQL Lock wait. After commit it returned already_applied; exactly one canonical memory existed.
2. Concurrent pet transfer: ownership update held the profile lock. A save from the old owner was observed waiting. After transfer commit, the save returned SUGGESTION_FORBIDDEN; no memory existed and the suggestion remained pending.
3. Synthetic users were deleted in cleanup, and their absence verified. Statement timeouts bound the test sessions. The script rejects pre-existing fixture IDs before entering cleanup.

Both cases passed twice, including after the fixture-collision guard was moved outside cleanup. These checks exercise actual locking, not inferred timing alone. They cover transfer-before-save ordering; they do not establish every isolation level, deadlock ordering, or post-save transfer behavior.

Prior full-suite/typecheck/lint results are unchanged and were not rerun for this SQL harness/documentation change. HTTP/PostgREST integration remains unverified. No providers, remote migrations, push, merge or deployment. The capped disposable database is stopped after verification.
