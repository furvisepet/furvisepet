# Furvise Human Architecture

## North star

Furvise behaves as one coherent brain coordinating specialized organs.

The user interacts with one mind and one voice. Specialized subsystems may be highly sophisticated, but none may independently redefine what the user meant, grant itself write authority, or publish a competing answer.

This architecture is intended to remain stable while features grow around it.

## Core model

```text
USER
  |
  v
PERCEPTION
  |
  v
FURVISE BRAIN  <---- working memory / conversation state
  |
  +----> SUBJECT ORGAN -----> entity / pet resolution only
  +----> MEMORY ORGAN ------> lifetime history / profile / evidence
  +----> SAFETY ORGAN ------> deterministic risk constraints
  +----> ACTION ORGAN ------> save / correct / lifecycle / navigation
  +----> BILLING ORGAN -----> admission / credits
  +----> DATABASE ORGAN ----> authoritative reads and commits
  |
  v
EXECUTIVE CONTROL
  |
  v
ONE FURVISE RESPONSE
```

## Permanent boundaries

### 1. One turn authority

Every user message becomes exactly one authoritative turn contract before downstream systems act.

That contract owns subject identity, user intent, memory depth, prior-turn references, mutation authorization, and confirmation state.

Classifiers, planners, retrievers, models, and validators may contribute signals. They do not own independent copies of these decisions.

### 2. Organs do jobs; the brain decides

An organ can be sophisticated while remaining narrow.

- Subject resolution may identify a pet, person, or external animal. It cannot change mutation authority.
- History retrieves and projects records. It does not decide whether the user wants to save something.
- Safety can block or constrain actions. It does not become a second conversational agent.
- Mutation can execute an already-authorized action. It cannot infer authorization.
- Billing can admit or reject work. It does not reinterpret the request.
- The language model may reason and propose actions. A proposal is not authority.

### 3. Reads may be probabilistic; writes require proof

Natural-language interpretation may be uncertain. A database mutation may not be.

A write requires server-verifiable user authorization for that mutation class. Authorization has explicit provenance:

- `current_turn`: the current user message contains an affirmative command.
- `transport`: an explicit product control, such as Save note, supplied the authorization.
- `durable_capability`: an earlier user turn was already verified as an authorization and the server retained that capability while waiting for missing information.

The following are never write authorization by themselves: subject clarification, selected-pet context, prior assistant wording, arbitrary prior user wording, the mere existence of a pending task, retrieved history, model inference, or a suggestion that a note would be useful.

A durable capability is different from trusting prior prose: the server must identify the exact user authorization turn and re-verify that it contained an affirmative command.

### 4. Clarification is field-local

A clarification resolves only the missing field it was requested for.

```text
User: he rolled down the hill yesterday
Furvise: Which pet do you mean?
User: Pebble
```

The second user turn may resolve `subject = Pebble`. It may not create or change intent, mutation authority, confirmation state, or unrelated retrieval scope.

A different flow is valid when the user already authorized an action:

```text
User: save that as a note
Furvise: Which pet?
User: Pebble
```

The final turn does not create permission. It supplies the missing subject to a previously verified durable capability.

### 5. Memory and action are separate systems

Understanding or recalling a fact does not imply permission to create a permanent record. Furvise may understand that Pebble rolled down a hill without creating a care-history entry.

### 6. One final voice

Organs return structured results to the brain. Only the brain publishes the final user-facing response. A subsystem must never independently return a contradictory completion such as `Note saved` when no authorized write actually committed.

### 7. History behaves like an event ledger

Pet history remains correction-aware and append-oriented. Corrections, deletions, source changes, and lifecycle events are represented through lineage and authoritative projection rather than pretending old records never existed.

The existing lifetime-history retrieval and evidence work should be preserved and moved behind the memory-organ boundary rather than rewritten.

### 8. Retry is a workflow concern, not a second attempt at meaning

A logical turn has one identity and one authoritative decision state. Retries recover or resume that turn; they do not reinterpret it from scratch after partial side effects.

### 9. Dangerous state transitions require confirmation capability

Lifecycle and destructive actions require deterministic confirmation where policy says so. The model may propose the action, but the action organ physically cannot commit it until confirmation has been satisfied.

### 10. Extension rule

Future Furvise features should be added as either a new brain capability that extends the canonical turn contract, or a specialized organ with a narrow interface.

Do not add a new independent intent authority, mutation authority, subject authority, memory-scope authority, or final-response authority.

## Current canonical brain modules

```text
furvise-brain/
  turn-authority.ts           canonical immutable turn state
  mutation-authorization.ts  deterministic write-authorization proof
  subject-authority.ts        subject-only field updates
  interpretation-authority.ts model interpretation -> advisory cognitive fields
  memory-organ.ts             brain-scoped lifetime/profile retrieval boundary
```

The owner-note task continuation and direct owner-note persistence paths already cross the brain mutation gate before they can reach a database write.

## Canonical turn pipeline

```text
RECEIVED
  -> PERCEIVED
  -> SUBJECT_RESOLVED
  -> TURN_AUTHORIZED
  -> MEMORY_PLANNED
  -> EVIDENCE_RETRIEVED
  -> REASONED
  -> EXECUTIVE_VALIDATED
  -> COMMITTED
  -> RESPONDED
```

Failures are explicit stage outcomes. A retry resumes or replays from durable state where safe.

## Mutation capability lifecycle

```text
user message / product control
        |
        v
verify authorization
        |
        +---- invalid ----> no capability, no write
        |
        v
mint turn capability
        |
        +---- complete input ----> action gate ----> commit
        |
        +---- missing field -----> durable pending capability
                                      |
                                      v
                              clarification fills field
                                      |
                                      v
                              re-verify capability
                                      |
                                      v
                                  action gate
                                      |
                                      v
                                    commit
```

A pending object without valid authorization provenance is inert. It may not be resumed into a write.

## Migration strategy from current Ask

1. Introduce canonical turn authority and mutation firewall. **Established; owner-note paths wired.**
2. Require server-verifiable authorization provenance for every current or resumed write. **Established for owner-note paths.**
3. Route subject resolution through canonical subject authority. **Adapter established; main route migration next.**
4. Make interpretation/classification modules advisory inputs rather than independent authorities. **Interpretation adapter established; main route migration next.**
5. Move lifetime retrieval behind a memory-organ interface. **Interface established; main route migration next.**
6. Move remaining writes behind the action-organ gate.
7. Centralize response publication through one brain-owned finalizer.
8. Reduce `app/api/ask/route.ts` to transport, admission, orchestration, and response delivery.

No broad rewrite is required. Each stage can be migrated behind stable interfaces with regression coverage.

## Non-negotiable invariant

> One brain. Many organs. One authoritative understanding of the turn. One mutation gate. One final voice.
