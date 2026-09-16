# Ask decision ownership

This document describes the current implementation after the September 16 cleanup, not a proposed replacement architecture.

| Decision | Owner | Output / limit |
|---|---|---|
| Interpret the requested task | `interpret-ask.ts` and `ask-request-contract.ts` | Validated request; no permission to execute writes |
| Authorize pet scope and historical access | Route guards and `history-access.ts` | Owned selected-pet and plan-window boundaries |
| Retrieve and assemble evidence | `history-retrieval.ts`, `retrieve-context.ts`, `ask-evidence.ts` | Source-bound records, coverage and losses; no completion verdict |
| Normalize proposed writes | `ask-execution-plan.ts` | Issued, integrity-bound execution plan |
| Order review and final validation | `finalize-ask-answer.ts` | Validation result and whether writes must be suppressed |
| Review historical claims | `review-history-narrative.ts` | Live review capability, bounded repair, independent partial support |
| Review other task obligations | `review-task-completion.ts` | Task checks and readiness; existing history/emergency eligibility retained |
| Derive answer outcome | `answer-assessment.ts` | Complete, limited or failed; bound to body/evidence |
| Execute and confirm requested effects | Ask route and persistence modules | Durable operation receipts; readiness is not execution |
| Derive final task and credit disposition | `task-execution-contract.ts` | Completion requires the answer and requested effects; clarification stays free |
| Settle and deliver | Ask route, credit ledger, admission settlement | Persisted delivery and reconciled accounting; cannot manufacture approval |

## Finalization contract

`run-intelligence.ts` prepares the governed plan and calls one finalizer. It no longer coordinates factual review, validation and task review itself. The finalizer:

1. Verifies that the write plan is an unchanged, server-issued object.
2. Runs historical review under its existing eligibility and budgets.
3. Validates the resulting answer, failing closed on core-invalid output.
4. Runs the existing task-completion review, providing the exact pending plan and the same validator for repairs.
5. Checks plan integrity again, determines write suppression, and transfers the live review capability to the final reasoning object.

The orchestration layer applies suppression to its governed effects; the route still requires the issued plan before persistence. Review readiness never substitutes for a database receipt. Pricing remains in the existing task-execution contract. Admission bookkeeping and delivery are intentionally separate from billing.

The finalizer adds no model calls, changes no model settings, and removes no factual review. Provider adapters in the offline integration harness follow the new boundary so network-disabled end-to-end cases still exercise production code.

## Scope and remaining work

This consolidation removes a concrete orchestration dependency and gives review sequencing and write-plan integrity explicit owners. It does not claim to finish every architectural cleanup, solve Retry failures, or improve the measured 74.8-second historical summary.

Remaining work should use these boundaries rather than add more orchestration branches:

- Separate retrieval operation planning from evidence selection so period coverage and prompt-budget losses are predictable.
- Improve first-draft source attribution and measure stage durations; retain independent review.
- Consolidate receipt-reference resolution with other typed read-reference resolution without expanding write authority.
- Gradually reduce the large HTTP route by extracting persistence/delivery stages only when replay, duplicate-save and settlement integration tests cover the handoff.
- Run the frozen 26-question live suite after behavioral fixes, within a fresh approved API budget. Structural cleanup alone is not launch certification.

## Evidence transport and response recovery checkpoint

Historical writer transport now compacts unrepresented query identity lists while retaining counts, query exhaustion, semantic uncertainty, correction limits, and grouped loss reasons. Full identities and note text remain in the server evidence contract. No compaction feeds eligibility, review, or completion decisions. Counts are added only when identities are omitted, avoiding metadata growth for completely represented small histories.

The offline 48-note/four-year fixture retains 22 complete notes instead of 20 in the same prompt budget (32,733 versus 33,295 serialized input characters). The existing 30-record same-timestamp case retains all 30. This is an evidence-budget improvement, not a measured production latency improvement.

The browser may recover a completed response with an authenticated, uncached GET for the original request and pet after a lost response, server error, or active-request conflict. At most three reads share the original deadline and account identity. The endpoint checks owned conversation/pet scope and only returns a durably COMPLETED response through the existing replay serializer. It cannot generate, execute writes, reserve credits, or reconcile accounting. Missing/incomplete results do not authorize another POST; the original error remains recoverable through the existing UI.

Offline coverage includes wrong-owner/pet isolation, unfinished responses, auth expiry/account changes, cancellation, bounded recovery, unchanged POST count, and history coverage/uncertainty retention. Production first-draft grounding, latency, and the frozen suite remain separate launch gates.

The post-deploy Q7 check returned in 25.526 seconds with three model calls and passed factual/date/calculation checks, but remained limited because the requested period was sampled. Its released credit did not make that limitation visible. The response parser now projects settled `turn.answerOutcome=limited` into a fixed product notice, displayed by the conversation and retained by Copy. This status does not modify reviewed prose, citations, JSON, save authority, or billing. It is derived from completion metadata and also applies to reloaded historical messages; it is not another instruction the model may ignore.
