# Furvise production 15-question result — September 9, 2026

**13/15 passed (86.7%): 2 failures, 0 partial, 0 errors.** First UI submission only for each question; no retries. All 15 answers were observed in the live app. Internal planner/writer repairs count in API spend.

Production was frozen at `f57fc7e61cc10989ce9abe26924134dfa9bffbf0` throughout. Questions and criteria were committed at `a441b3d` before submission. This targeted subset uses unchanged questions from the previous 55-question suite. It is a regression result, not representative reliability evidence.

The same selected questions previously had 7/15 full passes. The original full-suite 41/55 grade and overnight grades remain unchanged.

| # | Question | Before | Now |
| --- | --- | --- | --- |
| 1 | What food is Juniper eating now? | pass | pass |
| 2 | What was Pixel eating back in 2021? | pass | pass |
| 3 | How much did Pixel weigh on September 9, 2023? | pass | pass |
| 4 | When did Atlas go to the vet in 2024? | pass | pass |
| 5 | When did we switch Juniper to the current food? | fail | fail |
| 6 | When did we switch Pixel to the current food? | error | fail |
| 7 | When did we switch Mochi to the current food? | fail | pass |
| 8 | What is the earliest weight you have saved for Ziggy? | error | pass |
| 9 | What is the earliest weight you have saved for Nori? | error | pass |
| 10 | How much does Juniper weigh now? | pass | pass |
| 11 | And Atlas? | pass | pass |
| 12 | Which of those two is heavier? | error | pass |
| 13 | Do we know why Nori hesitated at the low platform? | pass | pass |
| 14 | What medicine was Maple on in that old seven-day course? | fail | pass |
| 15 | Was Mochi's food change because of an allergy? | partial | pass |

## Remaining failures

Juniper and Pixel food-switch questions returned early routine food observations and missed the recorded transitions. Juniper should identify December 9–16, 2023; Pixel July 9–16, 2024. The app returned substantive but incomplete retrieval-based answers, not transport errors. The production failure is not resolved by the current retrieval patch.

Mochi transition dates, both erased-weight cases, the two-pet comparison, the missing-medication question, and the food-change reason all passed in this run.

## Cost and data integrity

Operation-scoped guard telemetry: **$0.503677**, 57 provider calls, all completed, 15 completed credit operations. Daily counters increased by exactly 57 calls and 503,677 microdollars, matching operation telemetry. Database persisted exactly 15 user turns and 15 assistant answers for this run.

All 3,729 history records remained unchanged: before/after fingerprint `4ef19ccd440b5664850fe760565d4729`. No Save or Prepare action was invoked. No code or data edits occurred during measurement.

95%+ has not been established. Stop at the authorized 15 questions; diagnose the remaining transition failures offline before spending on another run.
