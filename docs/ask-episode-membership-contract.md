# Bounded episode membership repair

**Done for the approved local implementation only. Database validation and all-V1 completion remain pending.** Base: `a97d9e3a41619e642ed7c78d10f41d47c231a0d7`. Exact lifetime totals remain `null`. No coverage certificate or completeness flag was added.

## Before and after

The existing `read_ask_episode_sources` reader followed only `pet_care_entries.episode_id`. A real `pet_care_episode_events` row with `claim_id` and null `care_entry_id` therefore supplied no evidence to `generateAskHistoryAnswer`. Before production edits, the new callback fixture run recorded **14 tests, 12 passed / 2 failed**: claim-only generation and saved-reference setup failed. The duplicate imported-lineage case already passed via its care row; that result did not demonstrate claim retrieval. The initial progress update overstated the number of failures; these are the recorded results.

The new SQL contract preserves bounded raw membership edges, care sources and claim payloads. Application validation seeds member claim IDs into the existing correction reader, checks current owner/pet/canonical concept/role/payload, follows imported care lineage, and deduplicates a care row and its imported claim by the persisted legacy row ID. Text similarity, dates, titles and ordinals never create membership. Admission still requires the existing explicit positive episode-boundary text; arbitrary structured claim payloads and heuristic/unknown roles remain excluded.

An unreadable, missing, changed, forgotten, superseded, corrected, foreign, unsupported or overflow member excludes its entire group. Known missing source IDs also exclude the group. Independently supported groups remain eligible. Correction replacements do not inherit the target's membership. Existing graph semantics preserve destructive effects after their author is forgotten; removed-edge and removed-lineage tombstones remain authoritative. Imported claim roots now explicitly request their care IDs because the existing correction RPC returns `withheld_source_ids` only for requested care roots.

Two bounded correction passes surround membership revalidation. Saved source versions include raw membership identities/roles/ordinals, stored claim payloads and the observed correction/lineage/source revision. A changed membership can invalidate a reference even when its note is unchanged. Claim references use `claim:<id>`; care references retain their original format. Stored sequence 7 remains sequence 7 while its displayed ordinal is 1. Stale references never substitute another episode. The original whole-group omission repair, safety validation, read-only persistence gates, and final-render reference attachment gate remain intact.

This is read-committed revalidation, **not an atomic snapshot**. Changes after the final read remain possible. It cannot establish a complete retained inventory or a lifetime count.

## Authority inspected

- `AGENTS.md`, bundled `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, and `docs/ask-remaining-lifetime-evidence.md`.
- Actual legacy writer: `supabase/migrations/20260807010000_add_generic_semantic_event_persistence.sql`; membership trigger/backfill and missing-source tracking: `20260810230000_add_lifecycle_integrity_foundation.sql`.
- Claim schema and governed membership writer: `20260811150000_add_ask_v2_semantic_claims_foundation.sql`. Membership has a surrogate `id`, exactly one of `care_entry_id`/`claim_id`, owner/pet foreign keys, role, ordinal and timestamps. It has no invented `membership_version` column.
- Import writer/schema: `20260812044302_ask_v2_phase_2_legacy_import_rebuild.sql`. The draft checks its actual SHA-256 source shape: care row fields plus pet `species` and care membership `membership_role`. `source_issue` is a per-edge omission reason, not a completeness certificate.
- `app/lib/intelligence/v2/lifecycle/compatibility.ts`, `v2/projections/rebuild.ts`, `history-retrieval.ts`, the production history callback, reference persistence/reader, and `20260905095022_ask_episode_period_scope.sql`.

The optional Supabase skill file was denied by the sandbox. Repository schema and writers supplied the implementation authority.

## Exact changed paths

| Path | Change |
| --- | --- |
| `app/lib/intelligence/episode-membership.ts` | New versioned membership/source validation and explicit whole-group exclusions. |
| `app/lib/intelligence/episode-history.ts` | Membership retrieval, claim validation, deduplication, correction recheck, versioned saved references and claim details. |
| `app/lib/intelligence/history-retrieval.ts` | Optional member claim roots, imported care tombstone lookup, full claim version checks and observed graph revision. |
| `scripts/audits/ask-episode-membership-contract.cases.mjs` | 24 production callback cases with mocked database and provider dependencies. |
| `tests/ask-episode-membership-contract.test.mjs` | Default-suite subprocess wrapper for those 24 cases. |
| `supabase/drafts/ask_episode_membership_contract.sql` | Exact unapplied replacement-reader SQL draft. |
| `supabase/drafts/ask_episode_membership_contract.rollback.sql` | Exact prior five-argument reader restoration, including invoker mode and grants. |
| `supabase/tests/ask_episode_membership_contract.sql` | Unexecuted rollback-only schema, ownership, source, correction, import/hash, omission, overflow and version assertions. |
| `supabase/tests/ask_episode_membership_reversal.sql` | Unexecuted exact reversal body inside an outer rollback-only transaction, with function/grant assertions. |
| `docs/ask-episode-membership-contract.md` | This report. |
| `node_modules/` | Authorized ignored junction to `C:/Users/gwara/furvise-ask-remaining-reliability/node_modules`; target untouched. |

Ignored local logs also reside under `docs/`: `ask-membership-before.log`, `ask-membership-after.log`, `ask-membership-focused.log`, `ask-membership-full.log`, `ask-membership-typecheck.log`, `ask-membership-lint.log`, `ask-membership-original-before.log`, and `ask-membership-original-final.log`. The focused log contains two wrapper tests; the complete existing episode/history regressions were exercised by the full suite.

## SQL and deployment gate

Both installed commands were attempted locally: `node_modules/.bin/supabase.cmd --help` and `node_modules/.bin/supabase.cmd migration new ask_episode_membership_contract`. Both failed before useful CLI execution with `EPERM` attempting to write `C:/Users/gwara/.supabase/telemetry.json.tmp.*`. No dependency install, telemetry workaround, network request, database connection, Docker startup or fabricated migration creation was performed. Accordingly, the exact SQL is under `supabase/drafts/`, explicitly **NOT DATABASE-VALIDATED**, rather than presented as a CLI-created migration.

The draft uses a definer because claims and lineage are service-only tables; invoker access would require broadening table privileges. It has fixed `search_path=pg_catalog`, schema-qualified tables/functions, current `auth.uid()`, current pet ownership, per-table owner/pet filters, explicit PUBLIC/anon/service-role EXECUTE revocation, and only authenticated EXECUTE granted. It changes no RLS or table grants and provides no application service-role fallback.

An absent/erroring RPC produces unavailable episode coverage. An older installed reader can still supply the prior care-only subset, with explicit `episode_membership_contract_unavailable`; it cannot produce claim-backed evidence. A rollback therefore degrades safely and invalidates claim-backed saved references when they cannot be revalidated.

Remaining database gates: apply the draft through a real CLI-created migration in a separately authorized disposable database; execute both rollback-only SQL files; verify actual ACL/RLS behavior, registry and trigger interactions, import hash parity, deletion/tombstone behavior and foreign owner/pet constraints; inspect query plans and timeout/overflow behavior; validate reversal and subsequent reapplication. JavaScript fixtures do not prove any of those SQL behaviors. The SQL assertion file intentionally checks raw source/edge authority; semantic admission and deduplication are application callback assertions.

## Bounds and execution evidence

- Episode phase: two source RPC calls, at most six correction calls per pass (twelve total), plus one saved-reference RPC for follow-ups. One shared five-second episode deadline bounds all calls. The claim-only fixture asserts exactly two source reads and three correction reads across the callback: one preceding historical pass plus two episode passes.
- Existing preceding history phase retains its own five-second budget: up to four candidate pages per pet, six graph calls, and one supplemental dated-correction probe per pet when applicable. Episode scope admits exactly one current owned pet; context-loading queries are separate and unchanged.
- SQL discovery: at most four indexed topic probes of nine rows, merged to nine episodes; only eight receive membership probes. At most nine raw members per selected episode (72 total), with the ninth excluding that group before deduplication. At most 64 admitted candidates and eight displayed groups. Known missing-source ID arrays are capped at nine and any nonempty array excludes its group. Claim payloads above 16,000 bytes, notes above 2,000 characters and titles above 200 characters retain explicit omission markers. Correction closure retains its 64-root request, 128-claim/relation and six-call bounds per pass.
- Real local execution: Node ran retrieval → `generateAskHistoryAnswer` → provider-input construction → answer validation and persistence/reference gates. Database and provider were mocked by the unchanged harness, whose global fetch rejects network access. HTTP authentication, SQL, actual RLS, live providers and persistence writes were not executed.

| Required check | Exact result |
| --- | --- |
| Pre-edit callback reproduction | 14 tests; 12 pass / 2 fail. |
| Final new callback regressions | 24 tests; 24 pass / 0 fail. |
| `npm.cmd test` | 2,283 tests; 2,283 pass / 0 fail/skip/cancel. |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Exit 0. |
| `npm.cmd run lint` | Exit 0; zero errors, two existing unused-parameter warnings in `persist-learnings.ts:141,374`. |
| Original audit, separately before and after | 17 tests; 14 pass / 3 fail; exit 1 both times. |
| `git diff --check` and new-file whitespace check | Pass. |
| Database execution | None; both SQL test files and reversal remain unvalidated. |

The original audit, fixtures and harness remain byte-for-byte unchanged. SHA-256 respectively: `9fd1173abacf591dfe69568afafc9e2513a2e067e56aef600f5ccc0dd44b171d`, `a94407c46408925a3026c37ee0b8c16547e45c8c9e43fdea2721e2430d77bd46`, `95f471c313e1971fb12dc3be9b079f1aaf691e8f2ae2257807a06307978615c1`.

## Precise subsequent exact-count contract

An exact **recorded** episode total requires an owner/pet/canonical-concept/period scoped, versioned certificate tied to a single immutable inventory/projection revision. Its evidence must cover the retained source inventory and import frontier, unknown/unclassified sources, every membership and missing source, lineage deduplication, correction/retraction/supersession closure including tombstones, visibility/forgetting, and resolved grouping. All contributing writers and deletion/forget/correction paths must transactionally advance or invalidate that revision. Merge/split/reassignment needs stable episode identity and alias policy.

Only after those gates pass may a complete aggregate and bounded display page be read from the same revision/snapshot and return an exact total. Overflow, unresolved grouping, partial imports, unknown classification, missing or changed sources, or revision mismatch must return null plus specific coverage failures. Exhausted lexical pages, member counts, maximum stored sequence and model assertions cannot certify a count. Literal lifetime completeness additionally requires an explicit scope establishing which real-life history was recorded. None of these exact-count gates is claimed complete here.

No commits, pushes, merges, deployments, external services, credential reads, extra agents or other-worktree edits were performed. Runner owns any commit.
