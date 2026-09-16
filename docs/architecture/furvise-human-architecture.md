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

That contract owns:

- subject / pet identity
- user intent
- memory depth
- references to prior turns
- mutation authorization
- confirmation state

Classifiers, planners, retrievers, models, and validators may contribute signals. They do not own independent copies of these decisions.

### 2. Organs do jobs; the brain decides

An organ can be sophisticated while remaining narrow.

Examples:

- History retrieves and projects records. It does not decide whether the user wants to save something.
- Safety can block or constrain actions. It does not become a second conversational agent.
- Mutation can execute an already-authorized action. It cannot infer authorization.
- Billing can admit or reject work. It does not reinterpret the request.
- The language model may reason and propose actions. A proposal is not authority.

### 3. Reads may be probabilistic; writes are deterministic

A natural-language interpretation may be uncertain. A database mutation may not be.

No write can occur unless the current authoritative turn contains explicit user authorization for that mutation class.

The following are never write authorization by themselves:

- subject clarification
- selected-pet context
- prior assistant wording
- prior user wording
- pending tasks
- retrieved history
- model inference
- a suggestion that a note would be useful

### 4. Clarification is field-local

A clarification resolves only the missing field it was requested for.

Example:

```text
User: he rolled down the hill yesterday
Furvise: Which pet do you mean?
User: Pebble
```

The second user turn may resolve `subject = Pebble`.

It may not change:

- `intent`
- `mutation.allowed`
- `mutation.kind`
- `confirmation`
- unrelated retrieval scope

This invariant prevents subject clarification from turning into accidental persistence.

### 5. Memory and action are separate systems

Understanding or remembering a fact does not imply permission to store it permanently.

Furvise may understand:

> Pebble rolled down a hill yesterday.

without creating a care-history entry.

Permanent storage requires its own current-turn authorization.

### 6. One final voice

Organs return structured results to the brain. Only the brain publishes the final user-facing response.

A subsystem must never independently return a contradictory completion such as "Note saved" when the authoritative turn did not authorize a write.

### 7. History behaves like an event ledger

Pet history remains correction-aware and append-oriented.

Corrections, deletions, source changes, and lifecycle events are represented through lineage and authoritative projection rather than pretending old records never existed.

The existing lifetime-history retrieval and evidence work should be preserved and moved behind the memory organ boundary rather than rewritten.

### 8. Retry is a workflow concern, not a second attempt at meaning

A logical turn has one identity and one authoritative decision state.

Retries recover or resume that turn. They do not reinterpret it from scratch after partial side effects.

### 9. Dangerous state transitions require confirmation capability

Lifecycle and destructive actions require deterministic confirmation where policy says so.

The model may propose the action, but the action organ physically cannot commit it until the confirmation capability has been satisfied.

### 10. Extension rule

Future Furvise features should be added as either:

1. a new brain capability that extends the canonical turn contract, or
2. a specialized organ with a narrow interface.

Do not add a new independent intent authority, mutation authority, or final-response authority.

## Canonical turn pipeline

```text
RECEIVED
  -> PERCEIVED
  -> TURN_AUTHORIZED
  -> MEMORY_PLANNED
  -> EVIDENCE_RETRIEVED
  -> REASONED
  -> EXECUTIVE_VALIDATED
  -> COMMITTED
  -> RESPONDED
```

Failures are explicit stage outcomes. A retry resumes or replays from durable state where safe.

## Migration strategy from current Ask

The current Ask implementation contains valuable capabilities but overlapping decision makers. Migration is incremental:

1. Introduce the canonical turn authority and mutation firewall.
2. Route subject resolution through the canonical turn.
3. Make interpretation/classification modules advisory inputs rather than independent authorities.
4. Move lifetime retrieval behind a memory-organ interface.
5. Move all writes behind the action-organ gate.
6. Centralize response publication through one brain-owned finalizer.
7. Reduce `app/api/ask/route.ts` to transport, admission, orchestration, and response delivery.

No broad rewrite is required. Each stage can be migrated behind stable interfaces with regression coverage.

## Non-negotiable invariant

> One brain. Many organs. One authoritative understanding of the turn. One mutation gate. One final voice.
