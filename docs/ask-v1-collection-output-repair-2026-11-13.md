# Ask V1 collection output repair — 2026-11-13 (PST)

Release status: **NO-GO / qualification pending**. This is a source repair checkpoint, not a passing live cohort. Prior passes never transfer to this candidate.

## Observed failures and repairs

The explicit owned-pet unknown-detail failure A04 on 83ae3b9a produced an unnecessary pet clarification. The owner-bound source-free reconciliation and truthful-unknown composition repair on fe23dc55 passed the fresh R17 analogue. Neither that PASS nor earlier routine passes qualify this new head.

Fresh collection case A11 on fe23dc559f2d5a96f299d377ce4df82ad8e8bc47 then failed with ASK_READ_PROVIDER_INCOMPLETE, responseStatus=incomplete and incompleteReason=max_output_tokens. This was **not a timeout**. The initial owner-bound event-date collection search examined 36 distinct candidates across three pages and passed the task-read gate. The final provider request was 56,144 characters (18,715 estimated input tokens); its original usage reported 12,070 input / 2,400 output tokens. The second call completed its failed stage in 9,875 ms, after the 4,723 ms interpretation stage. No model answer was published; the saved user question received an explicit meaningful error. The UI-observation upper bound includes observer delay and is not actual app latency.

Both physical receipts are known: 4,046 + 19,853 = 23,899 microUSD. No new billing uncertainty was introduced. The original old NULL receipt remains unresolved and has not been converted to zero.

The provider wire now uses owner-bound source handles plus inclusive complete-sentence indexes for historical evidence. The server restores the exact original contiguous wording (at most 280 characters) before the existing task, source, clinical and visible-prose validators. Original sentence text, punctuation, whitespace, negation, conditional wording, pet identity and event/recorded provenance remain intact. Unknown/duplicate/profile handles, invalid/reversed/out-of-bounds indexes and overlong excerpts fail closed. The wire does not accept arbitrary legacy excerpt prose as a selector.

Only historyFacts and historySynthesis evidence are projected. Clinical review, occurrence classification, owner-fact selectors, citations, source review and calculation operands retain their existing contracts. Source bodies remain supplied once as original sentence segments. The 32 bodies / 24k source characters, 8 pages / 64 candidates, 2 calls and 2,400 output-token limits are unchanged. Incomplete provider envelopes still fail; no partial JSON is salvaged. Actual reasoning-versus-visible allocation for the failed output was not recovered, so this deterministic serialization reduction is not itself proof that a future model response will fit.

## Verification

- New sentence-selector checks: 8/8 complete, including the actual native provider adapter and incomplete-envelope rejection.
- Focused wire + benchmark gate cohort: 99/99 complete.
- Updated pre-existing wire fixture preserves strict schema/source assertions while accounting for sentence projection.
- git diff --check passed before this checkpoint.
- Broad scoped runs were cancelled, **not green**: one obsolete wire-format fixture was aligned; the subsequent complete run was safely cancelled when the laptop had under 700 MB free RAM. Cancellation exit status is not suite success.
- Source repair needs complete scoped Ask/security checks, standalone TypeScript/lint and exact-head production build verification. Prior fe23 515/515 Ask and 517/517 security passes are inherited evidence only.
- No paid or clinical prompts were submitted after A11. The new candidate's signed-in real cohort remains unverified.
- Fresh R18 (unknown owned detail) and original unused R04 (collection analogue) are frozen with an independent pre-output equivalence review. Original A04/A11 failures remain retained. Candidate additions do not raise the approved 48-turn / 96-call / $2.50 incremental ceilings or the 16 actual reserve-dispatch ceiling.

## Actual live ledger retained before this candidate

| SHA | Fresh turns | PASS | PARTIAL | FAIL | Published answers | Explicit errors | Physical calls | Actual USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 83ae3b9a5c2aa4dfbaece087d8637c08a0393476 | 4 | 3 | 0 | 1 | 4 | 0 | 8 | 0.036905 |
| fe23dc559f2d5a96f299d377ce4df82ad8e8bc47 | 2 | 1 | 0 | 1 | 1 | 1 | 4 | 0.031455 |
| New-session total | 6 | 4 | 0 | 2 | 5 | 1 | 12 | 0.068360 |

Per turn: A01 PASS $0.011165; A02 PASS $0.012466; A03 PASS $0.008310; A04 FAIL $0.004964; R17 PASS $0.007556; A11 FAIL $0.023899. All 12 new physical calls have original actual receipts.

Earlier retained history remains 48 turns, 30 PASS / 9 PARTIAL / 9 FAIL, 96 physical attempts, $0.862480 known plus one old unknown. Combined retained history is 54 turns, 34 PASS / 9 PARTIAL / 11 FAIL, 108 calls, 107 known actual receipts, $0.930840 known plus that same original unknown. Owner credit release/settlement never substitutes for provider billing reconciliation. G explicitly approved proceeding despite only that original unknown with an additional ceiling of 48 turns / 96 calls / $2.50. A new uncertain receipt still stops paid dispatch.

Private immutable prompt/UI/persisted-message/runtime/receipt captures and intent fences remain in evidence/live-1114s. No original failure or cost was erased; no tested prompt was relabeled fresh.

## Remaining release gates and invariants

Freeze an exact READY preview SHA, verify the signed-in owner and owned pets, repeat care/profile/function hashes, and complete the frozen >=30 fresh exact-head cohort with actual receipts before making a functional release claim. The cohort includes actual 32/36 synthesis and missing-four execution, exact quotes/dates, pet/year corrections, labeled arithmetic, historical recurrence scope, vet brief, Today/History guidance, routine constraints through detour and actual reload, and independently reviewed bounded clinical cases. Stop the medical lane immediately on unsafe advice and repair offline before resuming. No final-head clinical qualification or veterinary signoff is claimed.

The shared dirty checkout and Forge PR531 workspaces were not modified. Hosted required CI remains blocked by funding; the unqualified self-hosted runner is not enabled. No protection bypass, production merge/promotion, Supabase write, profile/care mutation or infrastructure upgrade occurred. The PT409 optimistic-concurrency migration/function is preserved. Laptop resource pressure is a separate verification blocker, not a passing test or proof of an app defect.
