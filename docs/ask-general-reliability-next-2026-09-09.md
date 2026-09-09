# Ask reliability continuation — September 9, 2026

The previous five-year benchmark remains **163/200 strict passes (81.5%)**. Its dataset contained 1,169 synthetic records. This continuation adds shared fixes on production base `2f301e93ed405ba8e5a6e27e28b48eb25f867845`; it does not replace that score or establish 95%.

## Changes

- Exact dated report requests recover a missing one-day retrieval window. Valid dates, leap days and exclusive upper bounds are checked. Existing planner bounds, comparison requests and open-ended temporal requests retain their scope. The integration regression retrieves the requested report and excludes an unrelated year.
- Explicit CAD, USD, EUR, GBP, AUD, NZD, JPY, CHF and CNY amounts can participate in grounded arithmetic. Each currency is a distinct dimension; mixed-currency calculations and inferred exchange rates are rejected. Source operands must still match, and narrative currency totals require source or verified calculation anchors. Ambiguous currency symbols remain unsupported.
- Explicitly attributed fictional quotations survive generation validation, action-claim filtering and persisted response presentation. Balanced quote spans are protected; surrounding claims still pass through the existing checks. A fictional quote does not grant a verified action receipt. Unattributed and malformed quotations remain subject to the guards.

These changes target shared request parsing, arithmetic validation and speech attribution. No answer lookup or pet-specific benchmark branch was added.

## Verification

- Full `npm test`: 2,466 tests passed, zero failures.
- TypeScript check passed.
- ESLint passed for all changed code and tests.
- Focused regressions cover exact report retrieval, invalid dates, comparison bounds, currency grounding and mismatches, preserved literary dialogue, mixed false mutation claims, and persisted response presentation.

The tests use deterministic providers and synthetic context. They are not new live-model or production browser measurements. Full-suite totals count wrapper tests; the shared-request wrapper runs additional internal scenarios.

## Budget and remaining acceptance

No paid API calls were made in this continuation: **$0 spent from the newly authorized $5**. The current workspace has no OpenAI API credential in its environment or local project env files. The existing five-year production fixture was not reset or modified again.

Next: restore authorized API access, run a separate frozen held-out set and the known-failure regressions, then perform authenticated production route/browser acceptance. Broader cross-period retrieval, illness-episode semantics, multi-step calculations, speaker attribution, evidence-versus-absence distinctions and planner follow-ups still require evaluation. The changes in this PR are not yet a deployed or live-verified improvement claim.
