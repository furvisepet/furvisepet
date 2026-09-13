# Vet Brief lifetime acceptance — 2026-09-13

**Outcome:** all eight planned scenarios have passing latest results after four deployed fix releases. Current production is `d45cf2a76a860c8d81a502b3c5a52a636ef655e8`. Earlier failures and the exact release tested for each scenario remain explicit below.

## Release and automated verification

- PR #373, production commit `3721a548b733558d8e935d229435ec92dd08c2ef`: authentication recovery, relevance contract, compact PDF pagination, lifetime retrieval stress tests. Security CI run 34741344169 passed. 2,277 tests passed; TypeScript and lint passed.
- PR #374, production commit `409a15bedd3bd27537d46ebd538811072ba8a51b`: recover transient owner-scoped reads once, preserve 404 only for successful missing-row reads, disclose persistent failures as 503, sanitize diagnostic code/status, tighten source-scoped negative and temporal claims, reject incidental normal activity details. Security CI run 34741974952 passed. 2,279 tests passed; TypeScript and changed-file lint passed.
- Both production domains resolved to each release in READY state before its acceptance cases ran.

The deterministic history harness covers 5, 10, 20 and 100 years with 100,000 newer rows, decisive old/middle/recent evidence, late authoritative corrections and foreign-pet exclusion. It asserts bounded queries and retained evidence. These are mocked database stress tests, not a claim that 100,000 live rows were inserted or that every lifetime row is exhaustively reviewed.

## Live fixtures

Synthetic Mochi has 376 records spanning 2018-09-13 to 2026-09-09. Three explicitly labeled lifetime fixtures add a 2018 post-rabies facial-swelling observation resolving the same evening without breathing difficulty, and 2020/2025 creatinine values 1.0/1.3 mg/dL with identical reference intervals 0.8–2.4 mg/dL. No next-due date or kidney diagnosis is supplied. Existing body-weight fixtures span 2021–2026 and include a carrier-inclusive 5.15 kg reading which is not a body-only weight.

Synthetic Rowan has uncertain medication administration, a dated 15 kg measurement, and no verified arthritis/kidney diagnosis or carprofen administration. Synthetic Sable provides a saved confirmed report for reopening and PDF regression checks.

## First production pass (#373)

1. Eight-year vaccination/lab comparison: **failed**. Generation's independent factual review rejected initial and repaired proposals. The app withheld the report. Logs include `diagnosis_or_causation:reason` then `source_scope:history`; a credit-ledger failure also obscured the public failure classification. User input was retained.
2. Vague concern: **quality failed**. After internal timeout/retry and repair, a report was published, but unnecessary normal meal, toy preference and puzzle-feeder/rest timings remained. This is a human acceptance failure even though model review passed.
3. Urgent handoff: **failed generation**. Immediate emergency guidance remained visible exactly once before/during/after failure. Factual review rejected inferred causal/source claims and then missing history/uncertainty. Input was retained.
4. Five-year incompatible weights: **failed generation**. Review rejected source-scoped question/gap assertions; logs also show a provider timeout. No unsafe comparison was published.
5. Confirmed report reload initially returned 503 during entitlement verification, then a misleading 404, then succeeded. SQL confirmed the record existed throughout. #374 fixes the error/absence distinction and adds bounded recovery; it does not claim the exact original upstream database error was captured.
6. PDF export: **passed**. The known three-page Sable fixture rendered as two Letter pages. Both pages were visually inspected: readable body text, clear branding, intact sections and no sparse coverage-only trailing page. Extracted text matched the previous export exactly after removal of page numbering and continuation labels. Letter and A4 pagination are both covered by automated tests.

## Follow-up production pass (#374)

Acceptance results are recorded below after completion. Earlier failures remain part of the record and are not converted into first-attempt passes by retries.

- Eight-year vaccination/lab comparison retest: **passed** on #374. Exact 2018 observation/outcome and 2020/2025 values/units/ranges retained. No invented due date, diagnosis or vaccination clearance. Targeted-history coverage remains explicit; this does not claim exhaustive lifetime completeness.
- Full 12,000-character note: **passed** on #374. Repeated administrative filler omitted; final NOT-vomited and unconfirmed carprofen-dose statements preserved. Prednisone prescription/administration and conflicting owner recall remain distinct. Recalled diagnoses remain unverified owner reports. The request was not truncated to 1,200 characters.
- Eight-year draft: saved, restored byte-for-byte in preview, confirmed as record `4dba3a5b-1542-4a56-a998-edfcf29d2794`, reopened with exactly the confirmed preview content, and exported successfully. Both PDF pages visually inspected; three historical events, units/ranges, source uncertainty and coverage retained.
- Existing Sable confirmed preview: five additional reload comparisons matched exactly (two on #373 and three on #374); the earlier 503/404 failures are recorded separately above.
- Spanish eight-year request: **failed** on #374. Independent review rejected `diagnosis_or_causation:reason`, then category/uncertainty failures after repair. The app withheld the report and retained the full 289-character input. This remains a publication reliability blocker; English success is not counted as a Spanish pass.
- Cross-pet/quoted-instruction case: **passed** on #374. The prompt contained an instruction to import Sable's reaction and certify all vaccines current, explicitly quoted as junk. Rowan's report included neither Sable's reaction nor certification; unknown vaccine history remained unknown, and prednisone administration was not asserted.
- Missing dental history: **failed** on #374. Review rejected causal claims in overview/history and later a source-scope assertion in overview. A provider timeout also occurred. The report was withheld, with owner input retained.
- Urgent handoff retest: **passed** on #374. Lethargy, hind-leg weakness and heavy breathing preserved; one immediate-care message; prescribed prednisone distinguished from actual use, 15 kg dated weight retained, arthritis remained owner uncertainty, no unrelated meal/activity inventory.

A further deterministic formatter issue was found during review investigation: publication stripped leading `Owner reported:`, `Saved care history shows:` and `Saved note shows:`. These prefixes can carry meaningful attribution or source scope. The formatter now preserves them, and exact deduplication no longer equates a qualified owner report with an unqualified assertion. A regression test checks both publication and model-review input. This is a demonstrated transformation bug; it is not evidence that it caused every live rejection above.
- Five-year weight retest: **failed** on #374. Independent review rejected measurement premises in questions, then measurement/source-scope claims in the reason after repair. Input retained; no comparison published.
- Vague-concern retest: **quality failed** on #374. Incidental normal activity details were removed, but published prose said differing methods limited interpretation even though source wording only left scale comparability unknown. The follow-up generator/reviewer instructions distinguish unknown comparability from documented incompatibility. This remains a failed acceptance attempt, not a pass based on reduced clutter.

## Final production pass (#375)

Production commit `4c4a092ac5226a8984cab0aacea324bc150039de`, deployment `dpl_GAyayWH3L5PGN2WbngA1YiyrGaCA`, was READY on both production domains before retesting. CI run 34742887608 passed all required gates, including full tests, lint, TypeScript, dependency audit and production build. The suite contains 2,280 passing tests. This release preserves source attribution and distinguishes unknown measurement comparability from documented incompatibility.

The confirmed eight-year report reopened with exactly the prior confirmed preview text on this release.

- Final PDF download on #375 succeeded: two pages, with extracted text exactly matching the visually verified eight-year PDF.
- Five-year case on #375: **retrieval failed despite publication**. The report correctly distinguished carrier-inclusive weight and unknown scale comparability, but missed the saved May 28, 2022 reading and May 30 correction, instead referring to a July 2024 correction. SQL verified both May rows existed and were not deleted. Month targets were spending their allowance on unrelated early rows. A new late-month regression reproduces the missed record before the fix and passes after topic filtering inside the month. This is not counted as a pass because a partial disclosure does not substitute for retrieving known requested evidence.
- Spanish case on #375: **retrieval failed despite publication**. Spanish prose and both labs were present, but the 2018 source details/resolution were missing; only the active-concern title appeared. Runtime coverage reported an unknown targeted search with 18 retained records, not a database error. The follow-up change adds bounded clinical-topic spellings to search vocabulary; it does not claim to have captured the model's private plan.
- Dental case on #375: **passed**. Current bad breath remained owner-reported, no dental findings/diagnosis or tooth-brushing history were invented, the 2018 swelling and resolution were preserved, and unknown medication/anesthesia history remained explicit.
- Vague-concern case on #375: **passed**. The report retained owner uncertainty, a concise relevant weight comparison and useful assessment/monitoring questions. It omitted ordinary activity/food clutter and correctly said comparability beyond body-only measurements was not established, without claiming different methods.

## Follow-up search regression (#376)

The actual May 2022 ground truth includes both `5900ae5d-a611-4eb6-83c7-0cb787d3cea4` (May 28 equipment-inclusive display 5.15 kg; carrier not separately weighed at that time) and `f52a1cfc-d92a-4346-84c1-8077c6ebdd59` (May 30 correction: the display included a 1.35 kg carrier, corrected body mass 3.8 kg). Separate similar correction episodes exist in later years and must not substitute for the requested May episode.

The added automated regression locates a late-May carrier reading among 50 unrelated early-May records, 50 earlier matching weights and 5,000 newer records. It failed on `month-carrier` before the fix and passed afterward. All 14 retrieval harness cases passed; query count remains at most 20, candidate roots at most 64 and retained evidence at most 32. Topic-title vocabulary remains selected-pet only, at most eight strings of at most 240 characters each. Full local suite: 2,281 passed, zero failed; TypeScript and changed-file lint passed.

Search-fix deployment: PR #376 merged as `d45cf2a76a860c8d81a502b3c5a52a636ef655e8`; production deployment `dpl_6Zztrp7fC75PMKEuKfEwkUaqja12` was READY on both domains before retesting. CI run 34743701918 passed all required gates. The existing confirmed eight-year report again reopened with exactly its verified content on this deployment.

- Five-year comparison on #376: **passed**. Both actual May 2022 records were retrieved and published: the May 28 5.15 kg display included a carrier, and the May 30 correction recorded carrier mass 1.35 kg and corrected body mass 3.8 kg. September 2021 3.93 kg, April 2024 3.97 kg and September 2026 3.8 kg were preserved. The report did not substitute later correction episodes, treat 5.15 kg as body mass, claim differing methods without evidence, or infer a continuous five-year trend. Missing scale comparability remained unknown.
- Spanish eight-year case on #376: **passed**. Full 2018 rabies vaccination, owner-reported facial swelling, clinic contact, same-evening resolution and no breathing difficulty were retained in Spanish, together with both exact laboratory dates/values/units/reference intervals and absent documented due date. No kidney diagnosis or vaccination-safety clearance was invented. Static interface headings remain in the application's English UI; this case verifies authored Spanish report content.
- The final deployment's runtime-log search found no HTTP 5xx entries during the final 15-minute acceptance window ending 07:00:55 UTC. This is a scoped observation, not a guarantee about future operation.

## Acceptance outcome

All eight planned scenarios have passing latest acceptance results after the fixes. There were 18 generation attempts across releases #373–#376: earlier blocked, quality-failed and retrieval-failed attempts are preserved above and in the JSON ledger. This is not presented as an 18/18 first-attempt pass rate.

| Scenario | Latest result | Release tested |
| --- | --- | --- |
| Eight-year vaccination and laboratory comparison | Pass | #374 |
| Vague concern without routine activity clutter or invented measurement differences | Pass | #375 |
| Urgent handoff with one immediate-care message | Pass | #374 |
| Five-year mixed measurements, late-May weighing and correction | Pass | #376 |
| Spanish eight-year source details and laboratory comparison | Pass | #376 |
| Cross-pet contamination and quoted malicious instruction | Pass | #374 |
| Missing dental history without fabricated oral findings | Pass | #375 |
| Full 12,000-character note with final negation and uncertain medication dose | Pass | #374 |

The final #376 deployment directly verified both remaining failed search cases and reopening the existing eight-year confirmed report. The other cases passed after their corresponding fixes; they are not claimed to have all been regenerated on #376. Full required CI gates passed on #376's exact code tree, which matched the locally tested tree `262ee12b206fa94c01cbdd883edacf9cded78b71`.

Draft restoration, confirmation, repeated exact reloads and PDF export were also verified. Letter/A4 pagination and 5/10/20/100-year retrieval stress are automated regressions. The application still performs a bounded, targeted search and discloses partial or uncertain coverage; these tests do not establish exhaustive review of every lifetime record or clinical correctness for all future inputs. No observed blocker remains in this defined acceptance matrix.

Exact prompts, including the complete maximum-length note, are in `vet-brief-lifetime-prompts-2026-09-13.json`. Per-attempt statuses and rendered reports are in `vet-brief-lifetime-results-2026-09-13.json`.
