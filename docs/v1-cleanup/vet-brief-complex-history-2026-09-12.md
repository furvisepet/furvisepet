# Vet Brief complex-history repair — 2026-09-12

## Trigger and actual production evidence

User supplied a failed Rowan request combining current lethargy, hind-leg weakness, heavy breathing, a five-year osteoarthritis/blood-work review and a prednisone taper said to have ended yesterday. Production diagnostics contained both incomplete output and compatibility validation failures. No patient text was logged by the new diagnostics.

Owner-scoped inspection of the internal synthetic Rowan account found 20 active care records, February 2024–September 2026. No five-year arthritis or blood-work series was present in those care records. A September 11 medication note describes a course starting tomorrow: 2.5 mg twice daily for five days, then 1.25 mg once daily for five days. This conflicts with the new owner statement that the course ended yesterday. Acceptance must preserve both sources and ask the clinician to reconcile the dates, not invent the requested trend or causal explanation.

## Architecture changes

- An appointment evidence plan identifies up to three distinct topics and an appropriate historical period. Explicit long-history requests and clinically relevant vaccination/background records can reach beyond the selected recent dates. Date input permits a century-scale range; source/page/time budgets remain bounded.
- Vet Brief uses the existing owner-scoped historical candidate and correction RPCs, with separate topic searches and reserved recent-record coverage. Corrected effective records are the only care records supplied to synthesis; raw originals cannot be appended as fallback.
- Generation and independent review receive the same evidence bundle. Current owner reports, saved records, background notes and coverage uncertainty remain distinct. The hidden 20-record serialization cutoff is removed from this route.
- The model generates prose fields and source references only. The server assembles profile identity, version, dates, title, settings and disclaimer. It no longer rejects otherwise useful prose because the model recopied immutable metadata differently.
- One bounded structural retry can handle incomplete/invalid output. The existing one semantic repair plus independent re-review remains. Maximum provider calls changes from four to six: planning, generation, review, repair/re-review, and at most one structural retry. All calls remain within the same metered operation and daily limits. Generation gets 12,288 output tokens; route/lease windows are 240/255/270 seconds. No new model or pricing is introduced.
- Immediate symptom guidance renders before generation and survives a preparation error. Historical/hypothetical/negated symptoms are scoped out. The report preserves urgency separately from optional detail sections.
- Corrected claim source references are verified using the existing authenticated correction RPC and retained when saving confirmed documents, including subsequent versions. No table privilege expansion or schema migration.

## Verification

- Initial new contract, urgent-scope and existing publication tests: 30 passed.
- Actual retrieval integration: vaccination evidence from 2001, laboratory evidence from 2014 and a recent taper survive among 5,000 routine records. Cross-pet evidence excluded; changed source withheld; correction-transport failure produces explicit gaps rather than unverified fallback. Three integration cases passed.
- Full suite before final provenance addition: 2,239 passed, zero failed. Updated obsolete static expectations for deliberate range, provider-budget and immediate-guidance changes; brand token violation was fixed in implementation.
- Final provenance checks pass: owner/pet-scoped RPC, malformed/foreign IDs rejected, unavailable verification fails saving safely.
- TypeScript passed before final provenance addition; final CI pending.

## Frozen live acceptance set (not yet run on this patch)

1. Exact Rowan complex request: current symptoms, immediate-care notice, conflicting taper dates and unavailable arthritis/lab history; no invented cause or five-year completeness claim.
2. Rowan vaccination appointment: recorded medication timing and unknown vaccine/reaction records; no invented schedule or clearance.
3. Mochi April 2024 weight comparison: historical measurement versus profile value; exclude unrelated diary entries.
4. Mochi April 2024 coat-care purpose: select brushing observation; no invented skin diagnosis.
5. Synthetic complex history with documented values and intervention response: preserve exact dates/doses/units and relevant negatives across topics.
6. Confirm, reload and export a complex brief: identical clinical content and retained source references, readable page breaks.

The browser session reset and is signed out. Production live acceptance is pending reconnection; local tests do not establish model performance or practitioner usefulness. Earlier Ask and Vet Brief first-attempt failures remain unchanged. This work does not import external records, certify complete lifetime retrieval, diagnose causes, or establish willingness to pay.

## PR352 deployed result and follow-up

PR352 passed every CI gate and deployed as ddb261b5ace3dfd0e7c5f3d4c3e0744d56a15043 (dpl_7JvjDg8y1x71ZHCfeV6ho8RCF1XX). Internal browser sign-in was restored through secure Google authentication.

Exact Rowan retry FAILED: both reviews rejected noDuplication, while the other six criteria passed. Request 60a698cb-c515-4140-b210-93ea9b0bf264; credit released. Immediate-care guidance was visible before generation and remained visible after failure. This is not a content acceptance pass.

Follow-up replaces parallel generated detail arrays with one canonical event list, each event assigned one section by the server. Duplication verdicts must cite valid same-date item locations in two actual supporting sections; overview/profile/question repetitions or nonexistent locations cannot veto the report. Grounding, omission, uncertainty, category, relevance and question checks remain independent and unchanged; no clinical text is deleted to satisfy a duplicate verdict.

During richer synthetic fixture setup, the Today native datetime input displayed a historical selection but saved its previous current-time state. This is the same native-input event synchronization class previously fixed on Vet Brief dates. Both Today and the shared care-entry editor now synchronize on input as well as change. One synthetic Sable lab note needs its timestamp corrected through the editor after deployment; its text already states the actual intended June 1, 2023 observation date.

## PR353 live audit and admission repair

PR353 passed all CI gates and deployed as 2f878dfb19fd584c2fdfa78d31a4c12abbb361fc (dpl_5SxxB7KiTAoZT9YDRUbENcpvsNs6). Exact Rowan now generates with current urgent guidance, exact recorded taper doses, the owner/record timing conflict, and unavailable arthritis/laboratory history. Manual audit keeps it PARTIAL because one question called the hind-leg weakness chronic without evidence and the short reason presented disputed completion too definitely.

Rowan vaccination also generated and preserved missing vaccination/reaction records and the recorded prescription. Audit keeps temporal attribution open: a question called the taper current, and its dated prescription appeared under Date unknown. Mochi weight comparison FAILED generation: both reviews rejected categoriesAccurate (request 65b314a7-4699-4ea1-b057-b72b307b1c5b). Mochi coat-care PASSED factual focus: April 18, 2024, seven minutes, easily removed tangle, no invented skin diagnosis or unrelated diary. Its sparse output was unnecessarily verbose and its questions asked for some already listed information.

The richer Sable fixture's first submission was denied because another generation was active. Subsequent clicks replayed the same denial even after that work finished. Root cause: rate/concurrency admission was inside the idempotent completion callback, so a temporary 409 became a persisted terminal response while the client retained its key. Admission now precedes completion; denied admission abandons its claim before any credit reservation or provider call. The client scope advances to v3 to retire keys cached by the old behavior. Actual-route tests verify both 409 and 429 denial, zero generation/credit on denial, then successful same-request retry and lease release.

Generation and review now explicitly check factual premises inside reasons/questions, source-relative medication timing and current-use uncertainty. Category instructions distinguish record storage labels from published clinical meaning, and permit measurements/routine observations in supporting history. Sparse outputs should have proportionate detail and questions that advance the appointment.

Synthetic fixture date correction was completed through the existing care-history editor, not SQL. UI verified June 1, 2023 at noon. Five additional synthetic Sable records were saved through the same editor with verified occurrence dates: September 13, 2023 rabies vaccination/reaction/clinic next-due date; August 28, 2026 comparison creatinine; September 1 prednisone schedule ending September 10; September 8 itching improvement; September 12 itching return with no heavy breathing or weakness. Rowan's original records were not altered.

The rich Sable first completed generation FAILED historical coverage: it omitted the June 2023 creatinine and the September 2023 reaction details, despite those saved records existing. The appointment planner retained the default recent window. Background topic searches now have their own full authorized historical scope while the recent-period query retains the selected interval. This separation is structural and applies to all appointment topics; it does not rely on recognizing a particular symptom or vaccine. Subscription access still clips the shared reader. The displayed reviewed range includes the earliest retained background record. Four actual retrieval integration cases pass, including older evidence amid 5,000 routine entries and subscription-window exclusion.

PR354 initial CI stopped on an obsolete static expectation for the v2 client scope; it was updated to v3. No behavioral gate was removed. Final CI and live retries remain pending.

## PR354 final deployment and remaining audit findings

PR354 final CI passed every gate; 2,244 local tests passed. Production deployment 79b5b0d44f364ac55375d1ca7ba8412a7e4429d8 (dpl_7kP3J1VmvEPys2z3A1ce7SZAYCzn) was verified on both production domains. A deliberately overlapping rich request was denied, then the same form/request successfully ran after Rowan finished: the live admission-retry regression passed.

Rowan generated with reported current symptoms, the exact prescription, unconfirmed actual start/completion, missing arthritis/lab evidence and urgent guidance; the reason's attribution should be clearer. Sable's rich retry now preserved both creatinine values/reference intervals, medication dates and itching improvement/return, but FAILED because the prior rabies reaction was still omitted. The weight retry generated correct requested values, but remains PARTIAL because it retained an unrelated ordinary food observation. Retries remain separate from earlier failures.

The next change gives every planned appointment topic a reserved query, up to six topics sharing the existing six-term RPC budget. A complex request no longer has to fit into three topics; extra synonyms cannot consume slots needed for distinct requested topics. Up to seven per-pet query pages (six topics plus recent context) remain within the existing total-page, candidate, record, character and time limits. Vet Brief's reserved topics are not displaced by generic date-anchor strategies. Ask's existing strategy path is unchanged. A six-topic actual-reader test with multiple named dates verifies all topics survive. Planning uses medium reasoning and independent review high reasoning within unchanged call/output/time caps. Publication explicitly labels the reason as owner-reported.

## PR355 deployment audit

PR355 passed all CI gates and deployed as 9b3cd0315251784267fd99e74f1babdc407e388f (dpl_FBF945aBuHjCtfg4vfWRnY6NT4iR). Rich case FAILED at planning: the provider consumed all 3,072 output tokens and returned incomplete output (request 880b42dc-c408-4e37-b1d0-76d78f5cb4c8). Weight case also FAILED because broad historical measurements displaced the specific April 2024 record, so the brief incorrectly treated that retrieved comparison point as unavailable.

Follow-up separates three retrieval responsibilities: background topics, the actual selected period, and up to five explicitly named date/month targets. Date targets and topic searches have reserved slots, up to twelve per-pet candidate-query pages within the existing twenty-page global, sixty-four-candidate, thirty-two-record, character and time limits. A middle-history April value now survives forty-five earlier matching measurements in the actual-reader test. Planning returns to low reasoning with 6,144 output tokens (within the existing feature maximum), and planning/content share one structural retry. Optional synonyms are trimmed to the six-term RPC budget after every topic receives a primary stem; an overlong synonym list cannot discard a topic or invalidate the whole plan. Three actual-pipeline tests prove the shared retry bound. Independent review remains high reasoning.

## PR356 live audit and review headroom

PR356 passed all CI gates and deployed as 6cc3902994171fb066840b82898653e2d3fc7a8d (dpl_13ARo4QCtQzbMvNmDRj9f66WtP1Q). The rich case's planning now succeeded in 445 output tokens and generation completed in 4,577; independent review exhausted 4,096 tokens and returned incomplete output (request 56fefedd-9e9b-4541-bef3-1f4625651058). This remains a failed attempt, not an accepted report.

The weight retry PASSED the requested factual comparison: April 9, 2024 at 3.97 kg without a carrier, current profile 3.8 kg with date/method unknown, no diagnosis or ordinary food note. An older carrier-inclusive weighing was kept explicitly incomparable; it was not treated as body-weight loss.

High-reasoning review now receives 8,192 output tokens and at most 60 seconds, still below the existing feature output ceiling. A malformed/incomplete review may consume the same one structural retry shared with planning/content, reusing the candidate rather than regenerating it. Five actual-pipeline retry tests cover the shared bound, and provider-transport tests preserve default/medium deadlines while verifying the explicit high-reasoning deadline. Route/concurrency/idempotency windows become 300/315/330 seconds so a bounded repair/re-review can complete. Model, six-call maximum, prices, daily limits and access remain unchanged. Final live acceptance remains open.


## PR357 live acceptance and remaining boundary fix — September 13 UTC

- Rich Sable multi-year vaccination/labs/prednisone/response case PASS. Both creatinine values, units/reference intervals, prior rabies reaction and resolution, clinic-recorded next due date, exact medication schedule and itching response were retained without invented diagnosis or clearance. Confirmed report `63c5fcf4-9717-4b5b-becf-5af47d69a036` retains all six fixture source IDs and clinical content survives reload unchanged.
- Confirmed Sable JSON and a two-page PDF produced by the production renderer are included in `artifacts/vet-brief-complex`. Both pages visually inspected: readable text, no clipping, proper page breaks/footer. The earlier confirmed Mochi comparison also survived reload and its actual downloaded one-page PDF was visually verified.
- Exact Rowan retry FAIL: completed with zero verified historical records and omitted the existing prescription. It disclosed incomplete history and retained emergency guidance, but that is not a satisfactory paid brief. Runtime diagnostics show 8 history queries and 0 retained records. The raw source records were not modified.
- A concrete contract defect was found: planner accepted 2–60 character terms, while both authoritative database RPCs require 3–32 and forbid percent/underscore. A short abbreviation can fail correction closure even when another topic or period query finds the prescription. The new boundary rejects invalid terms during planning (using the existing bounded structural retry), instructs expanded searchable words, and logs categorical coverage diagnostics. Failed correction authority now stops before content generation and releases the existing credit reservation instead of publishing a paid empty-history report. The exact failed plan was not logged, so the historical production failure cause is not claimed conclusively proven solely from its output.
- Sparse April coat retry PARTIAL: correct April 18 seven-minute brushing/easily removed tangle retained, but questions repeated known facts and asked about resolution already recorded. Reviewer criteria now explicitly reject redundant questions and loss of an explicit resolution; at most two questions for a single routine observation.
- The original Ask first-attempt score remains 12 pass / 7 fail / 1 partial, separate from this Vet Brief acceptance work. Earlier live failures remain above; retries do not erase them.


## PR358 deployment and live results

All CI gates passed (run 34727296275). Production `55a1e27397d44460281ecc4a27bdabb13f007362`, deployment `dpl_3K2PRm32M25LP4tf9JugTLxZovtu`, verified on both production domains. 2,251 local tests passed.

- Exact Rowan request PASS on content: ten verified records retrieved; symptoms/emergency guidance, September 11 prescription and exact doses, conflicting owner completion, and missing arthritis/lab evidence preserved. First review exhausted 8,192 tokens; the bounded retry recovered. The medication detail labels its date unknown while the synopsis correctly retains the prescription date; this is a presentation limitation, not an invented date.
- Sparse coat request remains PARTIAL for usefulness: correct dates, seven-minute brushing and removed tangle; no invented skin diagnosis and only two questions, but those questions still ask what the supplied note says. The next refinement separates private evidence-retrieval questions from the published appointment purpose and requires clinician-facing questions to support assessment, care/monitoring, prevention, or reconciliation of a genuine conflict. Search terms are no longer exposed as appointment facts.


## PR359 production result and bounded reviewer allocation

PR359 passed all CI gates (run 34727725410), deployed as `00a8e67c7988c2c67312b2e484c2581b7b24ca6d` / `dpl_4W4sT9PcuLvqdsveePJq15zaAPts` on both production domains.

- PR358 vaccination retry FAILED after factual repair and final questionsUseful rejection; credit released.
- PR359 vaccination retry FAILED because both high-reasoning reviews exhausted 8,192 output tokens without a verdict (request `addd25ab-f09a-4046-a630-21b2e7032a0e`). History retrieval succeeded with 10 verified records. This is an execution-allocation failure, not evidence that the generated content passed.
- Change the reviewer to medium reasoning with 12,288 output tokens and the existing 35-second medium execution ceiling. Keep the identical seven acceptance criteria, structured schema, same-candidate structural retry, one semantic repair and six-call operation bound. High reasoning repeatedly consumed the budget before returning a compact decision; this change aims to reserve useful output headroom and bound latency. Final live verification remains required.

- PR359 sparse retry also FAILED on a provider timeout after successful history retrieval (request `b7664efb-c960-4ebe-8f2b-4a13286e91c5`). Extend the same single shared response-recovery allowance to a transient provider timeout. This does not create a second retry allowance: planning, content and review still share one retry, with six provider calls maximum and unchanged credit/rate limits. Review timeout recovery retains the same candidate and never skips review. Added a test proving both recovery and termination after a second timeout.


## PR360 deployment and evidence-driven model/date correction

PR360 final CI passed (run 34728175399), with 2,252 local tests. Production `b16848b7163d0ff6ee67e4879c8db4af2439213c` / `dpl_H67PaD6cQ68yvhKkc4h8m7AY6kpY` verified.

- Vaccination FAIL: medium mini review completed, but the answer promoted a prescription recorded September 11 with a planned next-morning start into an actual start on September 11. Faster output is not a factual pass.
- Rich Sable PARTIAL: all important values/reaction/doses/response and useful clinician questions retained, but the supporting timeline displayed Date unknown. The document parser silently maps non-day date strings, including valid timestamps, to Date unknown. The generated-content boundary now requires a real YYYY-MM-DD or explicit Date unknown before that parser; evidence exposes the day separately from the full source timestamp. Invalid/ambiguous formats cannot silently lose known dates.
- Full GPT-5.4 now handles only Vet Brief content synthesis and independent review at medium reasoning. Planning and unrelated Ask schemas retain existing configured routing. Full-model Standard pricing verified September 13 from official documentation: $2.50/M uncached input, $0.25/M cached input, $15/M output, for input below 272K. Existing feature input ceilings are far below that threshold. The price registry meters/reserves full-model calls through the existing guard; no cost/call/credit limit is raised and no unpriced-model bypass is introduced. Clinical full-model calls do not silently downgrade to mini on rate limits.
- Official sources actually read: https://developers.openai.com/api/docs/models/gpt-5.4 and https://developers.openai.com/api/docs/pricing . Responses and structured outputs are supported; the existing endpoint/SDK wiring remains. The Google documentation search hit a CAPTCHA; it was not bypassed. The official documentation site and its own search were used instead.
- Added tests for scoped model routing/pricing and rejection of timestamps/impossible dates before publication cleanup. Live tests remain required to establish behavior with the deployed account's model access.


## PR361 live results and repair evidence isolation

All CI gates passed (run 34728796131; 2,254 tests after adapting the isolated transport harness). Production `9b76a16b30df1e6f73fa23a3fb90a02a51841fa7` / `dpl_EjgU1UvoM32NG4Zgvi2JJBL1QiHJ` verified. The deployed account successfully used full GPT-5.4 and metered it through the registered pricing.

- Rich Sable PASS: all six supporting event dates, both creatinine values/reference intervals, vaccine reaction/resolution/recorded due date, prednisone schedule/confirmed last dose, and symptom response retained. Questions support clinical decisions; no diagnosis or vaccination clearance invented.
- Vaccination FAIL: full reviewer rejected factsSupported before and after the single semantic repair (request `b2f7b73a-1b30-47d0-be0b-867de7d68f05`). The exact unsupported field was not previously available in categorical diagnostics.
- Repair generation now receives the failed checks and private correction feedback, but not the rejected draft as an additional apparent source. It explicitly regenerates from the authoritative evidence and corrects each identified failure. Publication review adds allowlisted fact-kind/section locations for diagnostics; raw patient text, values and source identifiers are never logged in those fields. The original seven checks and bounded attempts remain.
