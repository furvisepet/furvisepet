# Advisory hints: intentional semantic migration

Base: aa8f76eb4ad8df4edef5e738f4aee5c0403cbba9. Offline only; no model calls, live Ask, deployment, or legacy branch deletion.

## Boundary and factual meaning

Ordinary ticketed reads (native selection, generic result sets, plain reads, chronological compatibility) now remove searchHints before factual acquisition, effective processing, predicates, ordering, selection, and coverage/certification. The existing common organs run once. No hint is parsed into a predicate, date, subject, need, or selector. The source ticket retains advisory provenance; the executor sees the same typed semantic fields without hints, not a second planner representation.

Factual meaning remains in subjects, predicates, temporal fields, selection, and grounded needs. Two guidance-only sentences now explicitly prohibit hints as the sole carrier of factual meaning. No provider fields, binder logic, normalization of English, or grounding rules changed. A topic encoded only in a hint is an upstream semantic omission; this code cannot recover it. An empty predicate means an unfiltered scoped set, not an inferred hint topic. There is no missing generic topic primitive: existing text_any predicates already carry it. Offline mocked proposals prove legal representation, not future model compliance.

## Application inventory and actual effects

| Entry / caller | Classification before migration | Actual effect / disposition |
|---|---|---|
| history-retrieval.ts retrieveTicketHistory -> translateLegacyReadSelection | B factual authority | Hints previously blocked chronological normalization because they changed retained factual records. Finite single/group and multi-subject result take, and unbounded result sets now normalize despite hints. Calendar/independent-obligation exclusions remain. |
| lungs.ts retrieveReadTicket / old requested.sort(score) | B factual authority | Literal hint score preceded finite/global transport and could choose an older factual winner. New readWithSupportingContext boundary withholds hints from ordinary factual execution. Protected operators retain the physical old code. |
| lungs.ts hint reasons and final/group partial status | B factual coverage | Hint presence alone used to force partial. For ordinary ticketed reads it no longer reaches those checks. Actual scan, omission, correction, and certification checks remain. |
| effective-selection.ts retrieveEffectiveSelection group.status | B factual coverage | Removed hint presence as a broad-coverage downgrade. Clause certification, frontier, lineage closure, selectionStatus, blocked logic unchanged. |
| ordered-result-set.ts isOrderedResultSet | B eligibility | Advisory hints no longer prevent generic all-matching-set certification. The proof algorithm is unchanged. |
| history-retrieval.ts candidateIds transport bookkeeping | C mixed | Hint presence no longer chooses the candidate accounting mode. Actual strategy/needs remain responsible for their own metadata. Supporting candidates never enter factual candidateIds, entries, requiredSourceIds or proof. |
| supporting-context.ts contextSignalsFromTicket / allocateSupportingContext | A advisory only | Existing bounded allocator now consumes effective snapshots already acquired by ordinary reads. Separate supportingContext output, maySatisfyObligations=false. No new retrieval. |
| read-ticket.ts / ask-request-contract.ts | semantic proposal guidance | Topic meaning belongs to typed predicates; hints may suggest optional explanation only. Validation of hint syntax and incompatible episode/need combinations remains unchanged. |
| evidence-read-ticket.ts bindEvidenceReadTicket via ask-evidence.ts createAskEvidenceContract | C unsupported direct input | Direct already-loaded evidence rejects hints along with retrieval operators. This strict refusal does not select a hinted winner or grant factual authority. Left unchanged: broadening this direct publication contract would change authority policy. |
| lungs.ts calendar_samples/calendar, event_candidates, temporal_endpoints reservation/fill | B/C protected compatibility | Can still use hint ranking in the old executor. Explicitly excluded by this task; not claimed fixed. Endpoint adapter retains legacy_hint_ranking exclusion. |
| history-retrieval.ts non-ticket retrieval branch -> history-synthesis.ts orderHistoryEvidence; historyQueryRelevance/historyEventRelevance | B/C legacy factual relevance | Search terms/event facets influence bounded acquisition, lexical/broad fallback, candidate ranking and represented records; chronology/endpoint/need receipts derive from that set. No authoritative typed ticket exists for these inputs. Cannot safely strip their only topic meaning. Remains legacy pending upstream typed-plan migration, not downstream hint parsing. |
| history-retrieval.ts needGroups, targetGroups, currentGroups, periodGroups, vetGroups, requiredSourceIds | C mixed responsibilities | True independent obligations and reservations affect queries, receipts and transport. Kept unchanged; not relabeled optional merely because they use terms. Vet Brief and calendar/current/episode semantics remain outside this cut. |
| ai/ask-reasoning.ts buildAskContext, meaningfulTerms, scoreRecord, chooseUpdates | C legacy representation/relevance | With interpreted history, preserves retrieval ordering for care rows; unticketed/other source types still use raw-question relevance/recency. Remains separate legacy input path; not a searchHints consumer. |
| ai/ask-reasoning.ts latestNeedScopedCareIds, enforceAskPromptContextBudget | C mixed obligation/representation | Need-scoped selection and priority retention persist; unchanged independent obligations and publication safety. Certificate-bound source authority still restricts supported factual claims. |
| history-source-transport.ts source compaction | A representation | Metadata/body budget compaction, not searchHints-based selection; unchanged. |

No runtime traffic counts inferred from static reachability. One application compatibility call remains at retrieveTicketHistory; it carries the normalized ticket downstream into evidence/Labs.

## Supporting context

read-supporting-context.ts observes store.effective and store.effectiveWindow results without extra calls. The latest snapshot per subject replaces earlier snapshots; a failed effective read invalidates the prior observation. Raw page rows are never offered as support. Unclosed or unavailable subject snapshots are excluded. Owned subject/date scope is enforced again by the allocator; after-anchor equality is excluded. Missing/unresolved anchors never fall back to whole history.

After factual execution, authoritative rows consume the existing 32-record/18,000-character allocator budget first (allocator uses full snapshot size). Optional literal signals reserve bounded context; remaining optional rows follow existing allocator scoring. No transport budgets increased. If mandatory snapshot representation cannot fit this optional-context budget, support is omitted; the already-produced factual result and certificate are unchanged. Supporting omission/acquisition state is separate from factual coverage.

supportingContext is retained separately on ReadResult and askHistory. It is not merged into factual entries, source authorization, receipts, certificates, or Labs facts. This cut does not add a Mouth consumer or change renderer/source authority. Profiles are never retrieved by this allocator; same-valued profile facts cannot replace historical certificates.

## Changed expectations and safety retained

| Test | Retired expectation | Replacement invariant |
|---|---|---|
| legacy-hint-migration (former 13 counterexamples) | Food/medicine/rare hints change older/latest winner; hints-only mismatch forces partial; hint blocks normalization | Same explicit semantic plan gives identical records and coverage regardless of hints. Optional support may vary. Budget pressure, corrections, deletions, scope and exclusions remain asserted. Expanded to 18 tests including directional proofs, anchors, unavailable lineage and guidance. |
| legacy-selection-expressiveness, hint test | Hint wins before limit and unbounded scan remains partial | Newest scoped record wins; older hinted row is optional support; exhausted factual set is complete. |
| legacy-read-selection exclusion | Chronological hints cannot normalize | Chronological migration tested above; protected endpoint hints still excluded. |
| ordered-result-set exclusions | Any hint prevents ordered set | Only calendar/independent/endpoint exclusions retained. Hint-bearing set proof tested in migration suite. |
| furvise-read-obligations advisory/mandatory misses | Both forced partial by hint presence | Exhaustion proves the explicit lexical query complete/complete_empty; mandatory predicate still filters, advisory hint never substitutes. |
| ask-read-ticket-diagnostics captured thin-term Dune subtest | Hints force partial when predicates fail to match weighed | Still no selected record and calendar rule still rejects. Complete_empty is explicitly relative to ticket_text_predicates, not semantic absence inferred from hint wording. |

### One changed 222-audit assertion

Case: **shared lexical retrieval reserves scoped context for different wording without growing query budgets**.

Old proposal carried rest only in searchHints with empty predicates; old assertion required bounded_period_context_not_semantic_completeness. That asserted hint authority over factual coverage, not scan safety.

New mocked upstream proposal explicitly carries text_any(rest, slept) for the requested rest-history meaning; searchHints(rest) stays advisory. Same owned contextual event, exclusion of foreign pet, unchanged query budget and prompt/serialization checks remain. New assertions require no hint-induced factual warning, explicit typed predicates, and non-authoritative supportingContext. No runtime synonym/phrase rule was added. This case remains passing; all other audit assertions unchanged.

Audit before/after: **208/222**, exactly the same 14 failure names (programmatically compared). No unrelated failures waived. Broader safety retains exactly its same two failures.

## Chronological migration coverage

Newly migratable: finite single-subject chronological order/take, multi-subject finite globally ordered take, and unbounded ordered effective sets carrying any allowed advisory hints, including formerly winner-changing/no-match/redundant hints. Native grouped/result/union/anchored selection also ignores hints factually. This is intentional semantic correction, not parity with old winners. Native hintless results and coverage are the oracle.

Still legacy: calendar combinations; external independent evidenceNeeds exclusions; existing bound needs use their own common need path; episode/mixed compatibility; non-ticket lexical/relevance retrieval. Protected endpoint reservation/fill and event_candidates are untouched. Therefore the chronological branch is **not deletion-ready**. Plain hint-ranked chronology is no longer a blocker; all legacy relevance execution is not removable yet.

## Verification

- hints: tests 18, pass 18, fail 0
- context: tests 26, pass 26, fail 0
- compatibility: tests 61, pass 61, fail 0
- resultSets: tests 67, pass 67, fail 0
- probes: tests 22, pass 22, fail 0
- publication: tests 74, pass 74, fail 0
- brain: tests 77, pass 77, fail 0
- safety: tests 48, pass 46, fail 2
- body: tests 185, pass 185, fail 0
- audit: tests 222, pass 208, fail 14

Body includes Lungs, effective selection/history, Heart receipts, temporal/anchor and read-obligation tests. Publication includes certificate-bound source authority, Labs, diagnostics and direct evidence. Tests ran under offline-network-guard; no paid providers.

Broader safety baseline failures: episode membership production callback regressions; reviewed Ask effects execute inside the single Brain handoff. Audit failure set matches prior ledger exactly.

Clean typecheck and production build passed in dependency-complete gate checkout with .next and tsconfig.tsbuildinfo removed first. Whitespace check passed. No package, dependency, protected executor, effective-truth, certificate algorithm, Heart, publication authority, Labs renderer, Brief or Immune edits. The only effective-selection change removes the hint-derived broad-coverage downgrade.
