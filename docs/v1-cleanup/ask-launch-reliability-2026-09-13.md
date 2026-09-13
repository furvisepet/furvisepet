# Ask launch reliability — 13 September 2026

Status: implementation and local verification complete; CI/deployment and final live acceptance pending.

## Proven defect and fix

Literal dated retrieval recognized English month-first labels but missed day-first English, Spanish, French, German, Arabic and Japanese date labels. A semantic planner could recover some requests, which is why a fresh Spanish baseline passed, but bounded retrieval could miss middle-history evidence when the planner supplied a broad interval.

Use ICU month names and explicit calendar syntax to retain unambiguous literal day/month queries. Shared day/month/year labels, leap dates and Arabic digits are checked. Ambiguous numeric dates remain unparsed. These are retrieval hints, not factual or mutation authority. Existing authorized intervals, query/candidate budgets and independent review remain in force. Exact-day labels no longer also consume a redundant incidental month query.

Regression evidence: the old implementation fails the dense-history reproduction; the new implementation passes. Three application retrieval scenarios bury dated sources eight years apart among 5,000 unrelated rows. Separate unit cases cover all six languages, shared Spanish dates, leap-day rejection, Arabic digits, bounded query allocation and access clipping. These use offline providers and do not establish model quality.

## Verification

- Baseline repository suite: 2,310 passed.
- Final suite count, CI, and live outcomes will be appended after completion.
- TypeScript passed. ESLint: zero errors, nine existing warnings.
- Disposable PostgreSQL/WASM: eight SQL groups passed, including a century-scale fixture with 100,000 unrelated rows and keyset pagination in both directions.
- Real SQL writer → production application callback → saved-answer reload: 15 scenarios passed, including corrections, deletions, import deduplication, cross-pet references and source changes during generation.
- Synthetic SQL fixtures cleaned up: zero users, zero care rows, zero disabled triggers.
- PostgreSQL/WASM checks do not establish native PostgreSQL concurrency or production traffic capacity.

## Current-production baseline

Production 796a33ebe507807578043beac5a623f056e02d19, deployment dpl_4entoyEiowdrjipYFaJ6PwP7hkc9. Four prior failure cases passed first attempt through the app today: multi-pet JSON; Spanish two-date Mochi recall; Rowan breakfast sum/mean; Sable episode start/stop and day differences. These are baseline retests, not the final deployed acceptance score.

Budget: only targeted live calls; no broad model sweep. Provider cost will be reported from usage reconciliation. No guarantee of all possible requests, medical/research certification, or unlimited history coverage is claimed.

## Oversized input handling

Ask retains its existing 1,200-character API allowance. The composer previously accepted larger drafts and then surfaced a misleading empty-message failure. It now displays the allowance, preserves the entire pasted draft, blocks oversized submission before allocating a turn, and gives a clear edit instruction. Direct API clients receive an accurate length error. A regression exercises the actual client submission function: oversized input makes no request or turn; exactly 1,200 characters, including a final no-save instruction, reaches the request unchanged.
