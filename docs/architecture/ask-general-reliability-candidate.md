# Ask reliability candidate — September 16, 2026

Status: candidate only. Not deployed or launch-certified. The production baseline remains 10 passed / 9 failed / 7 weak.

## Changes

- Read-only contracts discard contradictory save tasks and extraction frames. Provider schemas constrain references to supplied turn identities and prohibit resuming a nonexistent task.
- Standalone unnamed reads default to the selected pet instead of accepting an unsupported account-wide planner hint.
- A follow-up save can retain its subject through an immediately preceding database-confirmed save and resolved USER discourse. Selection or assistant wording alone cannot authorize it. Ambiguous animal groups and human references remain blocked.
- Chronology searches filter generic record vocabulary, and earliest/latest evidence needs execute even without lexical terms.
- Retrieval records required source identities before either budget. Prompt trimming protects them; missing required evidence prevents a complete/billable assessment, including after completion review. Duplicate budget metadata is omitted from provider transport.

## Verification

- Local full test runner: 2,484 passed, zero failed. Nested pipeline regression suites also passed.
- TypeScript and lint of changed application files passed.
- Real-provider parser diagnostic returned validated results without contract-repair loops on five diagnostic inputs. The isolated save-status question correctly lacked conversation context; this is not verification of the live readback case.
- Authenticated HTTP smoke was blocked on its first turn by `SERVICE_DAILY_LIMIT`, before any provider call or credit reservation. The newly created synthetic account was deleted successfully.
- Diagnostic server log: `daily_call_limit`; shared daily counter 181; cost 1,722,375 microdollars ($1.722375). The local test configuration permits 100 calls and $5 per day. No guard or counter was changed. This does not establish the production deployment's configured limits.

## Required release gates

The frozen suite is `scripts/audits/fixtures/ask-launch-frozen-26.json`. Rerun all 26 prompts verbatim in the application with the same subject/conversation sequence, after authenticated candidate verification is available. No manual retries or prompt rewrites. Keep the original scorecard and record latency, credits, and evidence for the new run.

Continuity (16–18), earliest record (6), and fresh evidence (22 and 24) must pass. A sharply reduced hard-failure count is necessary but does not alone establish launch readiness. The selected-pet-only criterion for question 5 remains a product-policy gate; this candidate still permits explicitly requested multi-pet reads.

The opt-in synthetic route smoke is `scripts/audits/ask-reliability-smoke.live.mjs`. It checks two pets, ordinary reads, chronology, save continuity, stored text, and current evidence among long older notes. It uses normal admission controls and cleans up its temporary account. It is additional diagnostic coverage, not a substitute for the frozen live suite.
