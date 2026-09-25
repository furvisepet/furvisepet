# One-interpreter migration audit — 19 September 2026

**Blocked. Local draft only. No live Ask, paid model call, push, preview, deployment, or merge. Production remains e2ab3a0.**

Branch: `codex/one-interpreter`. Starting draft: `75746f4`. Local baseline `f7b323f` corresponds to remote production `e2ab3a05690d115bff6c58719570ea1859920655`. The baseline and starting draft were rerun unchanged in detached local worktrees.

| Same named audit cases | Passed | Failed | New failures versus production |
| --- | ---: | ---: | ---: |
| Production baseline | 213 | 9 | 0 |
| Starting draft | 102 | 120 | 111 |
| This cut | 135 | 87 | 79 |

Forty of the original 111 regressions now pass, 71 remain, and migrating previously accepted legacy proposals exposed eight additional failing cases. Eight of the nine baseline failures remain; `reading one pet does not require selecting every name mentioned` now passes. This is **not** the acceptance threshold.

## What changed

- A test-only fixture adapter copies explicit old planner fields into readTicket. It never reads the question, infers synonyms, resolves ownership, supplies an answer, or grants writes. Date/subject omissions were filled explicitly in the affected fixtures. Read frames are null; mixed/update fixture frames remain unchanged.
- The mocked database supports the same offset/range page reads used by real Lungs. There is no stub replacing Lungs, lineage resolution, coverage, or serializer.
- Ticket binding preserves declared evidence needs, profile-field requests, temporal presentation intent, projections, record-selection provenance, and requirements instead of discarding them. Needs are bound to exact USER text and owned subjects; their quoted English cannot infer a date window or search scope. Unqueried needs remain unqueried, never certified complete.
- A named account subset stays narrow; foreign/excluded subjects are rejected. Impossible calendar dates and malformed projection/record-selection metadata fail validation.
- Three focused regressions cover retained obligations/unknown coverage, named-subset ownership, and malformed metadata/date rejection.
- No audit case, assertion, receipt/lineage/tenancy test, coverage requirement, or serializer-completeness check was removed, skipped, or relaxed. Test names remain stable for comparison; some legacy names mention omitted fields that the migrated fixture now supplies explicitly.
- Heart, confirmation, receipt execution, Lungs retrieval, serializer, paywall, mouth text, Immune, and Brief were not edited in this cut. No production compatibility executor or phrase shortcut was restored.

## Verification

- Typecheck: passed (`npm run typecheck`).
- Targeted ESLint and `git diff --check`: passed.
- Focused Heart/replace, Lungs, serializer, working-memory interpretation, Brain authority, and one-interpreter tests: **61/61 passed**, zero skipped.
- Both audit files retain **all 222 names**, with no cancellations/skips/todos. The harness replaces fetch with an exception and uses explicit mocked provider clients. No external model was called.
- Local Dune is still a mocked fixture, not a live acceptance proof. The frozen limit-one coverage remains partial; it was not relabeled complete.
- Existing narrative repair cases still exercise mocked generation/review behavior. Their passing result is not proof that every runtime path has no repair pass; only the interpreter retry was removed in the starting draft.

## Failure categories

1 = old planner/fixture contract still needs typed input migration; safety assertions remain. 2 = evidence, coverage, task, or subject behavior has a real regression on the migrated boundary. 3 = legacy mixed/read or pre-planner compatibility boundary. Unclassified = an explicit old repair requirement conflicts with this branch’s one-planner policy; it stays red and is not waived.

| Category | Original 111, initial diagnosis | Remaining 79, current diagnosis |
| --- | ---: | ---: |
| 1 | 62 | 4 |
| 2 | 42 | 67 |
| 3 | 1 | 2 |
| unclassified | 6 | 6 |

A case may start as a missing-ticket fixture failure and reveal a real downstream regression once migrated. The tables distinguish those states; “fixture migration” is never an excuse to waive an unsafe answer.

## Every remaining new failure

The following 79 failures all passed on production. Each remains red. The JSON companion preserves full names (including newlines), first error text, source location, and all three run outcomes.

| ID | Case | Category | Diagnosis / required work |
| --- | --- | --- | --- |
| C001 | named blood test cannot cite unrelated note: September 3 urine test: result normal. | 2 | Real regression in an un-ticketed evidence caller. Named-test relevance is no longer bound at the direct-generator boundary; an unrelated note is not rejected as unrepresented for the requested test. |
| C002 | named blood test cannot cite unrelated note: September 3 vet note: skin diagnosis recorded. | 2 | Real regression in an un-ticketed evidence caller. Named-test relevance is no longer bound at the direct-generator boundary; an unrelated note is not rejected as unrepresented for the requested test. |
| C003 | source wording remains identical in visible quotation and citation: September 3 blood test: result pending, not confirmed normal. | 2 | Real regression in an un-ticketed evidence caller. Exact qualified quotation loses its permitted source channel and fails grounding; do not strip persistence-like words from a literal saved-note quotation. |
| C004 | source wording remains identical in visible quotation and citation: I recorded the urine test as pending. | 2 | Real regression in an un-ticketed evidence caller. Exact qualified quotation loses its permitted source channel and fails grounding; do not strip persistence-like words from a literal saved-note quotation. |
| C005 | source wording remains identical in visible quotation and citation: I added the urine test result: pending, not normal. | 2 | Real regression in an un-ticketed evidence caller. Exact qualified quotation loses its permitted source channel and fails grounding; do not strip persistence-like words from a literal saved-note quotation. |
| C006 | source wording remains identical in visible quotation and citation: I recorded the urine test value as 2.7, with uncertainty. | 2 | Real regression in an un-ticketed evidence caller. Exact qualified quotation loses its permitted source channel and fails grounding; do not strip persistence-like words from a literal saved-note quotation. |
| C008 | unsupported or ambiguous test locator abstains: test | 2 | Real regression in an un-ticketed evidence caller. An unsupported/ambiguous test locator no longer produces clarification; its ambiguity needs a typed selector, not a generic test lookup. |
| C009 | unsupported or ambiguous test locator abstains: blood and urine test | 2 | Real regression in an un-ticketed evidence caller. An unsupported/ambiguous test locator no longer produces clarification; its ambiguity needs a typed selector, not a generic test lookup. |
| C010 | compound test descriptors retain every named component | 2 | Real regression in an un-ticketed evidence caller. Compound named-test components are no longer preserved by a typed selector. Partial-word matching must not authorize the wrong test. |
| C011 | specific represented note reaches final answer: September 3 urine test: result pending. | 2 | Real regression in an un-ticketed evidence caller. The entire qualified source note does not reach the visible answer and citation. This is a quote/provenance regression, not a wording-only issue. |
| C012 | specific represented note reaches final answer: September 3 urine test: result normal. | 2 | Real regression in an un-ticketed evidence caller. The entire qualified source note does not reach the visible answer and citation. This is a quote/provenance regression, not a wording-only issue. |
| C013 | specific represented note reaches final answer: September 3 vet note: the veterinarian recorded a diagnosis of arthritis, not yet confirmed by imaging. | 2 | Real regression in an un-ticketed evidence caller. The entire qualified source note does not reach the visible answer and citation. This is a quote/provenance regression, not a wording-only issue. |
| C014 | source rendering does not depend on the model citing the note | 2 | Real regression in an un-ticketed evidence caller. A contradictory model result survives instead of the exact source quotation; this is an evidence-authority regression. |
| C015 | unselected competing evidence still blocks a quote; an earlier result does not | 2 | Real regression in an un-ticketed evidence caller. Competing unselected/later evidence no longer blocks an unsafe unique quote. Preserve ambiguity and lineage obligations before publication. |
| C016 | a valid cited ID for another topic cannot authorize a requested result | 2 | Real regression in an un-ticketed evidence caller. A cited ID from another topic is treated as enough support for the requested result. Restore requested-topic evidence binding. |
| C017 | an explicit year disambiguates historical notes without assuming a year | 2 | Real regression in an un-ticketed evidence caller. The explicit requested year is no longer a typed disambiguation constraint; historical notes cannot be chosen by an assumed year. |
| C018 | specific lookup fails safely: missing | 2 | Real regression in an un-ticketed evidence caller. The direct-generator path no longer enforces this case’s unavailable/ambiguous/omitted-source limitation; the unsupported normal-result assertion survives. |
| C019 | specific lookup fails safely: unavailable | 2 | Real regression in an un-ticketed evidence caller. The direct-generator path no longer enforces this case’s unavailable/ambiguous/omitted-source limitation; the unsupported normal-result assertion survives. |
| C020 | specific lookup fails safely: ambiguous same day | 2 | Real regression in an un-ticketed evidence caller. The direct-generator path no longer enforces this case’s unavailable/ambiguous/omitted-source limitation; the unsupported normal-result assertion survives. |
| C021 | specific lookup fails safely: ambiguous year | 2 | Real regression in an un-ticketed evidence caller. The direct-generator path no longer enforces this case’s unavailable/ambiguous/omitted-source limitation; the unsupported normal-result assertion survives. |
| C022 | specific lookup fails safely: later contradiction | 2 | Real regression in an un-ticketed evidence caller. The direct-generator path no longer enforces this case’s unavailable/ambiguous/omitted-source limitation; the unsupported normal-result assertion survives. |
| C023 | specific lookup fails safely: oversized | 2 | Real regression in an un-ticketed evidence caller. The direct-generator path no longer enforces this case’s unavailable/ambiguous/omitted-source limitation; the unsupported normal-result assertion survives. |
| C024 | a dated source does not establish current medical status or exhaustive absence | 2 | Real regression in an un-ticketed evidence caller. A dated observation is allowed to support current status or exhaustive absence. Typed scope and certified coverage must constrain that claim. |
| C025 | bounded answer policy rejects unsupported assertion: Exactly seven soft-stool episodes were recorded. | 2 | Real regression in an un-ticketed evidence caller. The unsupported numeric/clinical assertion survives grounding in the direct-generator path. Removing phrase inference did not migrate its evidence obligation. |
| C026 | bounded answer policy rejects unsupported assertion: The urine test was normal. | 2 | Real regression in an un-ticketed evidence caller. The unsupported numeric/clinical assertion survives grounding in the direct-generator path. Removing phrase inference did not migrate its evidence obligation. |
| C027 | bounded answer policy rejects unsupported assertion: Oscar has arthritis. | 2 | Real regression in an un-ticketed evidence caller. The unsupported numeric/clinical assertion survives grounding in the direct-generator path. Removing phrase inference did not migrate its evidence obligation. |
| C028 | bounded answer policy rejects unsupported assertion: The recorded weight decreased by 0.2 kg. | 2 | Real regression in an un-ticketed evidence caller. The unsupported numeric/clinical assertion survives grounding in the direct-generator path. Removing phrase inference did not migrate its evidence obligation. |
| C030 | capped loading, intermediate and final selection are distinct losses | 2 | Real regression in an un-ticketed evidence caller. The explicit lifetime completeness obligation is lost when scope defaults to unspecified. Capped loading and downstream omission remain distinct losses. |
| C031 | unknown coverage cannot authorize exhaustive answer: How many separate soft-stool episodes has Milo ever had? | 2 | Real regression in an un-ticketed evidence caller. Unknown coverage no longer blocks the exhaustive absence/count/comparison answer. Carry the completeness obligation on a ticket; do not trust model confidence. |
| C032 | unknown coverage cannot authorize exhaustive answer: Has Milo ever vomited? | 2 | Real regression in an un-ticketed evidence caller. Unknown coverage no longer blocks the exhaustive absence/count/comparison answer. Carry the completeness obligation on a ticket; do not trust model confidence. |
| C033 | unknown coverage cannot authorize exhaustive answer: Have I reported any vomiting for Milo? | 2 | Real regression in an un-ticketed evidence caller. Unknown coverage no longer blocks the exhaustive absence/count/comparison answer. Carry the completeness obligation on a ticket; do not trust model confidence. |
| C034 | unknown coverage cannot authorize exhaustive answer: Compare all Milo recorded weights. | 2 | Real regression in an un-ticketed evidence caller. Unknown coverage no longer blocks the exhaustive absence/count/comparison answer. Carry the completeness obligation on a ticket; do not trust model confidence. |
| C035 | failed loading survives to provider and definitive absence is replaced | 2 | Real regression in an un-ticketed evidence caller. Source loading is unavailable, but the model’s definitive absence statement survives. Unavailable is not complete_empty. |
| C036 | profile-only second pet does not imply history loading | 2 | Real regression in an un-ticketed evidence caller. Only the second pet profile is loaded, but the answer can imply both full histories were checked. Preserve per-pet/source coverage. |
| C038 | certified complete server fact is rendered instead of a contradictory model total | 2 | Real regression in an un-ticketed evidence caller. A server-certified exact total is no longer preferred over a contradictory model total. The count obligation and its scope key need typed binding. |
| C039 | complete retrieval without correction/grouping certification or verified total still abstains | 2 | Real regression in an un-ticketed evidence caller. Retrieval completeness is incorrectly sufficient without correction/grouping/verified-total certification. All dimensions must remain required. |
| C040 | model-proposed coverage metadata never establishes authority | 2 | Real regression in an un-ticketed evidence caller. Model-proposed coverage can survive the missing count guard. Only deterministic server evidence may certify completeness. |
| C041 | a verified fact loses authority if its qualified source cannot be represented | 2 | Real regression in an un-ticketed evidence caller. A certified fact retains apparent answer authority despite its qualified source being omitted. Representation loss must revoke it. |
| C042 | mandatory query scope preserves multiple topics and excludes unauthorized pet IDs | 2 | Real regression in an un-ticketed evidence caller. Topic and requested-period metadata are lost at the direct-generator boundary. The authorized-ID assertion still exists; the multi-topic/window obligation must be carried explicitly. |
| C043 | ambiguous episode reference asks for clarification | 2 | Real regression in an un-ticketed evidence caller. An ambiguous episode reference defaults to resolved scope. A typed clarification/reference job is missing. |
| C045 | date-filtered load does not claim correction completeness for requested historical period | 2 | Real regression in an un-ticketed evidence caller. A date-filtered load can imply a complete summary without correction completeness. Preserve the independent lineage-coverage limitation. |
| C048 | model proposals cannot turn factual recall into new history or memory | 2 | Real regression in an un-ticketed evidence caller. A factual recall can retain a proposed history update after read-only inference was removed. This is a write-boundary regression in an un-ticketed caller, not an acceptable fixture-only miss. |
| C051 | missing event candidates return a server limitation without generation or review calls | 2 | Real regression: the ticket carries literal predicates but no transition-evidence obligation. It returns complete_empty and a generic empty-list line instead of retaining the event-verification limitation. Do not treat a lexical miss as proof about the requested transition. |
| C052 | broad historical reads retain multiple time slices and cannot bill a sampled summary | 2 | Unfinished migration plus coverage regression: the fixture still omits the relative-year boundary; ticket coverage also has no equivalent per-period sampling evidence. Supply the boundary explicitly and retain the partial-summary billing assertions. |
| C053 | oldest calendar-period retrieval reads its full eligible year rather than a guessed year or oldest page | 2 | Unfinished migration plus coverage regression: oldest eligible calendar-year selection is not carried in the ticket. The compatibility coverage.plan remains the access window; it must describe the certified requested window, without guessing a year. |
| C055 | premise repair is bounded and revalidates exact user evidence | unclassified | Policy conflict, kept red: the fixture deliberately emits an invalid premise first and requires a second planner call. The branch forbids that repair. Preserve premise provenance and no-write assertions; do not silently waive the old repair expectation. |
| C056 | a premise repair cannot authorize invented pets or mutation scope | unclassified | Policy conflict, kept red: invalid input now fails after one planner call, while this case requires two and checks that the repaired proposal still cannot widen authority. |
| C075 | true episode counts retain their independent membership path | 2 | Real regression: an episode-count obligation is flattened to recall. The current read ticket has no episode-membership selector; preserve that obligation before routing through the shared organ. |
| C090 | a read contract cannot grant writes even with an assertion-looking premise | 1 | Fixture contract mismatch: this case submits a forged frame in read mode and expects a successful read with an empty frame. The new typed boundary rejects the whole conflicting proposal. No write runs; the successful-read compatibility assertion remains red. |
| C095 | comparison retrieves both temporal ends for arbitrary topics within the existing budget | 2 | Real regression: the typed comparison retrieves chronologically then truncates at the output budget; both comparison endpoints are not retained. This needs typed endpoint obligations, not a phrase-driven latest/earliest shortcut. |
| C097 | conversation identity must match a complete owned name | 1 | Fixture contract mismatch: the conversational proposal supplies no USER reference ID. It is rejected as reference before the expected conversation_subject check. The exact-name ownership assertion was retained. |
| C098 | shared lexical retrieval reserves scoped context for different wording without growing query budgets | 2 | Real regression: the old lexical hint rest becomes a strict ticket predicate and loses the slept note; the old period fallback and partial semantic-coverage reason have no explicit ticket equivalent. Do not restore an English fallback executor. |
| C105 | unlinked correction may be reported but does not create a verified edge | 2 | Real regression: Lungs conservatively withholds uncertain effective truth; the read no longer carries the unlinked correction as an attributed report with its uncertainty. Review uses two calls instead of one before the original assertion is reached. |
| C113 | real admission lets a repaired planner reach composition without opening extra repair cycles | unclassified | Policy conflict, kept red: the admission fixture expects an initially rejected plan to be repaired and admitted for composition. No extra planner call was reintroduced. |
| C134 | inclusive as-of date is a scope anchor while the event keeps its own date | 1 | Fixture still sends a one-day lower bound for an as-of request and expects a model-written latest-note answer. It must supply an open lower bound and a ticket-compatible output fixture while retaining the source date and no invented-date assertions. |
| C138 | empty conversational names recover only a unique user-established focus | 1 | Fixture migration incomplete: empty names and an assistant reference are still passed as subject resolution. Brain must emit Cedar plus the USER reference; ambiguous follow-ups must emit clarification. No assistant text may authorize a subject. |
| C143 | duplicate search hits do not consume independent candidate slots | 2 | Real coverage regression: 48 scanned candidate IDs collapse to the 32 returned records in compatibility coverage. Preserve the distinction between scanned candidates, retained records, and output losses; keep the 32-record assertion. |
| C149 | empty lexical searches return their unused capacity to bounded period context | 2 | Real compatibility regression: advisory nonmatching search hints became mandatory predicates, producing zero candidates rather than the explicitly needed bounded period context. The ticket must distinguish a requested content filter from contextual retrieval; no text fallback. |
| C164 | genuine episode requests still require a valid episode referent | 2 | Real regression: episode referent and clarification obligations are discarded on the ticketed read path. A missing referent now looks like ordinary recall. Do not invent a reference from English downstream. |
| C165 | standalone task wording cannot be replaced by a planner paraphrase | 2 | Real task-integrity regression: the original question is retained, but contradictory planner requirements survive beside it. The case still asserts that a paraphrase cannot narrow the task. Needs a source-bound obligation contract, not silent requirement deletion. |
| C166 | missing premises use bounded repair without inventing evidence | unclassified | Policy conflict, kept red: this fixture requires a second planner response to supply missing premises. The single-pass boundary instead rejects. No repair loop added. |
| C170 | diverse candidates reach a rare middle-history transition within existing bounds | 2 | Real regression: rare middle-history transition evidence is lost after ticketed selection. Carry transition and representation obligations explicitly instead of relying on old event phrase priorities. |
| C173 | event aliases cannot be starved by newer routine notes or a common alias | 2 | Real regression: an event-alias request becomes a limited literal list; the decisive event does not reach the narrative/review path expected by the retained assertion. Typed event selection and coverage remain incomplete. |
| C178 | review receives correction uncertainty attached to its own source | 2 | Real regression: per-source correction uncertainty is absent from the review sources. Effective-truth rejection cannot silently erase the distinction between ordinary and unlinked-correction records in an attributed read. |
| C180 | event reason retrieval is independent of a summary or comparison planner label | 2 | Real regression: the decisive reason/transition row is omitted under a generic summary ticket. The original test checks it for summary, comparison and latest; explicit obligations must survive all three. |
| C185 | middle date survives retrieval and representation among five years of routine records | 2 | Real regression: explicit middle-date evidence is not retained/represented with its requested scope; review needs an extra repair and violates the fixed call count before the evidence assertions. Do not increase that count. |
| C187 | separate user-grounded needs retrieve rare evidence and reach review and publication | 2 | Real regression: multiple grounded needs are now retained on the request but are not all retrieved and carried into publication. The second review call is a symptom; retain all source, need-coverage, and publication assertions. |
| C189 | different needs stay attached to their own pets through retrieval and evidence | 2 | Real regression: pet-bound needs survive validation, but ticket retrieval emits no per-need query receipts in history.coverage.needs. No invented receipt or semantic-support certification may replace them. |
| C190 | need candidates survive verbose routine evidence without exceeding the prompt budget | 2 | Real regression: a rare supplement reaction is excluded by the single bedding predicate/output budget. The request retains both needs, but retrieval/representation still fails their obligation under pressure. |
| C191 | need coverage records actual query hits without reinterpreting database matching | 2 | Real regression with an old mock interface: candidateRowsOverride exercises the legacy RPC, while Lungs uses paged rows; ticket retrieval also lacks per-need query receipts. Migrate the store fixture and retain actual-hit/semanticSupport assertions. |
| C192 | ordinary history reads recover irrelevant episode routing without granting references | 2 | Real regression: ordinary reads no longer infer episode routing, but a genuine typed episode-count obligation is also lost. The final count assertion remains red; do not discard it to keep the earlier subcases green. |
| C193 | a middle-history month survives comparison retrieval among dense unrelated years | 2 | Real regression: the typed path carries no explicit month target/need query coverage. The dense-history month assertion cannot be satisfied by claiming the entire scan proves each requested target. |
| C194 | a note-frequency question reaches ordinary evidence rather than an unrelated episode clarification | 2 | Real regression: the historical note/date obligation is not preserved through the note-frequency request. The fixture now reaches the pipeline, but the expected dated note is absent from final evidence. |
| C196 | new observation plus calculation can repair an invalid correction plan without weakening validation | unclassified | Policy conflict in mixed input, kept red: the fixture proposes an invalid correction first and requires a repaired mixed observation/calculation plan. This branch performs no second planner pass; confirmation and write checks were not weakened. |
| C204 | plain mixed-history answers retain owner-report anchors when legacy context IDs omit the request | 3 | Legacy mixed/read boundary: a mixed proposal is downgraded to read by the persistence-declined compatibility logic, but it has no read ticket. The shared validator then rejects it. Brain or a typed compatibility adapter must supply the read job without allowing a save. |
| C212 | profile contract mistakes get one bounded repair with full ownership revalidation | unclassified | Policy conflict, kept red: the fixture demands one profile-plan repair plus fresh ownership validation. The single-pass interpreter now rejects the invalid first response. Profile/Brief behavior was not widened to make it pass. |
| C217 | read mode discards contradictory mutation hints without a provider repair | 3 | Legacy read/write boundary: a nominal read contains a resume task. The typed boundary rejects the conflict before any action instead of silently discarding it. A normalized read ticket is needed; proposed task intent cannot authorize execution. |
| C218 | earliest unfiltered care record does not become a keyword lookup | 2 | Unfinished fixture and coverage migration: generic care/note hints become filters instead of an unfiltered earliest record request; the fixture expects a narrative prompt and chronology boundary receipt not yet supplied by the typed path. Retain its first-event assertion. |
| C219 | unnamed standalone reads cannot expand to the account from a planner hint | 2 | Real subject-scope regression: an empty account proposal expands to three owned pets when the test requires selected-pet scope. Ownership remains checked, but ownership alone does not certify intended scope. Needs explicit scoped intent provenance, not substring narrowing. |

## Accounting for each of the original 111

“Passed” means its existing assertions pass with an explicit mocked planner contract; it does not certify real Brain interpretation. All remaining failures are diagnosed above.

| ID | Original case | Initial category | Current result |
| --- | --- | --- | --- |
| C001 | named blood test cannot cite unrelated note: September 3 urine test: result normal. | 2 | Red — see diagnosis above |
| C002 | named blood test cannot cite unrelated note: September 3 vet note: skin diagnosis recorded. | 2 | Red — see diagnosis above |
| C003 | source wording remains identical in visible quotation and citation: September 3 blood test: result pending, not confirmed normal. | 2 | Red — see diagnosis above |
| C004 | source wording remains identical in visible quotation and citation: I recorded the urine test as pending. | 2 | Red — see diagnosis above |
| C005 | source wording remains identical in visible quotation and citation: I added the urine test result: pending, not normal. | 2 | Red — see diagnosis above |
| C006 | source wording remains identical in visible quotation and citation: I recorded the urine test value as 2.7, with uncertainty. | 2 | Red — see diagnosis above |
| C008 | unsupported or ambiguous test locator abstains: test | 2 | Red — see diagnosis above |
| C009 | unsupported or ambiguous test locator abstains: blood and urine test | 2 | Red — see diagnosis above |
| C010 | compound test descriptors retain every named component | 2 | Red — see diagnosis above |
| C011 | specific represented note reaches final answer: September 3 urine test: result pending. | 2 | Red — see diagnosis above |
| C012 | specific represented note reaches final answer: September 3 urine test: result normal. | 2 | Red — see diagnosis above |
| C013 | specific represented note reaches final answer: September 3 vet note: the veterinarian recorded a diagnosis of arthritis, not yet confirmed by imaging. | 2 | Red — see diagnosis above |
| C014 | source rendering does not depend on the model citing the note | 2 | Red — see diagnosis above |
| C015 | unselected competing evidence still blocks a quote; an earlier result does not | 2 | Red — see diagnosis above |
| C016 | a valid cited ID for another topic cannot authorize a requested result | 2 | Red — see diagnosis above |
| C017 | an explicit year disambiguates historical notes without assuming a year | 2 | Red — see diagnosis above |
| C018 | specific lookup fails safely: missing | 2 | Red — see diagnosis above |
| C019 | specific lookup fails safely: unavailable | 2 | Red — see diagnosis above |
| C020 | specific lookup fails safely: ambiguous same day | 2 | Red — see diagnosis above |
| C021 | specific lookup fails safely: ambiguous year | 2 | Red — see diagnosis above |
| C022 | specific lookup fails safely: later contradiction | 2 | Red — see diagnosis above |
| C023 | specific lookup fails safely: oversized | 2 | Red — see diagnosis above |
| C024 | a dated source does not establish current medical status or exhaustive absence | 2 | Red — see diagnosis above |
| C025 | bounded answer policy rejects unsupported assertion: Exactly seven soft-stool episodes were recorded. | 2 | Red — see diagnosis above |
| C026 | bounded answer policy rejects unsupported assertion: The urine test was normal. | 2 | Red — see diagnosis above |
| C027 | bounded answer policy rejects unsupported assertion: Oscar has arthritis. | 2 | Red — see diagnosis above |
| C028 | bounded answer policy rejects unsupported assertion: The recorded weight decreased by 0.2 kg. | 2 | Red — see diagnosis above |
| C030 | capped loading, intermediate and final selection are distinct losses | 2 | Red — see diagnosis above |
| C031 | unknown coverage cannot authorize exhaustive answer: How many separate soft-stool episodes has Milo ever had? | 2 | Red — see diagnosis above |
| C032 | unknown coverage cannot authorize exhaustive answer: Has Milo ever vomited? | 2 | Red — see diagnosis above |
| C033 | unknown coverage cannot authorize exhaustive answer: Have I reported any vomiting for Milo? | 2 | Red — see diagnosis above |
| C034 | unknown coverage cannot authorize exhaustive answer: Compare all Milo recorded weights. | 2 | Red — see diagnosis above |
| C035 | failed loading survives to provider and definitive absence is replaced | 2 | Red — see diagnosis above |
| C036 | profile-only second pet does not imply history loading | 2 | Red — see diagnosis above |
| C038 | certified complete server fact is rendered instead of a contradictory model total | 2 | Red — see diagnosis above |
| C039 | complete retrieval without correction/grouping certification or verified total still abstains | 2 | Red — see diagnosis above |
| C040 | model-proposed coverage metadata never establishes authority | 2 | Red — see diagnosis above |
| C041 | a verified fact loses authority if its qualified source cannot be represented | 2 | Red — see diagnosis above |
| C042 | mandatory query scope preserves multiple topics and excludes unauthorized pet IDs | 2 | Red — see diagnosis above |
| C043 | ambiguous episode reference asks for clarification | 2 | Red — see diagnosis above |
| C045 | date-filtered load does not claim correction completeness for requested historical period | 2 | Red — see diagnosis above |
| C048 | model proposals cannot turn factual recall into new history or memory | 2 | Red — see diagnosis above |
| C051 | missing event candidates return a server limitation without generation or review calls | 1 | Red — see diagnosis above |
| C052 | broad historical reads retain multiple time slices and cannot bill a sampled summary | 1 | Red — see diagnosis above |
| C053 | oldest calendar-period retrieval reads its full eligible year rather than a guessed year or oldest page | 1 | Red — see diagnosis above |
| C054 | reviewed shared-source attribution does not widen the record subject | 1 | Passed — fixture/typed boundary migrated |
| C055 | premise repair is bounded and revalidates exact user evidence | unclassified | Red — see diagnosis above |
| C056 | a premise repair cannot authorize invented pets or mutation scope | unclassified | Red — see diagnosis above |
| C058 | an omitted exact report-day window reaches retrieval without changing subject authority | 1 | Passed — fixture/typed boundary migrated |
| C066 | visible citation IDs are removed before review without losing format | 1 | Passed — fixture/typed boundary migrated |
| C070 | derived quantity passes shared generation without question-pattern arithmetic | 1 | Passed — fixture/typed boundary migrated |
| C091 | shared route preserves reviewed answer across unseen topics: grooming | 1 | Passed — fixture/typed boundary migrated |
| C092 | shared route preserves reviewed answer across unseen topics: sleep | 1 | Passed — fixture/typed boundary migrated |
| C093 | shared route preserves reviewed answer across unseen topics: travel | 1 | Passed — fixture/typed boundary migrated |
| C094 | as-of retrieval applies upper bound with no lower bound | 1 | Passed — fixture/typed boundary migrated |
| C095 | comparison retrieves both temporal ends for arbitrary topics within the existing budget | 1 | Red — see diagnosis above |
| C098 | shared lexical retrieval reserves scoped context for different wording without growing query budgets | 1 | Red — see diagnosis above |
| C099 | shared status reads retain resolved multi-pet scope through evidence creation | 1 | Passed — fixture/typed boundary migrated |
| C100 | read premise produces no memory or care proposal through full pipeline | 1 | Passed — fixture/typed boundary migrated |
| C101 | reviewed output structure survives shared pipeline: {   "observation": " | 1 | Passed — fixture/typed boundary migrated |
| C102 | reviewed output structure survives shared pipeline: - Aster slept normal | 1 | Passed — fixture/typed boundary migrated |
| C103 | reviewed output structure survives shared pipeline: \| Pet \| Observation  | 1 | Passed — fixture/typed boundary migrated |
| C104 | shared review cannot approve invented quotes even when the model approves | 1 | Passed — fixture/typed boundary migrated |
| C105 | unlinked correction may be reported but does not create a verified edge | 1 | Red — see diagnosis above |
| C106 | shared read repair is bounded and independently checked: approved | 1 | Passed — fixture/typed boundary migrated |
| C107 | shared read repair is bounded and independently checked: empty-body | 1 | Passed — fixture/typed boundary migrated |
| C108 | shared read repair is bounded and independently checked: malformed-denial | 1 | Passed — fixture/typed boundary migrated |
| C109 | shared read repair is bounded and independently checked: rejected | 1 | Passed — fixture/typed boundary migrated |
| C110 | shared read repair is bounded and independently checked: unknown-source | 1 | Passed — fixture/typed boundary migrated |
| C111 | shared read repair is bounded and independently checked: mutation-field | 1 | Passed — fixture/typed boundary migrated |
| C112 | shared read repair is bounded and independently checked: truncated-rereview | 1 | Passed — fixture/typed boundary migrated |
| C113 | real admission lets a repaired planner reach composition without opening extra repair cycles | unclassified | Red — see diagnosis above |
| C115 | shared review receives unknown present-state claims intact instead of a legacy keyword filter | 1 | Passed — fixture/typed boundary migrated |
| C118 | typed JSON renders nested data, arrays, nulls and escaping without model-written JSON | 1 | Passed — fixture/typed boundary migrated |
| C121 | shared retrieval and provider inputs respect free history access | 1 | Passed — fixture/typed boundary migrated |
| C122 | shared retrieval and provider inputs respect plus history access | 1 | Passed — fixture/typed boundary migrated |
| C123 | Free lifetime access retrieves a formerly paywalled 2022 period | 1 | Passed — fixture/typed boundary migrated |
| C130 | reviewed quotes and all clauses survive final conversation rendering | 1 | Passed — fixture/typed boundary migrated |
| C133 | reference lookup prioritizes matching evidence over years of period distractors | 1 | Passed — fixture/typed boundary migrated |
| C134 | inclusive as-of date is a scope anchor while the event keeps its own date | 1 | Red — see diagnosis above |
| C143 | duplicate search hits do not consume independent candidate slots | 1 | Red — see diagnosis above |
| C149 | empty lexical searches return their unused capacity to bounded period context | 1 | Red — see diagnosis above |
| C166 | missing premises use bounded repair without inventing evidence | unclassified | Red — see diagnosis above |
| C170 | diverse candidates reach a rare middle-history transition within existing bounds | 1 | Red — see diagnosis above |
| C173 | event aliases cannot be starved by newer routine notes or a common alias | 1 | Red — see diagnosis above |
| C178 | review receives correction uncertainty attached to its own source | 1 | Red — see diagnosis above |
| C179 | past versus present retrieval preserves both periods despite a narrowed planner range | 1 | Passed — fixture/typed boundary migrated |
| C180 | event reason retrieval is independent of a summary or comparison planner label | 1 | Red — see diagnosis above |
| C182 | past-present recovery never bypasses plan access or explicit as-of bounds | 1 | Passed — fixture/typed boundary migrated |
| C183 | unsolicited JSON is repaired once and independently re-reviewed as prose | 1 | Passed — fixture/typed boundary migrated |
| C185 | middle date survives retrieval and representation among five years of routine records | 1 | Red — see diagnosis above |
| C186 | schema-shaped generation repairs required meaning removed by publication policy before API and reload | 1 | Passed — fixture/typed boundary migrated |
| C187 | separate user-grounded needs retrieve rare evidence and reach review and publication | 1 | Red — see diagnosis above |
| C189 | different needs stay attached to their own pets through retrieval and evidence | 1 | Red — see diagnosis above |
| C190 | need candidates survive verbose routine evidence without exceeding the prompt budget | 1 | Red — see diagnosis above |
| C191 | need coverage records actual query hits without reinterpreting database matching | 1 | Red — see diagnosis above |
| C193 | a middle-history month survives comparison retrieval among dense unrelated years | 1 | Red — see diagnosis above |
| C194 | a note-frequency question reaches ordinary evidence rather than an unrelated episode clarification | 1 | Red — see diagnosis above |
| C196 | new observation plus calculation can repair an invalid correction plan without weakening validation | unclassified | Red — see diagnosis above |
| C203 | plain read-history answers retain owner-report anchors when legacy context IDs omit the request | 1 | Passed — fixture/typed boundary migrated |
| C204 | plain mixed-history answers retain owner-report anchors when legacy context IDs omit the request | 3 | Red — see diagnosis above |
| C205 | incidental cited-note count is exact and distinct: 2 | 1 | Passed — fixture/typed boundary migrated |
| C206 | incidental cited-note count is exact and distinct: 3 | 1 | Passed — fixture/typed boundary migrated |
| C207 | date-only history stays on its saved calendar day in America/Los_Angeles | 1 | Passed — fixture/typed boundary migrated |
| C208 | date-only history stays on its saved calendar day in Asia/Tokyo | 1 | Passed — fixture/typed boundary migrated |
| C210 | plain history review includes the actual brief sections rather than only their summary | 1 | Passed — fixture/typed boundary migrated |
| C211 | long plain answer reaches independent review without losing sentences or candidate sources | 1 | Passed — fixture/typed boundary migrated |
| C212 | profile contract mistakes get one bounded repair with full ownership revalidation | unclassified | Red — see diagnosis above |
| C217 | read mode discards contradictory mutation hints without a provider repair | 1 | Red — see diagnosis above |
| C218 | earliest unfiltered care record does not become a keyword lookup | 1 | Red — see diagnosis above |
| C222 | interpretation uses the user calendar day across the UTC date boundary | 1 | Passed — fixture/typed boundary migrated |

## Eight failures newly exposed by fixture migration

- C075: true episode counts retain their independent membership path — category 2; retained and red.
- C090: a read contract cannot grant writes even with an assertion-looking premise — category 1; retained and red.
- C097: conversation identity must match a complete owned name — category 1; retained and red.
- C138: empty conversational names recover only a unique user-established focus — category 1; retained and red.
- C164: genuine episode requests still require a valid episode referent — category 2; retained and red.
- C165: standalone task wording cannot be replaced by a planner paraphrase — category 2; retained and red.
- C192: ordinary history reads recover irrelevant episode routing without granting references — category 2; retained and red.
- C219: unnamed standalone reads cannot expand to the account from a planner hint — category 2; retained and red.

## Production’s nine baseline failures, by exact name

| Case | Current |
| --- | --- |
| read planner can omit extraction while writes still require a valid frame | fail |
| reading one pet does not require selecting every name mentioned | pass |
| five-pet earliest/latest weight retrieval certifies both endpoint pairs even when lexical weight matching misses weighed prose | fail |
| supplied premises narrow stale owned-history plans without granting writes | fail |
| general knowledge never widens owned authority and saved history still validates ownership | fail |
| supplied-context classification requires actual verbatim user premises | fail |
| event evidence survives both budgets among verbose routine observations | fail |
| rejected event answers retain relevant source excerpts instead of the latest profile | fail |
| a failed mixed answer cannot commit proposed observation side effects | fail |

## Category 3 boundary still outside the passing audit

`app/api/ask/route.ts` still calls `resolveOwnerNoteRequest` before Brain (around line 435), uses `ownerNote.companionQuestion` as `reasoningQuestion` (around line 476), and invokes deterministic/provider-independent command planners and a backward-reference check before `interpretAskQuestion` (around lines 745–838). `owner-note-request.ts` still contains `splitOwnerNoteAndCompanion`. These were not edited because the existing Heart/confirmation path is frozen.

**This remains a real, unresolved one-interpreter violation.** The splitter does not yet emit a typed read job and there is no new fixture claiming it does. It must become a ticket-producing boundary feeding the same retrieve path, with no independent memory-depth or answer choice. Do not describe this branch as one interpreter while it remains.

## Stop decision and next bounded work

The user-authorized written-accounting stop condition is used. The live-proof threshold is not met: 79 introduced failures remain, not just the production baseline names. Do not submit live Dune, publish a preview, merge, or deploy this draft.

The next bounded migration should start with the un-ticketed evidence callers: source-specific quotes, unavailable/ambiguous results, unsupported absence/counts, and read-only persistence protection. Carry those obligations on explicit contracts and rerun their existing assertions. Then migrate multi-need/episode/chronology coverage without inventing query receipts. Keep the remaining repair-policy conflicts red until an explicit contract decision preserves their safety obligations.

Reproduce the audit locally:

```sh
node --experimental-transform-types --test scripts/audits/ask-evidence-contract.cases.mjs scripts/audits/ask-shared-request-contract.cases.mjs
npm run typecheck
node --experimental-transform-types --test tests/furvise-lungs.test.mjs tests/furvise-replace-ticket.test.mjs tests/furvise-heart-receipt.test.mjs tests/ask-labs-list.test.mjs tests/ask-working-memory-interpretation.test.mjs tests/furvise-brain-interpretation-authority.test.mjs tests/ask-one-interpreter.test.mjs
```

Machine-readable case ledger: [one-interpreter-2026-09-19.json](one-interpreter-2026-09-19.json).
