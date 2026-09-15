# Owner note persistence

An explicit owner note is a source report, not a diagnosis. `/api/ask` saves it before context retrieval, AI admission, extraction, or answer generation. Authentication, selected-pet ownership, conversation/source identity, request idempotency, payload limits, and care-write rate limits remain required.

The Save note control provides explicit transport intent for arbitrary text. Natural-language commands also use this path when their save intent and selected-pet subject are unambiguous. Questions, quoted commands, opt-outs, ambiguous subjects, edits, and multi-record commands retain their existing authorization/clarification workflows. The raw source includes the complete submitted text; no symptom or normal finding is discarded. This is not an AI-free natural-language parser for every possible command.

`persist_ask_owner_note` writes `pet_care_entries` and its outbox job in the same transaction. Retries reuse the owned source message and cannot recreate a deleted, edited, or reassigned note. Dates are optional: unknown/ambiguous dates retain their literal text. The legacy non-null ordering timestamp uses the recording instant with `occurrenceBasis=recorded_at`; Ask and Vet Brief expose no event timestamp for that case. History labels it as a recorded date.

`owner_note_jobs` is a private service-only projection queue. Workers claim up to eight jobs with `SKIP LOCKED`, process two at a time, and use five-minute leases. Extraction receives only the selected pet name and current source note, has a 25-second provider timeout, and uses the existing global AI cost admission guard. It consumes no user Ask credit. Confidence below 0.8 produces an uninterpreted result. Provider/schema failures retry with exponential backoff, up to five attempts. Exhaustion is reported to owner monitoring.

Edits supersede previous projections and enqueue the current revision. Deletion invalidates in-flight results. Completion checks the current source revision and exact lease before accepting annotations. Annotations contain exact source sentences with uncertainty preserved; they never write diagnoses, concerns, episode boundaries, or counts. Ask and Vet Brief can read the original note while extraction is pending or unavailable. Annotations are retained separately for future projections; current clinical reads continue to use source notes and the existing evidence checks.

The scheduler migration enables pg_cron and pg_net. Once a minute it wakes the worker only if work is due. The scheduler token stays in a private database table; browser roles cannot read it or the networking request queue. pg_net is only a wake-up mechanism: losing a network request never loses a durable job. Preview deployments do not create another scheduler.

For combined note-and-answer requests, the note receipt is independent of the additional answer. A failed answer returns a truthful saved-note receipt and a visible limitation. Immediate emergency guidance remains available even if the note cannot be confirmed. No AI-generated save promise is used as evidence of success.

## Verification

- `node --test tests/owner-note-write-isolation.test.mjs`: actual HTTP functions with controlled IO; AI offline, conversation outage, rejected writes, emergency guidance, replay, and extraction failures.
- `scripts/audits/owner-note-postgres.mjs`: all application migrations except the native networking scheduler, then rollback-only SQL assertions. Requires explicit PGlite 0.5.8 package and new data directories via `FURVISE_PGLITE_PACKAGE_DIR` and `FURVISE_EMBEDDED_POSTGRES_DIR`.
- `supabase/tests/owner_note_write_isolation.sql`: native PostgreSQL-compatible rollback test for ownership, source identity, atomic note/outbox creation, leases, stale completions, retry backoff, edits, deletion, and role privileges. Run in isolation; it expects no other due jobs.

Database migrations are additive. Deploy the core migration before the application and enable the scheduler after the application is ready. If application rollback is required, leave source notes and queue data intact.
