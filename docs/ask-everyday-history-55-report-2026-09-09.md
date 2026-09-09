# Furvise everyday pet-history test — September 9, 2026

55 frozen owner-style questions were submitted through the production Ask UI using Furvise's existing provider API. Content grades: **41 pass, 2 partial, 8 fail, 4 error (74.5% full passes)**. This is a targeted regression benchmark, not a general reliability estimate.

**UI evidence limitation:** 54 final outcomes were observed in the browser. The browser transport disconnected during case 55 after submission. Its completed answer was recovered from the saved production conversation and graded partial; its final rendering was not verified. Strict UI-only accounting is 41 pass, 1 partial, 8 fail, 4 error, 1 unverified. No user-level retries were performed. Internal planner/review/repair calls are included in spending.

## What was tested

- Production commit `23a4d1794b8f950bf3af2d64929e742e8f306ce4`, deployment `dpl_Wjf4nSRjnPYR3V2VVLNruTyGupmq`, verified unchanged before and after.
- PR #264's offline architecture changes are **not deployed** and are not measured by this run.
- Ten synthetic profiles, 3,729 history records spanning September 9, 2021 through September 9, 2026. Questions covered the eight dogs/cats; the two rabbits remain represented as Other and were not treated as supported rabbit profiles.
- Questions cover current and old food, earliest and dated weights, annual vet dates, food-transition dates, a multi-pet follow-up, and missing information.
- Year coverage in questions is not a claim that the model received every record. Retrieval limits are part of what was tested.
- Frozen questions and source-based criteria: commit `dd817b5ac4365219212465ad8e45d5b02908a3ef`, [suite](ask-everyday-history-55-valid-fixture-frozen-2026-09-09.json).
- [Full answers, observed UI snapshots, grades and per-case cost](ask-everyday-history-55-results-2026-09-09.json).

## Findings

1. **Food-transition dates: 0/8 full passes.** Seven answers failed to recover saved transition dates; Pixel's question encountered a pre-provider backend error. Routine food observations or the latest profile often displaced the transition event.
2. **Two explicit HTTP 503 errors.** Case 12 failed at persisted-answer idempotency with `BACKEND_UNAVAILABLE`, before admission and with no provider cost. Case 51's simple weight comparison failed with `ASK_REQUEST_CONTRACT_MISSING_SUPPLIED_PREMISE` / `INTERPRETATION_FAILED` after one paid planner call; the app released the user's AI credit.
3. **Two silent answer failures.** Case 27 returned only a weighing-equipment caveat, with no weight/date. Case 33 returned only “I can help with that.” Both lacked the requested substantive answer despite a completed response.
4. **Missing-information handling was mixed.** Pixel's latest vet-medication scope and Nori's unknown mobility cause passed. Maple's old medication question returned unrelated excerpts instead of identifying the deliberately missing drug name/dose/reason. Mochi's allergy question avoided inventing an allergy but missed the recorded preference-change reason.
5. **A rendering defect remains.** Case 20 displayed raw JSON. Its factual content passed the precommitted rubric; this does not make the user experience acceptable. Case 8 contained the correct food in a fallback source excerpt. Case 45 was partial because its correct weight/date excerpt did not establish earliest-saved status.
6. Exact dated weights and annual vet dates each passed 8/8. Current-food facts and recorded 2021 food each passed 8/8, subject to the presentation problems above.

| Question category | Full passes |
|---|---:|
| current food | 8/8 |
| old food | 8/8 |
| earliest weight | 5/8 |
| dated weight | 8/8 |
| dated vet visit | 8/8 |
| food transition | 0/8 |
| current weight | 1/1 |
| followup | 1/1 |
| followup comparison | 0/1 |
| vet note scope | 1/1 |
| missing cause | 1/1 |
| missing medication | 0/1 |
| food change reason | 0/1 |

## Cost and telemetry

Budget: **$2**. Guard-committed cost: **$1.728038**; remaining authorization: **$0.271962**.

- 54 admitted operations; 53 credit-completed, one credit-released. Case 12 was not admitted.
- 200 provider calls in the guard ledger, matching the daily counter delta (1,974 → 2,174).
- 199 reconciled calls total **$1.694606**.
- One call in case 42 remains in `started` state with its **$0.033432** reservation retained. The committed total includes it; this is not presented as an exact final provider invoice.
- Daily guard cost delta: 13,476,061 − 11,748,023 = 1,728,038 microdollars, matching the operation-scoped ledger.
- Persisted answer traces sum to 177 provider calls, excluding the failed turn and undercounting some repair/re-review paths. The report uses the guard ledger's 200 calls. For example case 55 reports four in its saved turn trace but has five completed ledger calls.
- Checked budget in batches, then smaller batches toward the cap. Maximum reservation per operation was five calls × $0.033432 = $0.167160. No new requests were admitted beyond the $2 reserve allowance.

## Fixture correction and history integrity

The original seed used MD5 values cast to UUID without setting UUID version/variant bits. Nine pet IDs failed the app's UUID validator. Two initial UI submissions returned HTTP 400 before any provider calls ($0); those results remain in [the aborted-run record](ask-everyday-history-55-aborted-preprovider-2026-09-09.json).

An identifier-only repair transaction aborted on derived references and changed nothing. The subsequent atomic fixture regeneration corrected IDs and rebuilt derived references. It verified that all 3,729 source records' facts, dates, categories, severity and source metadata remained identical before committing. This happened **before** the measured run, and the unchanged question set was frozen against the new fingerprint.

Measured-run history fingerprint before and after: `4ef19ccd440b5664850fe760565d4729`. No Save/Prepare action was invoked. There were no history changes during the measured run. The fingerprint from before the fixture repair is intentionally not claimed unchanged.

Earlier overnight/200-question and production-24 grades remain separate and unchanged; they used different fixtures and/or versions.

## Case grades

| # | Question | Grade | Basis |
|---:|---|---|---|
| 1 | What food is Juniper eating now? | pass | Required source facts match. |
| 2 | What was Juniper eating back in 2021? | pass | Required source facts match. |
| 3 | What is the earliest weight you have saved for Juniper? | pass | Required source facts match. |
| 4 | How much did Juniper weigh on September 9, 2022? | pass | Required source facts match. |
| 5 | When did Juniper go to the vet in 2022? | pass | Required source facts match. |
| 6 | When did we switch Juniper to the current food? | fail | Missed recorded transition start 2023-12-09 and completion 2023-12-16. |
| 7 | What food is Pixel eating now? | pass | Required source facts match. |
| 8 | What was Pixel eating back in 2021? | pass | Required source facts match. |
| 9 | What is the earliest weight you have saved for Pixel? | pass | Required source facts match. |
| 10 | How much did Pixel weigh on September 9, 2023? | pass | Required source facts match. |
| 11 | When did Pixel go to the vet in 2023? | pass | Required source facts match. |
| 12 | When did we switch Pixel to the current food? | error | HTTP 503 before provider admission: idempotency backend BACKEND_UNAVAILABLE. |
| 13 | What food is Atlas eating now? | pass | Required source facts match. |
| 14 | What was Atlas eating back in 2021? | pass | Required source facts match. |
| 15 | What is the earliest weight you have saved for Atlas? | pass | Required source facts match. |
| 16 | How much did Atlas weigh on September 9, 2024? | pass | Required source facts match. |
| 17 | When did Atlas go to the vet in 2024? | pass | Required source facts match. |
| 18 | When did we switch Atlas to the current food? | fail | Missed transition start 2025-02-09; returned 2021/2022 food checks. |
| 19 | What food is Mochi eating now? | pass | Required source facts match. |
| 20 | What was Mochi eating back in 2021? | pass | Required source facts match. |
| 21 | What is the earliest weight you have saved for Mochi? | pass | Required source facts match. |
| 22 | How much did Mochi weigh on September 9, 2025? | pass | Required source facts match. |
| 23 | When did Mochi go to the vet in 2025? | pass | Required source facts match. |
| 24 | When did we switch Mochi to the current food? | fail | Missed transition start 2023-09-09; substituted a 2025 food observation. |
| 25 | What food is Ziggy eating now? | pass | Required source facts match. |
| 26 | What was Ziggy eating back in 2021? | pass | Required source facts match. |
| 27 | What is the earliest weight you have saved for Ziggy? | error | Displayed only equipment/body-mass caveat; omitted the requested weight and date. |
| 28 | How much did Ziggy weigh on September 9, 2023? | pass | Required source facts match. |
| 29 | When did Ziggy go to the vet in 2026? | pass | Required source facts match. |
| 30 | When did we switch Ziggy to the current food? | fail | Current-food source excerpt did not answer transition date 2024-11-09. |
| 31 | What food is Nori eating now? | pass | Required source facts match. |
| 32 | What was Nori eating back in 2021? | pass | Required source facts match. |
| 33 | What is the earliest weight you have saved for Nori? | error | Displayed only 'I can help with that.' No weight or date. |
| 34 | How much did Nori weigh on September 9, 2024? | pass | Required source facts match. |
| 35 | When did Nori go to the vet in 2022? | pass | Required source facts match. |
| 36 | When did we switch Nori to the current food? | fail | Missed transition start 2023-06-09; returned old food checks. |
| 37 | What food is Maple eating now? | pass | Required source facts match. |
| 38 | What was Maple eating back in 2021? | pass | Required source facts match. |
| 39 | What is the earliest weight you have saved for Maple? | pass | Required source facts match. |
| 40 | How much did Maple weigh on September 9, 2025? | pass | Required source facts match. |
| 41 | When did Maple go to the vet in 2023? | pass | Required source facts match. |
| 42 | When did we switch Maple to the current food? | fail | Latest profile excerpt did not answer transition date 2024-08-09. |
| 43 | What food is Cosmo eating now? | pass | Required source facts match. |
| 44 | What was Cosmo eating back in 2021? | pass | Required source facts match. |
| 45 | What is the earliest weight you have saved for Cosmo? | partial | Correct 6.82 kg / 2021-09-09 source shown, but earliest-saved status not established in answer; incomplete-answer fallback. |
| 46 | How much did Cosmo weigh on September 9, 2023? | pass | Required source facts match. |
| 47 | When did Cosmo go to the vet in 2024? | pass | Required source facts match. |
| 48 | When did we switch Cosmo to the current food? | fail | Old 2021 source excerpts did not answer transition date 2025-03-09. |
| 49 | How much does Juniper weigh now? | pass | Required source facts match. |
| 50 | And Atlas? | pass | Required source facts match. |
| 51 | Which of those two is heavier? | error | HTTP 503 after one paid planner call: ASK_REQUEST_CONTRACT_MISSING_SUPPLIED_PREMISE, INTERPRETATION_FAILED; user credit released. |
| 52 | Does Pixel's last vet note say he was given any medicine? | pass | Required source facts match. |
| 53 | Do we know why Nori hesitated at the low platform? | pass | Required source facts match. |
| 54 | What medicine was Maple on in that old seven-day course? | fail | Unrelated 2021 excerpts; missed the seven-day medication note and did not explicitly say name/dose/reason are absent. |
| 55 | Was Mochi's food change because of an allergy? | partial (server only) | Saved server answer avoided inventing allergy but omitted the recorded preference-change reason. Final browser rendering unverified after transport disconnected. |
