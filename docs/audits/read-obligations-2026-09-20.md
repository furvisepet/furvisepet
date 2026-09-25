# Ticketed read obligations — 20 September 2026

**Requested eight pass offline. The interpreter branch remains blocked. No live proof, preview, push, merge, or deployment.**

Branch `codex/one-interpreter`, starting at `5e8e0ba`. Production remains `e2ab3a0`; this run made no production calls or changes.

## Counts

| Same 222 named audit cases | Passed | Failed | New failures vs production |
| --- | ---: | ---: | ---: |
| Production baseline | 213 | 9 | 0 |
| Previous draft | 177 | 45 | 37 |
| This cut | 185 | 37 | 29 |

Only the eight requested outcomes changed. All eight moved from fail to pass. The remaining 37 failures comprise 29 introduced failures and eight pre-existing baseline failures. The ninth baseline failure already passed before this cut. Every one of the 222 names remains intact.

## Selected cases

| ID | Result | Obligation now carried by ticket and coverage |
| --- | --- | --- |
| C051 | Pass | Explicit event-candidate obligation; empty candidates use the existing server limitation with zero mocked generation/review calls. |
| C052 | Pass | Explicit cutoff 2024-09-04; one sample per UTC calendar year; omitted rows keep the answer incomplete. |
| C053 | Pass | Oldest calendar year resolved from effective accessible event time; full eligible 2021 window, no guessed year. |
| C095 | Pass | Both travel endpoints retained within 32 records; interior omission keeps coverage partial. |
| C098 | Pass | Advisory rest hint retains the owned slept note, excludes the foreign pet, and cannot certify semantic completeness. |
| C143 | Pass | 48 distinct matched candidates accounted for separately from at most 32 transported records; output budget loss recorded. |
| C149 | Pass | Nonmatching advisory hint does not discard the 48 eligible context candidates; at most 32 returned. |
| C218 | Pass | Empty mandatory predicates preserve the earliest care record; chronological boundary identifies care:first. |

## Implementation

- `read-ticket.ts`: the provider schema and immutable binder now distinguish optional advisory `searchHints` from mandatory `predicates`. `temporal.calendar` can request the oldest effective calendar year. `outputs.strategy` can request chronology, temporal endpoints, calendar samples, or an event-candidate lookup. Unknown fields and invalid combinations are rejected. Existing tickets may omit these new dimensions; no question text is parsed to fill them.
- `lungs.ts`: resolves the calendar after lineage, applies the explicit ticket window, reserves comparison endpoints before spending the interior-record budget, and samples across calendar years only when explicitly requested. Advisory misses retain scoped context and remain partial. Coverage records scanned, matched, retained, and omitted IDs separately, alongside periods, chronology, endpoints, and event candidates. An unavailable endpoint or incomplete scan cannot certify an endpoint pair. Existing limits remain four pages, 64 rows per page, 32 returned records, and 18,000 characters.
- `history-retrieval.ts`: transports those coverage obligations to the existing review contract. Explicit selection paths preserve matched-candidate accounting without transporting omitted records as answer evidence. Source/provenance transport remains limited to retained records and anchor proof. Default Bramble anchor retrieval retains its existing candidate/source behavior.
- `read-projection.ts`: the existing coverage-only event limitation now runs before the guard excluding ticketed reads from legacy phrase projections. It reads the server's missing-event obligation, uses the unchanged limitation text, and performs no generation or review call. Legacy phrase projections remain bypassed for typed tickets.
- `evidence-read-ticket.ts`: one boundary guard was extended to reject the new retrieval-only dimensions at the direct publication caller. This narrow plumbing change prevents that frozen caller from accepting selection semantics it cannot execute. Its evidence binding and publication behavior were otherwise unchanged.
- Eight audit fixtures now supply explicit typed obligations. C052's mocked citations were updated from the September records to the March records actually selected by the declared annual sampling policy. The source rows, expected incomplete assessment, time-window assertions, and all other existing assertions were preserved.

The existing serializer, review rules, and answer copy were not weakened or rewritten. Final representation/output losses continue through the existing evidence contract; Lungs does not claim that scanned records were necessarily retained or emitted.

## Verification

- Full paired audit: **185 passed / 37 failed**, 222 names intact. Outcome comparison against the previous ledger shows changes only for the requested eight.
- Focused Heart, replace, Lungs, serializer, interpretation, direct-evidence, and new read-obligation suites: **71/71 passed**, zero skipped. This includes all 66 pre-existing focused cases and five new safety cases.
- New cases exercise advisory versus mandatory matching, per-subject endpoints under record/character budgets, lineage before oldest-year selection, incomplete-scan refusal, truthful annual-sample omissions, and rejection of invalid strategies/direct-publication bypasses.
- AST comparison against `5e8e0ba`: **117 + 507 = 624 existing assertion calls unchanged** across the two audit files. No audit case was deleted, renamed, skipped, or waived.
- `npm run typecheck`: passed.
- Targeted ESLint: passed.
- `git diff --check`: passed.
- Actual paid/model/API calls: **0**. All provider responses in the audit are local mocks. Live Ask submissions, previews, pushes, merges, and deployments: **0**.

## Preserved boundaries and limits

Heart, confirmation, receipts, write adapter, list serializer, owner-note splitter, Immune, Brief, paywall, and mouth copy remain unchanged. No phrase executor, English fallback, or second planner was introduced. No episode, multi-need, mixed, or repair work was started.

This proves deterministic execution and coverage for explicitly supplied typed tickets with mocked dependencies. It does **not** prove that the real Brain emits these tickets, that live Dune is consistent, or that all Ask paths use one interpreter. Partial scans remain partial; endpoint reservation cannot discover a latest record outside the bounded scan. Advisory matching is literal ranking, not certified semantic understanding. Those limits were not hidden by relaxing review.

The new fields are represented in the planner's shared read schema, but no live planner submission was made. Existing compatibility callers and deferred cases still require migration. The branch remains blocked with 29 introduced failures. Stop here; no live proof or merge.

## Six repair cases retained red

| ID | Case | Result |
| --- | --- | --- |
| C055 | premise repair is bounded and revalidates exact user evidence | Fail, retained |
| C056 | a premise repair cannot authorize invented pets or mutation scope | Fail, retained |
| C113 | real admission lets a repaired planner reach composition without opening extra repair cycles | Fail, retained |
| C166 | missing premises use bounded repair without inventing evidence | Fail, retained |
| C196 | new observation plus calculation can repair an invalid correction plan without weakening validation | Fail, retained |
| C212 | profile contract mistakes get one bounded repair with full ownership revalidation | Fail, retained |

One planner pass remains the policy. Invalid first ticket means reject or clarify, never a silent second planner. This cut does not add a clarification workflow or rewrite the repair fixtures.

## Remaining failures

| ID | Origin | Case |
| --- | --- | --- |
| C055 | Introduced | premise repair is bounded and revalidates exact user evidence |
| C056 | Introduced | a premise repair cannot authorize invented pets or mutation scope |
| C063 | Baseline | read planner can omit extraction while writes still require a valid frame |
| C075 | Introduced | true episode counts retain their independent membership path |
| C090 | Introduced | a read contract cannot grant writes even with an assertion-looking premise |
| C096 | Baseline | five-pet earliest/latest weight retrieval certifies both endpoint pairs even when lexical weight matching misses weighed prose |
| C097 | Introduced | conversation identity must match a complete owned name |
| C105 | Introduced | unlinked correction may be reported but does not create a verified edge |
| C113 | Introduced | real admission lets a repaired planner reach composition without opening extra repair cycles |
| C134 | Introduced | inclusive as-of date is a scope anchor while the event keeps its own date |
| C138 | Introduced | empty conversational names recover only a unique user-established focus |
| C153 | Baseline | supplied premises narrow stale owned-history plans without granting writes |
| C155 | Baseline | general knowledge never widens owned authority and saved history still validates ownership |
| C156 | Baseline | supplied-context classification requires actual verbatim user premises |
| C164 | Introduced | genuine episode requests still require a valid episode referent |
| C165 | Introduced | standalone task wording cannot be replaced by a planner paraphrase |
| C166 | Introduced | missing premises use bounded repair without inventing evidence |
| C170 | Introduced | diverse candidates reach a rare middle-history transition within existing bounds |
| C173 | Introduced | event aliases cannot be starved by newer routine notes or a common alias |
| C176 | Baseline | event evidence survives both budgets among verbose routine observations |
| C177 | Baseline | rejected event answers retain relevant source excerpts instead of the latest profile |
| C178 | Introduced | review receives correction uncertainty attached to its own source |
| C180 | Introduced | event reason retrieval is independent of a summary or comparison planner label |
| C185 | Introduced | middle date survives retrieval and representation among five years of routine records |
| C187 | Introduced | separate user-grounded needs retrieve rare evidence and reach review and publication |
| C189 | Introduced | different needs stay attached to their own pets through retrieval and evidence |
| C190 | Introduced | need candidates survive verbose routine evidence without exceeding the prompt budget |
| C191 | Introduced | need coverage records actual query hits without reinterpreting database matching |
| C192 | Introduced | ordinary history reads recover irrelevant episode routing without granting references |
| C193 | Introduced | a middle-history month survives comparison retrieval among dense unrelated years |
| C194 | Introduced | a note-frequency question reaches ordinary evidence rather than an unrelated episode clarification |
| C196 | Introduced | new observation plus calculation can repair an invalid correction plan without weakening validation |
| C204 | Introduced | plain mixed-history answers retain owner-report anchors when legacy context IDs omit the request |
| C212 | Introduced | profile contract mistakes get one bounded repair with full ownership revalidation |
| C215 | Baseline | a failed mixed answer cannot commit proposed observation side effects |
| C217 | Introduced | read mode discards contradictory mutation hints without a provider repair |
| C219 | Introduced | unnamed standalone reads cannot expand to the account from a planner hint |

Full machine-readable ledger, including all 222 outcomes and remaining errors: [read-obligations-2026-09-20.json](read-obligations-2026-09-20.json).

## Reproduce offline

```sh
node --experimental-transform-types --test scripts/audits/ask-evidence-contract.cases.mjs scripts/audits/ask-shared-request-contract.cases.mjs
node --experimental-transform-types --test tests/furvise-lungs.test.mjs tests/furvise-replace-ticket.test.mjs tests/furvise-heart-receipt.test.mjs tests/ask-labs-list.test.mjs tests/ask-working-memory-interpretation.test.mjs tests/furvise-brain-interpretation-authority.test.mjs tests/ask-one-interpreter.test.mjs tests/ask-direct-evidence-ticket.test.mjs tests/furvise-read-obligations.test.mjs
npm run typecheck
```
