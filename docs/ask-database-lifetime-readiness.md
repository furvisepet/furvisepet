# Ask database and lifetime-history readiness — September 8, 2026

This pass prepares Ask for a new benchmark. It does not run that benchmark or claim 99% quality.

## Database incident and repair

The September 8 22:10 UTC production request failed at the pre-provider profile read. Its retained event contains `PET_OWNERSHIP` and no underlying database code. Production `logAskServerError` discarded the message/details before returning; the exact historical transport or database cause cannot be recovered from that evidence. Current production indexes cover the profile primary key, owner, and owner/lifecycle predicates. No evidence justified changing RLS or adding another index.

The installed PostgREST SDK already retries network errors and HTTP 503/520, up to four fetch attempts with 1/2/4-second backoffs. An additional outer retry would multiply calls. The profile query now disables that SDK layer and uses one explicit policy: at most three read attempts, up to three seconds per attempt, within an eight-second total deadline, with short bounded backoff. It also handles transient 502/504 and edge gateway statuses. Authentication, permission, schema, unknown errors, and server-cancelled SQL are not blindly retried. Empty authorized results remain empty. Owner, selected-pet, and archived-pet filters are rebuilt unchanged for each attempt. Caller cancellation is respected. This occurs before turn/credit reservation, and performs no write or model call.

Failure/recovery diagnostics retain only request ID, attempt count, duration, status, fixed categories, validated SQL/PostgREST code, and allowlisted network codes. Raw SDK text, SQL, profile data, credentials, and medical notes are not logged. The public database-error title now says the answer could not be finished; a failed read is no longer described as a failed save.

This is a verified resilience and observability repair, not proof of the root cause of the old incident or a guarantee against database outages.

## Validation

- All 2,440 default tests passed locally; the 18 new profile-read tests use the actual installed Supabase SDK with injected network responses/errors. They cover recovery, exhausted retries, authorization/schema/SQL failures, unchanged scope, empty results, deadline, cancellation, and redaction. These are fault-injection tests, not a reproduction of the original production outage.
- Typecheck passed. Lint passed with five existing warnings. Production dependency audit found zero vulnerabilities.
- All 102 repository migrations applied unchanged to a fresh isolated PostgreSQL 18.3 runtime (PGlite 0.5.8, WebAssembly).
- Seven SQL suites passed: ascending and descending candidates; correction/scoped reads; historical time and privileges; existing census; new century census; new century scale.
- The actual SQL writer created 101 yearly episodes and 202 sources from 1926 through 2026, retaining all 100 recurrence links and bounded inventory output. The century suite took 3,523 ms in the recorded final run.
- The retrieval fixture contained 100,061 rows, including 100,000 unrelated records. Both production candidate RPCs traversed all 61 matching historical rows in 25/25/11/0 pages with no gaps, duplicates, scope leaks, or lost 1926 source. Exact-period and no-match checks passed. The entire suite took 7,810 ms, including fixture loading and assertions; this is not an individual query latency.
- The existing writer-to-reader-to-production-generation-callback harness passed all 11 reported scenarios: historical evidence, recurrence/ordinal identity, exact counts, saved-reference reload, pet switching, 70-source census, duplicate imports, source mutation, correction, and deletion invalidation. Only provider output and initial non-history context were synthetic; no live provider call ran.
- Final SQL cleanup returned zero synthetic users, zero care rows, and zero disabled care-entry triggers. Callback fixtures also reported successful cleanup.

Machine-readable output: [ask-database-lifetime-readiness-results.json](ask-database-lifetime-readiness-results.json).

## Scope and limitations

PGlite executes real PostgreSQL SQL, roles, RLS, functions, constraints, and triggers. Its single connection and WebAssembly build do not validate native PostgreSQL 17 concurrency, PostgREST HTTP/auth behavior, network availability, or production load performance. Minimal local `auth.users` and auth identity functions are harness setup; no hosted Auth login is claimed. Previous native PostgreSQL 17 results remain separately recorded in the repository.

The 100,000-row retrieval fixture temporarily bypasses user projection triggers during synthetic loading, restoring them before every read and rolling the transaction back. It preserves foreign-key/other constraints and RLS. An earlier load retaining projection work was stopped after prolonged execution; it produced no accepted measurement. The century writer suite separately exercises actual writer/trigger behavior without that bypass. Bulk projection/ingestion throughput remains an unvalidated scaling concern.

The new century SQL checks and the older application callback checks are separate evidence. No new live-model century-history or full quality benchmark was run. Legacy histories lacking reliable episode membership still cannot receive certified exact totals.

Docker could not become healthy on the Windows host and consumed scarce RAM. Only the startup initiated for this task was stopped; free RAM recovered above 3 GB. Work continued in a separate workspace checkout. Production data and schema were not modified by SQL fixtures.

## Reproduce the isolated checks

Use a fresh database path and a separate temporary dependency prefix. PGlite is not added to application dependencies.

```sh
npm install --prefix /tmp/furvise-pg-runtime @electric-sql/pglite@0.5.8 --ignore-scripts
FURVISE_PGLITE_PACKAGE_DIR=/tmp/furvise-pg-runtime/node_modules/@electric-sql/pglite \
FURVISE_EMBEDDED_POSTGRES_DIR=/tmp/furvise-pg-data-new \
FURVISE_VALIDATION_REPORT=/tmp/furvise-pg-results.json \
node scripts/audits/ask-embedded-postgres-validation.mjs
```

The runner refuses an existing initialization directory, applies migrations, runs SQL suites sequentially, closes the database, then runs the callback harness. The original Docker/psql harness remains the default when the embedded-database environment variables are absent.

## Next acceptance step

Run the new benchmark against the deployed commit, counting every first-attempt error and retaining retries separately. Track the new database diagnostics if an error occurs. No budget was spent on live model calls in this pass; the prior tracked shared total remains $3.122177 of $10, leaving $6.877823 before the next benchmark. Vet Brief follows Ask acceptance.
