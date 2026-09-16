# Ask task reliability

## Implemented completion boundary

A model proposal, reviewed answer, persisted assistant message, executed action,
and billable task are different facts. `assessTaskExecution` combines the live
server assessment with execution receipts; it contains no question vocabulary.
The lifecycle trace and billing share the task-outcome calculation.

The route persists the reviewed answer, executes authorized effects, derives the
task outcome, and only then settles the reservation. Explicit pending or failed
mutations release the reservation. A care-note batch needs distinct persisted
entry IDs for every requested note. Clarification remains free. A read answer
requires a complete evidence assessment. Failed optional background learning
does not invalidate an otherwise complete read.

Execution remains behind existing ownership, capability, governance, operation
lease, and idempotency checks. The new contract does not grant write authority.
It consumes live server results, not model-authored success flags. It does not
rewrite reviewed prose after execution; action and care receipts show outcomes.

When assistant insertion acknowledgment is lost, the route compares the durable
body with the reviewed body before continuing under the same operation lease.
A finalized response replays the existing ledger decision. On later replay, an
undecided interrupted attempt receives a release disposition; existing complete
or release decisions remain immutable, and integrity conflicts still fail closed.
An unfinished durable answer is explicitly presented as incomplete. Recovery does
not rerun uncertain side effects or infer success from message existence.

This is not an atomic transaction across answer storage, every side effect, and
billing. A crash after an effect but before a completion disposition can leave a
successful effect uncharged. That favors the owner over charging an unproven task.
An interrupted task is not automatically resumed by this change.

## Remaining architecture gates

These are required work, not features implemented by this change:

1. Durable task continuation: persist a task ID, original request/source-message
   IDs, authorized subject, requested operations, missing inputs, revision, and
   state (`awaiting_input`, `ready`, `executing`, `completed`, `failed`,
   `cancelled`). Interpret each new turn against that state. Server validation
   must enforce ownership, source references, optimistic revision checks, and
   cancellation/supersession before execution. A short confirmation must resolve
   against a real pending task, never a growing list of phrases.
2. Evidence retrieval: evaluate source selection separately from answer quality.
   Retrieve by the interpreted information need, preserve coverage limits and
   source IDs, and test absent as well as present history. Keep event time distinct
   from recorded time and resolve relative dates using the source message's time.
3. Claim grounding: bind factual claims to retrieved records and classify missing
   information explicitly. Evidence unavailability must not become invented
   history. The existing evidence review must cover novel combinations of needs.
4. Owner-note purity: store user-authored content and its origin independently
   from AI summaries or interpretation. A draft cannot become owner testimony
   simply because the assistant generated it.
5. End-to-end evaluations: hold out paraphrases and multi-turn conversations;
   test subject changes, cancellations, partial failures, lost acknowledgments,
   retry/replay, date ambiguity, and missing history. Measure task completion,
   retrieval coverage, unsupported claims, unnecessary clarification, duplicate
   effects, and credits charged per fulfilled request. Review anonymized failure
   clusters with bounded retention; fix shared mechanisms, not exact questions.

The Sable conversation remains an acceptance scenario for task continuation.
Passing the completion/billing tests alone does not establish launch readiness.
