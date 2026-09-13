# Ask candidate RPC integration and shutdown recovery

## Result

The local integration is implemented and verified for review. Lexical history
reads use `read_ask_history_candidates` through the authenticated request client.
Date-only reads retain the existing ordered table query. The actual generation
callback is shared with the mocked integration harness, so retrieval, correction
processing, evidence construction and final answer validation run in production
order. Missing RPCs, database errors, cancellation and invalid timeout settings
produce unavailable coverage rather than a claim that no records exist.

No remote migrations, live provider calls, push, merge or deployment were run.

## Recovery inspection, September 5, 2026

- Starting worktree: `C:/Users/gwara/furvise`, branch `codex/ask-copy-polish`,
  HEAD `bafc3007fd562068a7200ad69f8e09d63f1daf4b`. Its three image deletions
  and untracked QA/Supabase files were preserved untouched.
- Integration worktree: `C:/Users/gwara/furvise-ask-candidate-integration`,
  branch `codex/ask-candidate-rpc-integration`, HEAD
  `d5d07a9` (the committed candidate experiment). The six modified files and
  seven untracked integration files survived. No staged changes existed.
- Read the existing experiment/validation reports, tracked diffs, untracked
  implementation/tests/migration/rollback, and saved verification logs.
  The earlier full-suite log contained failures; later focused logs did not
  establish a passing full suite. Fresh verification was therefore required.
- No lock files or merge/rebase/cherry-pick/revert/sequencer markers were found
  in the integration Git directory or shared Git directory. No Git operation
  was resumed, aborted or reset; no edits or lock files were removed.
- Docker initially had no reachable engine. Started the installed Docker Desktop
  in hidden-window mode, inspected the authorized container, then started only
  `furvise-stage2-db-2788f0b`, ID
  `a2e9a51d7ff15d6f9bfc195235f86130873eb5a353f1e25638e905c85c4723ae`.
  Verified network `none`, no published ports, and the existing read-only bind.
  All database operations used `docker exec` against `stage2_validation`.
- PostgreSQL 17.6 had no other sessions, zero care rows or integration fixtures,
  no experiment schema/role, all nine care triggers enabled and all 19 care
  indexes valid/ready. The candidate reader role, RPC and identity helper existed.
  The prior correction RPC was intact. The local migration bookkeeping ended
  at `20260903204432`; direct SQL application of subsequent migrations is not
  represented there. Catalog presence and fresh execution, not that bookkeeping
  or old logs alone, established what survived.

## Fresh verification

All commands completed successfully during this recovery:

| Check | Result | Local diagnostic log |
| --- | --- | --- |
| `node --test` | 2,183 passed; zero failed/skipped/cancelled | `candidate-resume-full-suite.log` |
| `npm.cmd run typecheck` | exit 0 | `candidate-resume-typecheck.log` |
| `npm.cmd run lint` | exit 0; two unused-parameter warnings in unchanged `persist-learnings.ts` | `candidate-resume-lint.log` |
| Candidate SQL suite on recovered schema | exit 0, ROLLBACK | `candidate-resume-sql.log` |
| Existing correction SQL suite | exit 0, ROLLBACK | `candidate-resume-corrections.log` |
| Actual database cancellation | SQLSTATE 57014 at 250 ms and 8,000 ms; blocker ROLLBACK | `candidate-resume-timeout.log` |
| Candidate rollback | COMMIT; only candidate RPC/helper/role removed; correction RPC retained | `candidate-resume-rollback.log` |
| Candidate migration reapplied | COMMIT; recovered/reapplied function definition fingerprints identical | `candidate-resume-migration.log` |
| Candidate SQL after reapplication | exit 0, ROLLBACK | `candidate-resume-reapplied-sql.log` |

The actual cancellation probe measured 356 ms and 8,100 ms including Docker/psql
overhead. It deliberately blocks an ownership-table read; it proves server-side
cancellation of that blocked RPC, not a worst-case query-planning latency bound.

Final database inspection again found zero other sessions, care rows, integration
users, disabled care triggers, invalid care indexes or experiment schema/role.
The candidate migration remains installed in the disposable database. All SQL
test fixtures rolled back. Prior migrations and commits remain intact.

## Review boundary and prerequisites

The migration introduces a dedicated NOLOGIN/BYPASSRLS reader with SELECT on only
profiles and care entries. The fixed SECURITY DEFINER query derives the request
identity and explicitly checks current pet ownership, care owner, pet and deletion
state. Authenticated callers alone receive RPC EXECUTE. The parsed SQL identity
helper stays SECURITY INVOKER. No service-role application read or RLS-policy
change is included. SQL tests check grants, validation, ownership transfer,
ordered full-value equivalence, timestamp ties and literal planner vocabulary.

The request must start with an effective statement timeout greater than zero
and no more than 8 seconds; otherwise the RPC rejects with SQLSTATE 55000.
The application also supplies its existing retrieval AbortSignal. Setting a
timeout inside the function is not relied upon to arm the current statement.
Any future rollout must separately verify the effective authenticated PostgREST
timeout, schema exposure/cache and grants in the intended environment.
[Supabase timeout documentation](https://supabase.com/docs/guides/database/postgres/timeouts)
describes role settings and gateway configuration reloads. None were changed
remotely here, and no HTTP/PostgREST or live-provider validation is claimed.

The inherited experiment's owner-rare tail/exhaustion scan limitation remains.
LIMIT bounds returned rows, not scan work; cursor exhaustion is not evidence of
semantic completeness. Existing correction, evidence and answer budgets remain.
The rollback file requires disabling/reverting the application's RPC use first;
otherwise lexical retrieval correctly reports unavailable coverage.

The integration implementation, migration, rollback, tests and this report are
checkpointed together for review on `codex/ask-candidate-rpc-integration`.
No further local repair was needed after fresh verification of the surviving
implementation. Unchanged verification was not rerun solely for the checkpoint.
The PostgREST timeout, schema-cache/exposure and grant prerequisites above remain
unverified in the intended deployment environment.
