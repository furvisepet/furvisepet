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

Production deployment and browser verification completed after the follow-up described below. The bounded source fallback remains a limitation when an answer cannot obtain review approval. These targeted structural regressions do not establish an overall 99% score; a separate frozen, unseen production benchmark is required to measure current overall performance.


## Final production follow-up

PR https://github.com/furvisepet/furvisepet/pull/245 also merged. Production is READY at e0e43b95c7fb9f2eb5b06951a022694a09afde89, deployment dpl_FwR3PsxYUfcJdyS1eYP4XHYwPXHv, serving www.furvise.com and furvise.com.

The initial six production checks passed conditional emergency guidance, exact quote preservation, walk-duration arithmetic and unknown intake. Dated recall was erased by downstream mutation-claim governance, and one JSON request failed request-contract validation. These failures are retained, not replaced by successful retries.

The follow-up preserves dated historical recording attribution and generic missing-documentation statements through both route and stored-response governance, with false-write and mixed-mutation regressions. It also discards irrelevant episode ordinals for measurement/duration comparisons and adds safe validation reason codes. The original JSON error did not expose a subcategory, so its exact cause is not proven.

Both production rechecks passed on the final deployment:

- Dated recall retained the September 4 observation of Oscar getting onto the sofa without hesitation, including its recording date.
- JSON returned earlier_kg=2, later_kg=2.5 and difference_kg=0.5 for Milo's carrier.

Final validation: 2,442 full-suite tests, 75 focused shared-pipeline cases, TypeScript, security checks, production dependency audit and hosted builds all pass. Eight production attempts are retained in ask-general-blockers-production-smoke.json. This is four initial passing paths plus two successful rechecks, not an eight-for-eight benchmark.

Database verification: 49 active care records, zero care records changed during production smoke checks; memory and suggestion counts remained 19 and 4.

Production ledger delta: 19 calls, $0.101881. Synthetic provider validation: 75 calls, $0.43858425. This run totals $0.54046525; cumulative tracked testing is $7.895736, leaving $2.104264 of the authorized $10. Cached pricing is conservatively accounted for; infrastructure/subscription charges are not included.

The last full overall benchmark remains 59/100. The fixes are deployed and the identified paths have passing checks; overall accuracy still requires a separate unseen production benchmark.
