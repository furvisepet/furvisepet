# Furvise Ask production benchmark 2 — 9 September 2026

**64 of 89 executed questions fully correct: 71.9% strict pass rate.** This is a budget-stopped partial run of a frozen 100-question set. There were 17 partial answers, seven failed answers and one technical error. Eleven questions were not submitted; they are neither passes nor failures. The dedicated safety section was not reached, so this result does not establish launch readiness or overall product accuracy.

## Execution and scope

- Production commit: `e0e43b95c7fb9f2eb5b06951a022694a09afde89`; deployment `dpl_FwR3PsxYUfcJdyS1eYP4XHYwPXHv`. Post-run deployment inspection confirmed READY, the same commit and production aliases.
- First submission: 2026-09-09 04:12:17 UTC; final submission: 04:47:46 UTC. Questions 1–89 were submitted once in frozen order through the authenticated production UI. No application code changed during this run.
- New question wording on the same known synthetic three-pet fixtures: 49 active care records, including 44 accessible past records, three excluded older records and two future-dated records. This is not an unseen-user or independent blinded evaluation.
- Effective Plus QA account with a five-year history window. Accessible older fixtures include October 2021 and 2023, alongside May–September 2026 records. This is sparse history, not five years of dense daily data. Free-tier three-month access and unlimited-history behavior were not measured.
- Four complete follow-up pairs ran (81–88); only the first turn of the fifth pair ran (89). Question 90 and all ten dedicated safety questions (91–100) remain untested.
- One browser-tool timeout interrupted collection of question 52. Its already-generated answer was recovered from the existing UI without resubmitting; its elapsed time is unknown. The production error on question 5 remains an error.

## Results

| Category | Executed | Pass | Partial | Fail | Error | Untested | Strict pass rate |
|---|---:|---:|---:|---:|---:|---:|---:|
| retrieval | 10 | 9 | 0 | 0 | 1 | 0 | 90.0% |
| chronology | 10 | 7 | 2 | 1 | 0 | 0 | 70.0% |
| calculations | 10 | 6 | 4 | 0 | 0 | 0 | 60.0% |
| uncertainty | 10 | 7 | 2 | 1 | 0 | 0 | 70.0% |
| formats | 10 | 6 | 4 | 0 | 0 | 0 | 60.0% |
| multi-pet | 10 | 8 | 2 | 0 | 0 | 0 | 80.0% |
| missing | 10 | 8 | 1 | 1 | 0 | 0 | 80.0% |
| robustness | 10 | 7 | 1 | 2 | 0 | 0 | 70.0% |
| followup | 9 | 6 | 1 | 2 | 0 | 1 | 66.7% |
| safety | 0 | 0 | 0 | 0 | 0 | 10 | Not measured |

Partial answers and technical errors count against strict success. The 71.9% figure describes the 89 executed cases only; it is not a 100-question overall score. Because the run stopped in category order, the missing cases are not a random sample. No confidence interval or population-accuracy claim is appropriate.

Two grading decisions are deliberately exposed: question 49 returned a correct uncertainty explanation as a JSON string where the frozen gold expected boolean false, although the question did not explicitly specify its type; question 50 supplied two hyphen-prefixed lines, but the DOM rendered a paragraph rather than a list. Accepting both would produce **66/89 (74.2%)**, which does not change the failure pattern. All other cases are graded on material requested requirements, rather than requiring every contextual detail in the shorthand gold. Question 33 is partial because it calls the reporting person Milo’s sister instead of the owner’s sister.

The previous 59/100 benchmark used different questions before the latest shared-pipeline fixes. These runs do not isolate a controlled improvement of 12.9 percentage points.

## What remains broken in the general pipeline

Primary observed failure classes are assigned once per non-pass in the grades file; underlying causes may overlap. These are output-level findings, not proven internal root causes.

1. **Answer completion and fallback behavior:** 11 source dumps and three generic “I can help with that” responses. Available facts often appear in the dump, but the requested comparison, calculation or bounded conclusion is never delivered. A safe fallback still fails the task when it supplies no usable answer.
2. **Evidence coverage across pets and turns:** three unavailable-evidence responses despite matching saved notes, plus one omitted pet. Luna’s brushing duration was recoverable in other cases but missing in two comparisons. Oscar’s travel-bag record was missed after a pet switch.
3. **Identity continuity and claim routing:** three unnecessary identity questions, including a medication follow-up immediately after Oscar had been identified. Explicitly named pets and quoted claims should reach the same shared subject-resolution contract.
4. **Final output fidelity:** one attribution error and two strict schema/rendering misses. Validate the completed response against the requested facts, subject and output shape, with a clear treatment of ambiguous format requirements.
5. **Technical reliability:** one production turn could not finish. Its underlying server cause was not established in this benchmark.

The next repair should address these shared boundaries across retrieval, composition and final validation. Do not implement branches for these particular question strings. For example, the 500-gram calculation succeeded standalone in question 21 and failed as a follow-up in question 84: a per-question arithmetic patch would not fix the conversation-level inconsistency. Preserve this run as evaluation evidence; any follow-up release needs a separately frozen unseen set and explicit budget coverage for the missing safety and free-tier tests.

## Cost and latency

- Production ledger: $1.885565 / 306 provider calls before the run; $3.755702 / 603 calls afterward.
- Run delta: **$1.870137 and 297 provider calls** for 89 submitted user turns. This is ledger-accounted/reserved provider cost, not a reconciled invoice. The delta assumes no concurrent unrelated provider traffic on this production ledger.
- Previously tracked cumulative testing: $7.895736. Cumulative after this run: **$9.765873 of the authorized $10**, leaving $0.234127.
- Frozen stop rule: stop starting turns once the day ledger reaches $3.75. Question 89 began at $3.738722; after it completed, the ledger was $3.755702, so no further turn was started. The remaining authorization is the reserved margin, not permission to silently change the protocol.
- Successful-response UI capture latency: median **14.398 seconds**, nearest-rank p95 **29.905 seconds**, maximum **45.992 seconds**, across 87 measured answered turns. Excludes the technical error and recovered question 52. These include browser orchestration and polling; they are not pure server inference timings.

## Data integrity and evidence

Post-run authenticated read checks found **49 active care records and zero care records updated since the freeze**, with memory and suggestion counts unchanged at 19 and four. Count stability alone does not prove byte-for-byte immutability of memories or suggestions. No save/review actions were clicked.

- [Frozen questions, expected outcomes and protocol](ask-v1-benchmark2-frozen.json)
- [First-attempt answers and DOM evidence](ask-v1-benchmark2-raw.json)
- [Per-case grades, rationale and metrics](ask-v1-benchmark2-grades.json)

Frozen-file SHA-256: `2a98011b3eb7c4bf78fec66abff2c9950f3aba798ce9a208aeaf1be7b0dcb781`.

The answer text includes the UI’s Furvise and Copy labels; these wrappers are excluded from content and JSON grading. Raw snapshots contain synthetic fixture content and were checked for email addresses, external URLs and UUIDs before committing. The durable result is documentation only; no product code or fixture writes are part of this benchmark-results change.
