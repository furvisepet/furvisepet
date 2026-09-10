# Fifteen complex production questions — first attempt

**Result: 6/15 pass (40%), 3 partial, 3 fail, 3 error. This does not meet the reliability goal.**

Production PR #273, commit 4e60c868e36d6ba9237cef589c500cdd54d36181, deployment dpl_7ABKF5BMwgJ52ivvhkCagtTMTAf4. Questions and criteria frozen in 0b60dec before the first submission. All questions used the signed-in app and its existing /api/ask endpoint. No external retries or production changes during the run. Internal guarded repairs are counted.

## Results

| Case | Grade | Finding |
|---|---|---|
| 1 | partial | Activity and rest reached excerpts, but combined duration and percentage were not verified or answered. |
| 2 | partial | Clover scope was retained, but the answer omitted the requested total and percentage. |
| 3 | error | Planner failed with ASK_REQUEST_CONTRACT_REFERENCE before subject resolution; no answer. |
| 4 | error | CSV did not take the deterministic path; primary generation succeeded, review rejected, repair timed out, and delivery ended at assistant_persistence. |
| 5 | fail | Published fallback showed unrelated 2026 samples and omitted the requested 2021/2026 comparison and calculations. |
| 6 | fail | Published fallback omitted the March 9, 2022 weights, requested table and gram difference. |
| 7 | pass | Correct display, body mass, correction date and 9.6% carrier share. |
| 8 | partial | Excerpts preserved the mobility observations and uncertainty but declined the requested completed summary/calculation. |
| 9 | pass | Distinguished parcel from pet weight and returned 3.82 kg on March 9, 2022. |
| 10 | fail | Published fallback omitted both activity sessions and all requested totals and differences. |
| 11 | pass | Correct food, observer, eating and grooming observations; did not infer allergy or food causation. |
| 12 | pass | Correct independent 10-day/4.80 CAD and 14-day/1.50 USD calculations. |
| 13 | pass | Correctly attributed headache to Jamie and explicitly marked Vale's health status unknown. |
| 14 | pass | Correct weight and seven-day course; name, dose and reason missing. Extra July correction was independently verified. |
| 15 | error | Interpretation provider timed out at 25,010 ms; no cohort ranking answer. |

## Accounting and integrity

15 guarded operations, 43 provider calls. Accounted cost $0.459495: $0.325767 reconciled completed calls plus $0.133728 retained reservations for four calls still marked started. The reservations are not confirmed billed spend. The daily guard changed from 476 calls/$3.250310 to 519 calls/$3.709805, matching this run exactly. User credit settlement: 12 completed, 3 released.

History remained 3,729 records, fingerprint a818b7e428832495367e3fafb08e57f7. No Save or Prepare actions. Conversation messages from submissions are expected.

## What the run establishes

The new completion assessment correctly distinguishes incomplete shared-history fallbacks from complete answers. It does not make those incomplete answers accurate or successful. General supplied-context cases 12 and 13 passed the frozen human criteria despite conservative internal assessments; benchmark grades are not copied from valid/outcome flags.

Case 3 failed reference validation before subject resolution, so the new scope reducer was never reached. Case 4 still invoked primary generation, so the deterministic projection did not handle that live request; independent review rejected it and its repair timed out. Case 15 timed out during interpretation, not primary generation. Exact reasons for the projection decline and semantic rejections require further offline investigation.

The run includes explicit UI errors rather than invisible indefinite stalls, but three missing answers are still product failures. Six fallback answers were published with explicit limitations. No unsupported final health claim was found in this sample.

Previous grades remain unchanged: the earlier ten-question run was 7/10; the 100-question run was 85/100; the overnight run was 163/200. These sets differ and are not controlled before/after comparisons. This fifteen-question set is a targeted stress gate, not evidence of 95–100% reliability.
