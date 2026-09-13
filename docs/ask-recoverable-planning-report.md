# Ask recoverable planning and temporal safety

Base: e3896aa1be3455dd7634325a8ffd7b2f083f8a10
Branch: codex/ask-recoverable-planning
Worktree: C:/Users/gwara/furvise-ask-recoverable-planning

## Outcome
This bounded repair addresses demonstrated planning failures, unnecessary non-pet clarification, and temporal safety/presentation conflicts. It does not establish a new live benchmark score or launch readiness.

The actual interpretation/callback/intelligence/validation path now normalizes compatible redundant read metadata before strict validation. A bounded set of unresolved planning errors degrades to conversation with no authorized saved-data scope and an empty read-only frame. Complete but oversized proposals can take that fallback; invalid ownership, unsafe filters, invalid dates, malformed mutation frames and transport failures remain strict. Explicit current pet names can narrow an overinclusive owned-pet read proposal; mutation proposals are not silently pruned.

General non-pet proposals no longer require a pet or episode clarification. The generator receives the recovery limitation and temporal scope without another provider call. The final intelligence acceptance boundary independently blocks reconstructed care actions, learnings and semantic events for read-only/no-owned-subject turns. This closes a downstream medication-action reconstruction bypass exposed during replay.

Temporal scope excludes explicitly historical, attributed and hypothetical clauses from current symptom detection while retaining uncertain current symptoms. A past report followed by "but now" current distress preserves current escalation. A historical model response marked urgent but explicitly not requiring immediate action cannot override routine server safety solely with that label. Active server safety is not lowered.

For current emergencies with historical evidence or episode results, final validation uses server-owned urgent guidance rather than letting a missing-history fallback replace it. Ordinary non-history answer processing remains intact. The emergency branch prioritizes immediate action; it does not attempt a combined historical narrative.

## Reproduction and verification
- Frozen real-model interpretation proposals from the existing 200-question benchmark were replayed through the production callback with synthetic records and mocked generation.
- Initial 14 planning/conversation regressions: 0/14 before.
- Expanded temporal suite before temporal corrections: 15/19 passed, four failed.
- Final focused suite: 22/22 passed, including unseen conversational wording and forged write proposals.
- Full default suite: 2,296/2,296 passed; zero failed/skipped/cancelled.
- Typecheck: passed.
- Lint: passed with the two existing unused-parameter warnings in persist-learnings.ts.
- Production build: passed.
- git diff --check: passed.
- Original lifetime audit freshly rerun: 14 passed / 3 failed; expectations and fixtures unchanged.
- Benchmark questions, stored outputs and scores unchanged.

Verification commands:
node --experimental-transform-types --test scripts/audits/ask-plan-recovery.cases.mjs
node --test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
node --experimental-transform-types --test scripts/audits/ask-lifetime-history.audit.mjs
git diff --check

Diagnostic logs: C:/Users/gwara/AppData/Local/Temp/furvise-plan-{focused,full,typecheck,lint,build,lifetime}-verified.log.
The lifetime command intentionally exits 1 for its three retained failures.

The existing generalization test was updated only for the now-supported redundant read-operation conflict. Its ownership/date rejection cases remain. An early emergency implementation bypassed history grounding and allowed an unsupported count; full-suite verification caught it and the implementation was corrected to server-owned emergency guidance. Invalid date/frame rejection and ordinary emergency answer behavior also remain covered by the full suite.

## Limits and cost
No additional live provider calls were made. The existing conservative cumulative testing ledger remains $4.40531625 against the authorized $5 cap (about $0.59 remaining). Replays are local regressions, not a second model benchmark. The last measured live result remains 106 good / 35 partial / 31 fail / 28 error out of 200. No percentage improvement is claimed.

Read-only fallback can sacrifice personalization or require a useful clarification; it does not turn failed planning into successful historical retrieval or a confirmed save. Natural wording still depends on generation. The English temporal parser is bounded; complex quotation, coordination and time scope are not universally solved. Lexical retrieval misses, unlinked historical episodes, completeness certification and full conversation-chain generalization are not redesigned here.

Providers and database boundaries were mocked. No authenticated browser, PostgREST, real database or live-model acceptance was performed. No Docker startup, dependency installation, migration, push, merge or deployment occurred. Follow-up live evaluation needs enough explicitly available testing budget and must use unchanged scoring plus held-out cases.
