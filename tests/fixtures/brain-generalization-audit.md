# Brain generalization: vocabulary audit and corpus

Base: `8c4577f38b98b593e53f25840f6b8ca2ffc04010`, verified on `launch/public-v1-rc` on 2026-09-26 UTC. This is newer than the earlier `2e4e8745…` checkpoint. The intended V1 for this track includes reads, writes and calculations; the earlier read-only launch recommendation is superseded.

This branch is an interpretation-contract increment, **not evidence that broad natural-language understanding or full V1 is solved**. It does not change route orchestration, product availability, UI, Heart, Lungs, Muscle, Labs or Mouth. No real provider was called.

## Audit before the production edit

| Intended primitive | Current vocabulary and boundary | Finding |
|---|---|---|
| Owned subjects | `ask-request-contract.ts::bindReadScope`, `readTicket.subjectScope`, server-owned `petIds`; selected/named/conversation/account scopes | Present. Names/references do not grant ownership. Explicit read and append targets can differ in the supported append-plus-read combination |
| Sources | `evidenceBasis`: saved_history, saved_profile, stored, supplied_context, general; `StoredRead` memory/current_state/operation_receipt | Present as distinct domains. No single typed operand union spanning all domains |
| Predicates | `read-ticket.ts::ReadPredicate`: only `text_any`; AND between predicates, OR between literal terms | No typed numeric comparison, exclusion, existence/null predicate or nested Boolean predicate algebra for record selection |
| Time | Complete from/to instants; semantic anchor concept with from/after/before; supplied time zone | Present for reads. One shared window/anchor per ticket; selection clauses have no local windows |
| Selection | `ReadSelection`: groupBy subject, event_at ordering, bounded take, union; provider grouped only | Present. Union clauses contain only orderBy and take, not independent predicates/windows |
| Grouping | Provider groupBy subject | No month/week/measurement-category grouping primitive |
| Arithmetic | Ten operators, semantic operand roles, exact record slots, prior-result references, result selection | Present for saved-history inputs. Counts require exhaustive unselected tickets; other operators require grouped selected slots |
| Typed supplied premises | `premiseQuotes` exists for conversational supplied context; `CalculateOperand` is slot or prior result | **Missing calculation input primitive.** User-supplied numbers are not typed arithmetic operands; root CalculatePlan requires saved_history/readTicket |
| Calculation DAG | Earlier-node references; max depth 8, 20 nodes, 64 operands/node; direct-only or result-only operands per node | Bounded DAG exists. Mixed slot/result operands, count dependencies, derived elapsed_days and DAG resultSelection are rejected |
| APPEND | One subject, 1–8 items, exact current USER spans, optional companion read | Present for this bounded composition. Relative write dates and repeated identical source occurrences are unresolved |
| REPLACE / REMOVE | Standalone jobs, exact supplied record handle or last event for subject; source-span authorization | Present. Arbitrary mixed operations and broad predicate-selected mutation sets are not representable |
| Profile mutation | `field-mutation-job.ts`: set_field for name/weight/current_food/routine_note/sex/breed; owner preference set/clear | Present but bounded. General profile clear_field, date of birth and arbitrary profile fields are absent |
| Lifecycle / concern state | `lifecyclePlan` active/deceased/archived; concern target handle, resolved/reopened | Present as standalone governed plans; not a general multi-operation transaction vocabulary |
| Follow-ups | USER referenceTurnIds; pending tasks, supplied record/receipt/concern handles; lifecycle pending state | Present, with bounded and domain-specific references. Assistant wording is not persistence or ownership evidence |
| General operation composition | Nullable root jobs; bound `jobs?: (AppendJob | ReadTicket)[]` | **Missing general composition primitive.** Current jobs array represents the append/read case only; it is not an arbitrary operation graph |
| Coverage/provenance | sufficient/exhaustive, source spans, references, selection positions | Present as requests/metadata; actual certification and mutation receipts remain downstream |
| Uncertainty/contradiction | Semantic frame and clarify/conversation modes; owner authorization checks | Requires real interpretation evaluation. The four modality cases below are not evidence of a missing schema by themselves |

Two important existing boundaries remain untouched:

- `public-v1-capabilities.ts` still disables Ask mutations and calculation execution at this base. Updating their interpretation contracts does not enable the product paths. The coordinating execution track must handle that scope separately.
- `interpret-ask.ts` contains a bounded second interpretation for certain invalid saved-profile proposals. The new mocked tests establish one successful handoff per legal fixture, not a universal one-call guarantee. No retry/orchestration policy was changed here.

There are also existing language-based helpers in `ask-request-contract.ts`, including owner persistence vetoes, subject/reference recovery and historical date compatibility. They were not added, broadened or removed by this change. This report does not claim the entire pre-existing Binder is free of lexical compatibility logic.

## Reusable contract clarification implemented

`CalculateSlot` already separates `subjectId`, `clause`, and `item`. Binder resolves `petName` separately, verifies it against the ticket's subjects, then reads `ticket.selection.union[clause]` and checks `item < take.count`.

The production change documents those independent coordinates in a shared exported contract string, the direct-operand schema description, and the individual provider field descriptions. The same contract string is included in `ASK_REQUEST_INSTRUCTIONS`.

For one grouped clause, three subjects can each address clause 0/item 0. Clause is not a pet index. A subject may independently address multiple existing clauses and occurrences. No new field, operator, selector, source type or Binder relaxation was introduced. This clarification applies to all direct calculations, including multi-subject result ranking; it does not special-case any named acceptance prompt.

The schema descriptions explicitly state that actual sibling-array bounds remain Binder-owned. Static integer ranges do not prove that a particular clause exists. Tests require the provider schema to accept a structurally plausible but nonexistent index while Binder rejects it.

The audit's larger missing primitives were **not** patched by adding unconsumed schema fields or stuffing typed work into free-text requirements. Each needs a coordinated contract and consumer design. This track cannot honestly implement full mixed execution or certified premise arithmetic while being prohibited from changing their execution consumers.

## Corpus accounting

152 utterances total:

- 116 typed semantic oracles in 29 families, four wording variants each.
- 32 explicit representation-gap examples across eight missing/limited primitive families.
- 4 unmeasured modality cases covering contradiction, revoked intent, hypothetical lifecycle and quoted malicious instructions.

Wording includes broken English, abbreviations, indirect requests, pronouns, explicit multi-pet requests, long historical ranges, arbitrary dates, profile-vs-history distinctions, all ten arithmetic operators, ranking, DAGs, saves, corrections, removals, lifecycle/state transitions and mixed read/write requests.

`brain-generalization-corpus.mjs` holds utterances and family labels. `brain-generalization-fixture.mjs` constructs proposals from the explicit family oracle, **not by parsing the utterance**. Production imports neither file. These proposal fixtures are reusable inputs for a future separately authorized real-model comparison. They must never be injected into production instructions as training examples or counted as model predictions.

The gap cases are not skipped green tests. They remain unresolved requirements. Six negative characterization tests verify representative unsupported shapes still reject rather than guessing an operand, changing ownership, dropping an operation or inventing an occurrence/date. The four modality cases require real-model evaluation before a language pass rate can be reported.

## Verification

New suite: **163/163 pass**. This comprises 116 typed-oracle cases, 12 structural/authority/corpus checks, 29 successful mocked single-interpreter handoffs, and 6 known-gap negative characterizations.

Expanded interpretation-related run: **931/933 pass**, with two failures reproduced using unchanged base production files under the same runtime:

1. `append-items-authority.test.mjs`: `confirmed batch uses one capability, all bound items, and the separate canonical companion read`. Initial mocked route returns 503 rather than 200.
2. `typed-read-ticket.test.mjs`: `foreign persisted subjects fail in continuation before factual retrieval`. Initial mocked turn returns 503 rather than 200, before the intended continuation assertion.

These are unresolved baseline/integration evidence gaps, not newly introduced regressions and not waived security properties. No existing test expectation or baseline allowlist was changed. Earlier raw Node attempts also encountered `server-only`, extensionless-import and TypeScript strip-mode loader errors; the committed test-only runtime and transform flag below address those without application changes.

Typecheck: `tsc --noEmit` passed. No full application build or production acceptance is claimed. The test workspace contains hash-verified tracked text files at the base SHA and cached dependencies; binary public assets were not materialized. GitHub tree construction preserves all untouched files, including those assets, from the base tree.

Commands:

```sh
node --test --test-reporter=tap tests/brain-generalization.test.mjs
node --experimental-transform-types --import ./tests/helpers/brain-generalization-runtime.mjs --test --test-reporter=tap tests/brain-generalization.test.mjs tests/calculation-provider-parity.test.mjs tests/read-ticket-provider-parity.test.mjs tests/stored-read-provider-parity.test.mjs tests/append-items-authority.test.mjs tests/lifecycle-plan.test.mjs tests/state-transition-job.test.mjs tests/generalized-replace.test.mjs tests/ask-compositional-emission.test.mjs tests/ask-request-contract.test.mjs tests/calculation-operand-roles.test.mjs tests/calculation-dag.test.mjs tests/calculation-result-selection.test.mjs tests/typed-read-ticket.test.mjs tests/stored-read-authority.test.mjs tests/ask-one-interpreter.test.mjs
npm run typecheck
```

## Proof of scope and no sentence-specific routing

- TypeScript AST comparison against the base found every function declaration, function expression and arrow function unchanged in both edited production files, including Binder and schema-construction functions.
- Production additions are a generic address contract, descriptions and its instruction inclusion. No question matching, keyword predicate, regex, sentence branch, date/pet constant or answer substitution was added.
- Existing required fields, allowed operators and executable bounds are unchanged.
- Tests explicitly preserve rejection of foreign subjects, assistant-only references, forged mutation sources, nonexistent clauses, out-of-range items and unsupported compound shapes.
- No execution/publication/UI file is part of the branch delta. No existing test file is modified.

## Remaining work and honest limits

The priority generic missing interfaces are (1) source-bound premise operands with units/provenance/modality; (2) a compositional operation graph with per-node subject/source scope, references, dependencies and explicit failure/atomicity semantics; (3) independently scoped selectors for different topics/windows; then additional grouping/predicate/profile domains as required by intended V1. Do not substitute phrases or mutate an unrelated organ to fake those contracts.

No real GPT-5.4 Mini interpretation was run. Therefore **real-language corpus accuracy is unmeasured**, and the existing grouped-address live failure has not been retested. Passing a supplied proposal through Binder cannot establish that Brain will emit it from messy language. Likewise, successful binding does not certify retrieval, arithmetic, persisted mutation, receipts, credit settlement or a visible answer. Those remain separate acceptance responsibilities.

Provider calls: 0. New provider cost: $0. Prior recorded acceptance spend remains $0.768512. No deployment or production database access was performed.
