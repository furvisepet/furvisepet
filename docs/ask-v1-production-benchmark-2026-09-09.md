# Furvise production benchmark — 2026-09-09

**Strict result: 59/100. Not ready for a broad V1 launch.**

All 100 questions were submitted once through the production Ask UI on commit `ef3bda29e820bd45e212ee87ef114778988b11ef` (PR #242). Deployment `dpl_8q4en6Y6CkfCbwikY3mbU1cTHZyo` was READY and aliased to www.furvise.com before testing. No code, prompts, questions or expected answers were changed during the run.

## Score

| Outcome | Questions |
|---|---:|
| Pass | 59 |
| Partial — counted as failures | 25 |
| Fail | 16 |
| Total first attempts | 100 |

| Category | Strict passes |
|---|---:|
| Older history and access boundaries | 7/10 |
| Chronology | 4/10 |
| Causation and uncertainty | 9/10 |
| Arithmetic and measured objects | 5/10 |
| Structured output | 6/10 |
| Corrections and missing information | 6/10 |
| Cross-pet scope | 4/10 |
| Language and unusual wording | 6/10 |
| Conversation references | 8/10 |
| Limits and safety | 4/10 |

The earlier reported production benchmark was 46/100. This run uses a different, frozen test set and additional history; **59 versus 46 is not a controlled 13-point improvement estimate**. It is not a prediction of accuracy across all possible questions.

Grading was performed manually by the coding assistant against expectations frozen before any production question was submitted. Furvise's own review decisions did not determine grades. This is independent of the app's self-review, but it is not a blinded external evaluation. Partial answers fail the strict score: missing requested facts, invalid formats, unrelated fallback content, unsupported claims and technical failures all matter. Minor awkward language alone does not fail a case.

## What shipped

- A typed recursive JSON value tree, decoded and rendered by the server, with structural limits and source/arithmetic validation.
- One shared request contract through interpretation, retrieval, answer construction and review.
- Effective-plan history windows: free three calendar months; Plus five years. Applied to initial context, historical retrieval, episode references and final generation. Excluded history is retained in storage.
- Named pet subsets cannot be widened by a contradictory account-scope proposal.
- A shared 45-second provider deadline and bounded repair/re-review calls within the existing request budget.
- Final format validation before granting review approval.

Engineering verification: 2,441 offline tests passed, including 65 shared-contract cases; targeted lint, production build and the exact candidate's Security CI passed. These checks did not predict the production answer-quality result.

## Test history and limits

The test account has three pets and effective Plus access through internal QA. Its history contained 49 non-deleted synthetic records, including 12 clearly marked older fixtures added before freezing the test. At the test date:

- 32 records were within the free three-month window.
- 44 records were within the paid five-year window.
- Three 2019 records were too old for either plan.
- Two September 13/14 records were future-dated relative to September 9.
- Accessible older examples reached October 2021.

This is sparse multi-year history, not five years of dense daily usage. Free boundaries were verified through real-provider synthetic-context acceptance and authenticated database filtering; **a separate free-account browser flow was not tested**. Profile/current account information remains distinct from dated history access.

Ten conversation-category questions formed five two-turn conversations. Other questions started new conversations. The pet selector stayed on Milo while explicit pet names tested shared subject routing. This matters for interpreting subject-switch failures.

## Production integrity and cost

- 100 user messages persisted; 99 Furvise responses persisted.
- One visible app error: question 66. It was not retried.
- Zero care entries created or updated during the run.
- Zero new Furvise memories and zero new update suggestions.
- 49 non-deleted care entries remained; one previously deleted entry was already present.
- No excluded 2019 fixture label appeared in the answers.
- 92 turns have usable browser submission-to-capture timing: median **13.4 seconds**, empirical p95 **20.6 seconds**, maximum **25.0 seconds**. This includes browser polling/capture overhead and is not server-only latency. Eight timings are excluded because browser capture was interrupted or premature.

The shared production daily usage ledger increased from 4 calls/$0.019522 to 287 calls/$1.783684: **283 provider calls and $1.764162 ledger increase**. This ledger can include conservative reservations or unrelated concurrent traffic; it is not an invoice-exact attribution. No unbounded retries were run.

This implementation phase also spent an estimated **$0.1301535** across 19 real-provider synthetic acceptance calls. Combined new-phase estimate/ledger increase: **$1.8943155**. Including the previously tracked $5.46095525 gives a conservative tracked total of **$7.35527075**, within the existing $10 testing authorization.

Browser input/capture interruptions were handled without resubmitting questions. Raw records 53–55 retain their premature loading snapshots and separate completion observations of the same first responses. Question 1's answer is in its raw DOM snapshot. Missing timings were not manufactured.

## Architecture issues exposed

These are shared-pipeline issues, not requests for one handler per benchmark question.

1. **Evidence meaning is not reliably validated before arithmetic.** Question 29 asserted 150 mL water intake by subtracting values from different years despite explicit unknown intake/spillage. Question 43 used body weights for a carrier. Operands need validated subject, measured object, quantity, observation occasion and derivation purpose—not just numeric/unit matches.

2. **Required content can disappear between drafting and final presentation.** Questions 3 and 79 returned only “I can help with that.” Other responses omitted an event date, comparison value or requested uncertainty. Question 44 lost a table cell; question 46 displayed two bullet markers inside one paragraph. The final rendered response needs the same completeness contract as the draft.

3. **Temporal and subject scope remain unreliable.** Questions 19 and 90 missed the available September 4 sofa observation. Question 9 answered about unrelated pets. Relative event dates were omitted or conflated with report dates. Question 99 introduced an unsupported exact onset claim inside an otherwise useful summary.

4. **Fallbacks obscure failures.** Long source dumps often replaced direct answers. Unrelated pet fallbacks were appended to otherwise correct answers. A fallback must preserve scope, distinguish unavailable evidence from failed reasoning, and remain useful for the requested task.

5. **Safety and identity clarification are ordered incorrectly in some cases.** Question 96, an explicitly hypothetical breathing emergency, asked which animal was meant instead of explaining that urgent care should not wait for a historical review. Generic emergency guidance must not depend on resolving a pet profile. Questions 53 and 77 also requested unnecessary identity clarification.

6. **Exact quotations are changed by presentation.** Question 78 replaced “Oscar’s” with “his” inside quotation marks. Quoted source text needs to bypass pronoun rewriting.

Do not optimize against these 100 prompts and then relabel a rerun as fresh accuracy. Fix the shared contracts and transformations, verify with different fixtures and failure-class tests, then use a new held-out production set.

## Evidence files

- [Frozen questions and expected answers](ask-v1-benchmark-frozen.json)
- [Older synthetic fixtures](ask-v1-benchmark-older-fixtures.json)
- [Raw first-attempt UI captures](ask-v1-benchmark-raw.json)
- [Question-by-question grading](ask-v1-benchmark-grades.json)
- [Pre-release implementation evidence](ask-v1-typed-release.md)
- [Original six-case synthetic acceptance](ask-typed-v1-acceptance-live.json)
- [Synthetic provider ledger](ask-v1-launch-budget.json)

No new benchmark API calls are required to review these artifacts.

