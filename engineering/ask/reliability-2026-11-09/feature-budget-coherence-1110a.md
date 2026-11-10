# Ask feature-budget coherence and preserved contracts

Status: review candidate only; NO-GO for launch. Production is unchanged. No new paid live generation was authorized or performed.

## Source change

Retained shared Ask producers declared 8,192 output tokens for interpretation/generation and 3,200 for completion review, while the current Ask admission policy permits 2,400. Legitimate requests therefore failed before SDK dispatch. A small producer-side helper now selects the lesser of the caller's existing maximum and its server-owned admitted feature policy. Initial, repair, catalog, and review reservations use the actual wire limit; review starts are emitted only after admission.

The independent admission guard still rejects oversized or mismatched requests. Malformed configured maxima fail closed. No quotas were raised, no SDK retries were added, and the public logical-turn limit remains two physical provider calls. Other admitted features retain their own limits.

The public route continues to use the compact native read-only engine and its two authorized read tools. No public planner, AI mutation tool, database migration, or non-AI CRUD change was introduced.

## Test migrations

- Preserve real reservation, usage reconciliation, ownership and opaque catalog assertions; the one-token catalog mock now declares a 512-token envelope.
- Add required nullable draft fields to cloned current fixture envelopes, preserving captured vectors.
- Inspect all relevant saved-history schema branches rather than accidentally selecting the preceding null-ticket branch.
- Keep source windows immutable through repair. The oversized-repair test uses a request at the real admission boundary and proves that a second SDK invocation is denied.
- Exercise incomplete native responses on both physical calls through the current public POST, including released user credit, no mutation and no answer publication.
- Update wire-limit assertions to the active policy while retaining the legacy upper-bound assertions, strict schema checks and bounded retry checks.
- For the root-envelope corpus, retain all 43 vectors unchanged: 10 legal current plans round-trip; 33 explicitly classified contradictory read/correction or evidence-domain combinations must fail closed. Validity is not inferred from the decoder under test.

## Local receipts

Validated from base f7a357ebb3abda2131a2fd262d842ccf86712cd8. The normalized source blob pins below bind these checks to the committed code.

All final test gates used the protected Windows runner. Typecheck, lint and build used their ordinary Node commands. The 25 compositional cases and 169 other contract cases passed in separate batches (194 distinct cases, zero skips). The focused suite retains one pre-existing optional skip. Scripted model decisions are not independent live-model accuracy.

| Gate | Actual result | Raw log SHA-256 |
|---|---|---|
| protected-compositional | # tests 25 / # pass 25 / # fail 0 / # cancelled 0 / # skipped 0 | d71ee192ace475d0b89a381ff6858f3985185378c3827b8320b1514dfc65e713 |
| protected-contracts | # tests 169 / # pass 169 / # fail 0 / # cancelled 0 / # skipped 0 | b344dbfcc0954173b89f90291512ee1e52d8a0a1309e462ed5354379c1fe2143 |
| focused | # tests 764 / # pass 763 / # fail 0 / # cancelled 0 / # skipped 1 | 1271646312dcf758e43ef2173f81018bbb7dc74e2b36937e70c3adb7d221b314 |
| security | # tests 517 / # pass 517 / # fail 0 / # cancelled 0 / # skipped 0 | c91a8c0c4f741f2a46b842bc94a9c877e9993627380aae71866003744b26fd68 |
| types | exit 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| lint | exit 0 | 9b46eae259cf38ed23e157fcdfc7442c9cf9cdb8da1725facf2d2e3539362606 |
| build | exit 0 | b231f004794746ad3f6b46702e29be027f96ae67e44a1b7428f44bb681282a9f |

The production dependency audit reported zero vulnerabilities; package.json and package-lock.json are unchanged from that audit.

A separate native-JIT diagnostic on portable Node 24.22.2 failed with Windows exit 3221225477 (0xC0000005) in the compositional worker: 170 registered outcomes, 169 pass and one crashed file. Its protected rerun passed all 25 cases. This is not a native Windows stability qualification. The existing default --no-opt workaround remains; the experimental opt-in was removed. No test was skipped to hide the crash.

## Full CI provenance

The last completed unfiltered run is [42668544558](https://github.com/furvisepet/furvisepet/actions/runs/42668544558): 6,224 total, 6,011 pass, 212 fail, one skip. It checked merge ae5ea7d9e58cf63b5b3b25e00ca4a0452a94219c; its tree equals head 8cca6338330aa739d9915b52d8f5a89245be0e53 (ce13931728c8bc8cb0a15c30770988024fe02326). These are historical counts, not the new candidate's verdict.

All 211 detailed failures plus the additional aggregate-parent count are preserved in full-failure-index-8cca-1110a.json. Original raw logs remain preserved. Diagnostic categories aid reproduction and do not waive tests or establish that all those failures persist on the current source.

Run 42671395235 attempt 2 reported an internal GitHub error with no jobs or check runs. It is not a successful test completion, and the earlier billing rejection is not treated as current. A new immutable candidate checkpoint is required. The previous complete full-test step took 3,043 seconds; aggregate job wall time was 3,453 seconds, not an invoice or a remaining-minute estimate. Publish both local commits in one push rather than rerunning full CI per commit.

## Live and release limits

The existing f7 preview was freshly rechecked without a new Ask submission: authenticated saved-note replay and owner-rechecked citation displayed the exact saved wording, event date and recorded date. This is replay, not fresh generation on this candidate. The previous 16-turn / 32-call / $0.062993 paid sample belongs to earlier SHAs. Current new paid turns/calls/spend: 0 / 0 / $0.

Fresh exact-candidate generation requires an approved budget; independent source-owner review and applicable release checks remain gates. Keep PR #516 draft, verify the candidate preview's source and READY state, and leave production untouched. Ops PR #517 remains separate and unmerged; no workflow changes were copied from it.

Rollback is a review-branch revert or discontinuing this preview. No database rollback is needed.

## Validated normalized source blobs

- app/lib/ai/ask-reasoning.ts: `712d6f880c7e468afb3c5a8d786c0ac45dbaee7a`
- app/lib/ai/usage-guard/provider-call-budget.ts: `8fd1cef0243236e360fa5c6e337b7accb6191294`
- app/lib/intelligence/interpret-ask.ts: `be21011c3c4d05615c5ec5b5769e9b8536069db8`
- app/lib/intelligence/review-task-completion.ts: `442d187a6fcd8c82add1f25f64f5dfe8692ee5fc`
- tests/ask-compositional-emission.test.mjs: `cb1b2863a976060b8f67e7076aa0ddb423e88ba9`
- tests/ask-interpretation-feature-budget.test.mjs: `c62b6d84b1732ad3ee0bb29500f077e876c3cc47`
- tests/ask-interpretation-input-budget.test.mjs: `bb2f0dcfeaf16ddecc7da72f046b3d7e7b7d3152`
- tests/ask-interpretation-output-budget.test.mjs: `253f1f0e25038fce0fce458035e2de3b13960c26`
- tests/ask-provider-root-envelope.test.mjs: `619ad5e33b9c605b8a32e3aae03926ff7a8592f2`
- tests/ask-recursive-transport.test.mjs: `7d4cac657e04cfb0d069118901ef79c2c2c041ed`
- tests/ask-structured-output-reliability.test.mjs: `f862648eb850737f58d19d0fea158b160bca0987`
- tests/helpers/receipt-catalog-permit.mjs: `57c8dfede210bc1c03ab7d515b9c53066a81eb77`
- tests/helpers/staged-operation-fixture.mjs: `304f27f35c3cddbc9eaaadb56a2a56ee4a1dca3f`
- tests/read-ticket-provider-parity.test.mjs: `89766d1073fa6ac531f2ebebe1f4f0f3401e725e`
- tests/replace-reference-context.test.mjs: `8b34c631c7f05d7f7b065da8bf84298792e6faad`
- tests/stored-read-authority.test.mjs: `19553ec4ebef98f98de618ad73fa0125e58c9450`
- tests/v27-general-evidence-repair.test.mjs: `8a6c0b869531feee1f52540ec939b81986b32998`
