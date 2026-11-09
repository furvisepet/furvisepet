# Operational guardrails (November 8, 2026)

Production logs show a sustained one-per-second CARE_ENTRY_STALE flood from
PostgREST update_my_care_entry calls. The accessible logs do not attribute
the original HTTP caller. Do not disable optimistic concurrency. The API PATCH
route now returns non-retryable 409 for this specific concurrency conflict;
this does not stop independently calling RPC clients. Track and stop the
actual caller separately and verify the error-rate decline before closure.

The full unfiltered test suite now runs on release-ready PRs and main;
draft PRs run fast verification, focused security and database checks.
A ready_for_review transition triggers the full tests. Superseded PR
commit runs cancel each other. There is no branch protection on this
private repository's present GitHub tier. A reviewer must manually verify
both CI gates before merging; a green fast gate is NOT release approval.
