# Phase 3 findings

Implemented the generic stored-report/effective-fact distinction. The 17/17 stress target and 32/32 new adversarial tests pass. Full offline acceptance is NOT green: two additional legacy correction/receipt suites remain red and reproduce against the exact starting production source. They are not skipped or waived.

## Baseline and scope

- Base: 8df9937704751789fa96ef55b283dc0b1ec54850; branch v1/intelligence-consolidation.
- Result commit: the commit containing this report (git log -1 --format=%H -- PHASE3_FINDINGS.md); its SHA is reported to the operator after commit.
- PHASE3_AUTHORITY_MODEL.md was written before application edits. Native-claim handling was refined after a failing source-form regression demonstrated omitted intermediate stored statements.
- No provider call, live G/G2, unseen-matrix execution, deployment, production database access, worktree switch, reset, or rebase.
- Existing untracked Astra task files remain byte-identical and are excluded from the commit.

## Repair and authority

Brain explicitly proposes readTicket.authority: stored_report or effective_fact. Older callers without the field retain effective_fact. Binder validates the typed proposition and owned scope; it does not classify user wording. Historical calculation grammar and Calculate Binder require effective_fact. No roles, Muscle arithmetic, slot execution, Brief or Immune behavior changed.

Stored reports reuse the existing bounded acquisition, graph/source-version validation, result-set/selection receipts, and immutable Labs snapshot. A store-owned storedReportsCertified flag proves exact active owned source versions independently of effective lineage. Receipt authority must match the ticket, and report receipts cannot be relabeled as effective facts. Existing effectiveStream/effectiveIds names are retained as compatibility transport fields; their domain is qualified by coverage.authority, not inferred from the field name.

Exact care rows and validated native correction/replacement-author payloads remain distinct sources. An older report is not silently replaced by a later one. Native report IDs use existing attributed_report vocabulary and are recognized only with report-qualified coverage. Deleted, withheld, stale, foreign and inactive sources remain excluded. Unknown event dates remain fail-closed. Source/graph availability remains required; this is not an outage fallback.

Stored-report Labs adds recorded_at and presents subject, source ID, recorded time, stored event-time metadata, and exact quoted body using the existing Markdown escaping. It explicitly declines current/corrected truth and supersession; unresolved lineage and no_cross_query_snapshot remain visible. Narrative publication cannot turn these sources into unrestricted fact paraphrases. Body bytes/Unicode survive binding, transport and JSON round trips unchanged.

Effective/current/corrected requests still remain limited on unresolved lineage. They are not automatically downgraded to report requests. Calculations cannot consume report authority; effective arithmetic with unresolved lineage publishes no calculation result. The initial report domain is ordinary concrete/null-window reads with optional selection, not semantic anchors, episodes, grounded probes or legacy strategy operators.

## Stress and adversaries

- Original three-pet and ten-pet/five-year corpora are byte-identical; all seven fixture-module SHA256 hashes are recorded in PHASE3_CORPUS_HASHES.json.
- Three-pet 7/7 and ten-pet 10/10 pass. No correction edge or source record was fabricated and no existing stress acceptance assertion was removed.
- Only the two record-level semantic proposals changed: the conflicting food reports and the request for one represented saved-history item per subject now explicitly request stored_report. True latest-value requests remain effective_fact.
- New tests cover unrelated mass, medication, routine, length, volume, Unicode, plain conflicting statements, timelines, linked superseded care rows, intermediate native corrections, typed current/effective limitations, arithmetic rejection, grouped/joint receipt tampering, body/time/subject tampering, cross-pet ownership, deleted/withheld/foreign/stale sources, source-form provenance, and prose/list/table output.
- The existing two unlinked-correction safety tests retain their assertions and now explicitly request effective_fact with coherent current/corrected questions.
- The shared audit helper gained an explicit negative-calculation expectation; successful calculation tests retain their original default success requirement. Provider-schema fixtures now state the existing effective proposition explicitly.

## Offline gates

| Gate | Passed / Tests | Status |
| --- | ---: | --- |
| retrieval | 244 / 244 | PASS |
| audit222 | 222 / 222 | PASS |
| brain | 78 / 78 | PASS |
| calculation | 360 / 360 | PASS |
| stress | 2 / 2 | PASS |
| expanded | 816 / 816 | PASS |
| phase2 | 29 / 29 | PASS |
| route-and-read | 217 / 217 | PASS |
| stress-cases | 17 / 17 | PASS |
| extended-domain | 678 / 678 | PASS |
| domain | 379 / 379 | PASS |
| correction-boundary | 2 / 2 | PASS |
| phase3 | 32 / 32 | PASS |
| correction-lineage | 15 / 17 | FAIL: inherited, unwaived |
| publication | 149 / 149 | PASS |

Test groups overlap; these counts are not a unique aggregate. All reported skips are zero. The correction-lineage count includes wrapper tests: the inherited context suite has 4/6 underlying passes, and the inherited late-correction suite has 0/9.

| Static gate | Result |
| --- | --- |
| typecheck | PASS (exit 0) |
| lint | PASS (exit 0) |
| build | PASS (exit 0) |
| diff-check | PASS (exit 0) |

Typecheck, changed-file lint with zero warnings, offline production build and diff check pass. External network is blocked by the existing offline guard. The build uses the established local Google-font response fixture. No application font/layout change was made.

## Unwaived blockers

1. tests/ask-context-lineage.test.mjs: the active old-receipt case lacks the expected recoveredReceiptReference=true; the future-dated saved-record case lacks the expected operationReceipt. These are baseline receipt-test failures, not demonstrated regressions from this patch. No receipt guarantee was loosened to make them pass.
2. tests/ask-late-corrections.test.mjs: all nine cases enter history without an interpretationProposal/readTicket and stop at ASK_MEMORY_BRAIN_REQUIRED. Restoring raw-language execution or treating retired supplemental-discovery expectations as the current typed contract is outside this repair.

Both failures were reproduced with a read-only Node loader substituting every changed production module with its exact git HEAD baseline bytes. The checkout was never reset or switched. The failed wrappers, underlying errors, baseline module list and logs are retained. This task does not claim that the full offline acceptance gate is green.

## Complexity and files

Production: 14 modified files, 0 new modules, 0 removed modules; +125 / -51 physical lines, net +74. Counts include comments and mechanical changed-file lint cleanup.

One generic requested-authority distinction; no new planner, provider call, language router, correction-discovery path, or query budget. Existing receipt/snapshot structures are reused.

| Production file | Purpose |
| --- | --- |
| app/lib/furvise-brain/calculate-plan.ts | One effective-only ticket guard; roles, operand parsing, DAG and arithmetic unchanged. |
| app/lib/furvise-brain/effective-selection.ts | Reuse bounded acquisition and selections with store-certified report versions; preserve effective closure gates. |
| app/lib/furvise-brain/lungs.ts | Carry authority on coverage; report completeness does not assert effective lineage; mechanical lint cleanup. |
| app/lib/furvise-brain/ordered-result-set.ts | Qualify existing receipts and distinguish exact source certification from effective lineage. |
| app/lib/furvise-brain/read-ticket-provider-schema.ts | Historical calculation grammar requires effective_fact; mechanical unused-binding lint cleanup. |
| app/lib/furvise-brain/read-ticket.ts | Typed requested authority, provider description, legacy effective default, and supported report-domain validation. |
| app/lib/furvise-brain/result-selection.ts | Carry report-qualified joint receipts and frontiers through existing selection. |
| app/lib/intelligence/ask-evidence.ts | Preserve claim IDs only with matching attributed-report provenance and report-qualified coverage; mechanical lint cleanup. |
| app/lib/intelligence/history-retrieval.ts | Reuse owned/fresh/tombstone-checked graph reading for exact active care and native report payloads, including superseded reports. |
| app/lib/intelligence/labs-list.ts | Snapshot exact report bodies and recorded times; deterministic attributed quotation output; reject report arithmetic transport. |
| app/lib/intelligence/labs-presentation.ts | Export and reuse the existing display escaping; existing rendering behavior unchanged. |
| app/lib/intelligence/publication-authority.ts | Qualify obligations; report source IDs cannot authorize unrestricted narrative fact claims. |
| app/lib/intelligence/result-set-publication.ts | Match ticket/receipt authority and source-version certification; reject authority relabeling. |
| app/lib/intelligence/selection-publication.ts | Same authority checks for grouped and joint selections; unresolved reports never gain effective certificates. |

Other changed files:
- PHASE3_AUTHORITY_MODEL.md
- PHASE3_CORPUS_HASHES.json
- PHASE3_FINDINGS.md
- PHASE3_OFFLINE_RESULTS.json
- PHASE3_PRODUCTION.diff
- scripts/audits/ask-ten-pet-five-year-stress.cases.mjs
- scripts/audits/helpers/current-stress-harness.mjs
- scripts/audits/helpers/lifetime-harness.mjs
- scripts/audits/helpers/publication-call-expectations.mjs
- tests/ask-compositional-emission.test.mjs
- tests/helpers/calculation-public-fixture.mjs
- tests/stored-report-authority.test.mjs
- tests/stress-correction-boundary.test.mjs

## Evidence and next boundary

PHASE3_PRODUCTION.diff is the exact production-only unified-zero diff against the baseline (apply with --unidiff-zero). PHASE3_OFFLINE_RESULTS.json records file lists, individual gates, complexity, log hashes and corpus hashes.

Full logs and baseline reproduction: C:\Users\gwara\waraich-operator\state\furvise-intelligence-phase3.

PHASE2_UNSEEN_MATRIX.json is unchanged and was not run. Its twelve language classes and exact G/G2 exclusion remain intact. Because the full offline gate is not green, matrix advancement is blocked.

Next bounded work: investigate/migrate the two inherited receipt/correction audit boundaries under existing typed authority, then rerun the full offline gate. Do not add raw-language execution or weaken source ownership to obtain green tests.

Provider calls: 0. Cost: $0. Production remains blocked.
