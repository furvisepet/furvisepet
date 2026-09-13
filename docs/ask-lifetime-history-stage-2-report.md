# Ask lifetime-history repair — Stage 2

## Branch and scope

Base: reviewed Stage 1 `c3854b877734e2d006b982c504910cf507a6173c`.
Branch: `codex/ask-history-stage-2`, isolated worktree
`C:/Users/gwara/furvise-ask-history-stage-2`. Earlier commits remain ancestors.
Other worktrees, including the dirty copy-polish worktree, were not changed.

This implements bounded historical **candidate retrieval and correction-aware
evidence**, not complete semantic retrieval, episode aggregates, durable
follow-ups, or general answer entailment. No cache, model, entitlement, credit,
output-limit, or recovery-authority changes. No provider calls, remote database
access, migration application, push, target merge, or deployment.

Repository instructions, local Next route documentation, the lifetime audit,
Stage 1 evidence/source-note/quotation reports, legacy effective-history rules,
V2 graph reducer/import/schema, and existing indexes were inspected. Supabase
and Postgres skill guidance informed the owner-scoped read boundary, cursor,
index preparation, and explicit separation of mocks from database verification.

## Actual execution path

1. `app/api/ask/route.ts`: existing token/owner/pet and conversation-subject
   authorization runs first. **Inside the actual generation callback**, call
   `retrieveAskHistory(liveContext, supabase, subjectResolution.petIds)` before
   constructing the Stage 1 contract and calling `runFurviseIntelligence`.
   The orchestrator's separate generationInput is still not the model input;
   changing that alone would not have fixed retrieval.
2. `app/lib/intelligence/history-retrieval.ts`: interpret a supported read-only
   topic/period, issue scoped chronological cursor queries, read the correction
   closure independently of event period, validate source/subject authority,
   reduce the governed graph, and budget whole effective records.
3. `ask-evidence.ts`: records raw care loading, correction-claim loading,
   original provenance and governed exclusions separately from represented
   spans. Retrieval/correction/extraction/grouping completeness stay separate.
4. `run-intelligence.ts`: supplies the resulting effective entries to the real
   `generateContextAwareAskResponse`. For this path, old selected memories,
   conversation snippets and episode projections do not reintroduce competing
   historical evidence. Existing deterministic safety context is retained.
5. `app/lib/ai/ask-reasoning.ts`: historical evidence bypasses the old 20/5
   selection and 180/520-character trimming. The existing 48,000-character
   context limit still removes whole records and records every budget loss.
6. `validation/validate-answer.ts`: Stage 1 policy consumes that same contract.
   Partial/unavailable/uncertain correction evidence produces a scoped
   limitation. Final server-grounded source quotations cannot override that
   limitation. Quoted source content and references remain consistent.

The route exposes read coverage and per-pet continuation checkpoints in existing
`contextUsed.historyCoverage` response metadata. This is not a new HTTP cursor
resume API or a durable follow-up reference. The visible fallback asks to narrow
the query/retry; this stage does not automatically complete additional pages.
Final pending-suggestion persistence and its fresh owned-concern lookup remain
unchanged. Existing read-only recall gates discard model-proposed mutations.

## Supported queries and bounds

Supported: a single explicit year, named month with year, ISO day, and recognized
topic-based history/record questions without an age floor. Topics currently cover
vomiting, stool, weight, food/diet, litter, medication/stiffness, urine, blood,
and diagnosis. Combined topic terms are bounded. Named dates without a year use
topic search across time followed by the existing exact source-note locator.

Disjoint/relative periods, unresolved episode ordinals and unrecognized broad
history shapes retain the legacy path **with a limitation**, not a second
competing historical selector for a supported query. Ordinary present-tense
safety questions, observations and explicit save requests retain their prior
path. Lexical matches and even exhausted SQL traversal never certify semantic
completeness or the absence of unlinked corrections.

- At most 3 authorized pets, 4 pages per pet, 25 rows per page, and 64 total
  candidate slots divided fairly across requested pets.
- Stable `(occurred_at ASC, id ASC)` keyset cursor; no offset pagination.
  A short page does not prove exhaustion; an empty next page is required.
  Budget exhaustion remains partial even if the last page happened to be final.
- At most 6 correction RPC calls, 64 input roots/frontier IDs per call and
  128 graph claims/relations. SQL also bounds lineage and current source rows.
  Oversized/ambiguous closure is withheld, not partially treated as authoritative.
- Shared 5-second client read deadline and abort signals. This bounds client
  waiting, not a measured PostgreSQL physical scan cost or guaranteed backend
  cancellation. Deployment needs real query-plan/statement-timeout validation.
- At most 32 whole effective records / 18,000 serialized row characters before
  prompt construction; existing 48,000-character full context limit remains.
  Qualifiers/quantities/corrections are never retained only as cut prefixes.
  Mandatory-contract overflow still uses the pre-existing fail-closed budget
  error rather than sending oversized/unqualified evidence to the provider.

## Correction and deletion governance

Only persisted owner-scoped graph edges establish correction authority. The
existing `resolveEffectiveClaimGraph` is exported and reused without changing
its rules; the rest of the shadow V2 pipeline is not enabled. Medical historical
changes are not inferred to be corrections. Existing legacy preference history
projection is not generalized into medical correction authority.

The new authenticated, read-only RPC scopes claims, relations, lineage, current
sources and subjects to `auth.uid()`. Foreign roots/targets cannot contribute
evidence. A bounded subject/event/topic seed of **stored correction authors**
also finds a reassigned Bruno event when Bruno has no original legacy care row.
It does not promote arbitrary shadow assertions. All incident graph edges are
then followed without filtering by their recording date. Rejected/unconfirmed
authors, invalid relations, missing targets, competing heads and cycles fail
closed. Original source IDs remain provenance; replacements use real `claim:`
IDs, actual recorded/event times and stored polarity/modality qualifiers.

Reassignments outside the requested pet or corrected event period are explicit
governed exclusions, not that pet/period's effective evidence. A replacement is
not quoted as the contents of the original historical note.

Current source rows are checked against imported payload/title/severity, pet
and event time; stale/missing imports withhold the closure. Deleted sources
tombstone their imported claims. Removing/retracting a correction does not
silently restore its target under the reused graph rules. Restoring a care row
does not revive an independently tombstoned claim.

The prepared migration adds private durable removal markers for future removed
destructive edges **and removed legacy lineage**. Thus an administrative/cascade
delete cannot make an invalid original appear newly unlinked and effective.
Markers are not automatically cleared by restoration/reimport; an explicit
governed repair would be needed. Account deletion cascades marker ownership.
Previously hard-deleted relationships cannot be reconstructed; completeness
therefore remains unknown. Text containing an unlinked correction is qualified
as uncertain, never turned into an authoritative edge. Unlinked late correction
discovery outside a query period remains an explicit later audit failure.

No cross-query snapshot/version mechanism was found suitable for this path.
Coverage says `read_committed_no_snapshot`. Source changes are rechecked during
the graph read; changed claims and disappearing incident edges observed on
subsequent closure reads fail closed. Concurrent edits after the last read, or
inserts behind an already-consumed cursor, remain possible. This is not a
snapshot-consistent or semantically exhaustive history API.

## Reproductions and adversarial review

Initial four downstream checks failed before implementation (old decisive
record, tied pagination/final evidence, late validated correction, failed
correction read). They now pass through the actual mocked provider and validator.
The 45 Stage 2 behavioral checks also cover row permutations, same-owner subject
reassignment, foreign targets, deleted/restored sources, correction retraction,
competing/cyclic/missing graphs, interruptions, unlinked text, and exact visible
source quotations with qualifiers/references.

Additional failing tests were added during self-review, then fixed:

- Bruno-only correction discovery without a Bruno legacy candidate.
- Removed lineage resurrecting an original as an unlinked legacy record.
- Three-pet saturated metadata exceeding the mandatory prompt budget.
- A corrected event date leaking into the old requested period.

Short server pages with tied timestamps, graph changes between reads, arbitrary
shadow assertions, and evidence removed by the final prompt budget are tested.
Other fixes found during review keep ordinary emergency questions off the
historical path, prevent replacement/original-note misattribution, and prevent
the source-quote renderer bypassing a partial-history limitation.

Mock measurements (not database, tokenizer, latency or billing benchmarks):

| Synthetic case | Query calls including existing loader | Serialized model context |
| --- | ---: | ---: |
| 2011 decisive record + 100,000 newer irrelevant rows | 15 (3 new historical reads) | 6,989 characters |
| Three pets with 110 matching UUID-keyed rows each | 16 (4 new historical reads) | 47,726 characters |

The second case explicitly verifies final `prompt_budget` losses and an
incomplete answer. Query calls/returned row counts are bounded independently of stored row count;
actual database costs still depend on indexes/selectivity. Input measurements
are JavaScript string lengths of `request.input`, not token counts or the
entire request including the fixed schema/instructions. No latency claim is
made from the in-memory mocks.

## Database preparation and verification limitation

`supabase/migrations/20260905045120_ask_history_scoped_read.sql` prepares:

- Partial owner/pet/event/id cursor index and `pg_trgm` note/title indexes.
- Partial correction-author owner/subject/event index; existing relation and
  lineage indexes supply endpoint/source traversal support.
- Private removal-marker table and removal/lineage triggers.
- Bounded owner-scoped read RPC; no direct authenticated shadow table grants
  and no public/service-role RPC execution grant.

This migration and the pre-existing semantic claim/lineage foundations are
deployment dependencies. Without the RPC, supported history lookups fail closed
with a correction-unavailable limitation; they do not fall back to stale originals.
Index construction/extension namespace, trigger behavior, query plans, RLS and
the SQL test must be verified on a disposable local database before deployment.
The migration has **not been applied anywhere**. Docker's daemon was unavailable
and no local psql runtime was available. `supabase/tests/ask_history_scoped_read.sql`
is a prepared rollback-only synthetic test, **not an executed SQL test**. Static
SQL contract checks and behavioral query/RPC mocks passed; they do not replace
PostgreSQL validation. Non-concurrent index creation needs deployment lock review.

## Verification and remaining audit

- `npm test`: **2,182 passed, 0 failed** (includes default wrappers that actually
  execute Stage 1 and Stage 2 subprocess cases).
- Stage 2 direct cases: **45 passed**.
- Stage 1 direct evidence/source-note/quotation cases: **50 passed**.
- Focused concern/pending-persistence and semantic recovery suites: **133 passed**.
- `npm run typecheck`: passed.
- `npm run lint`: zero errors; the same two existing unused `supabase` warnings
  in `persist-learnings.ts:149,378`.
- `git diff --check`: passed.
- Remaining explicit lifetime audit: **17 checks, 6 passed, 11 failed**, exit 1.
  This audit is intentionally outside normal green discovery; it is not green.

Seven satisfied reachability/span requirements moved into normal Stage 2
discovery. They now assert exact supported values and matching provenance, not
incidental old 80/20/5 snippet counts. Stage 1's old-path tests stay intact using
the harness's nonhistorical option. The remaining audit exercises the new path.
Two explicit later-stage aggregate assertions were added so successful evidence
reachability cannot be mistaken for correct episode totals or a verified 0.6 kg
weight calculation.

Remaining failures: legacy unsupported-query 20-selection; unlinked late
correction discovery; pet-switch ordinal binding; prior episode-list reference
retention; unbounded broad multi-pet history; old canonical episode retrieval;
episode recurrence/sequence representation; general hiding-answer entailment;
the existing addressed-Furvise capability classification; exact separate-episode
aggregate; verified complete weight delta. The last two safely abstain today.
These are not regressions newly hidden by Stage 2. The capability and general
entailment defects remain outside the requested changes and are not claimed fixed.

The harness forbids network fetch and mocks the database/provider. It executes
the real loader, new retrieval, contract, intelligence runner, generator/parser
and final validator. Full Next HTTP auth/billing execution and PostgreSQL query
semantics are code-inspected, not runtime-verified. Recovery persistence is
covered by its existing actual-function mocked dependency regressions.

## Changed files

Application: `app/api/ask/route.ts`; `app/lib/ai/ask-reasoning.ts`;
`app/lib/intelligence/{history-retrieval,ask-evidence,run-intelligence,source-note-recall,types}.ts`;
`app/lib/intelligence/v2/projections/rebuild.ts`;
`app/lib/intelligence/validation/validate-answer.ts`.

Tests/documentation: `scripts/audits/helpers/lifetime-harness.mjs`;
`scripts/audits/ask-history-stage-2.cases.mjs`;
`scripts/audits/ask-lifetime-history.audit.mjs`;
`tests/ask-history-stage-2.test.mjs`; the migration and rollback SQL test above;
this report.
