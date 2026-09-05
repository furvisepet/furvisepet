# Remaining Ask reliability batch

Base 287c162704958373db6fd1b2447ef9ffc232693b. Isolated codex/ask-remaining-reliability worktree.

Implemented:
- Explicit historical year requests prioritize event-year matches in the existing bounded intermediate selection. This does not fetch records absent from the supplied candidate set or guarantee representation of every disjoint period.
- Broad multi-pet history comparisons now use the bounded historical callback when at least two distinct owned authorized subjects exist. Existing per-pet budgets, correction processing and incomplete-coverage disclosure remain. No semantic completeness is inferred from traversal exhaustion.
- Legacy episode prompt records preserve sequence_number, recurrence_of and resolution date, explicitly labelled as stored topic sequence rather than displayed-list ordinal. This does not create a trusted follow-up reference from an unverified projection.

Verification: pre-edit lifetime baseline 9 pass / 8 fail; after edits 11 pass / 6 fail, unchanged assertions. New callback cases cover per-pet representation, foreign IDs, single-pet fallback and event-date selection. Direct prompt test checks episode identity. Full suite 2,244 passed; typecheck passed; lint passed with two pre-existing warnings. An initial lint process exited abnormally; a fresh serial rerun passed. A structural chronology assertion was updated to include the new leading sort criterion while retaining score and event-time ordering. No lifetime expectations changed.

Unfinished:
1. Bounded dated unlinked-correction discovery implemented in the subsequent repair; see ask-late-correction-checkpoint.md. Exhaustive discovery and automatic authoritative linkage remain unsupported. Current unchanged lifetime audit is 12 pass / 5 fail; latest full suite is 2,245 pass.
2. Recover old prose-only episode references with source revalidation; never treat an assistant list as record authority.
3. Old unlinked episode projections and ordinal recall remain limited; supported linked episode contracts already have separate passing tests.
4. Exact lifetime episode totals require certified membership and completeness; the fixture's unlinked notes do not establish either.
5. Earliest/latest weight comparison requires correction-aware effective measurements and completeness, not just arithmetic on visible notes.
6. Migrate the live results-page legacy memory writer and its consumers before dropping dog_memories.
7. Controlled browser/application verification and Vet Brief upstream failure diagnosis remain outstanding. No live provider or production validation is claimed.

No Docker, migration, provider, push, merge or deployment during this batch. Previous commits preserved. This checkpoint is not a declaration that all requested work is complete.
