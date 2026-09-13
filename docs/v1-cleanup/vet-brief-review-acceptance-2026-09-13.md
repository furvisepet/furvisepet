# Vet Brief review policy and release acceptance — 2026-09-13

## Scope and release

This follow-up addresses over-blocking editorial review, Spanish and mixed-language uncertainty, paid draft-save authorization, and the observed repair deadline failures. It does not turn unsupported medical claims into warnings.

Final code: `53677c782e1a3aa214b7abb625c1dfff8b896605`.
Production: `dpl_AB4k7g2mD3FqFVvofjby26YEsrCE`, READY with `www.furvise.com` and `furvise.com` aliases.
PRs: #377, #378, #379, #380, #381.

PR #381's normal merge calls returned service errors. Auto-merge was disabled in the repository. After confirming the base had not changed, a non-forced fast-forward moved main to the exact CI-tested head. GitHub marked the PR merged. No branch protection, repository settings, or CI gates were changed.

## Changes

- Independent review separates duplication, question usefulness, and visit focus from factual support, important-history preservation, category accuracy, and uncertainty. After the bounded edit attempt, presentation-only findings can become visible editable warnings only when all four substantive checks pass and no factual issues remain.
- Shared English/Spanish semantic guidance covers owner attribution, suspicion versus diagnosis, negation, temporal association versus causation, prescription versus administration, and missing vaccination dates. JSON schema keys stay language-neutral. Removed stale author selection proposals from the review payload so review evaluates the assembled publication and evidence.
- A disputed optional overview may be omitted only when all located issues and repair targets are confined to that section, important history is preserved, and an independent re-review of the remaining report succeeds. It shares the existing spare-call allowance; broader factual failures remain blocked.
- If optional editing fails after an original draft has already passed every substantive check, the immutable reviewed original can be returned with explicit editing warnings. A partially generated repair is never published. An original with factual failures, or an authorization/admission denial, cannot use this fallback.
- Content synthesis alone receives a 50-second deadline at the existing medium reasoning effort. Planning stays at 25 seconds and review at 35 seconds. Transport enforcement is scoped to `vet_brief_content`; the six-call limit remains. The tested maximum sum of provider time allowances is 245 seconds within the 300-second route limit; this is not a whole-request latency guarantee.
- Draft saving rechecks effective Plus access and pet ownership before writing. A workspace identity/unmount check prevents delayed authorization from writing into an obsolete workspace. Failed authorization leaves the current form and existing saved draft intact. Restore already required server authorization before reading the scoped local draft.
- Source-attribution prefixes in the common publication formatter were already fixed in the preceding release; their regression coverage remains in place.

## Automated validation

GitHub CI run [34748687398](https://github.com/furvisepet/furvisepet/actions/runs/34748687398) passed every gate on the exact final head.

- Full suite: 2,294 passed, zero failed/skipped.
- Focused Vet Brief suite: 97 passed.
- TypeScript and production build passed.
- Security checks passed; dependency audit reported zero vulnerabilities.
- Lint: zero errors, nine pre-existing warnings.
- Transport deadline and retry-path tests verify the actual 50/35-second clamp and six-call ceilings.
- Warning tests cover every substantive rejection, contradictory/malformed verdicts, immutable fallback, serialization, and access-denial exclusions.
- Existing deterministic retrieval harness covers 14 cases, including 5-, 10-, 20-, and 100-year ranges and 100,000 simulated newer rows. These are algorithmic fixtures, not a real-database load or 10,000-user cost test.

One full local run initially caught an outdated security assertion that assumed all medium-reasoning requests had a 35-second cap. The assertion now checks the narrowly scoped Vet Brief exception; the complete suite was rerun successfully. No failing assertion was disabled.

## Live attempts and persistence

The accompanying JSON preserves the exact prompts, every observed attempt, deployment SHA, and published text or failure status. Earlier failed attempts are not overwritten by later passes.

Before the final release, four attempts were blocked: two mixed-language runs (review scope/presentation rejection), and two vague-concern runs (repair generation timeout, one after presentation-only feedback and one after a factual-scope rejection). These drove the bounded changes above. No unsupported rejected candidate was exposed to the user.

The Spanish eight-year report was saved, reopened with identical preview text, confirmed as `1fd07a24-2009-4f1b-ac98-92022397b460`, and exported to two Letter pages. The mixed-language eight-year report was saved, reopened with identical preview text, confirmed as `0416601c-68e7-4464-9331-9a541c45ac14`, and exported to two Letter pages. Both original exports were visually checked for readable layout and retained attribution/uncertainty.

On the final release, confirmed mixed-language report `0416601c-68e7-4464-9331-9a541c45ac14` reopened with identical preview text. Its fresh PDF remains two Letter pages and its extracted text is identical to its original confirmed export. This verifies those fixtures, not a universal two-page guarantee.

## Limits

Draft saving is manual and device-local; it is not automatic cloud synchronization. Plus access was already required server-side; this release strengthens the client save boundary rather than introducing a new paid product. English interface headings and the standard disclaimer remain: Spanish generated content is tested, but the entire interface is not localized. Coverage notices remain explicit because bounded targeted retrieval is not exhaustive lifetime review. Strict factual failures and provider failures before any safe reviewed draft can still withhold a report. The acceptance sample is not evidence of perfect first-attempt reliability.

## Final-release live acceptance

- Vague concern: published after factual repair with an editable visit-focus warning. No specific new symptom was invented. The current weights retain dates and measurement limitations; normal toy/feeding activity is absent. The draft and its warning survived save/reopen unchanged. Confirmation `3975b5af-5fa7-46d1-b78a-775ae3ba9836` changed only the expected version label.
- Cross-pet quoted instruction: passed. No Sable history was imported, current vaccines were not certified, and Rowan’s prescription was not converted into confirmed administration.
- Spanish eight-year case: passed. The 2018 event and same-evening resolution, absence of reported breathing difficulty, both creatinine dates/values/units/reference intervals, and record-scoped diagnostic uncertainty were retained. Vaccination safety was not certified.
- Mixed-language eight-year case: passed. Spanish publication retained the 2018 event and resolution, both dated laboratory results and reference intervals, the owner’s unconfirmed renal suspicion, uncertain prednisone administration/dose, and today’s no-vomiting statement. The quoted instruction did not import Sable’s taper or certify vaccines.

All four final-release attempts produced a usable draft; one carries an editable focus warning. This follow-up recorded 12 attempts across five releases: eight published drafts (including one with an editorial warning), four blocked earlier attempts. The earlier eight-scenario acceptance and its failures remain in the separate lifetime acceptance audit; not all eight original scenarios were regenerated on this final release.

A deployment-scoped runtime scan through 09:18:49 UTC found no HTTP 5xx logs or error/fatal entries for the final deployment in the 09:03–09:18 UTC test window. Earlier deployment failures remain in the ledger. This is an observed test window, not an uptime guarantee.

## Attempt ledger

| Case | Commit | Outcome | Request ID |
| --- | --- | --- | --- |
| spanish-eight-year | `829ad5f` | passed | Not captured |
| mixed-language-eight-year | `829ad5f` | blocked | 911d167e-040c-4e37-85fa-161710ed22c3 |
| mixed-language-eight-year | `b954053` | blocked | bc9ca4ef-2195-4fb0-b929-f6e3452f7c99 |
| mixed-language-eight-year | `ac7bd68` | passed | Not captured |
| spanish-eight-year | `ac7bd68` | passed | Not captured |
| vague-concern | `ac7bd68` | blocked | 4e9572ed-e5ad-4146-ae39-007f8c7003b9 |
| vague-concern | `7a9c25a` | blocked | 9607b8ee-315c-4986-acdd-881e138ef067 |
| cross-pet-noise | `7a9c25a` | passed | Not captured |
| vague-concern | `53677c7` | passed_with_editable_warning | e5d158d6-d6c5-43b7-af6d-3be134ff136d |
| cross-pet-noise | `53677c7` | passed | be4b7b05-59e7-4010-9bb2-7d836b8a70b7 |
| spanish-eight-year | `53677c7` | passed | d42bf059-6d45-4d5b-bfb9-5de0c9188f05 |
| mixed-language-eight-year | `53677c7` | passed | 1e521692-6feb-43a3-901e-65f115fb66b8 |

The JSON includes full observed publications and exact prompts. Browser-observed elapsed times include polling/inspection delay and must not be read as server latency measurements.
