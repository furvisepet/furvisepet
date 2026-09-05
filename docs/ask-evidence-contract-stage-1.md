# Ask lifetime-history repair: Stage 1 evidence contract

## Scope and branch

Implemented on `codex/ask-evidence-contract-stage-1`, in the isolated worktree
`C:/Users/gwara/furvise-ask-evidence-stage-1`, based exactly on audit commit
`8e9e6df3fe6fbed2c236af9d54cb4b8f96ce200b` from
`codex/ask-recovery-integration`. All integration and recovery commits remain
ancestors. Other worktrees, including the dirty copy-polish worktree, were not
changed. No target merge, push, deployment, migration, credential change,
production access, or live provider call.

Repository instructions and the Next.js/Supabase skills were consulted. Local
Next.js route documentation was read; this change does not introduce a new
route API or database operation. Dependencies were reused through a local
node_modules junction, without installation or copying environment files.

## Actual execution path and changes

1. `app/lib/intelligence/retrieve-context.ts` records the outcomes of existing
   source loads, before policy filtering and selection: source IDs/counts,
   configured caps, unavailable sources, historical date filters, and lossy
   projections. Queries and caps are unchanged.
2. `app/lib/intelligence/ask-evidence.ts` defines the server-owned contract.
   It preserves the original query, requested topics/period, owned subject IDs,
   per-pet/per-source loading states, and separate retrieval, correction,
   extraction, and grouping completeness. A short or empty successful result
   remains **unknown**, not complete. An additional pet's profile does not
   imply that its history was loaded. No new history ranking authority exists.
3. `app/api/ask/route.ts` creates the contract inside the **actual generation
   callback** and passes it to `runFurviseIntelligence`. The callback still does
   not use the orchestrator's `generationInput`; modifying that unused object
   would not have repaired this path.
4. `app/lib/intelligence/run-intelligence.ts` passes the same contract to the
   real `generateContextAwareAskResponse`. Question-only factual recall clears
   model-proposed writes before governance; mixed assertions and explicit
   saves retain their existing pathways. Recovery, canonical rebuilding, and
   the fresh owner/pet-scoped pending-persistence authority lookup are unchanged.
5. `app/lib/ai/ask-reasoning.ts` carries coverage through existing selection
   and budget reductions. Represented spans identify the complete serialized
   record value, its source ID, pet, and character range in that value (not
   byte offsets in a database row). Loaded IDs are distinct from represented
   IDs. Oversized opaque values are omitted whole with an explicit loss,
   never emitted as a prefix missing a correction, negation, or qualifier.
   Memory preprocessing no longer cuts a prefix either. Omission counts refer
   only to supplied candidates, never to all stored or omitted history.
6. The contract is attached to the server result, never parsed from model
   JSON. `app/lib/intelligence/validation/validate-answer.ts` consumes it after
   generation. Recognized counts, exhaustive comparisons/summaries, absence
   and result/diagnosis lookups receive a deterministic scoped limitation when
   evidence cannot authorize an answer. Ambiguous episode references request
   clarification. Unsupported prose is removed from the whole answer, including
   sections and follow-ups. Deterministic emergency guidance remains first.

The existing 48,000-character prompt-context budget, models, output limits,
quotas, and entitlements are unchanged. Mandatory scope/coverage cannot be
silently discarded to fit: if the envelope alone exceeds the budget, generation
fails before the provider call. This is a safe error, not successful retrieval.

## Before and after

The initial eight actual-path regression checks failed before implementation.
They reproduced missing coverage/provenance, unsupported exhaustive answers,
and prefix truncation. The expanded 26-check Stage 1 matrix now passes.

- A model's fabricated seven-episode total, normal urine-test result, arthritis
  diagnosis, or 0.2 kg exhaustive comparison is replaced with a scoped limitation
  for the recognized request. Missing data cannot prove absence.
- Capped, failed, date-filtered, unknown, ambiguous, and profile-only second-pet
  coverage reach the actual mocked provider and returned validated result.
- A long correction-bearing note is omitted whole and marked partial, not
  silently reduced to the uncorrected prefix. Useful retrieval of that full
  corrected record remains a later-stage requirement.
- A small weight-note answer remains unchanged; a short Aug. 19 / 27.8 kg
  source with uncertainty, negation, and a second animal survives exactly.
- Synthetic, server-certified complete evidence plus a scope-bound verified
  count renders the verified fact instead of a contradictory model answer.
  Missing correction/grouping/extraction certification or an omitted proof
  source prevents that authorization. Production does not yet compute such
  complete-history facts; it deliberately supplies no verified totals.
- Explicit save of the preceding owner observation still yields an accepted
  care action. Mixed observation/question messages remain observations.
  Recall with fabricated model writes produces no accepted care/semantic/
  memory writes. Existing recovery/persistence regressions continue to pass.

## Verification actually run

- `npm test`: **2,180 passed, 0 failed**. Includes the default wrapper which
  executes and checks all **26** Stage 1 actual-path cases in a child process.
- `node --experimental-transform-types --test scripts/audits/ask-evidence-contract.cases.mjs`:
  **26 passed** independently.
- `node --test tests/ask-reliability-repair-1.test.mjs tests/concern-recovery-source.test.mjs tests/pending-recovery-persistence.test.mjs tests/ask-context-reasoning.test.mjs tests/ask-evidence-contract.test.mjs`:
  **172 passed**, including existing mocked final recovery-persistence cases.
- `npm run typecheck`: passed.
- `npm run lint`: zero errors; only the two pre-existing unused `supabase`
  warnings in `persist-learnings.ts:149,378`.
- `git diff --check`: passed.
- Remaining lifetime audit: **22 checks, 6 passed, 16 failed**, exit 1.

The shared synthetic harness exercises the real loader, real intelligence
runner, real generator/provider request builder and parser, and final answer
validator. Network fetch throws; provider responses and database results are
mocked. It does not execute an HTTP request through the full Next.js route,
real Supabase RLS, or production admission/billing. Route callback wiring was
inspected directly. Complete-history certifications are explicit test-only
fixtures, not claims about production loading. No general factual entailment
verification is claimed.

## Test migration and remaining red audit

Six requirements moved from the explicit lifetime audit to the default suite:
coverage metadata, unavailable-source disclosure, and four bounded fabricated
answer cases. Their behavioral assertions now inspect the actual contract and
returned answer, rather than an earlier proposed `coverage` property name.
The old compact-context wording assertion now checks that omissions refer to
supplied candidates and adds full supported-value/source-span assertions. The
existing selection-cap assertions remain. No failing retrieval behavior was
made a green expectation.

The remaining audit still explicitly fails for five old decisive-record
scenarios; intermediate 20 and final five selection; useful long corrected
record recall; late corrections across date filters; ordinal subject binding;
prior episode-list retention; multi-pet history loading; old canonical episode
coverage; episode sequence/recurrence identity; general hiding-resolution
answer entailment; and the pre-existing Furvise-addressed capability gate.
The long-record test is renamed to distinguish useful retrieval (still red)
from safe omission (now green). Run the red audit explicitly with
`node --experimental-transform-types --test scripts/audits/ask-lifetime-history.audit.mjs`.

## Limitations and next boundary

This stage does not fetch older pages, expand corrections, compute episode
totals, restore cross-turn bindings, or load every requested pet's history.
All four completeness dimensions remain conservative in production. Recognized
exhaustive requests therefore often receive a limitation even for small stored
histories. Ordinary supported answers are not given a generic disclaimer.
Request recognition is bounded English pattern recognition, not a universal
semantic verifier; unrecognized factual hallucinations remain possible (the
hiding audit deliberately demonstrates this).

Whole-span omission can reduce usefulness for long notes. Contract provenance
also adds prompt overhead within the unchanged budget and may cause additional
whole-record omissions. Spans duplicate serialized evidence for inspectability;
there is no token/latency benchmark or live-provider quality measurement here.
No retrieval or caching redesign was implemented. A later server retrieval/
effective-claim/grouping stage must supply genuinely complete scoped evidence
and verified aggregates before exact historical answers can be authorized.
