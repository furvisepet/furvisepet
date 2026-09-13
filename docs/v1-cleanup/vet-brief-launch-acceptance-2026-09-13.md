# Vet Brief launch fixes — live acceptance, 13 September 2026

**The targeted technical acceptance gates passed on the final deployment.** All 12 fixed live requests published usable reports, compared with 8/12 in the earlier benchmark. One final report carried an explicit focus advisory. History coverage remains qualified; this is not a claim to have reviewed every lifetime record.

## Release and verification

- Production: https://www.furvise.com
- Final commit: `b0c6db9d7894f6e97b60827d7cf35e0214aae653`
- Deployment: `dpl_9Bw65GAwbcWpV4ErpKs8tBzT7ZYm`; production aliases checked before and after testing.
- [PR #382](https://github.com/furvisepet/furvisepet/pull/382): multilingual PDF/bidirectional rendering, bounded session/read recovery, temporary appointment-input recovery, cross-language review guidance and shared factual repair.
- [PR #383](https://github.com/furvisepet/furvisepet/pull/383): restore newly regressed sections only after another whole-report review within the shared sixth-call limit; keep printed heading dates together; clear stale restored-input status.
- [Final Security CI](https://github.com/furvisepet/furvisepet/actions/runs/34754227735): **2,308/2,308 tests passed**, including 160 focused security tests; typecheck/build passed, lint had zero errors and nine existing warnings, and production dependency audit found zero vulnerabilities.
- The test suite includes full 12,000-character input/tail-negation preservation, scoped recovery and no duplicate mutation replay, factual gates after repair, and 5/10/20/100-year retrieval with 100,000 newer synthetic rows. Those are deterministic harness tests, not production concurrency measurements.

## Live benchmark

The same 12 prompts as the earlier benchmark were entered through the authenticated production form, one request at a time, using the existing synthetic Mochi history. No model endpoint was substituted for the app. Report text, save/reopen, confirmation, direct download and print view were checked through the app. Read-only source queries verified the additional dated weight/mobility details.

Generation window: **2026-09-13T11:27:13.704Z to 2026-09-13T11:47:42.545Z**. Time means submit to observed visible result, including app/browser overhead. Polling is about once per second inside observation windows; gaps between tool calls can make values upper bounds. Every final timing is retained.

| Metric | Final result |
| --- | --- |
| Published reports | **12/12 — 100%** |
| Blocked reports | **0/12** |
| Reports with visible focus advisory | **1/12** |
| Material factual errors found in checked published content | **0** |
| Median observed response | **48.6 seconds** |
| p90 response, nearest rank | **75.3 seconds** |
| Slowest response | **99.3 seconds** |
| Observed range | **32.5–99.3 seconds** |
| Provider calls | **40 reserved; 40 reconciled** |
| Logged model usage | **$1.716815 total; $0.143 per report** |

Model usage is application metering, not an invoice or all-in hosting/database cost. Most requests used three calls; English first pass and vague concern used five. No final request needed a structural timeout retry or the sixth-call section-restoration fallback. The latter is covered by deterministic regression tests; the fresh live Spanish passes do not prove that fallback was exercised.

| Case | Observed latency | Result | Provider calls |
| --- | --- | --- | --- |
| English, eight years | 60.1 s | Pass | 5 |
| Spanish, eight years | 48.7 s | Pass | 3 |
| Mixed language + injection | 61.3 s | Pass | 3 |
| French, eight years | 32.5 s | Pass | 3 |
| German, eight years | 46.2 s | Pass | 3 |
| Arabic, eight years | 42.7 s | Pass | 3 |
| Japanese, eight years | 48.3 s | Pass | 3 |
| English repeat | 35.6 s | Pass | 3 |
| Spanish repeat | 52.5 s | Pass | 3 |
| Mixed-language repeat | 75.3 s | Pass | 3 |
| Vague concern | 99.3 s | Published; focus advisory | 5 |
| Five-year weight correction | 48.4 s | Published; partial-history warning | 3 |

The English/Spanish/mixed repeats were part of the fixed set. Failed attempts were not replaced in this denominator. Exact prompts, publications, request IDs, timings, checks and usage are in [the JSON ledger](vet-brief-launch-acceptance-2026-09-13.json).

## Findings and acceptance gates

| Gate retained from the prior benchmark | Target | Final observation |
| --- | --- | --- |
| Usable publication | At least 11/12 | **12/12** |
| Material factual fidelity | No material errors found | **Passed the checked scenarios** |
| Response time | 90% within 180 s; none beyond 300 s | **All 12 below 100 s** |
| Saved draft integrity | No corruption | **Arabic/Japanese exact preview restore, 2/2** |
| Export readability | No unreadable export | **All four downloaded files readable on both pages** |

The long-history reports retained the 2018 reaction and resolution and the 2020/2025 creatinine dates, values, units and reference intervals. Mixed-language cases kept the owner's unconfirmed diagnosis and possible prednisone use uncertain, retained the no-vomiting statement, and did not import Sable's medication or certify vaccination safety.

The five-year comparison retained 3.93 kg on 2021-09-09, the 5.15 kg carrier-inclusive display on 2022-05-28, the 2022-05-30 correction to 3.8 kg with a 1.35 kg carrier, 3.97 kg on 2024-04-09 and 3.8 kg on 2026-09-09. It did not invent a continuous trend or assert that unknown scale comparability was disproven.

**Visible limitations remain.** The vague concern included one normal-meal detail in the overview and displayed a focus-editing advisory. The five-year report reported a failed history read while still retaining every specifically requested comparison and correction. Runtime coverage included `candidate_rpc_unavailable` and `history_page_unavailable_or_changed`, with 32 retained records. Other reports also explicitly qualified targeted/partial history. None should be described as exhaustive lifetime review.

## Save, confirm, download and print

| Final report | Save/reopen | Confirm/direct PDF | Visual checks |
| --- | --- | --- | --- |
| Arabic | Exact preview restored | Confirmed; Letter and A4 downloads passed | Both pages of each file checked; dates/ranges/units and Arabic glyphs readable; live print-route viewport also checked |
| Japanese | Exact preview restored | Confirmed; Letter download passed | Both pages checked; Japanese glyphs, clinical numbers and uncertainty readable |
| English repeat | Confirmation checked | Confirmed; Letter download passed | Both pages checked; provenance and full report content readable |

Each exported file had exactly two pages: Letter 612×792 pt, A4 595.28×841.89 pt. The ledger includes byte sizes and SHA-256 hashes. Japanese full-font embedding produces a roughly 3.34 MB PDF; this is a deliberate tradeoff to preserve actual glyph outlines. The initial font-subsetting implementation failed visual inspection locally even though text extraction worked; it was corrected before deployment and has an embedded-font regression test.

Confirmed report URLs:
- [Arabic](https://www.furvise.com/vet-brief?pet=d14b7cb5-87d1-4ba9-8038-7aabfe656990&brief=9eb6f800-b3e3-4634-afd3-50e4c7ef51fd&source=pet-profile)
- [Japanese](https://www.furvise.com/vet-brief?pet=d14b7cb5-87d1-4ba9-8038-7aabfe656990&brief=4e025bac-d428-4d35-a642-7a0c1c9d4c34&source=pet-profile)
- [English](https://www.furvise.com/vet-brief?pet=d14b7cb5-87d1-4ba9-8038-7aabfe656990&brief=09855d8e-09b6-4485-858f-db9648ccc243&source=pet-profile)

Browser print view was visually checked; a separate browser-generated PDF was not claimed. The four **direct app downloads** were the exported artifacts inspected.

## Failed preflight retained

After #382, English, German and vague concern published, but Spanish failed after 100.5 seconds (request `d23fac88-e9d4-4f6a-bc3f-d5876eee63b5`). Its first review rejected source scope in questions; the repair introduced new causation/administration issues in other sections. The app withheld that report and released its credit. A live reload restored the failed appointment note exactly.

This concrete failure led to #383. The [preflight ledger](vet-brief-launch-preflight-2026-09-13.json) preserves all four attempts and earlier export checks. It is separate from the final fixed run. The [original failed benchmark](vet-brief-live-benchmark-2026-09-13.md) is also retained.

## Scope of this result

This supports moving on from the identified Vet Brief technical blockers and a controlled launch of the tested flow. It is a small, sequential functional benchmark using one synthetic Plus account. It does not certify concurrent user capacity, prolonged soak reliability, every language/script, native-speaker quality, or veterinary clinical validity. Generated content was tested in English, Spanish, French, German, Arabic and Japanese; fixed UI/document labels remain English. Existing paid access and substantive review gates remain enforced.

