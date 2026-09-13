# Ask comparison, event retrieval, and output integrity — 2026-09-10

The fresh 15-question run exposed two valid factual failures: a past/current comparison omitted current evidence, and an explanation omitted a recorded transition reason. A correct dated weight also appeared as raw JSON. Two earliest-weight expectations in that benchmark were invalid because their records had aged outside Plus's rolling 60-month window; those are not retrieval defects addressed here.

## Shared changes

- `literal-history-window.ts` identifies explicit past-versus-present comparison obligations. `ask-request-contract.ts` prevents a planner's single historical range from removing the present endpoint. The resulting authorized read still passes through subscription clipping. As-of, exclusion, and explicitly restricted requests remain guarded.
- `history-query-relevance.ts` recognizes moving to another routine/item as a transition search hint. It supplies no factual conclusions or mutation authority.
- `history-retrieval.ts` keeps event searches independent of summary/comparison labels and preserves event relevance through evidence budgets. The context allocation includes recent records for endpoint comparisons. Candidate, page, record, character, pet, graph, and time budgets are unchanged.
- `historical-read-response.ts` defaults unspecified output containers to prose and rejects standalone serialized JSON as prose. Explicit JSON remains supported. The existing bounded writer-repair and independent review path can repair a format-invalid draft; no new retry loop or provider-call allowance was added.

## Evidence

Three focused regressions failed before the code changes and passed afterward: a narrowed past/present comparison, transition-reason retrieval among routine records under three planner selections, and unsolicited JSON acceptance. Reproductions use different names, dates, and a bedding topic rather than live benchmark answer fixtures.

Two additional controls verify that recovered temporal coverage cannot bypass plan access/as-of boundaries, and that unsolicited JSON is repaired once and independently re-reviewed before publication. An older output-format fixture now explicitly supplies its requested format; its exact output-preservation assertion remains.

Full offline suite: **2,474 tests passed, zero failures**, including the 130-case shared-request subprocess suite. External fetch was denied during the run. TypeScript passed. Lint has zero errors and 39 warnings. Whitespace check passed.

## Limits

No paid API calls or account-history changes were made. Existing benchmark grades are unchanged. The live failures' complete planner/writer/reviewer inputs were not retained in the inspected metadata, so the offline reproductions establish shared code defects, not an exact reconstruction of every live internal step. This change does not prove 95% reliability or replace a fresh live acceptance run.
