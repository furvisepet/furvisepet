# Ask episode review repair

Parent: 1e195bc8e5b1628030db383e98c5664dcef00de6
Branch: codex/ask-episode-review-repair

## Changes
- Episode mentions alone no longer authorize count/list replacement. Explicit counting/listing and established references retain the episode path.
- Stable follow-ups include complete effective source notes in chronological order after existing identity, version, correction and ownership validation. These are attributed observations, not causal conclusions.
- A new migration adds validated half-open period arguments to episode discovery before its candidate limit. Pinned identities retain independent revalidation. The former signature is replaced with defaulted parameters; rollback restores it.

## Verification performed locally
- Three behavioral reproductions failed before repair and pass afterward.
- Focused episode and regression cases: 19 passed.
- Full node test suite: 2,184 passed, zero failures/skips/cancellations. The wrapper includes the nested regression cases.
- Typecheck passed. Lint passed with two existing warnings in persist-learnings.ts.
- Diff whitespace check passed.
- Disposable PostgreSQL migration application, expanded episode SQL tests, rollback, original SQL tests, reapplication and expanded SQL tests all passed.
- SQL verifies date discovery beyond nine older episodes, half-open boundaries, invalid ranges, grants, ownership, bounded sources and stable references.
- Final disposable database checks: zero other sessions, zero care rows, zero disabled care-entry triggers. Migration remains installed; test fixtures rolled back.

## Limits
Only furvise-stage2-db-2788f0b / stage2_validation was used. No remote changes or provider calls occurred. Source-note follow-ups are extractive; arbitrary causal synthesis and general factual verification are not solved. Exact lifetime totals and unlinked grouping remain unsupported. The lifetime audit was not rerun or reclassified. Intended-environment PostgREST timeout/schema/grants remain unverified. Deploy the new RPC signature before the updated application; reverse that order for rollback. Broader scale/index performance was not benchmarked by this repair.
