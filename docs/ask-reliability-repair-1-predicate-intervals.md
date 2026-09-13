# Repair 1 revision: predicate evidence and temporal intervals

Base: `dbe22d63c011de030df1a985e14214da1591f66a`, on the existing isolated
`codex/ask-reliability-repair-1` branch. Prior commits are preserved.

## Causes and correction

1. Recovery detection suppressed ordinary symptom predicates in the same owner
   clause. Coordinated past-tense predicates without a repeated subject therefore
   disappeared. The extractor now emits separate, extractive predicate spans,
   inheriting subject, topic where omitted, uncertainty, and applicable negation.
   An explicit new auxiliary resets inherited negation; an elided one does not.
   Auxiliary/participle continuations remain in their parent owner assertion
   instead of being dropped as questions. Predicate offsets now match their
   evidence surfaces, rather than starting partway into the quoted evidence.
2. Temporal periods were compared as representative point values. They are now
   intervals: today's interval contains this morning's interval. Recovery must
   be wholly later than competing evidence; overlap, unsupported ordering, and
   incompatible temporal qualifiers cannot authorize terminal recovery.
3. The absence of competing evidence previously made historical recovery look
   current. The shared concern decision now receives the actual `opened_at`.
   A dated historical recovery must fall within the current concern's applicable
   interval, not predate or overlap its opening. Unsupported historical wording
   abstains. An independently clear current recovery remains valid even when the
   message also recounts an older recovery.

The shared decision remains the gate for orchestration, automatic resolution,
model care-action policy, and concern-linked semantic recovery. Semantic episode
targets supply their authoritative `started_at` as the applicability boundary.
The final persistence function still reloads owner/pet-scoped active concerns and
rebuilds canonical payloads; neither its lookup nor its write code was changed.

## Behavioral verification

Before implementation, 13 new persistence-first matrix cases failed, including
all four reported reproductions. The final matrix checks the shared decision,
orchestration with mocked generation, automatic actions, and the actual pending
persistence function with mocked database dependencies. Blocked cases assert no
terminal suggestion, payload, action, or write; positive cases assert exact
canonical proposed and persisted payloads.

Coverage includes reordered predicates, comma/semicolon variants, omitted
subjects and topics, auxiliary continuations, coughing/bleeding/hiding as well
as vomiting, source offsets, inherited negation and uncertainty, historical
years/dates, unsupported historical references, overlapping day/day-part times,
clear undated recovery, and ordered day/day-part positive controls. A separate
test varies the fresh concern opening under the same proposed payload to verify
that the database record controls historical applicability.

The new extraction initially over-propagated negation into an explicitly new
auxiliary, and the temporal fallback initially confused symptom frequency
“once” with historical time. Regression tests exposed both during implementation;
both were corrected. Existing successful cases and their expectations remain
unchanged.

- Focused reliability tests: **104 passed**.
- Full `node --test` suite: **2,141 passed, 0 failed**.
- `npm run typecheck`: passed.
- `npm run lint`: passed, with the same two pre-existing unused `supabase`
  parameter warnings in `persist-learnings.ts`, lines 149 and 378.
- `git diff --check`: passed.

## Limits

This remains bounded deterministic grammar, not general temporal/coreference
NLP. Unsupported periods and unanchored historical references abstain. Day parts
use coarse intervals rather than invented event instants. Calendar applicability
uses the server's UTC date reference; no owner-specific timezone is introduced.
Yearless dates compare within one month and require a current-year concern for
historical applicability; cross-month/yearless ordering is not inferred. Some
legitimate imprecise reports can remain history or require clarification instead
of automatically resolving a concern.

No live provider or real-database integration run was performed. No retrieval,
caching, model-selection, schema, migration, production, push, merge, or
deployment changes were made.
