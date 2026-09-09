# Ask shared blocker repair — 2026-09-09

PR: https://github.com/furvisepet/furvisepet/pull/244

The last full production benchmark remains **59/100**. This repair validation is not a replacement benchmark or a claim of launch readiness.

## Changes

- Preserve the complete reviewed answer through final rendering, including quotations, qualifications, JSON and tables. Shared review may approve the whole answer or request one bounded repair; it cannot silently drop invalid clauses.
- Prioritize matching records before unrelated period context inside the existing retrieval and prompt budgets. No wider history access or extra database scanning budget.
- Recover an explicitly named owned pet from an unnecessary planner clarification without granting write authority.
- Treat “as of” as an upper-bound lookup; distinguish its inclusive display date from the exclusive storage bound.
- Validate minute/second arithmetic, equivalent grammatical forms and exact source phrases containing one unambiguous measurement. Reject partial numeric tokens, incompatible units and ambiguous multi-measurement operands.
- Ask both writer and reviewer to verify measured entity, object, quantity and occasion. Arithmetic is deterministic; semantic attribution remains model-assisted, not a proof.
- Give conditional emergency guidance before identity clarification while retaining the separate current-emergency route.

## Verification

- 2,441 automated tests pass on the final code; 74 focused shared-pipeline checks pass.
- Production build passed after the evidence-ranking/date fixes. Final measurement-span change also passed full tests and TypeScript; hosted build must pass before release.
- Real provider: gpt-5.4-mini; synthetic database; final conversation renderer exercised; 36 records for the three-month fixture and 186 for the five-year fixture.
- Initial 10 development cases exposed duration validation, inclusive query-date anchors and long-history relevance budgeting. All first attempts are retained.
- Second 10-case verification: 9/10 answered the requested task; one duration case fell back. This repeats categories and some questions, so it is regression validation, not unseen overall accuracy.
- Final two duration checks used new values (8 and 23 minutes) and wording. Both returned the correct 15-minute difference through final rendering.
- All 22 synthetic turns produced zero accepted care actions, memories or semantic events.
- 75 provider calls, conservatively measured at $0.43858425. Cumulative tracked testing is $7.793855 against the existing $10 authorization, before post-deployment smoke checks.

## Evidence and limits

Raw outputs, review inputs and the call ledger are retained in the adjacent ask-typed-general-blockers*-live.json and ask-general-blockers-budget.json files. Do not overwrite these first attempts.

Production deployment and browser smoke checks are pending at the time this report was committed. The bounded source fallback remains a limitation when an answer cannot obtain review approval. These targeted structural regressions do not establish an overall 99% score; a separate frozen, unseen production benchmark is required to measure current overall performance.
