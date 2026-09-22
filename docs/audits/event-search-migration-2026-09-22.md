# Explicit event-search migration and empty-state proof (2026-09-22)

Base: 79b6ad810ecb3fc2893989b8137fec6cae5c5a0e. Offline only; no provider calls or deployments.

## Exact original failing fixture

Question: Show the latest dental record for Aster.
The fixture profile display name is Aster; its bound fixture ID is milo.

Bound/normalized ticket:

```json
{"subjectScope":"named","subjects":{"petIds":["milo"]},"operation":"read","needs":[],"episode":null,"searchHints":[],"temporal":{"from":null,"to":null,"anchor":null,"calendar":null},"predicates":[{"kind":"text_any","terms":["dental"]}],"selection":{"groupBy":["subject"],"union":[{"orderBy":[{"field":"event_at","direction":"desc"}],"take":{"count":1,"per":"group"}}]},"outputs":{"completeness":"sufficient","ordering":"desc","limit":1}}
```

The provider legacy strategy was event_candidates and its explicit selection intent was latest. The adapter removes strategy; the original output limit remains the transport cap independently of semantic take.

Runtime proof captured before changing publication:

- Resolved window: [1900-01-01T00:00:00.000Z, 2026-09-04T18:00:00.000Z).
- Acquisition: 1 row, 1 page for milo; history queryCount 2 (including the effective-history work).
- Acquired/effective IDs: [routine]; body: Usual walk.
- Matching/selected/retained/omitted IDs: all empty.
- Continuation: empty; subject exhausted true.
- lineageClosed true; replacementSeedsExhausted true; graphCalls 1; lineageRows 1.
- Group clause: descending/count 1/IDs []/certified true.
- Group status and selectionStatus: complete_empty; blocked false.
- Overall ticket coverage: complete_empty, matchSemantics ticket_text_predicates; reason no_cross_query_snapshot.
- No resultSet object: this is a selection. matchingSetComplete/representationComplete are not stored as those fields on this receipt. Exhaustion plus closed lineage establish completeness of the literal match set; no omitted IDs and transportValid true establish representation of that empty match set.
- Derived obligation: selection:milo:0; authority certified; certificateType selection; status complete_empty; authorizedSourceIds []; certifiedRecordIds [].
- Old dispatch: buildLabsList -> serializeLabsList -> deterministic Labs review -> complete final assessment, zero generation/review provider calls.

Answer to the proof question: YES for the literal text_any predicate in the resolved accessible window; NO for broad semantic absence of dental-related records. The fixture is NOT accepted as safely certified semantic emptiness under this cut. A teeth-cleaning note without the word dental is the executable counterexample.

## Two states, no new request operator

CERTIFIED_EMPTY_SEARCH means the requested empty claim is supported by existing common proof. This implementation conservatively permits the existing empty Labs response when the complete, closed effective subject scope contains no surviving records. With no records there can be no missed lexical synonym. Existing exhausted selection or resultSet proof must still certify it. Closed deletion of the final surviving record is covered. Incomplete acquisition or lineage never gains empty authority.

UNRESOLVED_REFERENCE means event identity is unproven. It remains outside this adapter. Zero candidates is not historical absence; ambiguous candidates are not silently normalized to top-1 by this migration. The protected legacy ambiguity behavior itself is not repaired here.

A third diagnostic distinction is necessary: a fully specified lexical search can have an empty literal set while the requested concept remains uncertain. It also receives the existing source-free limitation, not a broad empty claim. No downstream code reads the question to infer conceptual completeness. No arbitrary synonym-list length is treated as semantic proof.

## Implementation boundaries

- ask-request-contract.ts::bindTicketedRead invokes the existing translateLegacyReadSelection adapter before the original typed reference/latest/earliest intent is discarded. Bound subjects and predicates still come from existing validators.
- legacy-read-selection.ts::translateLegacyReadSelection consumes only typed compatibility intent and the bound ticket. It does not retrieve, interpret English, certify or publish.
- interpret-ask.ts::AskInterpretation.readCompatibility is server-owned provenance, not provider vocabulary or a new plan.
- history-retrieval.ts::retrieveTicketHistory retains only an empty eventCandidateIds limitation trigger for migrated empty searches. Nonempty migrated membership is exclusively common proof membership. The marker never certifies absence; certified empty Labs can supersede that legacy limitation trigger only with adequate proof.
- labs-list.ts::buildLabsList first defers empty candidate discovery without common proof to the existing limitation, including quantity records. It also declines the factual empty response for lexical-empty selections/resultSets with surviving effective records or without the stronger empty effective-scope evidence. Organ certificates and renderer copy are unchanged.
- validation/validate-answer.ts::validateGeneratedAnswer allows the exact existing source-free limitation past the factual-authority requirement. Both input and final response are checked. Additional prose, title, follow-ups, sections, source IDs, calculations, referenced records or pending actions fail closed. This does not grant a factual publisher a bypass.

## Migrated and excluded shapes

Eligible: explicit recall/records searches with typed nonempty predicates, owned subjects, resolved/default accessible window, and latest/earliest intent matching the ordering plus a finite cap; single subject uses existing group take, multiple subjects existing result take. Explicit unbounded period/summary exhaustive requests use existing ordered resultSet with no selection. Native grouped selections are unchanged.

Excluded: reference intent or referenced turns; anchors on event_candidates; calendar; episodes; independent needs/evidence obligations; separate requirements; profile fields; projections/record selection; nonhistorical scope; unclear cardinality; hints containing meaning absent from typed predicates; a bound ticket with no preserved typed intent. Anchor-plus-selection remains its existing separate native composition.

A hint exactly duplicating an existing predicate term can remain optional context. It cannot replace the common ordered winner. This is an intentional retirement of legacy hint winner selection, tested explicitly.

## Test comparison correction

bindReadNeeds preserves omitted needs versus [], but both bind zero needs. Lungs and adapter dispatch use needs?.length. Test parity canonicalizes only that empty representation (including the embedded ticket in the authority view); production normalization was not changed. An additional execution equality test proves omitted and [] yield the same result.

The existing ordered-result-set no-match test retains complete_empty and certified literal-set assertions. Its parity helper now permits null Labs, and the test additionally requires null Labs for lexical emptiness among surviving unrelated records. This strengthens publication safety; exhaustion/lineage assertions were not removed. No audit expectation changed.

## Offline verification

- migration: # tests 37; # pass 37; # fail 0
- characterization: # tests 16; # pass 16; # fail 0
- firewall: # tests 12; # pass 12; # fail 0
- hints: # tests 18; # pass 18; # fail 0
- context: # tests 26; # pass 26; # fail 0
- compatibility: # tests 61; # pass 61; # fail 0
- resultSets: # tests 67; # pass 67; # fail 0
- probes: # tests 22; # pass 22; # fail 0
- publication: # tests 74; # pass 74; # fail 0
- brain: # tests 77; # pass 77; # fail 0
- safety: # tests 48; # pass 46; # fail 2
- body: # tests 185; # pass 185; # fail 0
- audit: # tests 222; # pass 208; # fail 14

The migration suite includes explicit empty scope, exhaustive resultSet emptiness, incomplete acquisition, unresolved/ambiguous reference, lexical synonym counterexample, final tombstone, nonmatching correction, unclosed lineage, refusal tampering, profile substitution, transport pressure and subject rotation. Integration empty/limitation fixtures require zero generation and review provider calls.

Broader safety known failures:
- episode membership production callback regressions
- reviewed Ask effects execute inside the single Brain handoff

Audit unchanged 14 failures:
- premise repair is bounded and revalidates exact user evidence
- a premise repair cannot authorize invented pets or mutation scope
- read planner can omit extraction while writes still require a valid frame
- five-pet earliest/latest weight retrieval certifies both endpoint pairs even when lexical weight matching misses weighed prose
- real admission lets a repaired planner reach composition without opening extra repair cycles
- supplied premises narrow stale owned-history plans without granting writes
- general knowledge never widens owned authority and saved history still validates ownership
- supplied-context classification requires actual verbatim user premises
- missing premises use bounded repair without inventing evidence
- event evidence survives both budgets among verbose routine observations
- rejected event answers retain relevant source excerpts instead of the latest profile
- new observation plus calculation can repair an invalid correction plan without weakening validation
- profile contract mistakes get one bounded repair with full ownership revalidation
- a failed mixed answer cannot commit proposed observation side effects

Clean typecheck and production build passed from a fresh tracked-source export plus the reviewed diff, with the dependency-complete installation, offline network guard and no untracked public assets. Whitespace check passed. No deployment is authorized by this cut.
