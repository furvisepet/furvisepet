# Episode ticket obligations — 20 September 2026

**C075, C164, and C192 pass offline. The interpreter branch remains blocked. No live Ask, preview, push, merge, or deployment.**

Branch `codex/one-interpreter`; starting draft `805be31`. Production remains `e2ab3a0`; this run made no production calls or changes.

## Counts

| Same 222 audit cases | Passed | Failed | New failures vs production |
| --- | ---: | ---: | ---: |
| Production baseline | 213 | 9 | 0 |
| Previous draft | 185 | 37 | 29 |
| This cut | 188 | 34 | 26 |

Only the selected three changed outcome. All moved from fail to pass. The remaining 34 failures comprise 26 introduced failures and eight existing baseline failures. The ninth baseline failure was already passing before this cut. All 222 case names remain intact.

| ID | Result | Preserved behavior |
| --- | --- | --- |
| C075 | Pass | A typed breathing-episode count retains `count` and the episode topic, rather than becoming ordinary recall. |
| C164 | Pass | Missing episode referent clarifies; explicit typed membership preserves the ordinal reference; stray legacy episode hints on an ordinary ticket grant no reference. |
| C192 | Pass | Ordinary reads remain ordinary despite irrelevant legacy hints. Specific and unspecified episode-count assertions both pass. Membership routing, missing-reference clarification, and foreign-pet rejection remain intact. |

## Change and why

The typed read binder previously mapped `read` to ordinary recall and discarded the distinct episode job. The ticket now carries an optional `episode` obligation with `operation: count | membership` and a referent containing a basis, topic, and ordinal. A count targets a recorded register; membership can target a displayed list or an explicitly bounded register. This is semantic selection, not a membership certificate, event ID, count, or mutation authorization.

The schema rejects forged fields, invalid count ordinals, conflicting record filters, and record-selection limits on episode jobs. The referent is immutable after binding. Ordinary tickets have no episode obligation; legacy `operation`, `episodeTopic`, `ordinal`, and episode quantity cannot silently create one.

A missing referent produces clarification with no historical read authority. A proposed count with an unspecified topic remains a count job, preserving C192, but is marked for clarification and grants no history queries until scoped. A membership ordinal is provisional: the existing episode reader still fetches and validates the stored reference list, owner, pet, source versions, and membership. It cannot treat the planner's ordinal as proof that the episode exists.

The new fields are exposed in the shared planner schema and instructions. Fixtures supply them explicitly. No runtime question parsing was added to invent the obligation.

## Narrow boundary plumbing

- `read-ticket.ts`: typed obligation, schema, strict validation, and immutable binding.
- `ask-request-contract.ts`: maps the episode obligation to the existing count/membership path, or clarification; uses ticket dates for scoped-register references.
- `interpretation-authority.ts`: unresolved episode requests receive `memoryNeed: none`.
- `episode-history.ts`: requires the typed episode obligation when a read ticket exists. Typed routing does not consult the legacy lifetime-illness phrase gate or infer a topic from presentation prose. The existing member retrieval, ownership, source revalidation, correction checks, and counting machinery were not rewritten.
- `labs-list.ts`: one eligibility guard prevents episode jobs from being serialized as ordinary care-record lists. Existing completeness/review checks and copy remain unchanged.
- `evidence-read-ticket.ts`: one eligibility guard rejects episode obligations at the direct publication caller, which cannot perform membership retrieval.
- Only the three selected audit fixtures were migrated, using explicit episode objects. Their assertions were not altered.

## Verification

- Full audit: **188 passed / 34 failed**, all 222 names preserved. Outcome comparison shows only C075, C164, and C192 moved.
- Focused Heart, replace, Lungs, serializer, interpretation, direct-evidence, read-obligation, and episode-ticket tests: **76/76 passed**, zero skipped. All 71 preceding cases remain green; five new cases cover the episode boundaries.
- New safety checks prove no history/RPC calls on unresolved jobs; ordinary tickets cannot acquire episode authority from raw prose; a missing stored list clarifies despite a proposed ordinal; count uses the membership RPC and cannot enter the ordinary list serializer; malformed/forged episode fields and direct-caller bypasses are rejected.
- AST comparison against `805be31`: **624 existing assertion calls unchanged** (117 evidence assertions + 507 shared-request assertions). C192's count assertions are intact.
- Typecheck, targeted ESLint, and `git diff --check`: passed.
- Actual model/API calls: **0**. Provider dependencies in existing suites are local mocks. Live Ask, previews, pushes, merges, and deployments: **0**.

## Boundaries and limits

Heart, confirmation, receipts, Lungs retrieval, serializer review, mouth copy, Brief, Immune, paywall, mixed requests, multi-need selection, correction uncertainty, and the owner-note splitter were not rewritten. No phrase executor or second planner was added. The six repair cases below remain red.

This is an offline ticket/routing proof, not a successful live episode-count proof or proof that the real Brain emits these fields. The existing episode membership/count engine still owns factual certification and may return partial, unavailable, stale, or clarification. A proposed register or ordinal alone certifies no membership or total. The current topic vocabulary is inherited from that existing engine; this cut does not expand its taxonomy.

The branch remains blocked with **26 new failures**. No live Dune, preview, or merge was performed. Stop after this cluster.

## Six repair cases retained red

| ID | Case | Result |
| --- | --- | --- |
| C055 | premise repair is bounded and revalidates exact user evidence | Fail, retained |
| C056 | a premise repair cannot authorize invented pets or mutation scope | Fail, retained |
| C113 | real admission lets a repaired planner reach composition without opening extra repair cycles | Fail, retained |
| C166 | missing premises use bounded repair without inventing evidence | Fail, retained |
| C196 | new observation plus calculation can repair an invalid correction plan without weakening validation | Fail, retained |
| C212 | profile contract mistakes get one bounded repair with full ownership revalidation | Fail, retained |

One planner pass remains the policy: invalid first ticket means reject or clarify, never a silent second planner. This cut did not rewrite the repair fixtures.

## Remaining failures

| ID | Origin | Case |
| --- | --- | --- |
| C055 | Introduced | premise repair is bounded and revalidates exact user evidence |
| C056 | Introduced | a premise repair cannot authorize invented pets or mutation scope |
| C063 | Baseline | read planner can omit extraction while writes still require a valid frame |
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
| C193 | Introduced | a middle-history month survives comparison retrieval among dense unrelated years |
| C194 | Introduced | a note-frequency question reaches ordinary evidence rather than an unrelated episode clarification |
| C196 | Introduced | new observation plus calculation can repair an invalid correction plan without weakening validation |
| C204 | Introduced | plain mixed-history answers retain owner-report anchors when legacy context IDs omit the request |
| C212 | Introduced | profile contract mistakes get one bounded repair with full ownership revalidation |
| C215 | Baseline | a failed mixed answer cannot commit proposed observation side effects |
| C217 | Introduced | read mode discards contradictory mutation hints without a provider repair |
| C219 | Introduced | unnamed standalone reads cannot expand to the account from a planner hint |

Full machine-readable ledger: [episode-ticket-2026-09-20.json](episode-ticket-2026-09-20.json).

## Reproduce offline

```sh
node --experimental-transform-types --test scripts/audits/ask-evidence-contract.cases.mjs scripts/audits/ask-shared-request-contract.cases.mjs
node --experimental-transform-types --test tests/furvise-lungs.test.mjs tests/furvise-replace-ticket.test.mjs tests/furvise-heart-receipt.test.mjs tests/ask-labs-list.test.mjs tests/ask-working-memory-interpretation.test.mjs tests/furvise-brain-interpretation-authority.test.mjs tests/ask-one-interpreter.test.mjs tests/ask-direct-evidence-ticket.test.mjs tests/furvise-read-obligations.test.mjs tests/furvise-episode-ticket.test.mjs
npm run typecheck
```
