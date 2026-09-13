# Ask hardening follow-up — 13 September 2026

PR: https://github.com/furvisepet/furvisepet/pull/392
Tested head: 8c22895683d1b76caab157f78e5fc0f3911540c6

## Changes

Definitive HTTP client/auth refusals now win over ambiguous timeout or transport wording. The read wrapper also preserves a refusal from either inner or outer response metadata, instead of erasing an inner status when outer metadata is absent. Transient reads remain bounded; failures remain explicit and cannot become empty history.

Vague-concern guidance asks for grouped observations, preserves relevant urgency and uncertainty, and avoids asking for known authorized profile facts. It does not truncate responses or weaken publication review. Advice-only guidance is excluded from dedicated history instructions to preserve the existing evidence budget.

## Measured offline results

| Check | Result |
| --- | --- |
| Full local suite | 2,348 passed; zero failures; 41.362 seconds |
| Refusal combinations | 1,200 passed: 100 statuses × 4 misleading error details × 3 metadata placements |
| Transient returned/thrown errors | Six cases, each limited to two attempts |
| Stalled transports | 64 promises settled with deadline errors and aborted signals |
| Shared deadline allocations | 1,000 monotonically decreasing allocations; repair after expiry rejected |
| Type checking | Passed |
| Lint | Zero errors; nine existing warnings |
| Paid model requests in this follow-up | Zero |

The first full run passed 2,347/2,348 tests. Newly added general advice instructions displaced a required record in the ten-pet history fixture. Scoping those instructions to advice paths resolved the failure without increasing budgets or weakening source checks. The final full run passed.

## Limits and initial live-validation state

These are local fault and regression checks, not a production throughput benchmark or proof of database capacity at 10,000 users. They do not certify veterinary accuracy, research suitability, or reliability on every possible request. Previous live results and failures remain recorded in the earlier launch audit; they are not replaced by this offline result.

Before sign-in, the browser session redirected /ask to /login?next=%2Fask. At that stage, authenticated live prompt-quality and navigation checks were pending sign-in. The completed live results are recorded below.

## Release verification

CI run 34785635490 passed lint, TypeScript, focused security tests, full tests, production dependency audit and production build on the exact PR head. PR #392 merged as 34e4fd3c8011c2ec291c82a54b452c3f3a7ef89a; its tree matches the tested head (29ebd93908e9b5e4145a0f6461d4600a5d9f381d). Vercel production deployment dpl_BScPxfCXSJ7ng7fk5Pzn29d7hjdZ is READY and assigned to www.furvise.com. Build time was 67.678 seconds.

No error/fatal log entries were returned for this deployment between 22:11:18 and 22:17:34 UTC. This short, low-traffic scan is not a load test or assurance of future error rates.

## First authenticated check after PR #392

Conversation f8a23a1c-2322-4ecd-af1f-c669d6606ab4 completed with three provider calls and persisted user-to-answer latency of 15.294558 seconds. Estimated reconciled model cost: $0.016616 USD (7,257 + 4,968 + 4,391 microdollars). Browser polling first observed completion after 38.375 seconds; this is an observation upper bound, not server generation latency.

Reload restored the visible conversation text exactly. Today → Ask navigation settled on /ask. No care entries were linked to the user message; mutation outcome was not_requested. The initial general-conversation route contained no authorized saved sources. The response still used a broad six-group symptom inventory and offered to ask for species/age, so its concise-advice quality result is partial, not a pass. PR #393 tightens guidance without introducing selected-profile data into this no-source path.

## Follow-up release gate

PR #393 head 1b5ba46e7c8805613558ffbe89f8f4574cbc2214 passed CI run 34786610375: 160 focused security tests, 2,348 full tests (62.587 seconds), lint (zero errors, nine warnings), TypeScript, dependency audit and production build. Merge d97c04851322031757252fbe4e0f1c254b3303eb has the same tested tree, 9376db06da341aefd7fe9ca593c5e9d94f28bf1c.

The first live request has exactly one completed credit event (attempt 1178cad0-2e87-40b1-b01b-3d42ac5e284b, one credit). Reopening through the Conversations dialog restored the same visible text exactly.

## Final live result and verdict

Production deployment dpl_Fv1NJQaqnQAmsXD9fPHrCWZwcvjv is READY on www.furvise.com at merge d97c04851322031757252fbe4e0f1c254b3303eb. Vercel build time: 65.222 seconds.

The identical vague-concern prompt was submitted in a fresh conversation on the final deployment: 0f2433b7-10bc-4544-8d53-7ec09dfe7a77. It returned two focused paragraphs, retained uncertainty and urgent-action guidance, did not invent past symptoms, and did not ask for species/age or append a generic personalization offer. This passes the targeted response-quality regression, not an independent veterinary validation.

| Final live check | Result |
| --- | --- |
| Persisted user-to-answer latency | 12.420397 seconds |
| Browser first observed completion | 15.582 seconds after send; polling upper bound |
| Provider calls | Three |
| Reconciled estimated model cost | $0.008568 USD |
| Messages | One user and one assistant |
| Credit events | One completed event, one credit |
| Linked care-history entries | Zero |
| Reload | Visible conversation text restored exactly |
| New deployment error/fatal scan | No matching entries, 22:27:05–22:29:09 UTC |

The two live requests in this follow-up cost an estimated $0.025184 USD total, about 2.52 US cents. These are application-reconciled model estimates, not a provider invoice, current API balance, hosting cost or universal cost per Ask. The final call benefited from lower reconciled input cost; one sample cannot establish typical production pricing or latency percentiles.

This pass closes the reproducible refusal-classification bug and the tested vague-concern quality issue. No unresolved failure remained in the final automated suite or the targeted final live case. Confidence is appropriate for a monitored release within Ask's supported pet-care scope. Universal request reliability and NASA/research-grade accuracy are not established. The prior six-language and multi-year evidence remains in the launch audit; this follow-up did not repeat that entire paid live matrix. Real production load capacity at thousands of concurrent users remains unmeasured.
