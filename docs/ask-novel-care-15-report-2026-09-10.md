# Furvise live novel-care 15 — September 10, 2026

**12/15 passed (80.0%): 0 partial, 2 failed, 1 error, 0 invalid.** These are first-attempt production results; no question was resubmitted. This small designed care-history sample does not establish general reliability or improvement over differently composed earlier sets.

## Frozen conditions

- Questions and criteria committed and pushed before submission: `68973eb`, branch `codex/ask-novel-care-15`.
- Production commit: `5d9e8149207b79637b710c19378ba6ab449aedbc` (PR #270), deployment `dpl_DtVc3fzCfUaXpmW4GMzGqui1JYSQ`, READY with production aliases.
- Actual Furvise web UI submitted through the existing app API and existing provider setup, authenticated account. No local generation harness or mocked responses.
- Fifteen isolated new conversations across all ten pets. Selected source records span November 2021–April 2026 within the account's five-year history.
- New care topics and date combinations compared against every retained account user message. Deleted earlier conversations cannot be exhaustively checked; “never asked” is verified against retained account history, not unknowable deleted messages.
- Ground truth was read from saved records before submission. Wording-equivalent answers accepted; available evidence called absent is failure. Application errors count against the denominator.
- Start: 2026-09-10T02:39:33.291Z. Last terminal observation: 2026-09-10T02:46:31.957Z. Observation timestamps include polling delay and are not exact server latency.
- No Save or Prepare actions; no pet/history edits or production code changes during the run.

## Outcomes

| # | Pet | Question | Grade |
|---|---|---|---|
| 1 | Juniper | How long was Juniper brushed for in November 2021, and what did Alex notice? | PASS |
| 2 | Pixel | What did Pixel do while the vacuum was running in April 2022? | ERROR |
| 3 | Atlas | Was there more loose fur at Atlas's February 2023 brushing than the time before? | FAIL |
| 4 | Mochi | Did Mochi like the new toy in June 2024? | PASS |
| 5 | Clover | Who brushed Clover in March 2025, and how long did it take? | PASS |
| 6 | Ziggy | Do we know how much water Ziggy drank on December 24, 2021? | PASS |
| 7 | Nori | What did Riley notice about Nori's coat in August 2022? | PASS |
| 8 | Pebble | How did Pebble react to the dropped pan in May 2023? | PASS |
| 9 | Maple | Was Maple's bedding moved somewhere new in February 2024? | PASS |
| 10 | Cosmo | How long was Cosmo's brushing session in July 2025? | PASS |
| 11 | Juniper | Where did Juniper rest when we vacuumed in April 2026? | PASS |
| 12 | Pixel | That 1.2 kg entry for Pixel in September 2023—is that Pixel's weight? | PASS |
| 13 | Atlas | How long did Atlas watch the cardboard tunnel before approaching it in November 2022? | PASS |
| 14 | Clover | What care did we record for Clover's bedding in December 2024? | PASS |
| 15 | Cosmo | Does the January 2026 vacuum note tell us how often Cosmo reacts that way? | FAIL |

## Defects observed

1. **#2 Pixel — explicit error.** “What did Pixel do while the vacuum was running in April 2022?” The UI displayed “Furvise couldn't finish that answer,” offered Try again, and said no AI credit was used. No retry taken. Production logs for the matching logical operation show `ASK_REQUEST_CONTRACT_EPISODE_REFERENCE`, followed by `INTERPRETATION_FAILED`. One successful provider call cost $0.002109 despite the app credit release. This was visible error handling, not a silent indefinite stall.
2. **#3 Atlas — historical retrieval failure.** The answer said the February 2023 brushing note was unavailable and referred to 2025/2026 notes. Saved source `70695eb7-3a90-40ba-8805-4ec3ae3ca31c`, February 18, 2023, says Morgan noted more loose fur than the previous session. The persisted need ledger's candidate IDs omit this source; retrieval is partial with four pages. This establishes missing relevant evidence in the selected candidates, not a complete causal diagnosis.
3. **#15 Cosmo — irrelevant symptom clarification.** The question asked whether the January 2026 vacuum note establishes frequency. The answer instead asked which symptom to count, giving vomiting and soft stool as examples. Ground truth says frequency outside the observation was not established. The exact relevant source `83ba69ea-b689-46b3-8bfc-b2145ca5bab5` is present in represented evidence, so this failure occurred despite retrieval of that note.

The other twelve answers met frozen criteria. Notable uncertainty passes: Clover's note names Sam as observer, not definitively as the brusher; Ziggy's water consumption was unmeasured; Mochi's toy behavior was limited to one observation. Pixel's additional body-weight/correction facts in #12 were separately checked and are accurate.

## Spend and integrity

- **Provider spend: $0.309221**, **46 completed provider calls**, **15 guarded operations**.
- App credits: 14 completed, 1 released. Provider spend includes the released operation.
- Redis per-operation HMAC reconciliation summed all matching provider-call ledger entries. Daily delta agrees exactly: 100 → 146 calls, $0.868219 → $1.177440.
- Additional-spend cap: $1.10; actual $0.309221. No provider calls for fixes or retries.
- Response-level `providerCallCount` for #3 reports 4, whereas the provider ledger records 5. Actual cost/count reporting uses the provider ledger, not that response counter.
- All **3,729 care records unchanged**. Before and after fingerprint: `a818b7e428832495367e3fafb08e57f7`.
- Fingerprint algorithm: PostgreSQL `md5(string_agg(row_to_json(e)::text,'' order by id))` over all account care entries, including any deleted rows. This differs from earlier reports' hashing method; comparisons here use the same before/after method.
- Persisted 29 conversation messages: 15 user messages, 14 Furvise answers. The explicit error is preserved in the UI snapshot and usage record.
- Raw first-attempt DOM observations, saved response payloads, context/coverage ledger, operation identifiers and per-question costs are in the companion results JSON. Original earlier grades remain unchanged.

This result is below the requested 95% target. A new architecture and passing offline tests have not yet produced the required live reliability.
