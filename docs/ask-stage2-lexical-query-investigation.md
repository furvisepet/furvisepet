# Stage 2 lexical query investigation — local PostgreSQL

## Outcome

No application, policy, function, index or migration change is proposed in this
revision. The authenticated syntax alternative tested here does **not** improve
the problematic plan. Privileged diagnostic reads demonstrate potential, not a
safe deployable improvement. Keep the reviewed implementation unchanged pending
a separately validated narrow candidate-read boundary.

Base: `bab26f106294f28f7f1fb2d83ac5af05de9f28c1`, preserving application revision
`2788f0bee1b5567f36acfe1b289d14f3d1e06af0` and namespace fix `a5572703`.
Isolated branch: `codex/ask-lexical-query-plans`. Existing worktrees were preserved.
Only `furvise-stage2-db-2788f0b`, database `stage2_validation`, was used.
PostgreSQL 17.6. No remote/provider access, other database/container changes,
push, merge or deployment.

## Reproduction and controls

Read the prior local validation report and captured plans. The container was
initially stopped with exit code zero; started only that container. Before the
workload it had no other database sessions and no care rows. No interrupted
transaction remained. No Docker failure occurred during this investigation.

Run the committed `supabase/tests/ask_history_lexical_plan_probe.sql` with
`psql -X -v ON_ERROR_STOP=1` against this disposable database. It recreates the
documented 100,000 newer grooming rows, 60 vomiting rows sharing a 2014 timestamp,
and one decisive 2011 qualified soft-stool/negated-vomiting source. Synthetic
facts are explicitly labelled. After measurements it adds a second owned pet
and another owner's pet for isolation controls.

Everything is inside BEGIN/ROLLBACK, including ANALYZE and the temporary plan
capture function. The state-projection trigger is disabled only during bulk
fixture loading and restored before every measured read. It is asserted enabled
before rollback. No other trigger is disabled. Initial multi-pet control setup
failed with PET_LIMIT_REACHED because the measurement JWT was still present;
the disconnected failed transaction rolled back. Corrected fixture setup clears
that transaction-local JWT while inserting as postgres, then restores the owner
JWT before authenticated reads. No entitlement changes or bypass in reads.

Final successful load: 100,000-row insert 5,151.034 ms, 60-row insert 66.570 ms,
single-row insert 1.537 ms, care ANALYZE 40.013 ms. This excludes the deliberately
bypassed state projection; it is not an ingestion benchmark.

## Actual query and cause

Application authority remains `app/lib/intelligence/history-retrieval.ts:86-104`:
owner ID AND pet ID AND deleted_at IS NULL, optional period, OR across note/title
ILIKE predicates, exclusive `(occurred_at,id)` cursor, ascending date/ID and
LIMIT. The query is used in the actual generation callback, followed by existing
correction closure and evidence-contract processing. No alternate retrieval path
was added. Budgets remain 25/page, 4 pages/pet, 64 candidates, 3 pets, 6 graph
calls, 128 graph rows, 32 represented records, 18,000 evidence characters and a
5-second client deadline. These bound returned work/evidence, **not** the number
of database rows examined by an individual query.

Schema sources: `20260712000000_core_loop_schema_rls.sql:273` (SELECT policy),
`:337` (global date index), and `20260905045120_ask_history_scoped_read.sql:4-14`
(partial owner/pet/date/ID and note/title trigram indexes). Actual catalog:

- SELECT policy: `(auth.uid() = user_id)`, public roles. Authenticated has SELECT.
- Authenticated is neither superuser nor BYPASSRLS. Local postgres is BYPASSRLS
  but not superuser. Privileged comparisons retain the same explicit owner/pet
  predicates; they are not permission-equivalent to authenticated reads.
- `texticlike` is not leakproof; UUID equality/comparison and timestamp comparison
  are leakproof. Lexical predicates cannot be assumed safe ahead of the RLS
  security condition. Do not mark this built-in or a wrapper leakproof.
- Both trigram indexes are valid/ready and match `deleted_at IS NULL`. pg_trgm is
  in public, correctly handled by the reviewed namespace fix.
- ANALYZE saw one owner/pet, title entirely null, note MCV frequencies
  `{0.9994,0.0006}` (estimated two distinct values; the unique 2011 value was
  missed by the sample). Physical index pages: note 3,599; title 558; cursor
  2,833. Prior rollback workloads leave physical index/dead-tuple history;
  this was not a freshly rebuilt/vacuumed database. No cache reset or index
  rebuild was performed.

Two independent effects are demonstrated:

1. **RLS/operator eligibility and estimates.** Removing ORDER/LIMIT still gives
   an authenticated sequential scan for a single ILIKE: 100,000 rejected rows.
   Disabling sequential and ordinary index scans diagnostically does not create
   a lexical index condition: this run uses the partial title GIN as an all-entry
   bitmap scan with no lexical Index Cond and still rejects 100,000 heap rows.
   Merely seeing a trigram index name is not evidence of selective access.
   The equivalent privileged single-predicate read uses the note GIN condition.
   Authenticated common-term estimate is 10 rows versus 100,000 actual;
   privileged estimate is 100,001. ANALYZE alone therefore did not fix the
   authenticated estimates. The catalog/controlled role comparison supports a
   security-sensitive planning restriction; no PostgreSQL source instrumentation
   was performed to isolate every selectivity-estimator decision.
2. **Cost/order/OR shape even without RLS.** The privileged six-OR query still
   chooses the date index and filters 100,000 rows. Two OR arms or equivalent
   ILIKE ANY arrays can choose BitmapOr instead. The date index provides the
   first ordering key, enabling an incremental-sort startup-cost preference.
   To finish the last matching timestamp group the executor can walk the entire
   remaining index when all later rows fail the lexical filter; LIMIT does not
   guarantee early exit. The unique cursor index exists but is not selected.
   Eligibility alone does not guarantee a useful plan.

## Captured plans and timings

Full 27 EXPLAIN ANALYZE BUFFERS JSON plans:
[ask-stage2-lexical-plans.json](ask-stage2-lexical-plans.json).
PowerShell interleaved stdout/status lines were removed and wrapped JSON strings
joined for valid JSON; plan values were not changed. The SQL is the reproducible
source for each case label. Comparison rows below are from the same successful
transaction after loading and ANALYZE. They are **warm local runs**, not cold
cache, tokenizer, production, concurrency or large-tenant-distribution claims.
Root shared-read-block counts are zero except the forced-bitmap diagnostic
(3 reads). Buffer hits are accesses, not distinct pages or rows.

| Query / role (default settings unless marked) | Execution ms | Heap rows examined* | Root shared hits |
| --- | ---: | ---: | ---: |
| Existing six-OR, authenticated, three runs | 197.477 / 196.487 / 199.124 | 100,061 | 198,638 |
| Same six-OR, privileged diagnostic | 220.977 / 228.282 / 207.268 | 100,061 | 198,638 |
| No match, authenticated, three runs | 65.468 / 62.303 / 60.720 | 100,061 | 4,450 |
| Same no match, privileged diagnostic | 5.192 / 5.281 / 5.070 | 0 | 542 |
| Common grooming, authenticated, three runs | 81.363 / 88.892 / 91.069 | 100,061 | 4,450 |
| Same common term, privileged diagnostic | 0.103 / 0.070 / 0.094 | 87 | 8 |
| Two-OR selective, authenticated | 102.141 | 100,061 | 200,540 |
| Single note term, authenticated, no order/limit | 60.339 | 100,061 | 4,450 |
| Two-OR, authenticated, forced bitmap diagnostic | 66.742 | 100,061 | 4,646 |
| Single note term, privileged, no order/limit | 0.782 | 61 | 351 |
| Two-OR selective, privileged | 2.093 | 61 | 530 |
| Six patterns as two ANY arrays, privileged | 7.484 | 61 | 1,592 |
| Same ANY arrays, authenticated | 208.518 | 100,061 | 198,638 |

*Heap rows returned plus rows removed by filter at the scan node, not GIN index
tuple counts. Dead/invisible index entries can make index counts larger. The
common privileged date scan reads 26 matching plus 61 rejected rows. Repeated
runs are warm repetitions, not independent samples or percentile estimates.

This is a **before/diagnostic comparison**, not an application before/after speedup.
There is no changed production query to benchmark. In an earlier transaction the
privileged two-OR plan also chose the date index; costs/statistics/physical index
state matter. Do not generalize one attractive BitmapOr plan into a guarantee.

## Verification and unchanged semantics

- Successful real SQL assertion: 61 matching rows in 25/25/11/0 pages, no gaps or
  duplicates across 60 equal timestamps, 2011 source first, second owned pet
  separate, cross-owner rows unavailable under authenticated RLS.
- Existing `supabase/tests/ask_history_scoped_read.sql` executed successfully:
  all 13 DO blocks, including linked corrections, owner/unauthenticated access,
  oversized inputs, update/deletion withholding and cascade checks. ROLLBACK.
- `node --test tests/ask-history-stage-2.test.mjs`: 2/2 wrapper tests passed.
  Direct Stage 2 cases: 58/58 passed, including mocked actual provider input,
  correction authority/source consistency, pagination/failures and input bounds.
- Full suite/typecheck/lint were not rerun: no application or migration changes;
  this revision changes only a manual disposable SQL probe and documentation.
  Existing lifetime-audit failures remain outside scope; none were reclassified.
- Final database checks: care rows 0, synthetic owners 0, other sessions 0,
  projection trigger enabled, diagnostic planner flags all on/default.
  Test data rolled back; installed reviewed migrations were **not reversed**.

## Recommendation / next bounded experiment

No safe improvement is established under the existing authenticated query
boundary. Do not ship the ANY syntax change alone, force an index, alter
leakproof flags, weaken RLS, or use a service-role application read.

The most promising next experiment is a narrow authenticated lexical-candidate
RPC with explicit fresh auth.uid/owned-pet authority, bounded validated terms,
period/cursor/page parameters and the exact existing source fields. A custom
plan with parameter-bound ANY patterns is worth comparing, but this is a new
security boundary, not a proven fix. It needs actual permission and adversarial
tests (including grants, search_path, owner/pet changes and bad parameters),
default-planner common/selective/no-match measurements, multi-owner population
tests, and actual provider/evidence tests before replacing lexical reads. Keep
correction closure/source freshness validation and unknown completeness intact.
Do not infer semantic completeness from lexical exhaustion.

No speculative RPC/migration is included here. Diagnostic speedups alone do not
establish that its authorization, planning and deployment behavior are safe.
Further measurements should include maintained indexes and skewed multi-tenant
datasets; the present multi-owner control proves isolation, not their latency.
No caching, episode/aggregate/follow-up work or state-projection optimization.
