# Vet Brief — live production benchmark, 13 September 2026

**Verdict: do not mark broad launch readiness complete.** The fixed 12-attempt benchmark produced 8 reports (66.7%), below the predefined 11/12 target. A separate French recovery attempt succeeded after the user signed back in. Arabic and Japanese direct PDF downloads were unavailable, and the Arabic print layout had mixed-direction numeric ordering/wrapping problems.

This is new evidence from direct interaction with the production app. It supersedes the earlier four-case acceptance as a basis for broad reliability claims. No product code, review policy, quotas, or deployment settings were changed during this benchmark.

## Environment and method

- Production: https://www.furvise.com
- Commit: `53677c782e1a3aa214b7abb625c1dfff8b896605`
- Deployment: `dpl_AB4k7g2mD3FqFVvofjby26YEsrCE`
- First measured submission: 2026-09-13 10:10:17 UTC. Last observed result: 10:38:27 UTC.
- One authenticated Plus test account; synthetic Mochi history spanning 2018–2026. One generation at a time.
- Fixed initial set: repeated English, Spanish and mixed-language eight-year prompts, French, German, Arabic, Japanese, a vague concern, and a five-year weight comparison. One additional French recovery attempt was explicitly separated from the original denominator.
- Used the visible form, Prepare my brief, Save draft, reopen, Confirm brief, Download PDF, and Print. Server logs were used only to explain observed failures and provider usage.
- Latency means submission to observed visible result, including browser/app overhead. Polling was approximately once per second within observation windows; gaps between windows can make these upper bounds. The first Spanish timing was lost by the recorder and is excluded. French recovery includes a polling gap.
- Two browser-control submission timeouts were inspected and recovered before a generation started; those are recorded separately. A full-page screenshot timed out; a viewport capture succeeded.
- This was not a concurrent load test, soak test, or proof of a production-wide failure rate.

## Acceptance targets set before testing

| Gate | Target | Observed |
| --- | --- | --- |
| Usable publication | At least 11/12 initial requests | **Fail: 8/12** |
| Material factual fidelity | No material factual errors in published content | No material prose error found in 9 published drafts, including recovery; Arabic numeric layout remains a separate failure |
| Response time | 90% within 180 seconds; none beyond 300 seconds | All 11 timed initial responses were below 180 seconds; one timing missing |
| Saved draft integrity | No corruption | Arabic and Japanese exact restore passed, 2/2 |
| Export readability | No unreadable export | English direct PDF passed; Arabic print layout failed; Arabic/Japanese direct PDF unavailable |

Content review checked source attribution, dated reaction and resolution, laboratory values/units/reference intervals, medication uncertainty, negation, cross-pet isolation where applicable, and weight correction semantics. It is a targeted technical review, not independent native-speaker or veterinary certification.

## Benchmark numbers

| Metric | Result |
| --- | --- |
| Initial report publication | 8/12 — **66.7%** |
| Initial requests reaching model pipeline | 11; 8 published — **72.7%** |
| Additional recovery attempt | French: 1/1 published |
| All submitted attempts, including recovery | 9/13 published — **69.2%** |
| Successful initial reports with usable timing | 7 |
| Successful-report median observed latency | **46.6 seconds** |
| Successful-report p90, nearest rank | **111.9 seconds** |
| Successful-report observed range | **27.5–111.9 seconds** |
| All timed initial responses p90, including failures | **115.0 seconds**, n=11 |
| Slowest observed initial response | **136.4 seconds**, failed vague-concern request |
| Provider calls reserved across all 12 model operations | 44; 41 had reconciliation records |
| Logged reconciled provider usage | **$1.665804** total |

The usage figure is recorded application metering, not a complete invoice or all-in serving cost. Three reserved calls lacked reconciliation in the retrieved records, including timeouts; their billable usage is not established. Database, hosting, and other costs are excluded. Most straightforward successes used three calls; the first mixed-language success used five. No concurrency/cost-at-scale claim follows from this sample.

## Every attempt

| english-eight-year-1 | 42.2 s | Published; content checked | 3 |
| spanish-eight-year-1 | Not captured | Published; content checked | 3 |
| mixed-eight-year-1 | 111.9 s | Published; content checked | 5 |
| french-eight-year | 4.1 s | Blocked | 0 |
| german-eight-year | 88.6 s | Blocked | 5 |
| arabic-eight-year | 50.0 s | Published; content checked | 3 |
| japanese-eight-year | 55.1 s | Published; content checked | 3 |
| english-eight-year-2 | 27.5 s | Published; content checked | 3 |
| spanish-eight-year-2 | 115.0 s | Blocked | 6 |
| mixed-eight-year-2 | 46.6 s | Published; content checked | 3 |
| vague-concern | 136.4 s | Blocked | 4 |
| five-year-weight-comparison | 35.5 s | Published; content checked | 3 |
| french-eight-year-recovery | 67.1 s | Published; content checked | 3 |

The exact prompts and observed publications are in [the JSON ledger](vet-brief-live-benchmark-2026-09-13.json). Recovery is not substituted for the original French failure.

## Failure findings

1. **Entitlement read outage before French submission:** at 10:15:10 UTC, GET /api/vet-briefs/draft returned 503, with database read unavailable at the entitlements stage. The app said saved information was temporarily unavailable. One ordinary reload recovered the form. This auxiliary failure is outside the 12 submission denominator and remains part of the end-to-end findings.
2. **French initial submission, 4.1 seconds:** session refresh failed. The runtime recorded a pre-generation 401 and no provider call. Reload led to the sign-in page; the user completed secure sign-in. The same French prompt later produced an accurate report. This does not demonstrate a French semantic failure, but it is an authentication recovery failure in the user journey.
3. **German, 88.6 seconds:** review rejected source scope in history, then source scope in gaps after repair. No report was published. Request `6952f73d-83f0-4662-bd98-ec249e35299f`.
4. **Repeated Spanish, 115.0 seconds:** review timeout triggered the bounded retry; subsequent verdicts rejected date/time scope in overview/history, then questions after repair. Request `4252c0cd-ff21-4bcc-966c-48d5157bcf8f`.
5. **Vague concern, 136.4 seconds:** generation timed out, used its structural retry, and still ended in a primary timeout. Request `1810e4f2-39de-483e-97e3-1fa18a2ef845`.

All three failed model operations recorded release of the reserved user credit. Failed candidates were not shown; the reason text remained visible on the error form. Reviewer codes identify where the pipeline rejected a candidate; without exposing and auditing that rejected candidate, they do not establish that the rejection was a false positive.

## Saving and export

| Case | Save/reopen | Direct PDF | Print inspection |
| --- | --- | --- | --- |
| English eight-year repeat | Confirmed successfully | Passed: two Letter pages; both rendered and visually checked | Not needed |
| Arabic eight-year | Exact preview text restored; confirmed | Unsupported characters; app offered browser printing | Failed RTL acceptance: numeric dates/ranges/units have confusing ordering and wrapping |
| Japanese eight-year | Exact preview text restored; confirmed | Unsupported characters; app offered browser printing | Visible viewport rendered Japanese and numeric values legibly; final browser-generated PDF file was not verified |

Arabic confirmation: `f704f341-8ade-485e-ae2a-e1e662a530ed`.
Japanese confirmation URL: https://www.furvise.com/vet-brief?pet=d14b7cb5-87d1-4ba9-8038-7aabfe656990&brief=3cf8f085-88eb-4333-9ba3-21a61e7bb77e&source=pet-profile
English confirmation URL: https://www.furvise.com/vet-brief?pet=d14b7cb5-87d1-4ba9-8038-7aabfe656990&brief=dacbd248-c9a9-4596-9523-0612705d92e7&source=pet-profile

The PDF fallback message was: “Some characters in this brief need browser printing. Open Print and choose Save as PDF to preserve the full text.” No damaged direct PDF was silently supplied for either script. That is explicit degradation, not feature parity.

## What worked

- Both English eight-year reports retained the old reaction and resolution and the 2020/2025 laboratory dates, values, units, and reference intervals.
- Both mixed-language reports retained the owner's unconfirmed suspicion, uncertain prednisone administration, no-vomiting statement, and cross-pet exclusion.
- Arabic, Japanese, and French recovery prose preserved the requested historical evidence and uncertainty.
- The five-year comparison kept 5.15 kg including the carrier distinct from the corrected 3.8 kg body mass and 1.35 kg carrier. It did not invent continuous change or establish unknown scale equivalence.
- Exact Arabic/Japanese restore passed. English PDF content retained provenance and uncertainty on both pages.

Minor language quality findings remain: one mixed-language report kept English history-item titles; Japanese echoed the synthetic source's “test record” wording. English interface headings/disclaimers remain across languages.

## Prioritized launch work

1. Reproduce and fix the German source-scope and repeated Spanish date/time repair failures while preserving factual gates. Inspect the actual rejected assertions against source evidence before calling them false positives.
2. Diagnose the vague-concern timeout path and improve bounded completion reliability; do not simply remove factual review or extend every deadline.
3. Improve entitlement/session recovery and preserve a clear route back to the pending appointment reason after re-authentication.
4. Support Arabic/Japanese direct PDF fonts and script rendering, plus RTL direction and bidirectional isolation for dates, values, units, and ranges. Validate real exported files, not only DOM text.
5. Rerun a fixed repeated live benchmark after fixes, retaining every failure. Real concurrent-user load testing remains a separate staging gate.

The previous 2,294-test automated suite was not rerun in this browser-only benchmark. Its earlier pass remains useful regression evidence, but it did not predict these live reliability and export failures.

