# Episode count/reference stage checkpoint

Base: 54418f00977cff8caa141a6990a6ff31bed82519.
Branch: codex/ask-episode-count-references.
Worktree: C:/Users/gwara/furvise-ask-episode-count-references.

Baseline: explicitly invoked lifetime audit, 17 checks, 6 pass, 11 fail.
Raw output: episode-baseline-audit.log. No expectations changed.

Read AGENTS.md, installed Next route guide, lifetime audit, candidate integration
report, episode schema/assignment, live generation/evidence/validator and
service-only conversation completion/persistence. Existing episode assignment
uses lexical heuristics and is not certified separate-incident grouping.

Design: bounded canonical episode/source lookup plus existing correction closure;
count explicitly supported groups, not entries or symptom occurrences. Legacy
semantic/grouping coverage remains unknown, so no exact lifetime total is claimed.
Stable server-produced displayed references persist inside the existing
service-written assistant response and are read independently of recent prose.
Reuse revalidates IDs, scope, source versions and correction state; no reranking.

Implementation milestone: server result/evidence/validator and actual assistant
response attachment implemented. Boundaries require canonical membership plus an
explicit positive episode report; unlinked notes remain unknown grouping.
15 focused generation-path checks pass (episode-focused.log). Original audit
still 6 pass / 11 fail with unchanged expectations (episode-final-audit.log).

SQL milestone: only furvise-stage2-db-2788f0b / stage2_validation accessed.
Preflight found no other sessions/fixtures, all care triggers enabled, previous
RPCs present, no new RPCs. Migration 20260905091508 is installed. Final migration,
rollback and SQL tests pass; existing correction suite passes. Logs:
episode-migration-final.log, episode-rollback-final.log, episode-sql-final.log,
episode-corrections-sql.log. Test fixtures rolled back. Earlier SQL test failures
were fixture positional argument order and sequence collision, corrected after
reading the existing service-only function signature and sequence behavior.

Final verification: 2,184 default tests passed, including 16 nested episode cases;
typecheck and lint passed (two existing warnings). Logs: episode-full-suite-final.log,
episode-typecheck-final.log, episode-lint-final.log. The first full run exposed a
server-only import in the pure validator dependency; splitting the pure contract
from database retrieval fixed it. Final DB state in episode-final-db.log: no
sessions/fixtures/disabled triggers, all new indexes valid, prior RPCs intact.

Report: ask-episode-count-references.md. Implementation, tests, migration/rollback
and both documents are checkpointed together for review. Export target:
C:/Users/gwara/furvise-ask-episode-count-references-review.patch.
No provider/remote calls, push, merge or deployment. Preserve checkpoint/logs.
