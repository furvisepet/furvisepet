# Live-context memory reader consolidation

Base: 0e81aeea4fdbcafc84a6c8caadb0f20107c49fe6
Branch: codex/memory-reader-consolidation
Worktree: C:/Users/gwara/furvise-memory-reader
Exclusive writer lock held by PID 32520 during work.

## What changed
Extracted all three memory-source queries and their eligible-input selection from buildFurviseContext into memory-sources.ts. The existing live-context path used by Ask and feature intelligence now calls this shared loader and selector. Raw results remain available for source coverage and deleted-source discovery. Inactive markers still filter conversation claims via the existing policy.

Preserved owner/pet query predicates, active/expiry predicates, limits, independent optional-source failures, semantic eligibility, freshness selection and deleted Ask-source suppression. This is a behavior-preserving refactor, not a claimed correction-semantic repair or a switch to V2 reads.

## Why the old store remains
The current Ask suggestion save handler writes user-confirmed details to dog_memories. The legacy-memories endpoint and Vet Brief source reader also use that table. Removing its live-context reader now would silently lose current user-visible saves. No table, historical data, migration, API or writer was removed.

## Verification
Five focused behavior tests exercise the actual extracted module with mocked query responses and real selection/recovery policies. They check query scope/bounds, independent source failures, valid legacy saves, invalid-value filtering, deleted-source suppression and retention of raw coverage rows. Three existing structural tests were updated to inspect the extracted module while retaining their policy assertions.
Full default suite: 2,222 passed. Typecheck passed. Lint passed with the same two existing unused-supabase warnings; diff check passed. The unchanged lifetime audit was freshly run: 8 pass / 9 fail, matching the previous reported result. Those remaining requirements are not claimed solved. Logs: C:/Users/gwara/furvise-memory-reader-full.log and C:/Users/gwara/furvise-memory-reader-lifetime.log. No provider or real database calls.

## Next bounded change
Move the user-confirmed suggestion save path to an owner-checked, idempotent canonical-memory operation, preserving save/retry/delete/correction behavior. Then retire its old-table dependency after testing the full save-to-recall path. Other live readers still need migration before dropping the old table. No push, merge, deployment or remote changes occurred.
