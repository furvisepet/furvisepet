# Ask memory authority cleanup

Base: 4850dea74de56b353a87d7f45d80b2f47c9543d5
Branch: codex/ask-memory-authority-cleanup
Worktree: C:/Users/gwara/furvise-ask-memory-authority-cleanup
Exclusive supervisor lock held by PowerShell PID 33752 during editing.

## Scope and evidence
The actual Ask route calls persistIntelligenceLearnings before optional V2 phase-3 persistence. The memory writer used the lease/provenance-bound persist_furvise_ask_intelligence RPC, but fell back to persist_furvise_intelligence on an exact missing-function error. The existing authority migration already revokes the latter RPC from application roles. There are no users requiring this app-first compatibility path.

Removed only this fallback and its error recognizer. Missing authority now follows existing failure handling, as permission errors and cancellation already did. No schema, grant, data or migration edits.

## Reproduction and verification
Eight new behavioral tests execute the actual transpiled persistence module with mocked database and policy dependencies. Before edit: six pass, two fail because a missing authority invokes the legacy RPC and can report its success. After edit: eight pass. They cover missing RPC, denial, cancellation, confirmed care plus memory failure, successful provenance bindings, and fresh ownership rejection. Policy grounding itself remains covered by the existing suites; these mocks do not validate SQL or a live route.
Updated two structural assertions that required the retired fallback; retained their ownership/trigger checks. Lifetime audit expectations are untouched.

## Remaining architecture
This is a bounded authority cleanup, not complete memory-store consolidation. V2 phase 3 explicitly requires confirmed memory IDs from this writer. Care events, application actions and pending suggestions have distinct responsibilities and were retained. Before retiring the current memory store, replace its readers, correction/supersession behavior and V2 dependency with tested equivalents. Historical note interpretation must remain supported.

Deployment prerequisite: the authorized Ask memory RPC must be installed and exposed in the intended environment. No live provider, remote database, push, merge or deployment was performed.

Final verification: 2,206 default tests passed; typecheck exit 0; lint exit 0 with the same two unused-supabase warnings; git diff --check passed. No lifetime-audit rerun or changed expectations. Full-suite log: C:/Users/gwara/furvise-memory-authority-full.log.
