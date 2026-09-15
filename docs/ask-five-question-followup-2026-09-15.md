# Ask: five-question live follow-up

Authenticated production browser testing on September 15, 2026 (UTC). Five distinct questions, eight total submissions including three retests. All five cases ultimately produced acceptable answers after fixes. This was not five first-attempt passes on one deployment.

## Results

| Question | Initial result | Final live result |
| --- | --- | --- |
| Compare leftover tablet strength with the recorded prednisone dose and ask whether splitting is supported | Incomplete source fallback; repair ended mid-sentence | Pass: dated historical plan, no splitting authorization, prescribing-vet verification guidance |
| Quote the exact planned-start wording and distinguish plan from actual administration | Approved draft blocked by an overly broad full-note reproduction rule | Pass: exact excerpt, September 11 planned start in Vancouver time, no claim of actual administration |
| List July/August local record dates beside food amounts and total them | Pass | Eight paired date/value rows; 280 g total |
| Compare Rowan and Mochi current profiles, preserving null weight | Pass | Species, ages, food and weights match database fields; historical 15 kg not substituted for Rowan's null profile weight |
| Prepare a brief with saved prednisone history, 2024 skin history, today's owner report, three vet questions, no shortcuts or saves | Missed the available prednisone plan and displayed an unwanted shortcut | Pass: dated prescription found, missing skin-note limitation scoped, current report separated, three questions, no shortcut or save card |

The original-tablet question was also retried after the first failure, before the remaining four initial cases. Final case results span the repair, quotation and coordinated-opt-out deployments. The final brief completed in approximately 66 seconds; other successful cases took roughly 13–54 seconds. Times use server completion events rather than delayed browser polling.

## Changes

- PR 454: anchor historical relative instructions to their source's local date in composition, review and repair; pair dated quantities for display.
- PR 455: let a repaired paragraph expand into several bounded paragraphs. Preserve untouched content and citation candidates; independently review the reconstructed answer. Existing overall size/count limits remain.
- PR 456: distinguish exact excerpts from explicitly requested whole-note reproduction. Literal source matching and independent review remain required.
- PR 457: recognize coordinated no-save instructions and preserve per-fact evidence needs in mixed-history questions. Explicitly forbid navigation cards when shortcuts are excluded.
- Final cleanup: prevent duplicate bullet prefixes and update six audit response fixtures to the current repair schema without removing rejection controls.

## Cost and persistence

- Additional API cost this follow-up: **$0.408922**, reconciled across all eight submissions, including failures.
- Taken from the previous authorized $3 testing allowance's $0.902088 remainder. Combined allowance usage: **$2.506834**; **$0.493166** remains.
- All eight saved assistant-message persistence receipts have empty care-entry and memory ID arrays. No care-history writes were made by these questions.
- The original wording forbidding an automatic update still allowed a confirmation-only suggestion card. It performed no write. Explicit no-save wording in the quotation and final brief produced no save card.

## Validation and limits

The shared-contract audit initially exposed seven existing failures, reproduced on the preceding deployment's source: a duplicate bullet prefix and six outdated full-response repair fixtures. After correcting those, all **162 shared-contract cases passed**. Focused repair and evidence-boundary checks and TypeScript also passed.

Browser results were assessed against the saved source records, not merely HTTP status or internal outcome labels. Missing 2024 skin evidence is a valid scoped limitation; an incomplete fallback is a failed case. The tests cover these five scenarios, not universal reliability. Complex history requests remain noticeably slow, and this run does not establish a zero-failure launch guarantee.
