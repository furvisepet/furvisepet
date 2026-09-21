# Unbounded ordered result-set migration

Base: 7798d271c5ca920c9ebde8734ebfdd953d52e8a2.
Offline only; no live Ask, deployment or paid provider/API calls.

## Semantics and normalization

An eligible typed chronological input with outputs.limit:null becomes the same
subjects, predicates, temporal expression, completeness and ordering, with no
outputs.strategy and no selection clause. There is no invented take, large N, or
unbounded-budget bypass.

The adapter still refuses hints, calendar selectors, independent bound needs,
independent envelope evidenceNeeds, and episode semantics. Other strategies are
unchanged. Native plain result-set reads and normalized inputs share the ordinary
Lungs acquisition/window/predicate/order/transport pipeline.

Finite plain chronological cases already use grouped or global compositional
selection from the preceding cuts. Both finite and unbounded plain chronological
inputs now avoid old chronological execution. Excluded strategy combinations and
non-ticket legacy retrieval paths remain; the whole branch is not deletion-ready.

## Common effective history

The existing fair acquisition envelope remains four pages of 64 candidate slots.
No subject gets privileged acquisition based on proposal order. Unbounded reads
must establish the entire accessible matching set; a directional top-N proof is
not sufficient.

After acquisition, the common result-set path invokes the existing store-owned
effectiveWindow resolver once per subject. It does not add a correction algorithm,
change store queries, or increase closure budgets. The existing resolver loads
replacement seeds outside the initial page and closes correction/deletion and
linked-source lineage before predicates/window matching.

An unavailable or unclosed effective window contributes no raw candidates as
authoritative rows. A store-validated attributed unlinked report retains its
existing provenance and can still be reported under existing policy. It cannot
establish an edge, lineage closure, or an exhaustive result-set certificate.
This distinction preserves the existing unlinked-report safety fixtures.

One failed or incomplete subject keeps the whole exhaustive obligation partial;
other resolved subjects retain their independent proof. Total acquisition failure
still reports unavailable. Missing/ambiguous temporal anchors retain existing
limitations and never widen the window.

Fallback stores exposing only effective() remain conservative: exhaustion and
reliable effective resolution are required for full-set proof, and unresolved
source lineage blocks completeness. They cannot promote a bounded raw scan into
an exhaustive matching set.

## Derived result-set proof

coverage.resultSet is a derived receipt over the ticket, effective stream and
represented rows. No independent persisted truth table or planner authority is
introduced.

Shape:
- subjectIds, predicates, temporal, resolved windows, ordering;
- per subject:
  - exhausted and lineageClosed;
  - observed effective matchingIds;
  - retainedIds and omittedIds;
  - matchingSetComplete, representationComplete, certified, reasons;
- global matchingIds, retainedIds and omittedIds in result order;
- global matchingSetComplete, representationComplete, certified, reasons.

Matching IDs describe the observed effective matching set. Only
matchingSetComplete:true establishes that no additional eligible rows remain.
Completeness requires every subject to be exhausted with closed effective truth.
Exhaustive publication additionally requires every matching row to be represented.

For 100 matching records and a 32-record transport cap:
- matchingSetComplete can be true;
- matchingIds has 100 entries;
- retainedIds has 32 and omittedIds has 68;
- representationComplete and certified are false;
- coverage is partial, with mandatory existing limitation copy.

The proof does not authorize exhaustive counts or absence from an incomplete
scan. It does not introduce a separate source-authority policy for narratives.
Existing non-selection evidence policy remains unchanged; deterministic Labs
contain the same represented care sources, never substituted profile values.

## Oversized records and transport

Old unbounded chronological execution:
- orders the effective matching records;
- skips an oversized whole record instead of truncating its body;
- continues to later fitting records;
- stops at the fixed record limit;
- records omitted IDs and effective_evidence_budget/read_budget_or_limit;
- emits a per-subject chronology boundary receipt, blocked if its boundary is lost.

Before this cut ordinary no-selection transport stopped at an oversized record.
The common unbounded result-set path now uses the safe whole-record skip behavior.
Every omission remains in the generic proof and blocks exhaustive publication.
No record/character cap increased. Bodies are never partially fabricated or cut
to fit.

## Chronology consumer inventory and disposition

| Consumer | Class | Treatment |
|---|---|---|
| ask-evidence.ts::attributedHistoryAnswer boundary safety check | A: requires coverage proof | Migrated reads use subject result-set certification and represented source presence. No generic set is converted back into a chronology boundary. Missing any required representation blocks boundary authority. Existing fallback prose selection itself is not rewritten. |
| review-history-narrative.ts::reviewHistoricalAnswer coverage payload | A: needs proof, plus B: metadata | Carries resultSet for migrated reads; preserves chronology only for remaining legacy inputs. Review instructions/source-selection policy are unchanged. |
| history-retrieval.ts::retrieveTicketHistory perPet status | B: coverage/provenance transport | Uses independent result-set subject status rather than copying another pet's global partial state. ticketCoverage carries the same proof. |
| labs-list.ts::buildLabsList | A/B: proof-to-representation boundary | Validates generic receipt scope, order, IDs, per-subject ownership, omissions and completeness against the supplied payload. Missing or inconsistent representation rejects before the unchanged renderer. |
| read-projection.ts latest-saved and latest-cohort phrase-driven branches | C: legacy factual selection | Not adapted. They require old boundary receipts and receive none from migrated reads; they cannot acquire authority from a fabricated compatibility boundary. Left for later strangulation. |
| history-retrieval.ts old latest-save/earliest/latest producers and boundary-priority allocation | C: old factual retrieval/allocation | Remain on non-ticket legacy paths. Ticketed reads return through the common path before these branches. No new producer or adapter to this authority was added. |
| history-retrieval.ts chronology-ID mapping at the ticket bridge | B: legacy transport only | Remains conditional for excluded strategies; migrated reads emit no chronology field, so this mapping is not used. |
| HistoryCoverage.chronology / ReadCoverage.chronology types | Compatibility contracts | Retained for active excluded paths. Not factual authority for migrated result sets. |

No chronological boundary is reconstructed from generic result IDs for a raw-English
executor. The broader legacy selectors inside fallback prose and projections are
not removed in this cut; their later migration remains necessary.

## Publication snapshot and safety

result-set-publication.ts validates the existing organ receipt, not another
selection. It rejects:
- changed subject scope, predicates, temporal window or ordering;
- mismatched matched/retained/omitted ID lists;
- duplicate or foreign represented identities;
- mismatched per-subject ownership;
- claimed completeness inconsistent with exhaustion, closure or representation;
- dropping retained rows between organ transport and Labs construction.

Existing Labs snapshots still protect values, dates, order, whole bodies and
post-construction mutation. The renderer, authority policy, generation/review
instructions and mutation paths are unchanged. Exact-count/absence/exhaustive
safety tests remain at their original baseline.

## Parity and tests

30 new tests compare adapter output and native plans for records, order, complete
coverage/proof, source-policy outcome, represented care-source IDs and publication.
Legacy executor comparisons additionally cover records, candidate/omission
accounting, exhaustion and coverage status across exact-equivalent fixtures.
Generic proof adds explicit blocking reasons instead of preserving chronology
object identity.

Cases: ascending/descending, one/many subjects, rotations, explicit window,
no matches, corrections, deletes, outside-page correction, 100-to-32 transport,
oversized body, character pressure, independent subject exhaustion, alternate
predicate, incomplete empty scan, partial lineage, partial retrieval failure,
conservative fallback, completeness preservation, all three anchor relations,
snapshot mismatch, profile non-substitution, excluded inputs, attributed
unlinked provenance, production retrieval bridge, and model-free Labs review.

One obsolete compatibility test asserting that unbounded chronological remains
excluded was replaced by the new parity suite. Two earlier expressiveness
witnesses now assert the implemented generic proof/oversized behavior; their old
limitations are intentionally resolved. No protected body/audit expectations
changed.

Final verification:
- unbounded result set: 30/30
- remaining compatibility/parity: 39/39
- expressiveness regressions: 10/10
- bounded global result selection: 37/37
- body/architecture (including Lungs/effective-selection): 185/185
- publication/Labs/authority: 74/74
- Brain/interpreter/timeout: 77/77
- broader safety: 46/48, exact same two baseline failures
- audit: 208/222, exact same fourteen baseline failures
- typecheck: passed in dependency-complete gate checkout
- clean production build: passed after removing .next and tsconfig.tsbuildinfo
- whitespace: passed

Audit and broader-safety failure identities were compared against the preceding
committed-cut ledger. Tests use the offline network guard.

## Remaining chronology dependence

No eligible active plain chronological ticket, finite or unbounded, requires the
old executor through the sole application ticket-retrieval boundary.
Still excluded: hints/relevance, calendar semantics, independent needs/probes and
episodes. Non-ticket legacy factual retrieval/projections also still exist.
The old chronological branch remains physically present and is NOT deletion-ready
as a whole. temporal_endpoints reservation/fill, calendar_samples and
event_candidates remain untouched.
