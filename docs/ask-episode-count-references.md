# Bounded episode counts and displayed references

Base: `54418f00977cff8caa141a6990a6ff31bed82519`.
Branch/worktree: `codex/ask-episode-count-references`,
`C:/Users/gwara/furvise-ask-episode-count-references`.

## Delivered contract

The actual Ask generation callback now loads a server-owned episode result and
includes it in `AskEvidenceContract.episodes`. Final validation deterministically
renders its count and ordered list after prose normalization. Provider JSON cannot
change the count, introduce an item, or claim list completeness. Recall stays
read-only through the existing governance boundary.

The counted unit is an explicitly supported **recorded episode group**, not a care
entry, symptom occurrence, or inferred clinical incident. A usable group requires
an owned canonical episode ID, an effective linked care source with an explicit
positive onset statement, and current source/episode versions. Supported onset
syntax starts with the selected pet's name and “had/started/began a [new/separate/
recurrent] vomiting/soft-stool/breathing episode”. Negative, uncertain, correction
and multi-pet wording is withheld. Subsequent separate groups require an explicit
separate/new/recurrent boundary. No elapsed-time rule creates an episode.

Multiple linked updates do not increase the episode count. Conflicting repeated
onsets within one canonical group remain ambiguous. An explicit “vomited twice
during this episode” can annotate two occurrences within one group; this is not
summed across updates or presented as a complete occurrence count. Other occurrence
multiplicities remain unknown. Unlinked notes and heuristic episode IDs without
explicit supporting boundaries do not become counted groups.

**Exact lifetime totals remain unsupported.** `exactTotal` is always null and
coverage is partial, ambiguous or unavailable. The displayed count equals the
number of supported items actually listed. It is explicitly a subset, not proof
that missing episodes never happened. Legacy extraction/grouping and unlinked
correction coverage cannot be certified from the current schema, so this stage
adds no aggregate projection or false completeness marker. Relative/disjoint
periods, unspecified topics and multi-pet scopes clarify. Supported explicit
year/month/day scopes use the existing planner and half-open onset-time bounds;
an episode spanning a period boundary is not counted merely for overlapping it.

## Corrections, references and bounded work

Reuses canonical episode IDs, sequence/recurrence fields, source memberships and
the existing correction RPC/effective-claim reducer. Deleted, changed, inactive,
superseded and reassigned source evidence is withheld. Removed-relation tombstones
remain authoritative, so deleting a correction does not revive its original.
Member/episode versions are rechecked around correction processing; the reads are
still separate READ COMMITTED statements, not an atomic cross-query snapshot.
Unlinked corrections outside the bounded evidence remain a coverage limitation.

The reference envelope is attached at the real `persistAssistantAnswer` boundary
and final response reconciliation only when the summary and list match the server
result. It carries owner/conversation/pet/topic/period, partial coverage, original
ordering, episode/onset IDs and source-group/episode version hashes. Existing
service-only conversation RPCs persist it in `response_data.episodeReferences`;
client writes remain revoked. Old assistant prose and request-supplied IDs provide
no reference authority. Envelopes are stripped if the displayed answer is replaced.

An indexed owner/conversation lookup finds the last displayed envelope independently
of the recent-message window. First through eighth/last and “that one” resolve
against its original ordering; the latter needs a sole item or a previously
selected item. Pinned IDs are reauthorized and revalidated without reranking.
New history cannot displace the selected item. Changed/deleted/corrected sources
produce an explanation; pet/scope mismatches and ambiguous references clarify.
Reusing a full historical envelope does not certify its other items as current.

The migration adds two SECURITY INVOKER reads and three targeted indexes, with
EXECUTE only for authenticated callers and no RLS-policy changes. Episode discovery
merges at most four exact-key probes of nine rows. It hydrates at most eight groups,
nine members each, withholding a whole group if the ninth member is present.
Sources over 2,000 note characters/200 title characters carry an omission flag.
At most 64 candidate members enter the existing six-call/128-graph-row correction
budget. A second bounded episode read detects intervening membership changes.
Pinned follow-ups use episode primary keys. No request-time full-history scan or
unbounded pagination was added; index selection and scan latency are not guaranteed
by LIMIT. Both new RPCs reject missing/>8-second request statement timeouts.

The episode path adds at most two source RPC calls, six correction calls and one
reference read, with its own five-second client deadline, after the existing
bounded historical path. Model input independently retains the existing 48,000
character guard. The episode contract/list has at most eight items; omitted evidence
cannot become a complete list. There is no new provider call, model configuration,
cache, voice or Vet Brief change.

## Verification and limits

- Full default suite: **2,184 passed**, zero failures/skips/cancellations, including
  16 episode checks inside the generation/evidence/validation harness.
- Typecheck passed. Lint passed with the two pre-existing unused-parameter warnings
  in `persist-learnings.ts`. Diff whitespace checks passed.
- The harness uses the real context loader, generation callback, evidence builder,
  response parser, validator and conversation presentation/attachment. Provider
  output and database responses are mocked; fetch is forbidden. It covers two
  occurrences/one episode, updates, recurrence, ambiguity, old evidence, correction
  reassignment/tombstones, deletion, list agreement, intervening turns/reload/new
  history, pet switching, foreign IDs, stale references, failures and input bounds.
  It does not execute the complete Next HTTP/auth/billing handler.
- Actual PostgreSQL 17.6 tests ran only in `furvise-stage2-db-2788f0b`, database
  `stage2_validation`, using authenticated SQL calls. They verify bounded output,
  old/pinned episode lookup, deletion/omission flags, timeout prerequisites,
  foreign-pet/conversation denial, grants, RLS invoker execution, real service-only
  conversation completion and reference reload after 28 unrelated assistant turns.
  Existing correction SQL tests also passed. This is not PostgREST/JWT/network or
  a production-scale latency benchmark.
- Migration and rollback both committed successfully locally; reapplication and
  SQL tests passed. Fixtures rolled back. Final state: zero care rows, test users,
  other sessions or disabled care triggers; all three new indexes valid/ready;
  prior candidate/correction RPCs intact. New migration remains installed locally.
- Intended-environment PostgREST timeout, schema-cache/exposure and grant behavior
  remain **unverified**, including the prior candidate integration prerequisites.
  No remote migrations, live providers, push, merge or deployment occurred.

## Remaining original lifetime audit

Baseline and final: **17 checks, 6 pass, 11 fail**. No audit assertion was weakened,
removed or reclassified. Still failing: intermediate period selection; unlinked
late correction discovery; automatic Luna ordinal subject retention; recovering a
reference from prose-only old answers; multi-pet history coverage; old canonical
episodes without sufficient linked evidence in ordinary context records; ordinary
episode-record sequence/recurrence serialization; unsupported hiding resolution;
Furvise-addressed capability routing; exact unlinked legacy episode totals; and
complete weight-delta computation. The new structured-reference contract does not
retroactively make old prose or unlinked episode fixtures authoritative.

Checkpoint and local logs are listed in `ask-episode-stage-checkpoint.md`.
