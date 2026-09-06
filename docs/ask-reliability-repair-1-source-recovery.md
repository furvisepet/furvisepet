# Ask repair 1: source-grounded concern recovery revision

Base: `b98847e78059d4872f020243b38330d52e3e60d1`, on the existing isolated
`codex/ask-reliability-repair-1` branch. Earlier repair commits are preserved.

## Causes and execution paths

The concern transition extractor omitted ordinary ongoing symptoms. The
concern-specific reducer then chose the last recognized transition by source
position rather than event chronology. Its pet-name check treated an
unrecognized subject as the selected animal. Semantic recovery governance
considered selected model evidence and competing model proposals, so an omitted
source clause could bypass its contradiction check. Finally, a grounded target
did not imply that the proposed title, note, or additional resolution keys were
safe to persist.

The route resolves the turn subject and loads server-owned context, then invokes
the orchestrator. Its generation callback invokes `runFurviseIntelligence`; the
orchestrator's generation-input hint is not the actual intelligence input.
Recovery now goes through `classifyConcernEvidenceState` /
`isRecoveryGroundedForConcern` in suggestion selection, safety reconciliation,
model care-action policy, deterministic automatic resolution, and health or
concern-linked semantic terminal governance. Semantic episode compatibility and
existing confidence/safety checks remain additional gates, not write authority.

The final pending-suggestion function is extracted unchanged in responsibility
from the route into `persist-pending-suggestion.ts`, with injected database,
authority-client, and logging dependencies. The route still supplies these
server-side. It reloads active, unresolved concerns using owner and pet filters,
checks the fresh target, and rebuilds accepted resolution payloads from the
canonical concern and pet-bound owner spans before inserting a pending row.

## Bounded changes and reuse

- Reuse owner-assertion spans and their uncertainty/conditional/attribution scope,
  exact evidence alignment, existing external-animal/person surface helpers,
  concern topic aliases, and semantic episode compatibility.
- Add source-event ordering for current, relative-day, and explicit calendar
  evidence. No competing-event decision falls back to sentence position.
  Equal or unsupported ordering cannot authorize resolution.
- Bind observations across all current-message clauses, including outside-animal
  antecedents omitted from model output. Unknown explicit subjects do not default
  to the selected pet. Ordinary unambiguous animal pronouns remain supported;
  route-level turn-subject authorization remains in force.
- Share deterministic target selection with the recovery gate rather than using
  recency-ranked recovery candidates as authority. Generic improvement cannot
  select an arbitrary concern. Partial improvement is not terminal cessation.
- Preserve useful qualified reports as neutral history with owner wording intact.
  Reject shortened uncertainty evidence, recovery metadata on history payloads,
  and outside-animal source attribution. Explicit follow-up saves remain history
  actions, not implicit concern resolutions.
- Remove the breathing suggestion's extra lethargy-resolution keys: one owned
  concern's evidence cannot authorize additional concerns without evaluation.

Implementation files: `app/lib/ai/{concern-event-order,recovery-subject,
concern-engine,turn-classifier,ask-orchestrator}.ts`,
`app/lib/intelligence/{care-history-policy,memory-policy,safety-state,
semantic-events,run-intelligence,persist-pending-suggestion}.ts`, and
`app/api/ask/route.ts`.

## Behavioral verification

The initial downstream regression file produced eight failures before the
implementation changed. These included all three review blockers and reordered
dates, undated conflict, and an outside-animal pronoun continuation. Additional
red tests exposed a contradictory predicate without a repeated subject and a
recurrence pronoun preceding its explicit topic. The extracted persistence
function also reproduced a forged model note/title being inserted despite a
correctly grounded concern target.

Acceptance coverage includes:

- Yesterday's cessation plus current vomiting, in either narration order: no
  terminal suggestion, automatic action, semantic terminal event, or pending write.
- Recurrence today followed by yesterday's recovery, including “It started again”:
  no resolution. Same-day or undated conflicting events abstain.
- August 19/20 events reordered both ways: later symptoms block; later clear
  recovery survives. Clear undated “He stopped vomiting” remains supported.
- Sister's/friend's dog Bruno, other named animals, and following pronouns:
  no Milo recovery. Named Milo and unambiguous pet pronouns remain positive controls.
- Leading/trailing uncertainty and coordinated conditionals: no terminal mutation.
  Qualified history retains its exact wording and neutral payload.
- Model output omitting source contradictions: direct semantic and care-action
  policy tests reject the terminal interpretation.
- Explicit save requests: intended history remains available, and outside-animal
  notes are not relabeled as the selected pet.
- Final persistence: mocked fresh owner/pet lookup, stale/absent authority, lookup
  failure, exact returned and inserted canonical payloads, positive reordered
  chronology, explicit saves, and zero writes for rejected suggestions.
- Earlier answer-fact, decimal/date, question, mixed-message, correction, and
  deterministic emergency regressions remain covered.

Focused reliability tests: **66 passed**. Full `node --test` suite:
**2,103 passed, 0 failed**. `npm run typecheck` passed. `npm run lint` passed
with the two existing unused `supabase` parameter warnings in
`persist-learnings.ts` (lines 149 and 378). `git diff --check` passed.

Source-contract tests were redirected to the extracted persistence module;
behavioral database mocks now exercise the real function. Older tests that
expected undated conflict, uncertain or differently named observations, forged
keys, or general improvement to authorize terminal recovery were strengthened.
Their positive controls now use certain, correctly named, ordered evidence;
the formerly accepted unsafe inputs have explicit rejection assertions.

## Limitations and scope

This is a conservative source parser, not general temporal or coreference NLP.
Unsupported date formats, same-day ordering without a supported ordering cue,
cross-month dates without years, and ambiguous subject references abstain from
resolution. Complex legitimate reports can therefore require clarification or
remain history rather than trigger an automatic action. No timezone or missing
year is invented. Non-health, unlinked semantic lifecycles retain their existing
governance; this is not a replacement of the entire semantic engine.

Verification uses mocked generation and persistence dependencies and direct
production governance functions. It does not claim a live-provider, deployed
HTTP, or real-database end-to-end run. No provider calls, production changes,
migrations, schema changes, retrieval/caching work, model selection changes,
push, merge, or deployment were performed.

The principal design refinement is stricter terminal semantics: a general
improvement can remain an observation but cannot produce a “resolved” payload.
The pending persistence extraction is a test seam, not a new authority boundary.
