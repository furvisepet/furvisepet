# Ask reliability repairs — September 9, 2026

The latest measured everyday run remains **41/55 (74.5%)**. The original overnight benchmark remains 163/200 (81.5%); its separately reported rerun remains 175/200 (87.5%). Existing questions and grades were not edited. This patch does not establish 95% reliability.

This branch includes the previously unpublished production fixes from PR #264, then repairs the everyday run's shared failure paths:

| Path | Repair |
| --- | --- |
| History retrieval | Give event aliases separate searches within the existing four-page/64-candidate budget, so routine food and weight records cannot fill every search before an older transition is considered. Preserve pet ownership, history access clipping and chronological direction. |
| Planner | Explicitly distinguish a historical change from current status. Repair missing-premise contracts once; follow-up comparisons retrieve saved measurements again instead of treating prior assistant prose as evidence. |
| Presentation | Recognize historical measurement relative clauses without allowing affirmative unverified writes. Check the rendered answer, including the reload sanitizer, for empty placeholders and loss of numerical facts or all uncertainty. A failed check takes the explicit error/credit-release path. |
| Prose generation | Decode the narrow answer/note JSON envelope before source review; preserve both text fields and source identifiers. |
| Admission | Retry only transient idempotency-claim failures once with the same key and payload and a bounded deadline. Never bypass an ambiguous existing lease. |
| Provider lifecycle (PR #264) | Shared hard deadlines settle planner, writer, review and repair even when the provider ignores cancellation. |

Verification used no paid model calls. External fetch was blocked during offline tests; local mock servers were permitted. No production pets, history or conversations were changed.

- Full offline suite: 2,474 top-level tests passed, zero failures; shared-contract wrapper also ran 122 internal cases.
- Final targeted integrity tests and TypeScript passed after extending the check to conversation reloads.
- Lint: zero errors, 39 existing warnings. Whitespace check clean.
- Added retrieval fixtures place rare transition/discontinuation events behind 120 newer routine records, using different pet names and dates from the benchmark.
- Tests preserve historical measurements through the real persisted-response sanitizer and keep unverified mutation claims blocked.

Remaining validation: deploy the reviewed commit and run the same frozen questions once, grading new results separately. Offline tests demonstrate these mechanisms, not model answer accuracy. Numerical preservation is not a substitute for source/subject/unit validation, and the uncertainty invariant catches loss of all uncertainty rather than proving every requested limitation was answered. Other completeness or retrieval failures may remain.
