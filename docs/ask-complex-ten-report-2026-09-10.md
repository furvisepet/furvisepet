# Furvise: ten complex production questions

**7/10 full passes (70%), 1 partial, 2 application errors.** This does not meet the 95% target. It is a small designed stress set, not a population reliability estimate.

Executed September 10, 2026 through the authenticated production Ask UI and its existing /api/ask route. Each question received one user submission. No failures were resubmitted; normal internal provider calls are included. Cases 6–8 share a conversation; the others use fresh conversations.

## Frozen conditions

- Questions and criteria committed at `8d1834d` before any submission.
- Production: `ffafa3b21518f72e5204311fa800271fa9e61177` (PR #272).
- Deployment: `dpl_FXsNcK37KRiAjdkkB7ef1yWapjrc`, verified READY and serving www.furvise.com before and after.
- No production code or history changes during execution. No Save/Prepare actions. Normal conversation persistence occurred.
- History before and after: **3,729 records**, fingerprint `a818b7e428832495367e3fafb08e57f7`. Algorithm: `md5(string_agg(row_to_json(e)::text,'' order by id))`, including deleted rows.
- New wording was checked against the previous 100 questions. Some records and scenario families overlap. Novelty across every older run was not exhaustively checked.
- The browser reloaded before the run to load the deployed application; the existing session restored. No submitted question required an authentication retry.

## Results

| Case | Scenario | Grade |
|---:|---|---|
| 1 | Five-year weight change | pass |
| 2 | Different dates and pets | pass |
| 3 | Correction and equipment | pass |
| 4 | Historical uncertainty | pass |
| 5 | Incomplete medication record | pass |
| 6 | Activity percentage | partial |
| 7 | Missing-data follow-up | pass |
| 8 | Third-turn comparison | error |
| 9 | Ten-pet CSV | error |
| 10 | Mixed-currency calculation | pass |

The passing cases correctly handled dated weight changes, distinct dates across pets, carrier corrections, unknown recovery information, missing prescription details, missing activity data, and separate currency totals.

Case 6 is partial under the frozen rubric: correct source values were returned but requested calculations were omitted. It does not count toward the full-pass rate. Cases 8 and 9 displayed explicit errors; neither remained an indefinite silent spinner.

## Failure evidence

- **Case 6 — calculation incomplete:** the answer quoted 31 active minutes and 4 rest minutes, but omitted the combined 35 minutes and 88.6% active proportion. Four provider calls completed. Stored validation marked the response valid after grounding repairs, which does not establish task completion. The exact cause within generation, review, or fallback remains unproven.
- **Case 8 — follow-up error:** HTTP 503, ANSWER_GENERATION, after one successful interpretation call. Logs report multi_subject with candidateCount 10 despite a question referring to two pets. This is a signal to investigate subject resolution and evidence preparation, not a proven root cause.
- **Case 9 — ten-pet export timeout:** HTTP 503, PRIMARY_TIMEOUT. Logs show a successful interpretation followed by a primary-stage timeout, TimeoutError and ABORT_ERR. No CSV answer was returned.

## Cost and telemetry

**27 provider calls; $0.244990 accounted cost.**

| Accounting component | Amount |
|---|---:|
| Reconciled usage from 26 completed calls | $0.211558 |
| Reservation retained for the timed-out call | $0.033432 |
| Total accounted against budget | $0.244990 |

The timed-out call remains in ledger state `started`; its exact final billed cost is unknown. The total includes its reservation and must not be described as fully reconciled provider spend.

Daily calls increased from 449 to 476, and daily accounted cost from $3.005320 to $3.250310. Both deltas equal the per-operation sums. Approximately $3.246828 remains from the previously authorized budget after this accounted amount.

Ten guarded operations: eight user-credit operations completed and two were released. Released user credits do not imply zero provider cost. All ten user messages and eight Furvise answers persisted. Persisted provider-call counts match the ledger for the eight returned answers; error logs also match the remaining cases.

No code changes or additional paid tests were performed during this gate. The earlier 85/100 stress result and 163/200 overnight result remain unchanged and separate. These ten results do not establish that overall accuracy improved.

## Questions submitted

**1. PASS — Juniper**

Compare Juniper's body weight on October 9, 2021 with September 9, 2026. Give the change in grams and the percentage change relative to the older weight, rounded to two decimals. Does that establish why her weight changed?

**2. PASS — Pixel**

Use Pixel's February 9, 2022 body measurement and Juniper's October 9, 2021 measurement. Put both in grams in a table, calculate the difference, and make clear these were not measured on the same day.

**3. PASS — Maple**

For Maple, compare the September 2, 2026 weighing after applying its correction with September 9, 2026. What is the body-weight difference, how much equipment was excluded, and on what date was the correction recorded?

**4. PASS — Nori**

Read Nori's August 19 and August 23, 2024 platform notes together. Who saw the first event, how many calendar days separate the checks, and can we identify the affected leg or exact recovery day?

**5. PASS — Maple**

From Maple's October 9, 2024 records, give her body weight and the recorded medication-course length. Separately list whether the medicine name, dose and reason are recorded. Do not infer the prescription from her weight.

**6. PARTIAL — Pebble**

For Pebble's January 2025 activity record, give active minutes, separate rest and combined duration. What percentage of that recorded session was active, rounded to one decimal? Do not call it a monthly total.

**7. PASS — Pebble**

Now do that same breakdown for Clover in that same month. If a duration is missing, say so rather than borrowing a different month's session.

**8. ERROR — Pebble**

Using just those two pets and that month, can you rank their active minutes? State what is known and what prevents a complete comparison.

**9. ERROR — Atlas**

Return CSV only, with header pet,grams, for all ten pets' body weights recorded on September 9, 2026. Sort the rows alphabetically by pet name and exclude any carrier or parcel weight.

**10. PASS — Mochi**

Fictional shop arithmetic only, no pet-history update: three toy packs cost 12 CAD each, with 25% off the packs and 5 CAD shipping. Two bowls cost 8 USD each, with a 3 USD voucher applied once and 2 USD shipping. Give each currency's final total and its savings versus paying full price with the same shipping; do not combine or convert currencies.


[Full first-return answers, grades and per-case costs](ask-complex-ten-results-2026-09-10.json) · [Pre-submission questions and criteria](ask-complex-ten-frozen-2026-09-10.json)
