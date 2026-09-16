# Furvise Human-Core Architecture

Status: foundational contract for Ask Furvise first, reusable by Voice Furvise and Vet Brief.

## North star

Furvise behaves like one mind coordinating specialized organs.

There is one authoritative understanding of each user turn, one executive-control boundary for side effects, and one final voice to the user. Specialized subsystems may be sophisticated, but they are not independent decision-makers.

The architecture is intentionally evolutionary: the core contracts should remain stable while individual organs can be replaced, improved, cached, parallelized, or moved behind services without changing product semantics.

## Human analogy

| Human system | Furvise system | Responsibility |
| --- | --- | --- |
| Perception | turn parsing / entity signals | Observe the message and produce candidate signals. |
| Attention | retrieval planning | Decide what context deserves retrieval budget. |
| Working memory | conversation authority | Maintain the active subject, topic, unresolved references, and recent dialogue. |
| Long-term memory | pet history / profiles / episodes | Store durable facts, events, corrections, and lifecycle state. |
| Recall | evidence retrieval | Return relevant evidence plus coverage; never decide what the user meant. |
| Reasoning | model reasoning | Synthesize evidence and propose language/actions. |
| Executive control | turn authority + policy validation | Decide what is allowed, what needs confirmation, and whether a proposed action can execute. |
| Motor system | persistence / application actions | Perform a pre-authorized action transactionally. |
| Speech | final response authority | Produce the one user-visible Furvise response from validated state. |

## Hard invariants

These rules are architectural, not prompt instructions.

1. **One turn authority.** Every user message has one canonical `FurviseTurnAuthority` object. Other modules may contribute signals but may not independently expand authority.
2. **Understanding is not permission.** Recognizing an observation, correction, loss statement, preference, or likely useful memory never grants write access.
3. **Clarification is field-local.** A reply such as `I mean Pebble` may resolve the missing subject and nothing else. It cannot create save consent, erase answer obligations, or change confirmation policy.
4. **Reads may be probabilistic; writes cross a deterministic gate.** Model output can propose an action. Commit code requires explicit mutation authority and any required confirmation capability.
5. **Memory organs do not speak.** Retrieval returns evidence and coverage. It does not create final prose or application actions.
6. **Action organs do not interpret.** Persistence accepts an already-authorized operation and performs it idempotently. It does not infer user intent.
7. **The model does not own truth.** Database receipts, source records, correction lineage, lifecycle state, and evidence coverage remain server authority.
8. **The brain owns the response.** Safety, retrieval, persistence, billing, and application-action subsystems return structured results. Final user-visible wording is finalized once from validated state.
9. **Retry resumes state; it does not replay meaning.** Durable turn identity and committed receipts determine recovery. A network retry must not create a second interpretation or side effect.
10. **Authority is monotonic.** Downstream systems may narrow or reject a decision. They may not widen subject scope, evidence scope, or write authority.

## Canonical turn flow

```text
USER
  |
  v
PERCEPTION ORGANS
  - selected pet
  - explicit names / pronouns
  - conversation focus
  - safety signals
  - candidate intent
  |
  v
FURVISE BRAIN: TURN AUTHORITY
  - subject
  - intent
  - memory depth
  - mutation state
  - confirmation policy
  |
  +-------------------+
  |                   |
  v                   v
MEMORY / RECALL       SAFETY / POLICY
ORGANS                 ORGANS
  |                   |
  +---------+---------+
            v
        REASONING
     answer + proposals
            |
            v
     EXECUTIVE CONTROL
  validate claims/actions
            |
       +----+----+
       |         |
       v         v
     ACTION     SPEECH
     ORGANS     (one final response)
```

## Authority model

`app/lib/brain/turn-authority.ts` is the first stable core contract.

A turn records:

- immutable turn and message identity;
- resolved subject and the basis for that resolution;
- canonical intent;
- required memory depth;
- mutation state (`forbidden`, `proposed`, or `authorized`);
- the exact authorization basis for an authorized write;
- whether confirmation is required;
- the fact that the brain, not an organ, owns the final response.

A mutation is committable only when:

- it is explicitly in `authorized` state;
- authorization evidence exists;
- exactly one subject is resolved for a subject-bound write; and
- confirmation-required operations carry a confirmed capability.

## Organ boundaries

### Conversation / working memory

Owns recent dialogue, discourse focus, pending unresolved references, and durable conversation identity.

Must not write pet history or invent mutation permission.

### Subject resolver

Returns candidate subject resolution plus provenance such as `selected_pet`, `explicit_user`, `conversation`, or `clarification`.

Must not classify save intent or execute actions.

### History / long-term memory

Owns bounded retrieval, pagination, source freshness, correction lineage, deletion handling, episodes, chronology, and coverage.

This is where the existing lifetime-history work belongs. It should be preserved and isolated, not rewritten into the brain.

### Evidence compiler

Transforms retrieved records into a bounded evidence package with source identity and coverage. It can reject unsupported completeness claims.

Must not change subject or write authority.

### Reasoning

The model receives the canonical turn plus governed evidence. It produces an answer draft and zero or more proposed actions.

A proposed action has no side-effect authority by itself.

### Safety

May block, narrow, escalate, or require confirmation. It cannot silently broaden a requested action.

### Mutation / action engine

Performs explicit operations transactionally and idempotently. It requires executive authorization before execution and returns database-confirmed receipts.

### Final response authority

Combines validated answer content, confirmed receipts, safety state, and recovery state into the single Furvise response.

No other organ should independently generate a contradictory user-facing success statement such as `Note saved`.

## Migration strategy from the current Ask architecture

The current system already contains valuable organs: lifetime retrieval, evidence contracts, conversation authority, action capabilities, idempotency, correction handling, and persistence receipts. The migration therefore wraps and consolidates rather than rewrites them.

### Stage 1 — Authority foundation

- Introduce immutable `FurviseTurnAuthority`.
- Lock the clarification/mutation invariant.
- Require executive authorization for side-effecting paths.
- Add regression tests for the Pebble subject-clarification failure and lifecycle confirmation.

### Stage 2 — One perception pipeline

- Convert turn classifier, request interpreter, command router, subject resolver, and conversation-intent logic into signal-producing organs.
- Compile their outputs once into turn authority.
- Remove downstream re-interpretation of the same user intent.

### Stage 3 — Memory separation

- Make retrieval accept only an approved retrieval plan from the brain.
- Preserve lifetime search, correction awareness, coverage, and old-history pagination.
- Separate working-memory recall from targeted and lifetime retrieval paths.

### Stage 4 — Executive action firewall

- Require mutation authority for owner-note, care-event, care-state, profile, memory, correction, and lifecycle commits.
- Require action capabilities for confirmation-gated operations.
- Make database receipts the only source of successful-action claims.

### Stage 5 — One final voice

- Centralize response finalization.
- Remove direct success/failure prose from organs except structured emergency fallbacks where generation is unavailable.
- Ensure response text always reflects committed database state.

### Stage 6 — Thin Ask route

`/api/ask` becomes transport and orchestration only:

```ts
const turn = await brain.perceive(request)
const evidence = await memory.recall(turn)
const proposal = await brain.reason(turn, evidence)
const decision = executive.validate(turn, proposal)
const receipts = await actions.commit(decision)
return brain.respond(turn, proposal, receipts)
```

Billing, rate limiting, auth, and idempotency remain infrastructure around the turn, not competing cognitive authorities.

## What should remain stable

The long-lived contracts should be:

- one turn identity;
- one subject authority;
- one retrieval request/evidence boundary;
- one mutation authority;
- one confirmation capability model;
- one durable completion state;
- one final-response authority.

Implementations behind those interfaces are expected to evolve. A system that literally never changes is not a realistic engineering goal; the target is a core whose invariants survive model changes, new features, larger histories, and new storage/retrieval strategies.
