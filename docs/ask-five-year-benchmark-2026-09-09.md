# Furvise five-year / 200-question benchmark — 2026-09-09

**Strict score: 163/200 (81.5%).** There were 15 partial answers, 17 failures and 5 errors. Partials and errors receive no pass credit. This result does not meet the 95% target.

| Section | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
| Saved history, five-year access | 56 | 80 | 70.0% |
| Free-plan three-month access | 18 | 20 | 90.0% |
| Supplied scenarios and follow-ups | 62 | 70 | 88.6% |
| General, capability, privacy and safety | 27 | 30 | 90.0% |
| Overall | 163 | 200 | 81.5% |

## What was tested
The questions and expected criteria were committed before the first request. The 200 unique questions span 47 categories, including unusual object measurements, multi-pet identities, relatives and relayed observations, corrections, uncertain causation, missing values, dates, multi-turn references, multilingual instructions, structured formats, non-pet requests, privacy and urgent hypothetical scenarios.

The test used the real configured gpt-5.4-mini provider and the application's core interpretation, retrieval, generation, validation and bounded review/repair pipeline. The database adapter was synthetic and in memory. It loaded a source-for-source verified snapshot of the new QA history. This was **not** a production HTTP route or browser benchmark: the authenticated cloud browser was offline. Billing admission was a local bounded adapter, not production billing acceptance. The results do not establish production UX, network latency, authentication or concurrency reliability.

The clock was fixed at September 9, 2026, 12:00 UTC. Free history access was June 9 through September 9, 2026; Plus access covered five years. Profile/current account fields remain current data rather than dated history.

## History replacement
Only the verified test account's Milo, Luna and Oscar history was reset, after a private backup. Other accounts were not targeted. Old pet-related care, suggestions and derived history were cleared; profiles and owner preferences were retained.

The new synthetic dataset contains **1,169 care records**, September 9, 2021 through September 9, 2026: Milo 393, Luna 389 and Oscar 387. It includes monthly background records plus edge cases and corrections. This is five years of synthetic observations, not five years of real patient records or exhaustive daily coverage.

Every seeded record was read back and matched against its generated pet, date, text and category. After testing the count remained 1,169 and the complete care-table fingerprint remained `e4f01af840175bbadff48bdaab0ad521`. Accepted care/memory/event actions were zero in the benchmark runs. The private backup and account identifiers are excluded from this archive.

## Measurement correction
The initial harness assigned history access after context creation and lost it when switching to another pet. Production route inspection showed that production passes the server-derived access window on every context creation. This was a harness defect, not evidence of a production cross-plan leak.

All 20 free-plan questions were rerun after fixing only the harness, with unchanged application code and fixture. The corrected section replaces that invalid measurement section; all original outputs remain archived. Ten direct requests for excluded older records were refused in the corrected run. The boundary also held on the attempted bypass, but its irrelevant-record fallback failed answer quality.

The frozen application was `b68297091830022ae0de26601146d850105554c1`. Fixture and harness commits followed before requests; application code stayed unchanged throughout the 200 attempts and free-window correction. Follow-up application fixes began only after those completed.

## Grading and limits
The implementing assistant reviewed every answer against the frozen criteria and user request. This is not blinded or independent grading. An unrelated source dump does not pass merely because the answer appears somewhere inside it. Incorrect extra claims can make an otherwise correct answer partial.

Case 72 asks for an increase against the earlier baseline without explicitly saying percentage. Its frozen criterion requires percentage; the answer supplied the correct absolute increase. It is graded partial here. Accepting that ambiguity would yield 164/200 (82.0%), still well below 95%.

Case 93 contains two different same-date body-weight records in the fixture. An answer that attributes both is accepted rather than being forced to choose the preferred fixture value. Contextual expected details that the question did not ask for are not mandatory.

This is a deliberately difficult, small synthetic suite. Its aggregate is sensitive to the chosen mix and is not a measured probability of success for all possible user questions. The earlier production 90% and earlier core 91.25% used different questions/data and cannot be treated as like-for-like comparisons.

## Shared changes
Before the frozen benchmark, changes reduced planner reasoning latency, made original user intent explicit for historical generation/review, preserved subscription-window intersections, and removed obsolete clarification hints from recovered reads.

After the frozen benchmark, shared changes:
- Separate quantity and ordering fields from irrelevant episode references.
- Recover unambiguous literal month ranges when the planner omits both bounds.
- Preserve the user's exact standalone task across the read pipeline.
- Review completeness against the original question rather than planner-added obligations.
- Stop calendar years from being mistaken for symptom or medication quantities.
- Give bounded repair explicit diagnostics for unsupported quantities, dates and exact quotes.
- Limit failed-read fallback to three source excerpts per pet with an explicit sample notice.
- Preserve CSV quoting and describe saved-history capability without confusing a conversation turn with a platform limitation.

These are shared pipeline changes. There are no answer lookups keyed to benchmark questions.

## Follow-up confirmation, not a new overall benchmark
At application `9b57bfde0e0420c3ed4eef55f9963c4aa754a19e`, 10 of 13 selected previously failing cases passed. The remaining three still omitted an arithmetic total or fell back after repair.

After preserving original standalone wording at `18eeba6e68ee9dc8c1ec6a088141b7825b40b362`, those three passed: the requested total, the distinction between a bowl drop and intake, and the within-note sneeze count. This 3/3 repetition is diagnostic evidence only. We did not rerun all 200 on that revision and do not claim 95%, 100%, or a new overall score.

TypeScript passed. The full local suite passed 2,462 tests, and the added standalone-task test passed in its wrapper. Deployment/CI evidence is recorded in the adjacent release receipt.

## Remaining launch work
The suite still exposes broader risks: retrieval losing specific dated or cross-period evidence; event counts being confused with illness episodes; multi-step/currency arithmetic; person-versus-pet attribution; converting missing evidence into absence; fictional dialogue being caught by action-claim guards; and brittle planner/follow-up validation. The corrected subset is insufficient to declare those families solved.

A new full holdout and authenticated production end-to-end run are still needed on the final deployed revision. The frozen 200 score must remain unchanged.

## Artifacts
- `ask-five-year-200-frozen.json`: questions and expected criteria.
- `ask-five-year-fixture.json`: synthetic five-year source records.
- `ask-five-year-frozen200.json`: all initial raw attempts, including the invalid free-plan section.
- `ask-five-year-free-window-corrected.json`: all corrected free-plan attempts.
- `ask-five-year-200-grades.json`: every graded answer, reason, attempt source and artifact hashes.
- `ask-five-year-postfix-confirmation.json` and `ask-five-year-authority-confirmation.json`: separate repetitions.
- `ask-five-year-calibration.json`, `ask-five-year-policy-confirmation.json`: pre-freeze calibration.
- `ask-five-year-budget.json`: provider phases, usage, failures and reservations.
- `ask-five-year-reset-receipt.json`: scoped reset and verification receipt.

## API cost

| Phase | Calls | Measured USD |
| --- | ---: | ---: |
| calibration | 32 | 0.170735 |
| policy-confirmation | 5 | 0.030719 |
| frozen200 | 501 | 2.574173 |
| free-window-corrected | 50 | 0.284924 |
| postfix-confirmation | 37 | 0.185060 |
| authority-confirmation | 13 | 0.066042 |

Five-year work measured $3.311653 over 638 calls. Its conservative total including unresolved failure reservations is $3.394049. Across the authorized additional $15, measured spending is $14.200210 and conservative committed spending is $14.373318, leaving $0.626682. Reservations without returned usage are not presented as known billed cost.
