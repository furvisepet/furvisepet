# Furvise fresh 15-question benchmark — September 10, 2026

**15 first attempts completed. This is not a clean 15-case reliability score: two expected answers were outside the current plan's history window.**

Raw frozen grades: 10 pass, 1 partial, 4 fail, 0 error. Two cases (2 and 8) are invalid expectations, retained unchanged for audit. The separately labeled valid subset is **10/13 pass (76.9%), 1 partial, 2 fail, 0 error**. Do not report the invalid cases as newly earned passes.

Questions and criteria were committed at `23d0b7f91435b79c8ec460e1e6f314c0d53b4457` before submission. Production stayed at `b3546f8242dbbbbc2a5a9eed0f8765634044171f`. All answers were observed in the live Ask UI using Furvise's existing provider API. New wording covered ten pets and familiar failure categories, with dated records spanning 2021–2026 and two same-conversation follow-ups. No retries, code edits, Save actions, or Prepare actions during measurement.

## Results

| # | Question | Frozen grade | Audit note |
| --- | --- | --- | --- |
| 1 | Can you remind me when Juniper started and finished changing to lamb-and-oat food? | pass |  |
| 2 | What did Pixel weigh at the very first weigh-in in our history? | fail | Invalid expected date; outside 60-month access |
| 3 | What date was Atlas's 2022 checkup? | pass |  |
| 4 | Can you look up Mochi's weight from 9 September 2025? | pass |  |
| 5 | Was Clover eating the same hay in 2021 as now? | fail | Current orchard hay is recorded; answer failed to retrieve or include the current endpoint. |
| 6 | What's Ziggy's most recent recorded weight? | pass |  |
| 7 | Find Nori's weigh-in for 9 September 2024. | pass | Correct facts; raw JSON displayed |
| 8 | How heavy was Pebble when our records began? | fail | Invalid expected date; outside 60-month access |
| 9 | Why did we move Maple to lamb-and-rice food? | fail | Recorded transition explicitly says owner preference change; answer incorrectly says reason unavailable. |
| 10 | Did Cosmo get any medication at the January 2024 checkup? | pass |  |
| 11 | Tell me Pixel's latest weight in kg. | pass |  |
| 12 | What about Mochi's? | pass |  |
| 13 | How much lighter is Mochi than Pixel? | pass |  |
| 14 | Does that seven-day medication record for Maple include the drug name and dose? | partial | Correct name/dose answer; date omitted |
| 15 | Do the notes tell us exactly when Nori recovered from the platform hesitation in February 2026? | pass |  |

## Benchmark defects and interpretation

I froze September 9, 2021 earliest-weight expectations without checking the moving access boundary. On September 10, 2026, `resolveAskHistoryAccess` sets Plus history access to September 10, 2021 through September 11, 2026 exclusive. The oldest fixture measurements aged out by one day. SQL confirmed that Pixel's October 9 weight of 5.22 kg and Pebble's October 9 weight of 2.98 kg are their earliest accessible measurements. These are setup errors, not demonstrated retrieval defects. Original grades remain in the result file, with invalid-case annotations; there were no replacement submissions.

Case 14's date requirement was also unnecessarily strict: the user asked whether the drug name and dose were recorded, which the answer correctly addressed. The frozen expected facts included the October 9, 2024 record date, so its omission remains a partial. That grading caveat must accompany the aggregate.

The sample is small, deliberately designed, and has substantial category overlap with earlier tests. It does not establish representative reliability, 95% accuracy, or a regression relative to a different 15-question set.

## Actual remaining problems

- Clover: retrieved the 2021 timothy hay but failed to supply the saved current orchard hay, leaving the comparison unanswered.
- Maple: missed the recorded owner preference reason for the food transition and said the reason was unavailable.
- Nori: returned a correct dated weight as raw JSON, a separate presentation defect.

The live Juniper transition question passed with both dates. Pixel-to-Mochi follow-up and weight subtraction passed. Nori's recovery answer correctly distinguished a later normal observation from an unknown exact recovery date. Case 13 recovered internally from a planner contract issue and completed correctly; all provider calls are included in spend.

## Cost and integrity

Exactly **$0.465831**, 54 completed provider calls, 15 completed guarded operations. Operation-scoped telemetry matches the daily increase from 10 to 64 calls and 90,671 to 556,502 microdollars. Persisted records contain 15 user turns and 15 assistant answers. No blank responses or app errors were observed.

All 3,729 history records stayed unchanged, with fingerprint `4ef19ccd440b5664850fe760565d4729` before and after. Production deployment was unchanged. All earlier benchmark grades remain unchanged. Stop at the authorized 15 submissions.
