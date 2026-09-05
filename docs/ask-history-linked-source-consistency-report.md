# Stage 2 linked-source consistency revision

Parent: `d2179902ed479ad25788784b69786f525d654cd6`.
Existing isolated branch: `codex/ask-history-stage-2`. Earlier work preserved.

## Cause and correction

`effectiveCandidates` compared the correction RPC's source with its linked
claim, but the `effective_linked` branch returned the earlier candidate row.
When both RPC values changed together, that comparison succeeded and the stale
candidate still reached the actual generator. The unlinked branch had a limited
candidate/source comparison; the linked branch had none.

Chosen policy: **withhold changed candidates**, not substitute fresh evidence.
One shared comparison now checks every selected source field: identity, owner,
pet, category, title, note, severity, event/creation/update timestamps and
deletion state. This applies to linked and unlinked candidate rows. A note,
topic, pet or date change is not assumed to remain inside the requested scope.
Even content-identical timestamp changes conservatively require another lookup.

Linked candidate claim IDs are marked before withholding so those same claims
cannot re-enter through the replacement-rendering branch. Existing source/claim,
lineage, graph and owner checks remain in force. Inconsistent source/claim
versions still withhold the graph with correction coverage unavailable.

Withheld rows carry `deleted_or_changed` provenance, explicit excluded source
IDs and `source_deleted_or_changed` reasons in both history and contract losses.
These are no longer mislabeled as evidence-budget exclusions. The existing
final answer policy renders an incomplete-evidence limitation and clears
unsupported references; no new general answer-rewriting rule was added.

Actual exercised path: real candidate retrieval → mocked correction RPC →
Stage 1 contract → `runFurviseIntelligence` → real generator with a mocked
provider → final validator. The existing route callback invokes this same path.

## Behavioral verification

Added 13 downstream cases: coordinated source/claim note change; topic, event
date, pet, title, severity, category, creation/update time and deletion changes;
unchanged linked evidence; source-only and claim-only version inconsistencies.
Tests preserve separate candidate and RPC snapshots, including edits that do
not bump `updated_at`. They assert stale content is absent from serialized
provider input, explicit loss coverage, and the final returned answer/references.
The positive control asserts supported content reaches the final answer.

Before implementation: 58 Stage 2 cases, 48 passed and 10 failed. Nine failures
demonstrated stale emission; deletion was already withheld but lacked the new
explicit changed-source loss. Unchanged and inconsistent-version controls passed.
The precise loss-label assertions also failed before their bookkeeping fix.

After implementation:

- Stage 2 direct regressions: **58 passed** (all earlier 45 preserved).
- Full default suite: **2,182 passed, 0 failed**; includes executed Stage 1/2
  subprocess suites, not just source-text assertions.
- Stage 1 direct evidence/quotation regressions: **50 passed**.
- Focused concern/pending-persistence and semantic recovery: **133 passed**.
- Typecheck passed; lint zero errors with the same two existing unused
  `supabase` warnings in `persist-learnings.ts:149,378`.
- Diff checks passed.
- Remaining lifetime audit unchanged: **17 checks, 6 passed, 11 failed**.

## Files and limitations

Changed `app/lib/intelligence/history-retrieval.ts`,
`app/lib/intelligence/ask-evidence.ts`,
`scripts/audits/ask-history-stage-2.cases.mjs`, and this report.

No database/schema/RPC changes. Supabase skill guidance was used to inspect the
read boundary and verify through mocked queries, without database access.
This repairs the observed between-read inconsistency; it does not create a
cross-query snapshot or prevent changes after the final read. Conservative
withholding may require retrying otherwise useful edited records. PostgreSQL
runtime validation remains unperformed, as documented for Stage 2.
No provider calls, remote migrations, production changes, push, merge or deploy.
