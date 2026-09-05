# Resolution-status recall grounding

Implemented one bounded repair for requirement 7 in [the gap classification](ask-runner-gap-classification.md), with the pre-governance and final-answer boundaries required by [the review](ask-runner-gap-review.md). Verification was local on September 5, 2026, using Node 24.19.0. The synthetic audit clock remains September 4, 2026.

## Reproduction and result

The unchanged lifetime fixture asks `Is Luna hiding fully resolved?`. Its `luna-hiding` care row has observation time `2026-08-19T12:00:00Z` and the exact note:

> Luna is hiding less but still hides sometimes; it has not fully resolved.

The mocked provider says `The hiding is fully resolved.` with recovery status `none`. Before this repair, the question had ordinary scope and did not activate read-only stripping. The validator had no independent authority over the resolution assertion.

The final answer now has title `Furvise`, empty sections, and this summary:

> The August 19, 2026 note reports that hiding had decreased but still happened sometimes. I can't establish whether the hiding has ended now from the available dated evidence.

The entire visible answer excludes the lifetime audit's forbidden phrase, including its title, sections and safety note. Source text and the original question remain intact in the internal evidence contract; they are not rewritten. References and follow-up suggestions are cleared for this scope. No care action, learning, semantic event, history offer, mutating application action, accepted V2 claim or V2 relation is returned.

## Actual path and authority

1. [The Ask route](../app/api/ask/route.ts) resolves the subject, rebuilds an alternate pet's context when needed, and supplies the authorized pet IDs and authoritative semantic frame inside its `generate` callback.
2. [generateAskHistoryAnswer](../app/lib/intelligence/generate-ask-history.ts) performs existing bounded history and episode retrieval, creates the evidence contract inside that callback, and calls `runFurviseIntelligence`. Its implementation did not need changing.
3. [ask-evidence.ts](../app/lib/intelligence/ask-evidence.ts) recognizes the status question independently of provider flags. Contract creation verifies that the named subject matches the single authorized owned pet.
4. [buildAskContext](../app/lib/ai/ask-reasoning.ts) selects and compacts records and enforces the existing 48,000-character serialized-context budget. For status recall, represented spans carry their observation date; creation time cannot substitute for a missing observation date. Budget omissions remain evidence losses. The generator returns this final budgeted contract, not provider-supplied coverage.
5. [runFurviseIntelligence](../app/lib/intelligence/run-intelligence.ts) activates existing recall stripping before learning, care and semantic governance. Status recall also normalizes provider update/recovery flags and bypasses later deterministic resolution, recurrence, explicit-history and confirmed-loss action builders. Both model and supplied authoritative semantic frames are removed before V2 governance. Existing read/navigation application actions remain permitted.
6. [validateGeneratedAnswer](../app/lib/intelligence/validation/validate-answer.ts) composes the complete status answer from that budgeted contract after prose transformations. Provider prose and context citations cannot authorize it. Urgent/emergency escalation and shopping suppression remain available. Source quotations and authoritative episode rendering retain their existing behavior outside status scope.

No persistence machinery, route APIs, retrieval limits, episode identity rules or lifecycle transitions were changed. No Next API was touched, so bundled Next API documentation was not needed. Root AGENTS.md and both gap documents were read.

## Deliberate bounds

Recognition supports a single question with `Is` or `Has`, a one-word named subject (optionally possessive), a topic, optional `fully`/`completely`, and `resolved`/`ended`/`stopped`, ending in a question mark. An optional `in YYYY` uses the existing bounded historical-period path. The recognized topic vocabulary is hiding, vomiting, stool, litter, stiffness, breathing, condition and issue. Missing subjects/topics, subject alternatives, multiple authorized subjects, and topic alternatives abstain. A subject must match the authorized profile, not a name inferred from provider prose. Mixed owner observations, saves, episode ordinals and added urgent observations are outside this grammar.

Only hiding has deterministic dated-report rendering in this repair. Other recognized topics return uncertainty. The supported whole-note sentence forms are the fixture's qualified partial-improvement sentence, `<pet> still hides sometimes.`, `<pet> stopped hiding.`, and `<pet>'s hiding has [fully] resolved.` Case differences are accepted. Other prose, titles prepended to these sentences, additional qualifications, competing represented hiding notes and ambiguous statements abstain. This is deliberately conservative, not general medical entailment. A still-hiding note alone does not imply improvement. A terminal report is attributed to its date and always followed by uncertainty about the present ending.

Attribution requires one represented same-pet hiding care record, loaded source identity, an explicit valid non-future observation date, and no recorded loss of that source. Missing, deleted, wrong-pet, wrong-topic, unselected, oversized and final-budget-omitted evidence cannot supply attribution. Available historical correction provenance is respected: changed, missing, superseded and withheld sources cannot supply the report, and failed correction/candidate retrieval produces uncertainty. Historical effective linked or unverified legacy reports can be attributed as historical contents, never as certified current state.

The exact recent-context question does **not** gain source-version or correction revalidation. Its answer attributes the represented loader snapshot and disclaims current ending. No arbitrary later correction search or additional history scan was added. Optional year queries retain the existing limits: 25 rows per page, four pages per pet, 64 candidates, at most three pets, six correction graph calls, 128 graph rows, 32 retained history records, 18,000 historical evidence characters and a five-second retrieval deadline. Historical consistency remains `read_committed_no_snapshot`. Neither completeness nor `verifiedFacts` is manufactured.

## Verification

[The new audit](../scripts/audits/ask-resolution-status.cases.mjs) exercises the real loader, `generateAskHistoryAnswer`, captured actual provider prompt, and final validator with synthetic database responses and a mocked provider. Network fetches throw. It does not execute the HTTP route or persistence. The harness exposes no insert operation.

The harness additions pass an authoritative semantic frame, allow a specified provider response sequence for bounded retry tests, and optionally inject fields immediately after the real generator for final-boundary tests. Title and safety note are not accepted provider-schema fields, so those tests explicitly inject them at that boundary rather than pretending the provider schema accepts them. Ordinary calls, including the unchanged lifetime audit, still require exactly one mocked provider request. Invalid terminal flags retain the existing single repair; repeated invalid flags stop after exactly two requests.

| Check | Fresh result |
| --- | --- |
| New resolution-status audit | 40 passed |
| New audit plus evidence-contract, history-stage-2, episode-history, episode-review-regressions and subject-continuity audits | 170 passed, 0 failed |
| Context-reasoning, governance-validation, answer-economy-v1-2, structured-output-reliability and reliability-repair-1 unit suites | 96 passed, 0 failed |
| `tsc --noEmit --incremental false` | Passed |
| ESLint on changed code and audit files | Passed |
| Repository ESLint | 0 errors; two existing unused-parameter warnings in unchanged `persist-learnings.ts`, lines 149 and 378 |
| Unchanged lifetime audit | 8 passed, 9 failed; resolution-status assertion passed |

Audit command:

```powershell
node --experimental-transform-types --test scripts/audits/ask-resolution-status.cases.mjs scripts/audits/ask-evidence-contract.cases.mjs scripts/audits/ask-history-stage-2.cases.mjs scripts/audits/ask-episode-history.cases.mjs scripts/audits/ask-episode-review-regressions.cases.mjs scripts/audits/ask-subject-continuity.cases.mjs
node --experimental-transform-types --test scripts/audits/ask-lifetime-history.audit.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js
```

The five related unit suites used `--experimental-transform-types` and this network-blocking preload:

```powershell
node --experimental-transform-types --import 'data:text/javascript,globalThis.fetch=async()=>{throw%20new%20Error(%22Network%20forbidden%22)}' --test tests/ask-context-reasoning.test.mjs tests/intelligence-phase-3d-governance-validation.test.mjs tests/ask-answer-economy-v1-2.test.mjs tests/ask-structured-output-reliability.test.mjs tests/ask-reliability-repair-1.test.mjs
```

Initial command setup attempts failed before executing tests: the lifetime command needed Node's transform-types flag, and the unit-suite preload needed URL-encoded quotation marks under PowerShell. The corrected commands produced the results above. Early new cases also exposed a missing ambiguous-topic match and incorrect mock setup for budget pressure and date-only candidate failure; these were corrected without changing existing tests.

The nine lifetime failures remain: old-period selection, late unlinked correction discovery, prose-only episode-list continuity, broad multi-pet history, old canonical episode prompt representation, qualified ordinal episode representation/metadata, assistant-address capability classification, exact lifetime episode totals, and certified complete weight comparison. They were recorded, not weakened or repaired. The result does not establish that those requirements are complete.

## Limitations and local scope

The preceding implementation did not run the full default repository test suite. The independent review below records both a guarded attempt and final normal full-suite validation after separately confirming the four affected tests use only local loopback servers and synthetic temporary environment files. No production build, HTTP integration, live provider, remote database, installed migration, production permission, snapshot consistency or performance claim is made.

Dependencies were absent. Only the explicitly authorized local `node_modules` junction to `C:/Users/gwara/furvise-ask-episode-count-references/node_modules` was created. No dependencies were installed, and that target was not edited. Only approved source/test/documentation paths were changed. The runner created local implementation/review commits; no credentials, external services, migrations, pushes, merges or deployments were used, and no agents were spawned.


## Independent local review — September 5, 2026

This review started from clean commit `6d86877178aad981d035fb345f071865f691e290` (the preceding resolution-status repair), whose parent is `6e6555703017b8edcbba1b74a3cd54bcd2ad6356` (gap review). The classification is the earlier `87b5fb8`. These are existing queue commits, not commits created by this review. `git diff HEAD^ HEAD --stat` accounts for seven repair files: four application files, the status audit, harness and this document. `generate-ask-history.ts` and the evidence-contract audit were not changed by that commit. The working review adds only two tests in the approved status audit and this documentation; no application defect requiring a further source change was found.

The first command explicitly set the requested location and `git rev-parse --show-toplevel` returned `C:/Users/gwara/furvise-runner-resolution-1/review-resolution-status/worktree`. Root AGENTS.md, both gap reports, the complete lifetime audit/fixtures/harness, and the preceding commit diff were read. The bundled `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` was also consulted. The absent dependencies were made available only through:

```powershell
New-Item -ItemType Junction -Path node_modules -Target 'C:/Users/gwara/furvise-ask-episode-count-references/node_modules'
```

No install or edit to the junction target was performed. Node reported `v24.19.0`.

### Findings

- Recognition is an anchored, explicit question-only grammar; matching missing/alternative subjects or topics becomes ambiguous read-only uncertainty. A resolved attribution additionally requires one owned authorized profile whose name matches the question. The narrow supported grammar and hiding-only rendering documented above remain intentional limits. Wrong-pet rows and wrong names inside same-pet rows cannot support the report. No generic forbidden-phrase filtering was introduced.
- The actual route closure passes the resolved subject IDs and authoritative frame to `generateAskHistoryAnswer`. That callback builds the evidence contract after bounded retrieval. The generator returns the serialized contract after the 48,000-character budget removes records and records losses. Attribution uses represented whole text and its explicit observation date, not creation time, loaded-but-omitted rows, provider citations or provider coverage. Unavailable evidence yields uncertainty; even a represented dated terminal report never certifies current resolution. Recent snapshot attribution still has no correction revalidation.
- Recall stripping precedes semantic event, care, learning and V2 governance. The supplied authoritative frame is removed along with the model frame; deterministic resolution/recurrence, explicit-history and confirmed-loss builders are bypassed for status recall. Final accepted care actions, learnings, semantic events, governance acceptances, V2 claims/relations and history offers were checked under adversarial proposals. Read/navigation actions remain permitted.
- Persistence ordering was reviewed in the actual route: accepted arrays feed legacy persistence, and the returned V2 turn feeds `persistAskV2Phase3LowRisk`. Its selection exits before writing when no claims are accepted. Shadow fallback uses the already emptied frame and returns no accepted claims on failure. This establishes the reviewed output contract, not an executed database-persistence test. Conversation/answer storage and usage accounting are outside the clinical read-only claim.
- Complete-answer authority runs after prose transformations and before the episode fallback. Provider title/summary/section/safety-note assertions cannot survive it. Urgent escalation and shopping suppression survive; mixed urgent observations and genuine saves remain outside status-only recall. Existing evidence-contract and episode suites retain exact source quotations, supported episode rendering, ordinal identity, subject switching and stale-reference rejection outside this scope.
- Two added controls verify that an episode result cannot replace a status answer, a permitted care-history query survives stripping, and a plain still-hiding note does not invent improvement. The episode-precedence check explicitly supplies a complete synthetic episode-result shape directly to final validation; it does not claim the status grammar ordinarily retrieves an episode result.
- The prior harness diff is limited to opt-in post-generation injection, authoritative-frame forwarding and explicitly bounded provider sequences. Its default one-request assertion and network block remain. `git diff HEAD^ HEAD -- scripts/audits/ask-lifetime-history.audit.mjs scripts/audits/fixtures/ask-lifetime-history.mjs` was empty. This review changes neither those files nor the harness and does not modify any existing expectation.

### Fresh commands and results

| Command/check | Independent result |
| --- | --- |
| Six audit files using the audit command above, before review additions | 170 passed, 0 failed |
| `node --experimental-transform-types --test scripts/audits/ask-resolution-status.cases.mjs` | 42 passed, 0 failed |
| Six audit files using the audit command above, after final additions | 172 passed, 0 failed |
| Five unit suites using the exact network-blocked command above | 96 passed, 0 failed |
| `node --experimental-transform-types --test scripts/audits/ask-lifetime-history.audit.mjs` | Exit 1: 17 tests, 8 passed, 9 failed; resolution assertion passed |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Exit 0 |
| `node node_modules/eslint/bin/eslint.js` | Exit 0; only the same two unused-parameter warnings in unchanged persist-learnings.ts |
| `node node_modules/eslint/bin/eslint.js scripts/audits/ask-resolution-status.cases.mjs` | Exit 0 |
| `git diff --check` and `git diff --check HEAD^` | Exit 0 |
| Guarded full discovery below | Exit 1: 2,198 tests, 2,194 passed, 4 intentionally blocked by the process-local guard |
| Normal full suite after inspecting and separately passing those four local-only tests | 2,198 passed, 0 failed |

The nine lifetime failures are the same nine listed above. They remain open and were not made to pass through changed expectations. The full discovery does not discover the explicitly named status `.cases.mjs` audit; the 42/172 audit results therefore remain separate.

The full suite was attempted with this exact process-local preload and command. The preload blocks real fetch/socket/HTTP operations and environment-file reads while leaving tests and assertions unchanged. It propagates through NODE_OPTIONS to child test processes. It is execution isolation, not a product change or an assertion replacement.

```powershell
$env:NODE_OPTIONS = '--import=data:text/javascript,import%20net%20from%20%27node%3Anet%27%3Bimport%20http%20from%20%27node%3Ahttp%27%3Bimport%20https%20from%20%27node%3Ahttps%27%3Bimport%20fs%20from%20%27node%3Afs%27%3Bimport%20fsp%20from%20%27node%3Afs%2Fpromises%27%3Bimport%7BsyncBuiltinESMExports%7Dfrom%27node%3Amodule%27%3Bconst%20deny%3D()%3D%3E%7Bthrow%20Error(%27LOCAL_REVIEW_NETWORK_BLOCKED%27)%7D%3BglobalThis.fetch%3Ddeny%3Bnet.Socket.prototype.connect%3Ddeny%3Bnet.Server.prototype.listen%3Ddeny%3Bhttp.request%3Ddeny%3Bhttp.get%3Ddeny%3Bhttps.request%3Ddeny%3Bhttps.get%3Ddeny%3Bfor(const%20obj%20of%5Bfs%2Cfsp%5D)for(const%20key%20of%5B%27readFile%27%2C%27readFileSync%27%2C%27open%27%2C%27openSync%27%5D)if(obj%5Bkey%5D)%7Bconst%20original%3Dobj%5Bkey%5D%3Bobj%5Bkey%5D%3Dfunction(path%2C...args)%7Bif(%2F(%3F%3A%5E%7C%5B%2F%5C%5C%5D)%5C.env(%3F%3A%24%7C%5C.(%3F!example%7Csample%7Ctemplate))%2F.test(String(path)))throw%20Error(%27LOCAL_REVIEW_ENV_FILE_BLOCKED%27)%3Breturn%20original.call(this%2Cpath%2C...args)%7D%7DsyncBuiltinESMExports()%3B'
node --experimental-transform-types --test
```

The full run was repeated solely because initial tool-output truncation hid the aggregate, with the same preload and output captured in a PowerShell variable. The exact reporting command was:

```powershell
$reviewOutput = & node --experimental-transform-types --test 2>&1
$reviewExit = $LASTEXITCODE
$reviewOutput | Select-String -Pattern '^. tests ', '^. suites ', '^. pass ', '^. fail ', '^. cancelled ', '^. skipped ', '^. todo ', '^. duration_ms ', '^. failing tests:', '^test at ', '^✖', 'LOCAL_REVIEW_NETWORK_BLOCKED', 'LOCAL_REVIEW_ENV_FILE_BLOCKED' | ForEach-Object { if ($_.Line.Length -lt 500) { $_.Line } }
Write-Output "EXIT_CODE=$reviewExit"
```

Three failures are `LOCAL_REVIEW_NETWORK_BLOCKED` at the local-server listen step: both tests in `tests/cleanup-scripts-environment.test.mjs` and the test in `tests/run-integrity-diagnostics.test.mjs`. The fourth is `tests/validate-production-environment.test.mjs`, whose child script could not read its synthetic environment file (`LOCAL_REVIEW_ENV_FILE_BLOCKED`). Those failures do not demonstrate a resolution-status regression, and that guarded run alone did not constitute passing full validation. The later normal run in the results table completed all tests. No socket was opened by the guarded tests and no credential file was read.

**Review status: complete for the bounded local repair.** After confirming the four guarded failures use only local loopback servers and synthetic temporary environment files, those four tests passed separately and the normal full suite passed all 2,198 tests. The nine independently known lifetime gaps remain reported without weakening tests. No HTTP route/integration, live-provider or production-DB test was performed. No external provider/network service, remote DB, credentials, migrations, pushes, merges, deployment, dependency installation or additional agents were used. No other worktree was edited.
