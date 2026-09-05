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

The full default repository test suite was not run: it includes socket-based cleanup/diagnostic tests and environment-file fixtures, outside this task's no-network/no-credential workflow. No production build, HTTP integration, live provider, remote database, installed migration, production permission, snapshot consistency or performance claim is made.

Dependencies were absent. Only the explicitly authorized local `node_modules` junction to `C:/Users/gwara/furvise-ask-episode-count-references/node_modules` was created. No dependencies were installed, and that target was not edited. Only approved source/test/documentation paths were changed. No credentials, external services, migrations, commits, pushes, merges or deployments were used, and no agents were spawned.
