# Phase 2 findings

Baseline: 6fef96ea11207f221ac7f5b67f8fa8aee6d08c33. Branch: v1/intelligence-consolidation. Workspace unchanged. No reset, rebase or worktree switch.

## Outcome

Two generic production acquisition defects repaired. Audit is 222/222, expanded is 816/816, and the three-pet stress corpus is 7/7. Ten-pet stress is 8/10. Its two original acceptance assertions remain red; full offline acceptance and live execution remain blocked.

FAILURE_CLASSIFICATION.json was created before application edits and records all 13 original audit failures, both stress wrappers, the missing asset and new reproduced defects. The initial classification was updated with evidence and dispositions, not used to waive failures.

## Production repair 1: cohort correction budget

createEffectiveWindowResolver divided a small aggregate budget among subjects. For ten subjects it allocated nine calls total, giving one subject zero closure attempts. Five subjects also exhausted some subjects after one call, even with an empty graph. New tests using arbitrary subject identities reproduced 2/4 failures for cohorts of 1, 3, 5 and 10 before the repair.

Each authorized subject now receives the existing six-call traversal allowance. Calls already spent remain deducted. Exhaustion, incomplete/truncated graphs, ownership checks, graph row limits and the shared five-second history deadline remain enforced. The repair grants opportunity to establish closure; it never declares closure itself.

Operational tradeoff: the worst-case cohort correction-call ceiling increases from nine to sixty for the ten-subject maximum. This is finite and subject-scoped. Live database latency and throughput have not been measured. Tests prove the six-call cap, no extra call after exhaustion, foreign-subject rejection and partial-graph rejection. Existing broader correction/lineage adversaries also pass.

## Production repair 2: concrete temporal acquisition

Effective selection calculated the typed selectedFrom/selectedTo bounds but passed the entire accessible history to the page store. Out-of-window noise consumed the finite acquisition budget before reaching the requested facts. Three new tests over unrelated volume, duration and length windows, each with three subjects and 120 older distractors per subject, failed before the repair and pass afterward.

Raw pages now use the requested half-open window intersected with accessible history. Returned raw rows must fall within that window. Correction seed discovery still covers the full authorized scope: date-shifted corrections can be discovered and their original sources validated outside the selected window. No temporal inference or timestamp repair was introduced. Added out-of-window-row rejection coverage; existing correction and bounded-endpoint suites remain green.

Exact code patch: PHASE2_PRODUCTION.diff. Only effective-selection.ts and history-retrieval.ts changed in production source: 8 lines added, 5 removed, net +3; no new production source file, request field, schema branch or instruction. Binder, Muscle, Labs, publication, roles and public capability policy are unchanged. Brain chooses semantics once; deterministic acquisition now honors those typed semantics more reliably.

## Audit migration and authority evidence

The original 13 reds were stale contracts, not thirteen proven model defects:

- Supplied-premise and mixed-correction fixtures expected a second interpretation. The actual path only permits its existing saved-profile repair. Migrated cases test a valid first proposal where supported, exact USER evidence, rejection after one mocked call, and no foreign/mutation escalation. No retry was added.
- Several general/supplied-context fixtures reused a context asking to compare saved observations, contradicting their proposed domain. Their context is now coherent with the frozen semantic proposal. Owned-history validation remains strict. Conversation formatting is not a factual projection.
- Null-frame write assertions now use an actual save request. Mixed observation tests exercise the actual route with a source-bound append plus companion read: failed response persistence creates no capability; successful preparation creates only a pending capability; neither path writes a care row before confirmation.
- Five-subject endpoint arithmetic now has explicit grouped endpoint selections and five typed difference nodes. The test retains the 600 historical rows, certifies both sources per subject and verifies each exact 1.25 kg result. Retired server-read-projection fields are no longer asserted.
- Event-budget tests retain verbose distractors and exact transition records, but assert deterministic certified transport and visible quotations instead of a nonexistent answer-model prompt. Injected invented prose is never called or published.

The audit still contains 222 executable tests. No tests were deleted or skipped. Its improvement includes repaired fixtures and assertions; it is not evidence of live first-attempt language-model accuracy. Combined arithmetic-plus-append remains unsupported: the migrated rejection test does not claim that positive composition now works.

## Shared stress migration

Both original corpora now use current-stress-harness.mjs, which supplies explicit frozen semantic dimensions through the existing lifetime harness. It invokes the real interpretation validation, history acquisition, correction traversal, deterministic Labs and publication. It asserts one mocked Brain interpretation and zero answer/review calls. It does not generate certificates, infer semantics from raw questions, synthesize correction links or implement a second language planner.

The underlying in-memory table/RPC fixture remains the existing lifetime adapter for the paths exercised here; no alternative factual execution engine or stronger snapshot guarantee was introduced. Production still reports read_committed_no_snapshot / no_cross_query_snapshot. These offline tests do not prove PostgreSQL isolation or live storage behavior.

All seven historical fixture files have identical before/after SHA256 hashes in PHASE2_OFFLINE_RESULTS.json. Records, chronology, noise, deleted records and correction graphs are unchanged. Case semantics now explicitly include endpoint ordering, subject grouping, time bounds and ordinary topic synonyms. Full ten-subject cardinality and exact record assertions remain. The old provider prose does not supply factual authority. The calculation test page adapter was also corrected to respect its from/to parameters; two bounded-endpoint tests exposed that stale adapter after the production window repair.

## Remaining authority boundary: two failures, one cause

The frozen Birch corpus contains a later textual correction but no authoritative relation linking it to the earlier food note. Production marks it unlinked_correction_uncertain / attributed_report. Current effective-history result-set certification requires resolved lineage and cannot publish it as settled effective truth.

The individual report request therefore returns server-history-unavailable. The ten-subject request certifies nine subjects and remains limited for Birch. The original tests still require both stored reports to remain visible and all ten subjects to be represented, so both remain red. New correction-boundary tests (2/2) separately prove that no effective correction link is invented and no complete ten-subject result is claimed. Those safety tests do not replace the failing acceptance assertions.

Resolving this needs an explicit distinction between certified stored wording and certified effective facts, or an authorized real correction relationship. Fabricating fixture lineage, dropping the subject, marking closure true, suppressing the failures, or broadening publication without that authority would violate this task. No such change was made. This is the first unresolved architectural authority boundary; no stacked redesign follows it.

## Exact asset provenance

Restored app/lib/vet-brief/fonts/brand-print.png from commit deeb788e. Git blob: 1980c556e9e2f47afa76e7fb9d1d0bed57e0749c, 46,335 bytes. It was removed by 747a9154. Restored bytes hash to the identical repository object; nothing was fabricated or approximated. The formerly failing Brief test passes in the expanded suite. The fonts directory is ignored, so this exact verified asset must be explicitly staged.

## Offline gates

| Gate | Before | After |
| --- | ---: | ---: |
| Calculation | 360/360 | 360/360 |
| Brain | 78/78 | 78/78 |
| Retrieval | 244/244 | 244/244 |
| Focused evidence-domain | 379/379 | 379/379 |
| Route/read | 217/217 | 217/217 |
| Audit | 209/222 | 222/222 |
| Expanded | 815/816 | 816/816 |
| Stress wrappers | 0/2 | 1/2 |
| Migrated stress cases | not comparable before migration | 15/17 |
| Extended calculation/domain | additional verification | 678/678 |
| Phase 2 regressions plus relevant policy/helper tests | new gate | 29/29 |
| Unlinked-correction safety boundary | new gate | 2/2 |

Groups overlap; do not sum as unique cases. No skips. Typecheck, changed-file lint (zero warnings), offline production build and diff check pass. Build uses the existing cached genuine font through Next's font-response fixture, telemetry disabled and external network guard enabled. No application layout/font-loading source changed.

Exact file lists, counts, failures, unchanged corpus hashes and complexity: PHASE2_OFFLINE_RESULTS.json. Logs: C:/Users/gwara/waraich-operator/state/furvise-intelligence-phase2. Before/after reproductions: budget-before.log, window-before.log; final manifests: gate-files.json, gate-results.json. The stress diagnostic retains actual coverage and no_cross_query_snapshot limitations.

## Unseen matrix and stop

PHASE2_UNSEEN_MATRIX.json contains twelve proposed, never-run first-attempt cases covering all requested language classes, excluding G/G2 wording. It contains fixture specifications only; no user, session or DB row was created. It has no executable alternate Ask harness. Each future case is capped at one interpretation, without retry or resend.

Live blockers: the two stress acceptance failures; no matrix provider authorization; unchanged disabled public calculation/mutation policy; an exact reviewed local acceptance/cleanup packet and one-call controls. The matrix is prepared only and explicitly blocked. This phase does not authorize enabling capabilities or running any case.

Provider calls: 0. Provider cost: $0. No live G, production DB access, deployment, merge, push, new worktree or reset. Both ASTRA task files remain untracked and untouched. Commit SHA is reported in the handoff; these artifacts are part of that commit.

## Files changed

- FAILURE_CLASSIFICATION.json
- PHASE2_FINDINGS.md
- PHASE2_OFFLINE_RESULTS.json
- PHASE2_PRODUCTION.diff
- PHASE2_UNSEEN_MATRIX.json
- app/lib/furvise-brain/effective-selection.ts
- app/lib/intelligence/history-retrieval.ts
- app/lib/vet-brief/fonts/brand-print.png
- scripts/audits/ask-semantic-stress-multi-pet.cases.mjs
- scripts/audits/ask-shared-request-contract.cases.mjs
- scripts/audits/ask-ten-pet-five-year-stress.cases.mjs
- scripts/audits/helpers/current-stress-harness.mjs
- scripts/audits/helpers/publication-call-expectations.mjs
- tests/helpers/calculation-public-fixture.mjs
- tests/history-subject-budget.test.mjs
- tests/history-window-acquisition.test.mjs
- tests/stress-correction-boundary.test.mjs
