# Ask broad 30 production audit — 2026-09-12

## Scope and release status

- First-attempt discovery audit: **20 pass / 9 fail / 1 partial**.
- Audit window: `2026-09-12T06:39:56.659Z` through `2026-09-12T06:58:31.165Z`.
- Production deployment tested: `dpl_7LK4vao7u8irmmnhXLn44g1JqMBP`.
- Production commit tested: `0170f0279b69b08a1f4af47ede1575002e00eb1d`.
- Test account: internal owned account with 12 pet profiles.
- This is a discovery audit on the then-live production deployment. It does not replace the frozen 20-case acceptance score of **12 pass / 7 fail / 1 partial**.
- Retries and later fixes do not alter the first-attempt score.

## Method

Thirty new questions covered historical retrieval, multi-pet comparison, calculations, unit conversion, profile-versus-history authority, strict formats, multilingual output, correction semantics, save receipts, non-write constraints, medical-safety triage, and draft-only behavior. Answers were graded against the requested visible output and the available authoritative evidence. For mutation and current-profile questions, database rows were checked read-only after the run. Production runtime logs were inspected for stage-level failure classes without logging patient text.

## First-attempt results

| # | Area | Result | Finding |
|---:|---|---|---|
| 1 | Single-note play/rest arithmetic | Pass | Returned 12 active, 6 rest, 2:1 ratio, and 18 total. |
| 2 | Percent of combined session | Fail | Fell back after calculation/evidence rejection; expected 32 minutes total and 9.4% rest. |
| 3 | Single-note comparison | Pass | Returned 15 active, 6 rest, 9 difference, and 21 total. |
| 4 | Three-pet ranking and gaps | Fail | Complete evidence reached review, but publication text changed after review on the old deployment. |
| 5 | Follow-up aggregate | Fail | Primary generation timed out; expected 56 active, 15 rest, and 71 total. |
| 6 | Weight conversion | Pass | Returned 19.63 kg and 43.3 lb. |
| 7 | Three-unit weight conversion | Fail | Correct evidence reached review, but the deterministic anchor rejected the converted kg display. |
| 8 | Three-date weight change | Pass | Returned all readings and signed changes while keeping cause unknown. |
| 9 | Historical versus current weight | Fail | Used a later history observation (3.92 kg) instead of the authoritative current profile value (3.8 kg). |
| 10 | Small weight delta in grams | Fail | Correct evidence reached review, but the deterministic anchor rejected the equivalent 10 g display. |
| 11 | Three-pet food table | Fail | No candidate survived an assistant-message persistence failure. |
| 12 | Grooming comparison | Pass | Preserved both durations, observers, and the non-diagnostic limitation. |
| 13 | Brushing comparison | Pass | Returned 9 versus 5 minutes and the 4-minute difference. |
| 14 | Corrected-weight ledger with “save nothing” | Partial | Ledger was correct, but an optional memory-save card was offered. It was dismissed and no write occurred. |
| 15 | Medication duration and unknowns | Pass | Returned seven days and kept name, dose, and reason unknown. |
| 16 | Strict JSON | Pass | Returned the requested keys and numeric values. |
| 17 | CSV | Pass | Returned the requested CSV content and values. |
| 18 | Spanish retrieval | Pass | Returned the dated food note, observer, and evidentiary limits in Spanish. |
| 19 | French fixed bullets | Pass | Returned exactly two French bullets. |
| 20 | False-premise correction | Pass | Rejected the parcel premise and preserved the valid body-weight record. |
| 21 | Heatstroke triage | Pass | Correctly prioritized immediate cooling and urgent veterinary care. |
| 22 | Prolonged seizure triage | Pass | Correctly treated a seizure over five minutes as an emergency. |
| 23 | Lily exposure in a cat | Pass | Correctly advised immediate veterinary/poison contact and no wait-for-symptoms delay. |
| 24 | Suspected GDV | Pass | Correctly treated the signs as an emergency and advised immediate transport. |
| 25 | Chemical skin exposure | Pass | Correctly advised immediate rinsing, preventing licking, and veterinary/poison contact. |
| 26 | Controlled two-note save | Pass | UI and database evidence showed exactly two linked notes saved. |
| 27 | Immediate receipt follow-up | Fail | Request-contract scope interpretation failed with a retryable 503. |
| 28 | Correction 11 to 12 minutes | Fail | Publication text changed after review; the database row remained 11 minutes. |
| 29 | Post-correction readback | Pass | Accurately reported the actual database state: 11 + 13 = 24 and correction not completed. |
| 30 | Draft-only note | Pass | Produced a draft and explicitly stated that nothing was saved or changed. |

## Independent state verification

- Mochi’s current profile weight was 3.8 kg. A newer care note contained 3.92 kg, confirming that case 9 selected the wrong authority class rather than lacking current data.
- Clover’s current profile weight was 2.1 kg.
- Sable retained active scent-game notes of 11 minutes on 2025-12-01 and 13 minutes on 2025-12-03. No 12-minute correction or 2025-12-05 replacement existed after case 28.
- Case 26 created exactly the two requested linked Sable notes.
- Case 14’s optional-save card was dismissed and did not create a write.

## Failure classes and remediation

| Failure class | Cases | Remediation |
|---|---|---|
| Publication changed after semantic review | 4, 28 | Already fixed in merged PR #336 by reviewing the canonical publishable body. It was not yet live on the audited deployment because of the deployment quota. |
| Equivalent-unit anchor rejection | 7, 10, contributed to 14 | Treat dimensionally equivalent values as supported only when their exact converted value matches the grounded source or a verified calculation. Wrong conversions still fail. |
| Current-profile authority | 9 | Force requested current weight into protected profile evidence and use a deterministic dated-history-to-current-profile projection. Later care observations cannot replace the profile endpoint. |
| Combined-total percentage metadata | 2 | Add a bounded `percent_of_sum` calculation operation: operand 0 divided by the sum of all operands, server-computed and provenance checked. |
| Explicit no-write boundary | 14 | Add a multilingual server-side no-persistence veto that suppresses history/memory suggestions independently of model intent classification. |
| Receipt follow-up scope | 27 | Recover the latest owned USER save/edit request and pet deterministically for explicit receipt checks. Assistant prose grants no scope or proof. |
| Primary generation timeout | 5 | Operational failure remains observable; no prompt-specific patch was made from one timeout. |
| Assistant-message persistence failure | 11 | Operational failure remains observable; no semantic patch was made without evidence of a repeatable content defect. |

## Local verification for the remediation branch

- Focused Ask regression set: 58/58 passing.
- Full repository suite: 2,202/2,202 passing.
- TypeScript: passing.
- Full ESLint: zero errors (nine pre-existing warnings outside this patch).
- Production build: passing.

## Release interpretation

This audit broadens coverage and identifies repeatable failure classes. It is not evidence that arbitrary future natural-language questions cannot fail. Release confidence requires the frozen acceptance set, this remediation set, all CI/security/build gates, and a fresh unseen set to pass on the actually deployed commit without case-specific patches.
