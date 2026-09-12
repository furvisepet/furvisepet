# Vet Brief value refinement — September 12, 2026

The user's renewed concern was product value and cognitive load. The preceding redesign improved mechanics, but the live weight report still introduced itself as appointment preparation and separated the two comparison values. Sparse generated reports should not imply comprehensive knowledge.

## Implemented

- Evidence-first synopsis, with requested comparison values together and their historical/current scopes preserved.
- Relevant recorded interventions and responses must survive summarization.
- Concise appointment reason, without copying report-generation instructions.
- One or two useful discussion questions instead of filler.
- Shared screen/PDF/print/text presentation strips only three known leading system attribution wrappers from dated entries. Report-level owner attribution and embedded source attribution remain; saved documents do not change.
- Compact document spacing and visual emphasis on the overview.
- Unconfirmed drafts with fewer than two included dated entries explain that history is limited and link to Ask for missing observations. This is a content-count signal, not a clinical completeness score.

## Checks

- TypeScript passed locally.
- 13 focused report tests passed, including negation, dose, embedded attribution, source-document immutability, exact deduplication and section exclusions.
- Five PDF examples regenerated; representative output rendered and inspected.
- PR345 CI and final production acceptance pending at this checkpoint.

## Product limitations

This change does not implement lifetime retrieval, external vet-record import, or clinical validation. Vet Brief still selects bounded history (up to 300 care entries over at most 730 days, plus bounded memories). The report is owner-recorded appointment preparation, not a diagnosis or a complete medical record. Willingness to pay and practitioner usefulness cannot be established by software tests.

## PR345 production result and recovery finding

PR345 passed all CI gates (2,220 tests) and deployed as `737a1cbd4fcb3b161df64b76647e1426670d7a22`, deployment `dpl_3fT5saq9JKEnG3i88cvmDrZjsDo4`.

The first deployed Mochi weight retry FAILED. Both generation attempts were rejected by the independent reviewer; no draft was published and the credit was released. Runtime diagnostics showed only counts of failed criteria, because arrays are deliberately redacted to counts. The repair step received criterion names but no concrete explanation of the failure.

Follow-up: require bounded, private repair instructions from the reviewer and pass them to the existing one-repair sequence. Log only joined server-defined criterion names. Patient-bearing instructions are not logged or published. Global owner attribution is explicitly sufficient; a dated entry need not repeat it. No factual checks are removed and no extra repair calls are added.

PR346 passed CI and deployed as `f28a0a064df75d506dfc54255b632b5735b88592` (`dpl_JA5tgjFUyDpHMLzVqxT4tByuudE3`). The original request retry remained blocked BEFORE generation: admission returned `operation_call_limit` for the already exhausted operation before the existing released-credit classifier could run. This is a recovery ordering defect, not evidence that the new reviewer passed or failed.

Follow-up adds an owner/request/payload-scoped ledger check before provider admission. Only confirmed released events receive the existing fresh-request handshake; completed events remain distinct, unresolved states remain protected, and read failures/identity conflicts fail closed. Provider limits are unchanged. Seven focused credit/request lifecycle checks passed locally; TypeScript passed.

PR347 passed all CI gates (2,223 tests) and deployed as `e7452b65ce457d3576f2784fc6af8a452811a4eb`, deployment `dpl_4EMrQ5T68G62GeugPcx8ifu7HvvA`. The original request in the same browser session recovered to a new request (`972d9de0-4578-41bc-9339-e03136d7ccb6`) and returned a brief. Recovery PASS; content relevance PARTIAL: exact weights and dates survived, but unrelated grooming and household notes remained. The reviewer had rejected duplication once, then accepted the repaired report.

A separate routine Sable control passed on PR346: concise reason, correct 83 g routine feeding, two questions, no invented change, and the new limited-dated-history message. The saved historical Sable PDF also downloaded as one page with exact dates/amounts and owner addition intact.

PR348 clarifies precedence: a specific concern or comparison stays focused even when the owner says routine/checkup; the latest observation must be relevant; repair preserves relevant supported facts, not every true baseline fact. Final deployed content retry pending.

PR348 passed CI and deployed as `03bd9b6624b1b70999209ffb3fb6c0d843f1656c` (`dpl_45BU81mh3azR2YLkF1SqPfdpvwGY`). First live retry failed: generation was rejected for duplication and relevance; after repair relevance passed, but duplication remained. No draft was published and the credit was released.

Publication review finding: reviewer input was the raw document before the shared publication contract applied exclusions and exact deduplication. Its exception allowed synopsis overlap with timeline but did not clearly cover supporting history/profile comparisons. Follow-up supplies the actual publication sections to review and precisely scopes duplication to repeated dated events across supporting sections. Overview-to-evidence links and profile comparisons remain permitted, while all grounding and omission checks remain.
