# Ask event fallback and review integrity — 2026-09-10

The two-question production retest on e1591710 passed Pixel and failed Juniper. Existing grades remain unchanged. This change has no paid API acceptance run.

## Confirmed defect and changes

A rejected event answer could retain transition evidence in the prompt yet return only the newest profile excerpt. The fallback reapplied the planner's latest-date selection and discarded the requested event. An offline regression reproduced the missing transition dates before the fix and passed afterward.

Shared read fallbacks now rank represented, eligible sources using the original question's event terms before choosing their bounded three-excerpt sample. Chronological presentation follows selection. Earliest-occurrence handling, source eligibility, access limits, correction restrictions, explicit verification failure, and rejection of unsupported model prose remain enforced.

The narrative reviewer previously received a global correction warning without the per-source correction statuses already available to the writer. It now receives source-specific provenance status strings and guidance to keep unresolved-link uncertainty attached to the affected source. This closes an information gap; the exact reason for Juniper's live review rejection was not persisted and is not established by this test.

## Verification

- Full offline suite: 2,474 tests passed, zero failures, with external fetch denied.
- Added regression: forced reviewer rejection retains both transition dates and the recorded non-allergy qualification while discarding rejected model prose.
- Added regression: ordinary and uncertain-correction records retain distinct provenance statuses in the review request; rejected content produces no accepted semantic events.
- TypeScript type check passed.
- Lint: zero errors, 39 warnings.
- Git whitespace check passed.
- No paid provider calls, account history changes, or benchmark regrading.

## Limits

Offline regressions prove the tested evidence and fallback behavior, not model reliability. The 15-question production result remains 13/15; the subsequent two-case retest remains 1/2. These changes do not establish 95% reliability or a successful live Juniper retest.
