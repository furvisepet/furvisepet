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

## Interrupted scale check — no benchmark claim

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

## Checks and remaining work

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
