# Remaining Ask reliability batch

Completed: mixed-topic episode follow-up, base 7700363. Callback reproduction confirmed competing vomiting/breathing topics incorrectly resolved the saved vomiting reference because multiple topics and absent topics both became null. These states are now distinguished; mixed-topic ordinal requests clarify without selecting or persisting episode references. Existing unqualified and single-topic follow-ups remain supported.

Verification: callback regressions 8/8; full suite 2,246 passed; typecheck, lint and diff passed (two existing lint warnings). Unchanged lifetime audit 13 pass / 4 fail. Logs C:/Users/gwara/furvise-mixed-topic-{before,focused,full,typecheck,lint,audit}.log. Lock PID18172 released after commit via C:/Users/gwara/furvise-mixed-topic.release. No database, provider, push, merge or deployment.

Limitation: topic recognition remains bounded English vocabulary. Requests mentioning multiple recognized symptoms conservatively clarify, including secondary symptom questions; broader multi-topic episode answering is not implemented. The four lifetime gaps below remain open.

Completed: episode correction handoff, based on 2150ae4. Reproduced actual callback returning a supported episode count despite a discovered late unlinked correction. Member-only revalidation now preserves inherited unavailable/partial corrections and unlinked correction uncertainty, returning unavailable episode coverage without count items or saved references. No correction-to-event linkage is inferred.

Verification: full suite 2,246 passed; typecheck and lint passed (two existing warnings); diff check passed. Focused callback suite 7/7 passed, including additional final response reference and no-write assertions. Unchanged lifetime audit remains 13 pass / 4 fail. Logs: C:/Users/gwara/furvise-episode-correction-{before,full,focused,typecheck,lint,audit}.log. Exclusive lock PID21040 is released after local commit via C:/Users/gwara/furvise-episode-correction.release.

Limitations: this preserves uncertainty already discovered by historical retrieval; it does not discover every unlinked correction, certify exact lifetime totals, or add cross-query snapshot consistency. No database/provider calls. Existing supported-list, revalidated-follow-up and period controls remain passing.

Base 287c162704958373db6fd1b2447ef9ffc232693b. Isolated codex/ask-remaining-reliability worktree.

Implemented:
- Explicit historical year requests prioritize event-year matches in the existing bounded intermediate selection. This does not fetch records absent from the supplied candidate set or guarantee representation of every disjoint period.
- Broad multi-pet history comparisons now use the bounded historical callback when at least two distinct owned authorized subjects exist. Existing per-pet budgets, correction processing and incomplete-coverage disclosure remain. No semantic completeness is inferred from traversal exhaustion.
- Legacy episode prompt records preserve sequence_number, recurrence_of and resolution date, explicitly labelled as stored topic sequence rather than displayed-list ordinal. This does not create a trusted follow-up reference from an unverified projection.

Verification: pre-edit lifetime baseline 9 pass / 8 fail; after edits 11 pass / 6 fail, unchanged assertions. New callback cases cover per-pet representation, foreign IDs, single-pet fallback and event-date selection. Direct prompt test checks episode identity. Full suite 2,244 passed; typecheck passed; lint passed with two pre-existing warnings. An initial lint process exited abnormally; a fresh serial rerun passed. A structural chronology assertion was updated to include the new leading sort criterion while retaining score and event-time ordering. No lifetime expectations changed.

Unfinished:
1. Bounded dated unlinked-correction discovery implemented in the subsequent repair; see ask-late-correction-checkpoint.md. Exhaustive discovery and automatic authoritative linkage remain unsupported. Current unchanged lifetime audit is 13 pass / 4 fail; latest full suite is 2,246 pass. See ask-weight-comparison-checkpoint.md for the explicit subset scope of the now-passing arithmetic check.
2. Recover old prose-only episode references with source revalidation; never treat an assistant list as record authority. Qualified wording for existing validated references is repaired separately in ask-episode-wording-checkpoint.md; that does not certify prose-only references.
3. Old unlinked episode projections and ordinal recall remain limited; supported linked episode contracts already have separate passing tests.
4. Exact lifetime episode totals require certified membership and completeness; the fixture's unlinked notes do not establish either.
5. A qualified comparison of retrieved positive kg statements now works. Complete lifetime weight endpoints still require broader extraction and completeness certification; see ask-weight-comparison-checkpoint.md.
6. Migrate the live results-page legacy memory writer and its consumers before dropping dog_memories.
7. Controlled browser/application verification and Vet Brief upstream failure diagnosis remain outstanding. No live provider or production validation is claimed.

No Docker, migration, provider, push, merge or deployment during this batch. Previous commits preserved. This checkpoint is not a declaration that all requested work is complete.

## Latest launch batch
See docs/ask-launch-batch-checkpoint.md for current status. Provider/citation hardening is committed as 61418b9. Older prose-list labels are now presentation-only navigation with explicit source limitations. Latest full suite 2,250 passed; unchanged lifetime audit 14 passed / 3 failed; typecheck/lint/diff passed (two existing lint warnings). Legacy migration and authenticated/provider rollout validation remain unfinished. No deployment, remote migration or provider calls occurred.
