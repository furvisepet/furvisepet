# Stage 2 disposable PostgreSQL validation

Reviewed parent: `2788f0bee1b5567f36acfe1b289d14f3d1e06af0`.
Revision branch: `codex/ask-history-stage2-db-validation` in the separate
`C:/Users/gwara/furvise-ask-stage2-db-validation` worktree.

## Environment and isolation

Actual Docker Desktop 4.87.0 / Engine 29.7.2 was initially reachable.
Created only `furvise-stage2-db-2788f0b`, container
`a2e9a51d7ff15d6f9bfc195235f86130873eb5a353f1e25638e905c85c4723ae`,
from the already-cached `public.ecr.aws/supabase/postgres:17.6.1.165` image.
The server reported PostgreSQL 17.6, x86_64 Linux, GCC 15.2.0.

The container has `--network none`, no exposed host port, no existing volume
mount, and only a read-only bind of this worktree at `/workspace`. SQL was run
via `docker exec ... psql`, not through a remote URL or the existing Furvise
stack. Its new database is `stage2_validation`. Existing containers/databases
were not stopped, modified or deleted by this task.

The standalone image's database/public schema ownership initially prevented
the repository's `postgres` migration role from creating objects. Local bootstrap
assigned this **new database and its public schema** to `postgres`, and granted
public-schema usage to the standard application roles. The existing operational
readiness migration also required the CLI's `supabase_migrations.schema_migrations`
table, so that local bookkeeping table was created. These are disposable harness
setup steps, not application/schema fixes or mocked database semantics.

## Migration application and defect fixed

Applied the 94 existing repository migrations in chronological order through
`20260903204432_restrict_ask_conversation_mutation_authority.sql`.
The reviewed Stage 2 migration then failed on real PostgreSQL:

```
ERROR: operator class "extensions.gin_trgm_ops" does not exist for access method "gin"
```

Catalog inspection returned `pg_trgm|public`. `CREATE EXTENSION IF NOT EXISTS ...
WITH SCHEMA extensions` does not relocate an existing extension. The migration
incorrectly hard-coded the operator-class namespace.

The revision resolves `pg_extension.extnamespace` through `pg_namespace` and
quotes that schema with `format('%I', ...)` when creating the two trigram indexes.
It does not move/recreate pg_trgm or change authorizations. The corrected complete
Stage 2 migration applied successfully using `psql -v ON_ERROR_STOP=1 -1 -f ...`.
The initial failed non-transactional attempt had created only the cursor index;
the successful reapplication tolerated it through its existing IF NOT EXISTS.
Application of Stage 2 was direct SQL, not a CLI migration-history operation.

## Actual SQL assertions executed

The requested `supabase/tests/ask_history_scoped_read.sql` passed after the fix.
It was then expanded and rerun successfully: **13 DO blocks completed**, with
all expected-error checks and savepoint assertions, ending in `ROLLBACK`.

Verified with real roles, tables, RLS, constraints and triggers:

- Authenticated owner receives two linked claims and their correction relation.
- Corrected-pet/event seed finds the reassigned Bruno event.
- Foreign care IDs and actual foreign claim IDs expose no source/claim/lineage.
- Anonymous execution is denied; authenticated execution with no auth subject
  is denied. RPC privilege checks permit authenticated and deny anon/service_role.
- Authenticated callers cannot SELECT the private removal-marker table.
- More than 64 care roots, 64 claim roots, 3 seed pets or 6 terms are rejected.
- Non-authority relation metadata updates do not create false markers.
- Relation type updates and deletes preserve target withholding.
- Lineage source-ID updates and deletes preserve original-source withholding.
- Deleting a correction claim cascades its edge while retaining target markers.
- Deleting an original claim cascades lineage while retaining source markers.
- Auth-user deletion cascades successfully without leaving that owner's markers.

The original SQL test and the expanded test both rolled back their synthetic
users, pets, claims, relations and markers. **That is not migration reversal**:
the successfully applied schema/functions/indexes remained in the disposable DB.

## Initial interrupted scale check — no benchmark claim

Added `supabase/tests/ask_history_scoped_scale.sql`, a rollback-only real SQL
workload preparing 100,000 newer irrelevant care rows, 60 identical-timestamp
historical rows and one decisive 2011 row. It includes production-shaped
keyset-pagination assertions, index inspection, and three EXPLAIN ANALYZE BUFFERS
repetitions of period, lexical, no-match, tied-cursor and correction-RPC reads.

Execution reached BEGIN and insertion of the synthetic owner and pet. During
the 100,000-row insert, Docker's engine stopped responding and returned:

```
500 Internal Server Error ... /v1.55/exec/.../json
```

Subsequent independent version and container-inspection requests also returned
engine API 500 errors. Docker host logs showed repeated engine ping timeouts.
No cause such as OOM has been established. The benchmark never returned an
INSERT completion, reached pagination/EXPLAIN, or emitted its final ROLLBACK.

**No actual 100,000-row query plans or timings are available from this run.**
The setup's sub-millisecond/millisecond owner/pet inserts are not retrieval
benchmarks and are not substituted for them. Earlier Stage 2 mock query counts
and serialized-input measurements remain separate mock measurements.

The engine failure also prevents verification of the interrupted transaction's
final state or container cleanup. PostgreSQL should roll back an interrupted
transaction on disconnect/recovery, but this has not been observed. The uniquely
named disposable container/storage was left intact. No existing database was
deleted, and Docker Desktop was not restarted by this task because that would
affect the user's existing stack.

## Initial checks and remaining work (at a557270)

- Real migration application and expanded SQL permission/trigger/cascade tests:
  passed as described above.
- Focused default SQL-boundary regression: 1 passed. Added namespace assertions
  accompany the actual PostgreSQL reproduction; they do not replace it.
- `git diff --check`: passed.
- No unrelated application suites, provider calls or remote operations ran.

Resume after Docker Desktop's engine is healthy: inspect only this disposable
container, confirm no lingering benchmark transaction, rerun the SQL tests and
the scale workload, capture actual index definitions/plans/timings, and verify
the benchmark ROLLBACK. SQL permissions/cascades have been validated, but full
deployment approval remains pending those scale/pagination/plan measurements.
Production index-build locking, hardware differences and the existing lack of a
cross-query snapshot also remain deployment limitations.

## Resumed validation: completed SQL, pagination and plans

Used only the same disposable `furvise-stage2-db-2788f0b` container. Initial
inspection found it exited (255), `OOMKilled=false`, and no process. That does
not establish the earlier failure's cause. Started only this container. Its log
reported PostgreSQL crash recovery and readiness. Before any rerun, actual
`pg_stat_activity` showed no other database sessions; synthetic users and
benchmark rows were both zero. The old interrupted workload was not active and
had left no visible synthetic data.

The expanded SQL assertions ran again with exit 0, all 13 DO blocks completed,
and a final ROLLBACK. The role/ownership/input-bound/trigger/cascade results above
therefore also hold on the recovered database.

### Fixture loading adjustment, not a production ingestion benchmark

The first resumed scale attempt remained in the 100,000-row INSERT for 304.125
seconds. Docker remained responsive. Only that known test backend was cancelled;
the resulting SQL stack was in `apply_care_event_to_pet_state`, and the session
closed. Checks confirmed zero benchmark users/rows before loading again. A
transient extra session count was observed during cleanup, not evidence of a
surviving benchmark; final inspection below showed no other sessions.

Inspection of this existing state-projection trigger shows a growing source-ID
array processed and persisted for each inserted row. To benchmark retrieval
without spending the run rebuilding unrelated state, the SQL fixture now
temporarily disables **only** `pet_care_entries_apply_current_state` during
synthetic loading in the disposable transaction. It re-enables it before all
assertions, ANALYZE and measured reads, and asserts it is enabled. All other
triggers, constraints and RLS remain in force. Added transaction-local 120-second
statement and 5-second lock timeouts. The record-presence assertion also uses
`IS DISTINCT FROM` so a missing record cannot pass via SQL NULL comparison.

The adjusted workload completed with exit 0. Loading the 100,000 recent rows took
5,153.911 ms; this excludes the bypassed state projection and **is not production
ingestion throughput**. The earlier cancelled load is separately preserved in
`resume-scale.log`; it was not another Docker failure and does not explain the
prior interruption. No Docker failure occurred during the resumed validation.

### Actual retrieval measurements

Dataset: 100,000 newer irrelevant grooming records, 60 matching historical rows
with identical timestamps, and one decisive 2011 note: **100,061 care rows**.
The same user/pet predicates, lexical forms, sorting and row projection used by
the production candidate path were executed as `authenticated`, with RLS and
default planner settings. No planner index hints or forced scans were used.

The cursor assertion retrieved all 60 tied rows in four queries (three nonempty
pages plus empty termination), without gaps or duplicates. The exact qualified
2011 source note was found despite all newer records. All five prepared indexes
were present, and their actual definitions were captured.

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` server execution times, milliseconds:

| Query | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| Explicit 2011 period | 0.023 | 0.020 | 0.017 |
| All-time vomiting lexical search | 165.775 | 158.132 | 157.512 |
| All-time weight search, no match | 103.031 | 104.234 | 102.610 |
| Identical-timestamp cursor continuation | 0.078 | 0.070 | 0.059 |
| Correction RPC, one source / empty claim closure | 10.550 | 8.119 | 8.392 |

Complete captured plans: [ask-stage2-postgres-plans.json](ask-stage2-postgres-plans.json).
Only interleaved psql stdout and console line wrapping inside JSON strings were
normalized when exporting them. These are real PostgreSQL measurements, not the
earlier mock measurements, token estimates, end-to-end HTTP timings or provider
latency. They are repeated local runs after fixture loading/ANALYZE, not a
controlled cold-cache benchmark. The first all-time search read 225 shared blocks;
later repetitions were cache hits.

Observed plan shape: `Limit → Incremental Sort → Result → backward Index Scan`
using existing `pet_care_entries_occurred_at_desc_idx`. Period reads had an event
date Index Cond. The tied-cursor read scanned 35 accepted rows, filtered 25 prior
IDs and returned the requested 25-row page. The all-time vomiting scan filtered
100,000 irrelevant rows; the no-match scan filtered all 100,061 rows. The new
trigram and compound cursor indexes existed but were **not selected** in these
plans. This is an important scaling limitation, not a demonstrated bounded
physical scan. No cause for that planner choice is asserted from these results.

The RPC EXPLAIN reports the function's outer Result node and total time/buffers;
it does not expose nested PL/pgSQL plans. This scale fixture has no semantic
claims. Nonempty linked correction/owner/cascade behavior was tested separately
by the SQL assertions, not benchmarked at graph scale.

### Rollback, preserved state and review export

The successful scale script emitted `ROLLBACK`. A subsequent fresh SQL session
confirmed: zero other database sessions, zero synthetic test users, zero care
rows, zero semantic claims and zero private withholding markers. The state
projection trigger was `O` (enabled); all five prepared indexes still existed.
Thus test data and the temporary trigger change rolled back; the migration
itself was **not** reversed. The disposable container remains available, and no
other container or database was changed or queried.

Preserved local diagnostics: `resume-container-state.log`,
`resume-container-before.log`, `resume-recovery.log`, `resume-preflight.log`,
`resume-assertions.log`, `resume-scale.log`, `resume-cancel-rollback.log`,
`resume-scale-measured.log`, and `resume-final-state.log` in this worktree.
These include actual SQL output, not only the extracted plans.

No unrelated suites were rerun. The focused SQL-boundary test and diff checks
passed. Remaining deployment limitations: lexical scans still scale with the
owner's records on these plans; larger/multi-owner and nonempty graph workloads
need profiling; state-projection bulk ingestion warrants separate investigation;
index-build locks and hardware differences remain relevant; there is no
cross-query snapshot. These results validate the exercised SQL behavior, not an
unqualified production scalability approval.
