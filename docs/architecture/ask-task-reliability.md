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

1. General task continuation beyond owner-note saves: persist a task ID, original request/source-message
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


## Owner-note continuation implementation

The note operation now has a durable task adapter. The existing interpretation
call proposes save, resume, or cancellation using message references and an owned
pet name. The server resolves the reference to an actual USER message and saves
its exact text. Assistant drafts cannot supply note content. There is no list of
follow-up phrases or topic-specific save handler.

A private, RLS-enabled task journal retains the source and authorization message
IDs independently. A save with an unknown subject becomes `awaiting_subject`;
a later subject answer can complete it. An exact, uniquely owned pet name fills
that missing field by data lookup before AI admission, even when the Ask allowance
is exhausted. Extra instructions or ambiguous names retain semantic interpretation. The pending task survives the short
conversation window. Unrelated turns do not execute it. A new save can supersede
it, and cancellation ends it. Revision checks and conversation locks reject
stale turns. The care entry, enrichment outbox, and completion receipt commit
in one database transaction. Exact replay reuses the receipt; it never restores
a deleted or edited entry.

A bounded task-context read provides active task state and database-confirmed
receipts associated with the source, save instruction, and completing follow-up.
Receipt questions therefore do not rely on the assistant saying it saved
something. Ownership and source text are checked again inside the transaction.
Only the trusted service role can call the task functions; neither browser roles
nor model output can write the private journal directly.

Pure note continuations and missing-subject clarification release the Ask credit.
Mixed note-and-answer requests preserve the saved note if answer generation
fails. Relative `today`/`yesterday` dates use the original source timestamp in
the request timezone, not the later save time. Other unresolved dates retain
literal source wording and recorded-date provenance; no exact occurrence is
invented. Source-timezone changes between turns remain a limitation until source
messages carry their own timezone metadata.

### Verification and release gates

- PostgreSQL checks run against a disposable PGlite database with both the existing
  owner-note migration and the new task migration. They cover ownership, source
  text, revisions, long conversations, replay, cancellation, stale turns,
  deleted entries, enrichment outbox insertion, receipts, grants and RLS.
- Executable route tests use the actual admitted callback and request validator,
  substituting only infrastructure and provider boundaries.
- New retrieval scenarios use three unrelated topics, records a century apart,
  and 10,000 distractor rows. All six requested sources remain retrievable within
  the existing query and record budgets. Missing-evidence cases distinguish a
  completed empty query from unavailable, bounded, unqueried, omitted or
  foreign-pet evidence.
- These are deterministic tests with synthetic provider contracts. They do not
  measure real-model intent accuracy. Live provider credentials were unavailable
  in this workspace, so real-provider paraphrase and multi-turn acceptance is
  still required before merging/deploying. Do not present test counts as launch
  readiness.
- Deploy the new migration before the application change. A missing task backend
  fails closed rather than silently losing pending-task state. No production
  migration or deployment has been performed by this change.
- This adapter covers owner-note saves, not every mutation category. Multi-note
  splitting, corrections and other application actions retain their existing
  governed paths. Extend the task mechanism by operation category only after
  defining its authority and receipt contracts.


## Follow-up integration audit

The preview build and Security CI passed for the initial continuation revision
(`8f6402b`). The review then found and fixed these additional boundaries:

- A pending mixed task retains its original USER request and an independent
  answer obligation. Resolving the pet cannot turn it into a note-only success.
  Retrieval and both answer-review paths see that server-retained whole request,
  not only a short subject reply or a model restatement.
- A saved note with an unfinished answer remains `awaiting_answer`. The note
  receipt and original question survive another turn or an answer failure.
  Finalizing a reviewed complete assistant answer completes the task in the same
  database transaction. Rolling back the answer also rolls back task completion.
- Cancelling that remaining answer leaves the already-saved note intact and says
  so. It cannot falsely claim that the note was never saved.
- Superseding a pending task binds the new source to the new authorization.
  Exact replay and receipt reads recheck current pet ownership.

Validation now includes 31 disposable-PostgreSQL assertions and additional
executable contract/route cases for mixed tasks and cancellation after a save.
The production database remains unchanged. The connected deployment tools could
not create access to the protected preview, no Supabase development branch
exists, and no live model credential is available locally. Therefore the hosted
migration, authenticated app flow and real-provider acceptance remain unverified.
The successful build is not a substitute for these release gates.
