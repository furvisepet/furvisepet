# Remaining lifetime evidence: local result

Status: **blocked for the original three acceptance requirements; a demonstrated production-path omission bug is repaired.** The unchanged lifetime audit remains 14 passed / 3 failed. No source membership, semantic completeness, migration validation, or lifetime total has been invented to turn it green.

Work was confined to this isolated worktree with explicit command cwd. Read AGENTS.md, the bundled Next.js route-handler guide, `docs/ask-episode-source-checkpoint.md`, the original audit/fixtures/harness and existing episode callback regressions before edits. The optional installed Next.js skill file was inaccessible. Created only the expressly authorized `node_modules` junction to `C:/Users/gwara/furvise-ask-remaining-reliability/node_modules`; no dependency installation or target edits. No credentials, external services, live providers, database connections, Docker, extra agents, commits, push, merge, deployment, or browser validation were used.

## Actual authority path and current writer investigation

- `app/api/ask/route.ts:756` invokes `generateAskHistoryAnswer` with the resolved authoritative pet IDs. That callback runs historical retrieval, episode retrieval, then creates the evidence contract and invokes generation. The harness exercises this callback with mocked database/provider dependencies; it does not exercise HTTP authentication. Its global fetch throws on network access. No production auth bypass was added.
- `app/lib/intelligence/episode-history.ts` reads pinned or topic-scoped episode sources, revalidates owned care sources through `effectiveCandidates`, and rereads the episode/source payload to detect changes. `history-retrieval.ts:173` closes the correction graph, checks legacy lineage against current source values, and withholds deleted, forgotten, superseded, reassigned, changed, or uncertain sources. An episode ID alone does not establish an incident boundary.
- `app/lib/ai/ask-reasoning.ts:1211` serializes revalidated `episode_evidence` separately from the recent projection window. Its metadata retains stored `sequence_number` and `recurrence_of`, separately from `displayedOrdinal`; current status remains unknown. `episode-contract.ts` allows only partial coverage and `exactTotal: null`, and attaches saved references only when final rendered content still matches the authoritative answer.
- The legacy writer in `supabase/migrations/20260807010000_add_generic_semantic_event_persistence.sql:163` matches an active/monitoring episode, or creates a new projection with sequence/recurrence, then writes the relational care-entry membership. This is evidence of persisted grouping, not certification of every incident in a pet's life. Later reconciliation ranks topic matches (`20260808030000_rank_semantic_episode_reconciliation.sql`); presentation labels are not an independent identity authority.
- There IS another real membership source: `pet_care_episode_events`. `20260810230000_add_lifecycle_integrity_foundation.sql:240` records owned relational memberships. Its backfill at line 399 restores only surviving, unique, owner/pet-matched `summary.sourceRecordIds` and records missing source IDs. The fixture episodes have no such source IDs. The legacy role function can label the first member as opening and retains `unknown_legacy`; role labels alone do not establish correction-aware semantic completeness. The membership trigger runs on insertion or episode-ID updates, not every source-content correction.
- `20260811150000_add_ask_v2_semantic_claims_foundation.sql:395` conditionally inserts claim memberships when a governed `server_episode_id` exists and ownership, subject, lifecycle and canonical concept checks pass. `v2/lifecycle/compatibility.ts` binds a unique compatible active episode, otherwise leaves the ID null for new/historical lifecycle events. This writer does not guarantee every historical opening has a stable episode membership. `20260812044302_ask_v2_phase_2_legacy_import_rebuild.sql:295` imports existing membership roles and preserves unknowns; it checks changed legacy hashes instead of silently reimporting them.
- The correction-aware reducer in `v2/projections/rebuild.ts` has source claim IDs and applies opening/recurrence/continuation/resolution roles to supplied effective claims. However, `v2/phase3/runtime.ts` uses it for shadow comparison; the graph read has 1,000-claim/2,000-relation bounds and rejects overflow. `v2/phase3/cutover-policy.ts:21` explicitly excludes lifecycle claims from low-risk cutover. No evidence found here makes this a complete, authoritative lifetime episode inventory.
- The current reader, `20260905095022_ask_episode_period_scope.sql`, reads only `pet_care_entries.episode_id`, not claim memberships. It limits discovery to nine episodes, supplies members for eight, and returns at most nine members per episode. Oversized content is replaced with null plus `content_omitted`. Its response explicitly says `bounded_candidates_not_complete`; its statement timestamp does not certify cross-call or semantic completeness. These are repository contracts, not claims about deployed database state.

## Original requirements versus fixture authority

| Unchanged assertion | Why it remains red | Supported behavior |
| --- | --- | --- |
| Old canonical episodes survive the 20-row window | Projection fixtures are unlinked: the decisive care rows have no `episode_id`, and episodes have no source-reference list. Date/topic similarity cannot manufacture membership. | Source-linked old episodes bypass the recent window and reach the actual provider input. |
| Retrieved episodes retain sequence and recurrence | `Describe the second soft-stool episode` supplies neither a persisted displayed reference nor membership-backed authority. The assertion fails at record existence, before sequence equality. Stored sequence 2 cannot be reinterpreted as displayed ordinal 2. | New regression verifies stored sequences 7 and 12, displayed ordinals 1 and 2, and the original recurrence ID through the actual callback beyond 25 newer projections. |
| Exact separate-episode lifetime aggregate | This call supplies decisive notes but no episode rows. The expected value 2 is a fixture oracle. Explicit text boundaries alone do not certify distinct stable groups, exhaustive imports, or absence of additional/corrected/forgotten events. | Available evidence remains a supported subset with null exact total; an invented provider total is replaced by the grounded answer. |

The first two requirements are feasible with authoritative linked data, as demonstrated by existing and new callback cases. Their supplied fixture authority does not support the requested promotion. The third requires an additional completeness contract even when all supplied notes have been retrieved. These are distinct limitations, not permission to weaken the assertions.

## Implemented repair and adversarial reproduction

Previously, episode retrieval discarded an omitted member payload but retained the group's other notes. An intact opening could therefore establish an episode while another member's correction or conflicting boundary was unreadable. A saved reference could even remain valid because the newly omitted member was absent from the version hash.

`app/lib/intelligence/episode-history.ts` now withholds the entire affected episode when any member has omitted content or a non-string note, as it already did for more than eight members. It retains `episode_input_bound` and the partial-coverage contract. Independently supported episodes remain eligible. Pinned follow-ups to the affected group become stale. This change does not certify other groups as a complete list.

Added seven cases in `scripts/audits/ask-remaining-lifetime-evidence.cases.mjs`, with a default-suite subprocess wrapper in `tests/ask-remaining-lifetime-evidence.test.mjs`. They exercise oversized notes, omitted titles, absent notes, persisted-reference invalidation, old sequence/recurrence preservation, forgotten onsets, foreign ownership and unsupported exact provider totals. The unchanged harness supplies all database/provider mocks. Before the repair: 3 passed / 4 failed. After: all seven pass. Existing tests, fixture expectations and harness were not edited.

## Smallest authoritative design still required

1. Extend the owned, bounded episode-source read contract to union existing care-entry and claim-backed `pet_care_episode_events` memberships. Return stable episode IDs, membership provenance/version, governed concept/role, original stored sequence/recurrence, source hashes and explicit per-group omissions. Validate owner/pet/concept consistency on every edge; deduplicate imported legacy claims and care rows by lineage. Do not infer membership from dates, titles, model output or first-row ordinals. Treat legacy heuristic roles as unresolved until source-backed adjudication establishes a boundary.
2. Close correction/retraction/supersession and forgotten-source visibility for those memberships before admitting an episode. Revalidate all member payloads and graph versions. Cross-pet corrections must remove or explicitly reassign membership; replacement prose alone cannot silently inherit it. Preserve tombstone effects so forgetting a correcting claim cannot revive its target. Introduce a stable projection identity/alias policy for merges, splits and corrected boundaries instead of treating reducer sequence keys as durable episode IDs.
3. Add a versioned owner/pet/concept/period coverage certificate covering the full retained source inventory, import frontier, unknown/unclassified rows, unresolved grouping, missing source IDs, correction closure and projection revision. Every relevant writer/correction/deletion/forget operation must transactionally invalidate or advance it. Reuse existing membership/lineage tables; the missing element is verified coverage and revision tracking, not a second collection of generated episode summaries.
4. Read a complete aggregate and a bounded display page against the same immutable revision or database snapshot. Return `exactTotal` only when all source, semantic, grouping, correction and visibility coverage checks succeed; otherwise return null plus specific omissions. A complete count of recorded episodes is not a claim that all real-life episodes were recorded. Literal lifetime completeness requires an explicit scope and corresponding source coverage. Never derive a total from page size, maximum stored sequence, note count, or exhausted keyword candidates.
5. Validate the schema/RPC/writer changes with local database integration tests for RLS, member-only claims, imports, duplicate lineage, late/cross-pet corrections, forgotten sources, paging overflow, concurrent updates, merge/split identity and atomic aggregate coverage. This task forbids database connections and edits outside the allowed paths; no migration was added, run or claimed validated. That design remains work, not a completed implementation.

## Verification

All logs are outside the worktree in `C:/Users/gwara/AppData/Local/Temp/`.

| Check | Exact result | Log |
| --- | --- | --- |
| Original audit before edits, with `--experimental-transform-types` | 17 tests; 14 pass, 3 fail; exit 1 | `ask-lifetime-before.log` |
| New callback regressions before production repair | 7 tests; 3 pass, 4 fail; exit 1 | `ask-remaining-lifetime-regressions-before.log` |
| Focused original episode/history review plus new callbacks | 35 tests; 35 pass, 0 fail/skip/cancel; exit 0 | `ask-remaining-lifetime-focused.log` |
| `npm.cmd test` | 2,282 tests; 2,282 pass, 0 fail/skip/cancel; exit 0 | `ask-remaining-lifetime-full.log` |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit 0; incremental cache writes disabled | `ask-remaining-lifetime-typecheck.log` |
| `npm.cmd run lint` | exit 0; 0 errors, 2 existing unused-parameter warnings in `persist-learnings.ts:141,374` | `ask-remaining-lifetime-lint.log` |
| Original audit separately after repair | 17 tests; 14 pass, same 3 fail; exit 1 | `ask-remaining-lifetime-original-final.log` |
| `git diff --check` and added-file whitespace check | pass | command output |

The initial audit invocation without transform-types failed before tests due to a TypeScript parameter property; it was rerun correctly before edits. PowerShell blocked the `npm.ps1` shim; `npm.cmd` ran the existing test/lint commands without changing execution policy. Neither launch issue required dependency or production changes.

Byte comparison with HEAD confirmed the original audit, fixture/expectations and harness are unchanged. SHA-256:

```text
9fd1173abacf591dfe69568afafc9e2513a2e067e56aef600f5ccc0dd44b171d  scripts/audits/ask-lifetime-history.audit.mjs
a94407c46408925a3026c37ee0b8c16547e45c8c9e43fdea2721e2430d77bd46  scripts/audits/fixtures/ask-lifetime-history.mjs
95f471c313e1971fb12dc3be9b079f1aaf691e8f2ae2257807a06307978615c1  scripts/audits/helpers/lifetime-harness.mjs
```

Only the production reader, two new regression files, this report and the authorized ignored dependency junction were changed. Runner retains responsibility for any commit. Browser validation was intentionally not repeated (parent `0e7d721`).
