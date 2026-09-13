# Ask reliability audit — 13 September 2026

The reproduced request, retrieval, arithmetic and retry blockers are fixed and deployed. The evidence supports a monitored beta within Ask's pet-care scope. It does not support an unconditional reliability claim. Vague-concern brevity and the deployment-window navigation observation remain open.

Production: commit `819b608d84fbc6aa3e9afdff3d916b4df78c97dd`, PR #391, deployment `dpl_1YU4xGRz6m5hoDUVQDse4pDFgW7U`. CI run 34765613459 passed lint, TypeScript, security tests, all 2344 tests, dependency audit and production build.

## Measured results

| Check | Result |
|---|---|
| Automated regression suite | 2344 passed; zero failed |
| Latest six affected language/history cases (#389) | 6/6 passed |
| Those six: saved question to saved answer | Median 22.8 s; maximum 36.8 s |
| Those six: reconciled model estimate | $0.190018 total; about 3.17 cents per answer |
| Offline dated-history fixture | Eight years, 5,000 distracting rows |
| Offline SQL scale fixture | 100,000 distracting rows over a century; 61 relevant notes; four pages per direction |
| SQL checks | Eight suites and 15 writer/callback/reload cases passed |
| Century-suite elapsed time | 7.275 s for the suite; not individual query latency |
| Cached-admission repair | 10 PostgreSQL/WASM protection cases passed; 7 eligible live refusals reopened |
| Ask input boundary | Exactly 1,200 characters processed intact; 1,201 visibly retained and blocked before submission |
| Save/correction integrity | Two saved notes; only intended 11→14-minute correction; other note 17 minutes; readback total 31; no duplicates |

Final production checks (#391):
- The old rate-limited French question recovered under the same request ID, returning 3.98 kg, 3.8 kg and −180 g in readable French.
- A fresh second-tab request received a visible 135-second wait estimate and a retryable state. It created no credit reservation during refusal; retry produced one answer and one charge.
- The vague-concern retry returned relevant observations without inventing symptoms or a diagnosis. It remains verbose and asks for profile details; this is a content-quality warning, not a clean editorial pass.
- Arabic arithmetic returned 395 ml removed and correctly left actual drinking uncertain.
- Reopened failed Japanese question (#390) recovered with one user row and one answer. The failed attempt settled at zero credits, the successful attempt at one. Reload preserved the answer.
- Final active care-row count remained 3,789: exactly the original 3,787 plus the two authorized synthetic notes.

The final recovery/Arabic checks completed successfully. Do not combine their retry waits with the six-case latency sample above.

## What changed

- Multilingual date targeting now recognizes ICU-derived month aliases, shared dates, Japanese calendar notation and Arabic/Persian digits.
- Decimal-comma measurements remain whole values. Day-first calendar dates no longer consume following gram quantities; wrong quantities and dates are still rejected.
- Bounded transient reads recover selected connection failures. Missing records and unavailable database reads remain distinct.
- Mandatory correction validation gets time reserved inside the existing five-second Ask history budget.
- Repaired answers can retain calculations only when recomputed against their own existing citations. Review approval remains mandatory.
- Follow-up receipt questions retain the prior owned save and correction references, allowing exact readback without another write.
- Reopened first questions recover their original conversation-origin identity through the ordinary full hash check, with the same logical request and credit identity.
- Temporary concurrency/provider refusal responses remain retryable. A guarded data repair reopens old cached refusals only without a saved answer or incompatible credit work.

PRs #385–#391 carry the changes, diagnostics and regressions. No Vet Brief generation was run in this audit.

## Failure history retained

These were adaptive debugging phases, not independent random samples. Successful retests do not erase earlier failures. The original twelve-case holdout had four passes, three partial results and five failures. The exact prompts, outputs, expected values and per-request timestamps are retained in the companion JSON.

| Release | Phase | Recorded outcomes |
|---|---|---|
| #385 | Original frozen holdout | 4 pass; 3 partial/quality warning; 5 fail |
| #386 | First repair retest | 3 pass; 1 partial/quality warning; 3 fail |
| #387 | Binding and receipt retest | 3 pass; 0 partial/quality warning; 5 fail |
| #388 | Private-audit diagnostics and independent prose holdout | 2 pass; 0 partial/quality warning; 1 fail |
| #389 | Calendar and history-budget fix retest | 6 pass; 0 partial/quality warning; 0 fail |
| #390 | First-turn recovery and discovered cached-admission failure | 1 pass; 0 partial/quality warning; 1 fail |
| #391 | Final cached-refusal recovery, fresh concurrency/retry and Arabic check | 2 pass; 1 partial/quality warning; 0 fail |

Original five-year comparison expectations were corrected after checking the real access policy: on September 13, 2026, the September 9, 2021 record is outside the rolling 60-month Plus window. Correct behavior is to give the accessible 2026 value, explain the older value is unavailable and decline to invent a difference. The accessible November 9, 2021→September 9, 2026 comparison spans four years and ten months.

## Cost and timing limits

All collected audit phases reconciled **$1.504201** across **140 provider calls**, including repairs and unsuccessful earlier attempts. This is approximately **$1.50** of model usage. It is not a provider-balance reading, a steady-state per-question price, or all-in operating cost.

Database timings measure persisted user-message to persisted assistant-message, excluding some admission time and client rendering. Retries of older questions are reported separately; the age of the original saved message is not response latency. Small-sample maximums are not service-level guarantees.

## Launch limits

- This is synthetic owned-data testing, not veterinary expert validation or NASA/research certification.
- PGlite is PostgreSQL/WASM with one connection. It does not establish native PostgreSQL production concurrency or capacity for 10,000 active users.
- The six language examples do not prove every language, dialect, ambiguous decimal convention or phrasing.
- Ask's input allowance is 1,200 characters. Vet Brief's 12,000-character allowance is a separate contract.
- Independent quality review can still return a limited answer when evidence cannot be established.
- Intermittently, first navigation around deployments landed on Today. Repeating the same URL restored Ask; ordinary Ask navigation also worked. No data loss observed. Cause not established; retain as an open rollout observation.

The practical acceptance standard is correct scoped evidence, bounded failure, a recoverable saved question and consistent credits. Unlimited correctness on arbitrary requests is not a supportable claim.
