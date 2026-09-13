# Local candidate-search RPC experiment

## Decision

**GO for a separately reviewed, narrowly scoped integration proposal; not deployment.**
The parameter-bound ANY function demonstrated real authenticated improvements
for globally selective/no-match queries and common terms, with equal candidates
and passing local authority checks. **NO claim of general bounded search
latency:** owner-rare terms common across other owners still scan the selected
owner's history on tail/exhaustion pages. This experiment stops at that result;
no additional search architecture or application change is included.

Base: `06b57af4ffad0b6ea1f78f6ea7f812e5a5f496bb`.
Branch: `codex/ask-candidate-rpc-experiment`, isolated worktree
`C:/Users/gwara/furvise-ask-candidate-rpc`. All reviewed predecessors and unrelated
worktrees preserved. Only container `furvise-stage2-db-2788f0b`, database
`stage2_validation`, PostgreSQL 17.6, was accessed. Initially healthy/running,
zero care rows, no other database sessions or interrupted workload. No Docker
failures, remote/provider access, push, merge or deployment.

## Files and authority

Experimental files live under `supabase/experiments/candidate_rpc/`, **not**
`supabase/migrations/`. No application wiring or remote-ready migration.

- `function.sql`: fixed, parameter-bound ANY lexical query returning the same
  11 fields as `app/lib/intelligence/history-retrieval.ts:88-94`.
- `setup.sql`: exclusive local schema/role and deterministic synthetic fixture,
  followed by VACUUM ANALYZE of the two relevant tables.
- `tests.sql`: real authenticated equivalence/authority tests, baseline and RPC
  EXPLAIN ANALYZE BUFFERS, and nested auto_explain capture.
- `cleanup.sql`: checked removal of only these fixture users/dependents and
  explicit experiment function/schema/role; no database drop or CASCADE DDL.
- `capture-plans.mjs`: parses unwrapped raw psql output, requires successful
  rollback, validates 84 outer plans and one internal candidate plan per RPC.
- [Captured plans](ask-candidate-rpc-plans.json): all 84 outer plans plus 42 actual
  internal candidate plans, not separately executed privileged approximations.

The function is in the unexposed `ask_candidate_experiment` schema. Owner is a
new dedicated `ask_candidate_experiment_reader` role: NOLOGIN, NOINHERIT,
NOSUPERUSER, NOCREATEDB, NOCREATEROLE, BYPASSRLS; SELECT on only dog_profiles and
pet_care_entries, schema USAGE and auth.uid EXECUTE. No role memberships or write
grants. BYPASSRLS is deliberately required for this eligibility experiment,
not a policy-permission workaround or a service-role application read. Local
supabase_admin is used for setup/auto_explain/cleanup, **not** as either measured
caller. Both measured paths execute as authenticated. The dedicated role's
privileges and absence of write/semantic-claim access are asserted in SQL.

Function EXECUTE is revoked from PUBLIC, anon, authenticated and service_role,
then granted only to authenticated. Authenticated has schema USAGE, not CREATE.
The function has a controlled `search_path=pg_catalog`, qualified auth/public
objects and fixed SQL; every value is passed with EXECUTE USING, including
owner, pet, patterns, dates, cursor and limit. No caller SQL or owner parameter.
No RLS-policy change, leakproof override or planner forcing.

Authorization derives auth.uid(), rejects null identity, and reads current
owned pet authority. Every care query independently requires owner, pet and
nondeleted care row, and rechecks the owned profile. Pet profiles have no
soft-delete column; care-row deleted_at is explicitly filtered. The STABLE
function uses one calling-statement snapshot for authorization/evidence; it does
not promise current ownership beyond that snapshot or across requests. No
cross-page/correction snapshot has been introduced.

Validation accepts 1–6 literal terms, length 3–32, one-based one-dimensional
nonnull arrays; current deterministic planner words/spaces/hyphens are supported.
Wildcards, escapes, punctuation/injection-like input and malformed arrays are
rejected rather than silently normalized. Page size 1–25; optional period must
have both finite endpoints with start < end; cursor must have both finite time
and UUID, and fall inside a supplied period. PostgreSQL types reject malformed
UUID/timestamp strings. The cursor is a boundary, not an authority-bearing source
ID; all returned rows still undergo the explicit scope filters.

The existing OR-over-note/title literal matching, half-open period, ascending
occurred_at/ID order and exclusive cursor semantics are preserved. Empty term
lists/period-only requests are outside this lexical experiment. No correction
closure, source freshness guard, completeness field or model-input selection
has changed. Exhausting the lexical cursor still says nothing about semantic
completeness. Bytes returned are not additionally truncated; the existing later
application evidence budgets would remain necessary in any integration.

## Fixture and method

250,062 care rows, 3 owners, 4 pets:

- Owner A: Milo has 100,000 newer irrelevant grooming rows, 60 qualified vomiting
  rows tied at July 9, 2014, a decisive qualified 2011 stool/negated-vomiting note,
  and a deleted 2010 vomiting note. Luna has 25,000 grooming rows.
- Owners B/C: 75,000/50,000 newer vomiting-and-grooming records. These create
  material cross-owner lexical skew, not just single-row negative controls.
- Note-only and title-only matches, null titles/severity, 27.8/28.4 kg and 2.5 ml,
  uncertainty and negation are represented. All synthetic text is labelled.

The sole fixture-loading trigger bypass is
pet_care_entries_apply_current_state, disabled inside the setup transaction and
restored/asserted before COMMIT and every measured read. Setup commits so VACUUM
ANALYZE can maintain indexes before measurements. Bulk load took 11,900.675 ms;
60 rows 64.562 ms; two control rows 2.617 ms. Care VACUUM ANALYZE 196.688 ms;
profiles 1.897 ms. These are not production ingestion benchmarks; the projection
cost was explicitly excluded.

All three prepared indexes were valid/ready. Post-maintenance catalog pages:
cursor 4,720, note GIN 6,040, title GIN 1,206; reltuples 250,062. Existing physical
allocation from prior experiments remains; VACUUM is not REINDEX/VACUUM FULL.
MCV frequencies: owner approximately .503/.297/.200; pet .401/.297/.200/.102;
notes .5026/.497233/.0001/.0000667. ANALYZE samples rare values imperfectly.
Both paths share these statistics, indexes and fixture in the same test
transaction. No cache flush, forced index, enable_* override, altered cost
constant or new index. Four relevant default enable_* flags are asserted.

Fourteen query cases, three warm runs per path, alternating baseline/RPC order.
The baseline emits the application's actual explicit OR/period/cursor SQL and
11 selected fields. RPC measurements call the function **as authenticated**.
auto_explain is loaded only in that local measuring session and logs nested
actual execution plans; EXPLAIN JSON captures outer time including validation,
planning and instrumentation overhead. Nested logging especially affects small
RPC times; these are not uninstrumented latency measurements. All captured
root shared-read counts are zero. Warm runs are not independent percentile or
cold-cache benchmarks, and there is no HTTP/PostgREST/network timing here.

## Results

Median of three instrumented warm runs, milliseconds. Heap rows examined are
scan-node returned + filtered rows (times loops), excluding the separate small
owned-profile check. Buffers are accesses, not distinct pages.

| Case | Existing outer ms | RPC outer ms | RPC internal ms | Care rows examined, existing → RPC |
| --- | ---: | ---: | ---: | ---: |
| Globally rare stool, all time | 68.178 | 0.604 | 0.023 | 100,061 → 1 |
| No match, all time | 68.700 | 0.514 | 0.023 | 100,062 → 0 |
| Common grooming, all time | 84.163 | 0.605 | 0.102 | 100,062 → 86 |
| Common grooming, next page | 95.390 | 0.664 | 0.122 | 100,062 → 111 |
| Common grooming, 2026 | 85.698 | 0.549 | 0.034 | 100,062 → 25 |
| Owner-rare vomiting, first page | 0.083 | 0.362 | 0.047 | 25 → 25 |
| Owner-rare vomiting, second page | 0.109 | 0.454 | 0.092 | 50 → 50 |
| Owner-rare vomiting, tail (11 rows) | 177.412 | 177.888 | 177.287 | 100,061 → 100,061 |
| Owner-rare vomiting, empty final page | 181.915 | 178.579 | 177.954 | 100,061 → 100,061 |
| Vomiting, 2014 | 0.179 | 0.609 | 0.137 | 60 → 60 |
| Vomiting, 2014 next page | 0.152 | 0.502 | 0.117 | 60 → 60 |
| No match, 2014 | 0.120 | 0.445 | 0.074 | 60 → 60 |
| Decisive stool note, 2011 | 0.063 | 0.416 | 0.017 | 1 → 1 |
| Second owned pet, common term | 21.181 | 0.429 | 0.029 | 25,000 → 25 |

Examples of before/after buffers (first run): globally rare stool 3,193 → 22
root hits; no match 2,333 → 49 (later RPC runs 43); common all-time 2,333 → 22;
owner-rare tail 3,193 → 3,214. Full plans include every repetition's buffers,
filters, estimates and index conditions.

The globally rare stool and no-match internal queries use BitmapOr of note/title
GIN with actual `ILIKE ANY` index conditions. This is an actual authenticated
function invocation, not the earlier privileged diagnostic. Common terms use
the owner/pet/date/ID cursor index and stop after 25 qualifying rows; no measured
common-term regression. Period-bounded cases appropriately retain date access,
but outer function overhead makes these already-fast queries slower in absolute
terms (generally several tenths of a millisecond here).

Owner-rare vomiting is globally common because of other owners. The first two
pages are already efficient on the maintained baseline, unlike the prior
single-owner physical/statistical fixture. Do not compare their timings as a
longitudinal speedup. The tail/empty pages still choose the owner/pet cursor
index and scan 100,061 rows. Estimated RPC matches there are about 24,988 versus
11/0 actual. ANY plus authorization does not solve owner/topic correlation or
cursor exhaustion cost. Tail RPC median is slightly slower in this run;
empty-page medians slightly faster, with overlapping ranges. Treat that as
**no established improvement**, not a successful optimization.

## Actual assertions and limitations

Passed real SQL assertions:

- 14 permitted query cases compare **ordered full JSON values**, not sorted ID
  sets. Includes explicit periods, all-time, first/subsequent/tail/empty pages,
  another owned pet, title-only matching and qualified source contents.
- Complete 61-row lexical traversal in 25/25/11/0 pages, all 60 timestamp ties,
  no duplicates/gaps, oldest source first, deleted source excluded.
- Null auth.uid, anon, service_role, foreign/missing/null pet rejected (42501).
  Positive second-owner call succeeds only for its own pet.
- Invalid term lengths/characters/nulls/dimensions/bounds, oversized term arrays,
  malformed UUID/timestamp, incomplete/reversed/infinite periods, incomplete/
  infinite/out-of-period cursors and invalid/oversized page limits rejected.
  Six terms and page size one remain valid.
- Ownership transfer is observed between calls: former owner denied; new owner
  receives no old-owner care rows. Transfer/restoration occurs only on a fixture
  pet in the rollback test transaction. This is not a concurrent-race test.
- Empty temporary tables shadowing public names do not change results.
- Dedicated role/grants, valid indexes and enabled projection trigger checked.
- Existing real correction SQL suite: all 13 DO blocks passed, including
  correction/lineage deletion/update withholding, cascade and permissions;
  its separate transaction rolled back. No correction function was changed.
- Plan parser completed, and diff checks passed. No application code changed;
  application tests/typecheck/lint/full suite were not rerun. No provider calls
  or mocks substitute for the SQL assertions. Existing lifetime-audit gaps stay
  out of scope and were not reclassified.

Two initial setup attempts failed and rolled back: unsupported synthetic
severity, then a missing tombstone deletion_reason. Fixture values were corrected
after reading the actual constraints; no constraint/trigger was weakened. Tests
attempted before successful setup only reported missing experimental schema.
Final setup and all assertions/measurements succeeded. No function defect or
Docker failure was hidden by retrying an unchanged workload.

This proves local SQL authority/equivalence on this fixture, not production
PostgREST exposure/grants, JWT verification, concurrency, adversarial timing
noninterference, cancellation behavior or a production security audit. Local
calls set the JWT subject GUC as a trusted test harness; clients must not control
that trusted session identity in a real gateway. BYPASSRLS removes policy defense
inside this fixed function, so explicit predicates and narrow grants are critical.
The chosen term validator is intentionally tied to the current ASCII planner
vocabulary, not a general multilingual lexical API. No hard per-call database
work guarantee: LIMIT bounds rows, not scan work or oversized stored note bytes.
Any later integration still needs deadlines, failure coverage and review of this
new authority boundary. Do not deploy the experimental role/schema/scripts.

## Reproduction and cleanup

Use only the named local container/database. Copy this experiment directory to
`/tmp/candidate_rpc` in that container. As local supabase_admin, run
`psql -X -v ON_ERROR_STOP=1 -d stage2_validation -f /tmp/candidate_rpc/setup.sql`.
Check success before running tests.sql with the same local connection. Capture
psql stdout/stderr **inside the container** to a local log, then docker cp it out;
this avoids PowerShell wrapping/interleaving JSON. Run
`node supabase/experiments/candidate_rpc/capture-plans.mjs candidate-rpc-tests.log`
to reproduce the JSON capture (optional third argument restricts a case prefix).
Run cleanup.sql after successful setup, including if assertions fail. Setup
refuses name/fixture collisions rather than overwriting objects. Never run these
scripts on another database or as a remote migration.

Cleanup executed successfully: DELETE of exactly three synthetic users cascaded
to their four pets and 250,062 care rows (3,848.066 ms), then explicit function,
schema and role removal; no trigger bypass. Final checks: zero care rows,
experiment users/schema/role absent, projection trigger enabled, no other
sessions. **Test transactions rolled back; committed setup data/objects were
explicitly cleaned up. This was not rollback or reversal of reviewed migrations.**
The container and installed reviewed schema/indexes remain. The synthetic fixture
is recoverable by rerunning setup; no existing database was deleted.
