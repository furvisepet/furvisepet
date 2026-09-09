# Shared Ask request architecture — 2026-09-09

The production stress benchmark remains 46/100 strict successes. This change has
not been deployed or measured with that live benchmark. Offline pass counts are
engineering verification, not answer-accuracy percentages.

## Problem

Interpretation, recovery, retrieval and presentation independently reinterpreted
question wording. This could discard a requested quantity, narrow an open date
range, lose a conversational referent, or replace an answer with a record dump.
Review could approve supported sentences while dropping another requested part.

## Shared changes

- Production interpretation emits a validated `ask-request.v2` contract carrying
  the standalone question, requirements, stable conversation references, quantity,
  subject scope and retrieval plan. It bypasses legacy wording-based recovery.
- Read requests cannot extract new write proposals. Owned identities and referenced
  turns are validated independently of the model; downstream write governance remains.
- Date boundaries apply independently to queries, corrected candidates and episode
  members. Comparisons retrieve both temporal ends for any topic within existing
  page, row and time budgets. The new path bypasses food-specific ranking.
- Referenced user and assistant turns retain IDs through context selection. They
  remain reference context, never saved factual evidence. Missing/truncated refs
  are explicit.
- Review must account for every requested requirement using retained answer chunks.
  It cannot approve a supported subset that silently omits another requirement.
  Tables, bullets and valid JSON retain their structure through review.
- Derived quantities cite literal source operands. Server arithmetic validates sums,
  differences, ratios, percentage changes, compatible unit conversion and elapsed
  days; semantic review checks meaning and direction. The new path disables the
  previous wording-dependent arithmetic exceptions.
- Unlinked correction uncertainty stays attached to the relevant report. It cannot
  establish a verified reassignment. Failed review produces an explicitly incomplete,
  attributed fallback rather than claiming the request was fully answered.

Existing legacy parsers and handlers remain for compatibility; this is a migration
of the production request path, not removal of every old module.

## Verification

- `npm test`: 2,441/2,441 passed, including the wrapper executing all 38 new cases.
- New cases use renamed pets and varied topics, actual generation/retrieval/review
  orchestration, synthetic database records and mocked model responses. They test
  boundaries and invariants; they do not test real model understanding.
- Targeted ESLint: zero errors; one existing unused-variable warning in
  `ask-reasoning.ts`.
- `git diff --check`: passed.
- `npm run build`: passed, including TypeScript and production page generation.
- A separate read-only Codex audit examined the previous architecture and identified
  shared contract, reference, coverage and review defects. It did not approve this diff.

## Remaining limits and next measurement

Retrieval is still bounded lexical/period retrieval, not exhaustive semantic recall.
Preserving temporal endpoints and per-pet fairness does not guarantee that each
requirement's evidence survived selection. Review reports missing evidence but
cannot discover records never retrieved. A future requirement-aware retrieval stage
must fit the same cost and ownership boundaries and prove its benefit independently.

Conversation references are limited to supplied dialogue; this change does not add
durable cross-conversation reference storage. Calculations support registered units
and literal operands, not arbitrary mathematical programs. Future-dated reports
continue to use attributed fallback instead of being treated as past events.

Before production rollout, run real-provider acceptance on unseen multi-part tasks,
format changes, renamed subjects, corrections, sparse and conflicting history, and
both three-month and five-year datasets. Keep first attempts, incomplete answers,
errors, latency, usage and mutation outcomes. Do not tune against the held-out set
or report a new accuracy score from these offline checks. Subscription history
entitlements are a separate feature and are not implemented here.
