# Lifetime history implementation and acceptance

Base `ab19cc2cbbe50657c37555dc1ecc5176373fc044` was verified clean. Its runner was complete; the old lock PID was absent. Work used `C:/Users/gwara/furvise-lifetime-completion`, branch `codex/ask-lifetime-completion`, and an exclusive file handle on the common `furvise-remaining.lock`, tied to the active Codex process. No runner was restarted. Existing worktrees and dependencies were preserved.

## Acceptance contract: unchanged original failures

Each failure was run separately with `node --experimental-transform-types --test --test-name-pattern=... scripts/audits/ask-lifetime-history.audit.mjs`. The full original audit remains **14 passing / 3 failing**. Its audit, fixture and harness files are byte-identical to the base commit.

| Original failure | What the fixture establishes and where authority is missing |
| --- | --- |
| Old canonical episodes survive the 20-row window | `fixtures/ask-lifetime-history.mjs` supplies 2011/2014 episode projections, but neither their summaries nor any care entry links sources to those episodes. The recent loader excludes the old projections; the topic reader retrieves them, but membership validation cannot establish them. No `episode:stool-episode-1` evidence reaches generation. |
| Retrieved episodes retain sequence and recurrence identity | The projections contain sequence 1/2 and a recurrence ID, but still no memberships. The question also refers to “second” without a saved displayed list. The callback asks for clarification; it cannot interpret stored sequence 2 as displayed ordinal 2. Failure occurs at record existence, before sequence comparison. |
| Exact separate-episode aggregate | The four stool notes explicitly describe two bouts and recovery. This audit call supplies **no episode rows**, memberships, or inventory certificate. Counting the four notes would be wrong; asserting a complete count of two would promote an unlinked fixture oracle into database authority. The final validator returns an explicitly incomplete supported subset. |

These are missing persisted-authority states, not proof that the events never happened. The audit invokes no writer (`database(...).from(...).insert` is absent). The current semantic writer creates care memberships and source IDs; it does not create the fixture's unlinked pair as a successfully processed episode history. Manual/legacy/incomplete states can nevertheless lack these links and must remain uncertain. None of the three original assertions has been relabelled as passing.

The original seed is explicitly synthetic. It records Milo's stool bouts, weights 28.4/27.9/27.8 kg and food changes; the vomiting correction assigns the report to Bruno. Luna's litter-associated accidents improved and hiding remains qualified. Oscar completed a course and has recurrent stiffness with qualified improvement. There is no Luna urine result or Oscar diagnosis. No new expected medical facts were invented.

## Implemented path

The existing answer schema now extracts a quoted, confidence-bearing episode-boundary assessment. `governCanonicalEvents` checks owner assertion, subject, symptom topic, verbatim evidence and transition/owned-reference compatibility. The server RPC binds this to the full message, care row and membership hashes. Natural opening, continuation and resolution wording works without “started/continued” in the sentence. This is governed **semantic extraction**, not a claim that deterministic rules understand arbitrary prose. Unknown assessments fail closed; existing legacy compatibility never overrides an invalidated proof.

The actual writer now preserves recurrence identity and resolution provenance. Idempotent retries return the existing owned record before the old compatibility writer can mutate timestamps. Provenance follows the resolved owned pet rather than requiring the conversation's original pet anchor. The historical-time draft removes the ten-year ceiling for finite, source-quoted historical dates; future-date checks remain.

`read_ask_episode_sources` adds a statement-snapshot census for all source-verified native records and validated imported copies. It counts persisted episode IDs, checks every source in PostgreSQL, deduplicates imported aliases against the import writer's source hash, and returns a small count/revision certificate. It does not transport every source to the model. Unknown processing, changed sources, unsupported claims, correction/removal debt or ambiguous membership cannot certify the census. Existing graph validation remains responsible for legacy/corrected subsets.

The callback keeps its bounded evidence page and model budget, but can use the complete database count even when more than 64 sources exist. Stored sequence and displayed ordinal remain separate. Owner/registry revisions bracket the reads; a second validation after generation prevents a concurrent mutation from returning stale counts or saved references. Saved references are attached only to the final matching displayed answer.

## Measured results

| Check | Before | After |
| --- | --- | --- |
| New offline acceptance cases, run against the clean base and this implementation | 3 pass / 6 fail | 9 pass / 0 fail |
| Original lifetime audit, unchanged | 14 pass / 3 fail | 14 pass / 3 fail |
| Full default suite | Base report: 2,285 pass | 2,286 pass, no failures/skips |

The offline baseline includes a missing census API failure; it is not represented as a database measurement. The new cases assert the fresh aggregate before testing its invalidation, avoiding a vacuous abstention test. Two older **query-count-only** assertions were updated to include post-generation revalidation; their behavioral assertions were preserved. Typecheck passes. Lint has zero errors and the same two unused-`supabase` warnings. Working/staged diff checks pass.

`scripts/audits/ask-lifetime-postgres.mjs` executes the actual governor, RPC serializer, PostgreSQL writer/readers, production generation callback, final answer and stored-reference reload. Only model output and initial non-history context are synthetic; no HTTP authentication, PostgREST, browser or live model execution is claimed. It verifies:

- The original four Milo stool-note meanings, supplied through the writer with dated source text, produce two episode identities and a final count of two.
- A 2011 decisive episode remains available behind 26 newer, irrelevant writer-created entries.
- Two vomiting episodes retain recurrence; continuation notes do not add episodes. Seventy relevant notes still count as two with bounded model input.
- Stored sequence 2 displays as ordinal 1 for the 2014-only scope; the saved full-list second episode resolves after reload.
- Luna can be written in a Milo-anchored chat. Pronoun and ordinal subject resolution plus persisted follow-up retain Luna.
- Real duplicate imports preserve the two identities and 70 unique source records.
- A separately committed mutation during generation invalidates an undisplayed source's aggregate. Source correction and soft deletion invalidate saved references; hard deletion leaves completeness unknown.

The separate PostgreSQL assertion suites `ask_history_scoped_read`, `ask_episode_membership_contract`, `ask_recorded_completeness`, `ask_governed_freeform`, `ask_governed_freeform_reversal`, `ask_lifetime_time_and_privileges`, and `ask_lifetime_census` pass. They cover cross-pet correction edges, forgetting, import hashes/frontiers, ownership, privileges, revision rollback, unrelated-owner stability and reversal. The census suite creates **35 episodes / 70 sources with the real SQL writer**, verifies 34 recurrence links, and receives a complete count with a bounded page. The time suite accepts a quoted 2011 date and rejects an unquoted older date, infinity and a future date. Correction-edge SQL assertions are distinct from the callback's source-edit correction test.

Only `furvise-stage2-db-2788f0b` / `stage2_validation` was used, PostgreSQL 17.6, network `none`, no ports. The initial catalog had the previous completeness draft and no governed provenance. Its **actual previous rollback** was extracted from `6400a772`, executed first, then the new drafts applied. Committed rollback/reapplication passed in order: completeness rollback, governed rollback, historical-time rollback, historical-time forward, governed forward, completeness forward. The executable acceptance checks free RAM every ten SQL operations and stops below 2 GB; observed preflights remained above 5 GB. Final checks: **users 0, care rows 0, provenance rows 0, other database sessions 0**; 6,360,264 KB free at the final SQL-suite preflight. The container is left running. Synthetic users and dependent rows were cleaned up after each run.

## Limits and deployment prerequisites

This completes the demonstrated writer-backed scenarios, not retroactive certification of every legacy record. Unlinked historical projections still lack membership authority. Unclassified/general records, unsupported topic families, uncertain semantic extraction, unresolved correction graphs and removal debt can still leave exact totals unknown. The displayed page remains capped at eight episodes/eight members per group; an oversized group can contribute to a certified count without being offered as a detailed reference. Historical dates and grouping still depend on correct semantic extraction; no live-model quality evaluation was permitted.

These are coordinated **local SQL drafts**, not registered or deployed migrations. Release requires migration packaging against the actual target catalog, coordinated application/writer rollout and PostgREST/browser validation. No push, merge, deployment, credentials, dependency installation or live provider call occurred. The original three audit failures remain explicitly open for legacy-data authority/backfill, rather than being concealed by the new acceptance results.
