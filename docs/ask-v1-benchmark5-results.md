# Furvise production benchmark 5 — September 9, 2026

**110/120 strict passes (91.7%), up from 107/120 (89.2%). The 90% target is met on this known regression set.**

The first 100 questions passed 93/100; the former fresh 20 passed 17/20. Those 20 are now known regression questions, not an unseen holdout. All questions and grading rules were frozen before the run. Partial answers, source fallbacks and request errors count as non-passes. All first attempts are preserved; no code changes or replacement retries occurred during evaluation.

Production commit: `623a424073269f448b663ad1edf574477f277db4` ([shared fixes, PR250](https://github.com/furvisepet/furvisepet/pull/250)). The shared pipeline now preserves relevance when ordering history, reuses unused retrieval capacity, accepts equivalent dimensional units, supplies grounded arithmetic feedback to review, and preserves supported historical explanations through final display filtering. Planner/reviewer reasoning and review output capacity were adjusted within the existing operation limits. No question-specific answer branch was added.

This is one run on a known synthetic fixture: 49 active care entries, 44 accessible past entries, three excluded older entries and two future entries. The account has effective Plus five-year access. This does not establish 91.7% accuracy on all real users, dense five-year histories, or free-tier production UI. Model variance remains visible: 11 previous non-passes became passes and 8 previous passes regressed. No confidence claim for an unseen population is made.

## Results by category

| Category | Strict passes |
|---|---:|
| safety | 11/12 |
| retrieval | 11/12 |
| chronology | 11/12 |
| calculations | 12/12 |
| uncertainty | 10/12 |
| formats | 11/12 |
| multi pet | 11/12 |
| access missing | 11/12 |
| robustness | 10/12 |
| followup | 12/12 |

## All non-passes

| Question | Grade | Reason |
|---|---|---|
| 13 | fail | Incorrectly says the recorded post-reversal scent is unavailable. |
| 36 | partial | Preserves uncertainty but calls the owner’s sister his sister, misattributing the reporter. |
| 38 | error | Production request did not finish. |
| 54 | fail | Source fallback does not answer the as-of sofa question. |
| 56 | error | Production request did not finish. |
| 61 | fail | Source fallback does not answer whether the pets are medically cleared. |
| 89 | partial | Gives July 10 room and scent but omits July 5 room and scent. |
| 106 | fail | Source fallback fails the nested JSON weights request; Oscar body weight missing. |
| 108 | fail | Incorrectly places May 2021 inside a window beginning September 2021. |
| 120 | fail | Source fallback does not answer the allergy question in Spanish. |

The ten non-passes comprise 6 failures, 2 partial answers and 2 request errors. Remaining weaknesses include retrieval/completion reliability, reporter attribution, comparison coverage, date-window explanations, and structured or multilingual output. The medically-cleared question failed to provide an answer; the 91.7% result is not a blanket safety certification.

Grading disclosures: Q65 now explicitly says remaining water alone cannot establish drinking volume and makes no missing-volume calculation or upper-bound claim; its final wording remains imprecise. Q66 retains the prior source-author wording flag. Q23 uses the recurrence report date under the clarification frozen before both repeats. Bullet/table layout was checked using saved DOM. No rubric was loosened to reach 90%.

## Cost and verification

The final 120-question rerun used 356 provider calls and **$2.379187**. Total additional spending, including earlier production evaluations and all direct diagnostics, was **$7.659678 of the $10 allowance**; $2.340322 remains. Production ledger delta is measured from the turn baseline of $3.755702 to $9.969125, plus $1.446255 direct diagnostics. No further paid tests were started after this run.

Median response latency: 17.35 seconds; p95: 29.63 seconds, including request errors. The released code passed 2,446 local tests, 99 focused checks, TypeScript, targeted lint and GitHub CI. Production deployment readiness and aliases were verified before the first question. After all 120 questions, care-history, memory and suggestion content digests exactly matched the baseline. Chat conversations were saved normally.

Frozen questions, full UI captures, item-level grades and real-provider diagnostic records accompany this report. Earlier failed benchmarks remain archived separately and have not been replaced.
