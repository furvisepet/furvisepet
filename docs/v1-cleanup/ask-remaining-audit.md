# Remaining Ask audit — 2026-09-11

Base commit: `eec244f9d3edb64e2758bf5bf2c328fe494b23a1`.

## Scope

The inventory contains 84 Ask application files. The preceding audits covered positions 1–60. This audit covers the remaining 24 and the newer `review-task-completion.ts` omitted from that inventory: **25 files**, completing review of these **85 Ask-owned application files**. Shared architecture dependencies are not claimed to be newly audited in their entirety. Unchanged files were reviewed rather than rewritten to inflate the diff.

| File | Finding / review |
| --- | --- |
| `app/lib/intelligence/history-access.ts` | Fixed timezone-offset clipping by comparing instants; bounds, entitlement windows and out-of-window empty intervals remain intact. |
| `app/lib/intelligence/history-calculation.ts` | Fixed Unicode-sign operand grounding and singleton expression bounds; retained independent dimensional and semantic review. Signed derived values retain both signed and magnitude anchors. |
| `app/lib/intelligence/history-dates.ts` | Reviewed literal days/months, leap-day validation, coordinated dates, relative/open comparisons and evidence-need windows. No new defect established. |
| `app/lib/intelligence/history-limits.ts` | Reviewed shared cohort/obligation limits against their consumers; no mutation limits widened. |
| `app/lib/intelligence/history-narrative-facts.ts` | Fixed sign reversal in explicit quantities and rates. Quote/date grounding, missing-diagnosis qualification and legacy derivations remain separate. |
| `app/lib/intelligence/history-narrative.ts` | Reviewed exact draft shape, sentence/citation limits, structured-format size limits and calculation parsing. |
| `app/lib/intelligence/history-obligations.ts` | Reviewed whole-question and per-subject/window obligations, evidence bindings and explicit limited/missing states. |
| `app/lib/intelligence/history-query-relevance.ts` | Reviewed lexical hints, separate transition facets and rarity ranking; hints never become factual authority. |
| `app/lib/intelligence/history-read-strategies.ts` | Reviewed calendar anchors, fair facet allocation, omitted-target diagnostics and retained broad context. |
| `app/lib/intelligence/history-retrieval.ts` | Fixed abort-ignoring candidate and correction-graph reads using the shared local deadline. Reviewed pagination, duplicate versions, owner scope, graph closure, corrections and evidence budgets. |
| `app/lib/intelligence/history-review-selection.ts` | Reviewed sentence indexes, complete task obligations, action indexes and bounded rejection feedback. Invalid denials cannot grant approval. |
| `app/lib/intelligence/history-review-state.ts` | Fixed receipt input aliasing with a defensive snapshot. WeakMap identity and source/draft signature checks remain required. |
| `app/lib/intelligence/history-synthesis.ts` | Reviewed controlled paraphrase equivalence, stable instant ordering, relevance tiers, pet fairness and conservative occurrence boundaries. |
| `app/lib/intelligence/inspect-ask-publication.ts` | Reviewed the same serialization/reload/action-set/integrity gate used by production and test harnesses. |
| `app/lib/intelligence/interpret-ask.ts` | Reviewed server-owned request validation, bounded admitted repair, user-premise authority, reference recovery and provider failure redaction. |
| `app/lib/intelligence/read-projection.ts` | Fixed PostgreSQL midnight offset exclusion; uncertain/negated measurements defer to semantic review. Unsafe table cell delimiters defer rather than corrupting the table. |
| `app/lib/intelligence/recorded-inventory.ts` | Fixed revision type coercion and mutable census snapshots; owner/topic/period/freshness/count/source constraints remain required. |
| `app/lib/intelligence/recorded-provenance.ts` | Reviewed source/message hashes, semantic-boundary quotes, owner/pet identity, membership roles and correction/uncertainty exclusions. |
| `app/lib/intelligence/request-reference-context.ts` | Reviewed bounded dialogue selection, missing/truncated-reference disclosure and non-evidence authority label. |
| `app/lib/intelligence/review-history-narrative.ts` | Reviewed citation and anchor checks, independent review/repair, task completeness, exact final format and receipt binding. |
| `app/lib/intelligence/source-note-recall.ts` | Reviewed named-test matching, date ambiguity, competing records, full-source quotation and current-status restrictions. |
| `app/lib/intelligence/structured-history-json.ts` | Reviewed data-only JSON shape, bounded serialization and mandatory downstream source/narrative review. |
| `app/lib/navigation/ask-composer-focus.tsx` | Reviewed context lifecycle and stable provider value; no new defect established. |
| `app/lib/navigation/ask-request-activity.ts` | Reviewed shared request-activity state, event synchronization, cleanup and guarded-submit integration. |
| `app/lib/intelligence/review-task-completion.ts` | Newer file absent from inventory: reviewed whole-task requirements, navigation versus mutation readiness, repair restrictions, snapshot binding and honest assessment limits. |

## Episode-count investigation

The earlier production failure was not an arithmetic error. The synthetic Clover data contains five unlinked weighing-correction notes and no registered vomiting, breathing or soft-stool episode groups. The synthetic account also has one retained removal-debt flag and ten removed correction targets. Unknown historical attribution cannot be repaired by assigning invented correction edges or clearing deletion safeguards.

A real defect was the response class: persistent correction uncertainty was described as a temporary outage with “try again.” The episode reader now distinguishes unresolved correction links from an unavailable correction read. The response explains the correction issue, explicitly avoids implying zero episodes, and directs the owner to identify the original reports in History. Genuine transient failures retain retry guidance. Counts and references remain withheld while their source authority is unresolved.

This fixes the misleading retry behavior, **not the missing historical relationships**. The old synthetic dataset still cannot support an exact count. No care data, correction link or deletion safeguard was changed to manufacture a pass.

## Other fixes

- History candidate reads, correction discovery, graph closure, episode reads and rechecks now settle locally if the SDK ignores cancellation. They share the existing execution-deadline owner; there is no new helper file or expanded read budget.
- Explicit negative quantities cannot become positive through anchor extraction or Unicode-minus operand matching. A single reverse-Polish operand must meet the same finite-value and scale bounds as compound calculations.
- History-access clipping compares instants, preventing timezone spellings from expanding the authorized window. The projection reader uses instant comparisons at midnight and the exclusive upper boundary.
- Reviewed-answer receipts and accepted census objects are defensive snapshots. Mutating the caller's input cannot rewrite an accepted receipt or count.
- Deterministic body-mass drafts defer uncertain/negated measurements and structurally unsafe table names to ordinary reviewed generation.

The shared deadline, correction discovery, episode reader and episode presentation are narrow dependencies outside the 25-file remainder. Factual review, request intent, write authorization and billing remain separate.

## Verification

- Baseline: **1,436/1,436** focused tests passed.
- Final focused suite: **1,446/1,446** passed, zero failed, cancelled or skipped. New regression file: `tests/ask-final-scope-audit.test.mjs`. The initial seven regression cases failed before their fixes. Existing tests were retained; one expected derived-quantity list now explicitly includes the signed percentage as well as its magnitude.
- ESLint and scoped TypeScript covered all 25 remaining files plus four changed dependencies: **29 source files**, zero diagnostics.
- Real disposable PostgreSQL/WASM writer → reader → application callback → saved-answer reload passed 11 scenarios: two episodes/four notes; old decisive evidence behind 26 newer entries; period-relative ordinals; original stool-note meanings; exact-count reload; switched-pet references; 70 notes counted as two episodes; import deduplication; concurrent source mutation invalidation; correction and idempotent replay; soft/hard deletion invalidation. All synthetic owner data was cleaned up. This validates actual SQL and application behavior, not live HTTP, native PostgreSQL concurrency or the old account's unresolved relationships.
- The first SQL harness invocation lacked the test runner's admission fixture and correctly failed `provider_call_without_admission`. Running the unchanged harness under the Node test runner supplied its existing test admission and passed; production admission enforcement was not weakened.

## Release and live verification

Pending final-source deployment and browser checks.

## Rating and remaining limits

A fault-free 10/10 certification is not supported. Exact legacy counts still require trustworthy correction relationships and episode boundaries; plain notes cannot safely be counted as distinct illnesses. General-answer assessment retains unevaluated checks when no independent evidence/calculation verdict exists. Natural-language review remains model-assisted, and bounded historical reads disclose incomplete coverage. These limits are not reclassified as passing tests.
