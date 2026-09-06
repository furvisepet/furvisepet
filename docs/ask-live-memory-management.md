# Local live memory management repair

This is a bounded local implementation, not real database or live UI validation. Work was confined to the assigned worktree. No credentials, external services, dependency installation, SQL execution, commits, or deployments were used. The sole dependency setup was the authorized `node_modules` junction; its target was not edited. AGENTS.md and the bundled Next.js route-handler and useParams guides were read. Optional plugin skill files could not be read because filesystem access was denied.

## Current caller and authority map

| Surface | Actual path and behavior |
| --- | --- |
| `/pets/[id]/memories` | Reexports `app/dogs/[id]/memories/page.tsx`; this is the mounted management UI. |
| Management profile load | `loadDogProfileWithMemoriesForUser`: owned profile plus eligible active legacy rows. Returned profile identity and every legacy row are now checked defensively. |
| Management detail load | `loadCanonicalRememberedDetailsForUser`: canonical rows from `furvise_memories`, legacy rows from `dog_memories`. Every returned row must belong to the user and appropriate pet. Canonical owner preferences require a null pet; pet facts require the selected pet. Inactive, expired/invalid-expiry canonical rows and ineligible facts are excluded. Legacy rows must explicitly be active. |
| Display projection | Existing `buildRememberedDetails` in `remembered-details.ts` keeps eligibility, freshness, correction/history projection, canonical precedence and distinct `source` values. Its implementation is unchanged. |
| Profile-list compatibility load | `loadOptionalDogMemories`, called by the profile-list loader, retains compatibility storage and now defensively checks user, requested pet IDs, active status, and eligibility. |
| Canonical confirm/edit/forget | UI sends PATCH `/api/memories/[id]` with the original `{action,value}` contract. Existing route performs authentication, ownership, eligibility/correction validation and idempotency before `manage_furvise_memory`. Route and SQL authority are unchanged. |
| Legacy Forget | Card passes the detail including its source. UI sends DELETE `/api/legacy-memories` with `{petId,memoryIds}`. Legacy edit/confirm are rejected. Canonical IDs are never relabeled or inferred as legacy IDs, including ID collisions. |
| Existing legacy helpers | `deleteDogMemoryForUser`/`deleteDogMemoriesForUser` already use the legacy DELETE route; `saveDogMemories` and its pet alias still use POST `/api/legacy-memories` and retain `{saved,skippedDuplicates}`. |
| Canonical Ask suggestions | PATCH `/api/ask/suggestions/[id]` continues through `saveMemorySuggestion` and the existing canonical suggestion authority. No suggestion route, receipt, or persistence authority changed. Existing canonical suggestion behavioral tests pass in the full suite. |
| `/results` | Mounted `ResultsPage` renders `ResultsRedirect`, which replaces the route with the selected pet or `/pets`. `ResultsPageContent`, including its legacy save callback and loader calls, remains unmounted and unchanged. |

## Changes and draft review

The preserved draft in `furvise-runner-canonical-memory-3/canonical-results-memory/worktree` was read only as an unreviewed proposal.

Accepted and selectively reimplemented:

- Defensive reader filtering, tightened further to explicit active legacy status and valid canonical subject/pet combinations; also applied to the profile and optional compatibility loaders.
- Keeping forgotten legacy rows as `status: rejected`. Existing migration `20260729010000_harden_memory_lifecycle_retrieval.sql` defines active/superseded/rejected legacy status. Existing `20260820010000_enforce_furvise_memory_semantic_integrity.sql` grants authenticated status updates; the original core schema supplies owner/pet update policies. This is repository evidence, not a claim about deployed schema.
- A legacy Forget control, reimplemented with an explicit source-bearing callback. The draft's button still encountered `memory.source !== "canonical"` in the card guard and therefore did nothing. Its ID-membership routing also did not preserve source identity when IDs collided.

Rejected:

- `/api/results-memories`, results-memory helpers, confirmation SQL/rollback/verification, confirmation receipts and export dependencies: these introduce a separate feature/authority for a dead caller and are outside this task.
- Changes to the dead Results callback, save-helper return contracts, export enumeration, or security tests accommodating a new table: current redirects and compatibility contracts remain intact.
- The draft comment implying tombstones alone stop recreation: current legacy POST previously searched only active text. The local implementation additionally checks inactive text and reconciles replay.

No existing tests were edited or weakened. No changes were made to remembered-details projection, canonical routes, Ask suggestion authority, SQL, or redirects.

## Legacy write and replay behavior

DELETE retains scoped rows with rejected status. It does not fall back to hard deletion if status update fails. Repeating it is harmless, and other users/pets are unaffected by the scoped query.

POST now reads existing text across all legacy statuses for the authenticated user and pet. It requests an exact count and fails with 503 when the inventory is unavailable or truncated by the database response limit; it does not insert using an incomplete suppression inventory. Large inventories therefore require separate pagination work before this compatibility write can succeed. Trimming, collapsing whitespace, and lowercasing defines the suppression key. Existing active duplicates, forgotten text, superseded text, duplicates within a batch, and ineligible details are skipped. A distinct eligible detail can still be saved. Read/update/insert failures return errors rather than pretending the operation succeeded.

The unique-conflict recovery query includes user, pet, active status and operation key, with defensive output filtering. Completed idempotency replay uses the existing `reconcilePersistedReplay` hook: previously saved IDs are reread as current scoped active eligible rows. Forgotten rows are omitted from `saved`; failed verification returns 503. This corrects a stale receipt without rewriting idempotency infrastructure or canonical authority.

These are sequential application-route guarantees for the normalized text described above. They do not provide semantic-paraphrase suppression, punctuation equivalence, cross-storage semantic identity, direct-database write prevention, or real-database concurrency guarantees. A concurrent insert/forget or a writer bypassing this route requires separately reviewed database authority. Canonical/legacy duplicates are not merged or reclassified by this task.

## Async view behavior

A session key contains user, auth status, pet ID and app-data version. Changing any of these mounts an empty detail session, including loading state and card editor state. The session captures its pet ID. Cleanup invalidates pending loads and callbacks; a post-session-lookup check prevents dispatch after switching pets. Initial loads and refreshes have generation checks, so older responses cannot replace a later refresh. A request already dispatched before a switch stays bound to its original memory/pet; its eventual response cannot update the new session.

## Evidence and verification

Before implementation, executable loader/route probes reproduced foreign/inactive rows, accepting a foreign profile, hard deletion and stale saved replay. The actual legacy card had no Forget control. The final baseline evidence was regenerated from unchanged HEAD source through the same transpilation harness, with five selected behavioral tests failing; no baseline source was edited. A separate pre-change optional-loader probe returned four rows where only one was valid.

| Check | Result | Evidence |
| --- | --- | --- |
| Selected HEAD baseline behaviors | 0 pass / 5 fail | [Baseline](ask-live-memory-before.txt) |
| Optional compatibility loader before fix | 0 pass / 1 fail | [Optional baseline](ask-live-memory-optional-before.txt) |
| Focused actual loader/route/component callbacks | 27 pass / 0 fail | [Focused](ask-live-memory-focused.txt) |
| Full test suite | 2277 pass / 0 fail | [Full](ask-live-memory-full.txt) |
| Typecheck, incremental disabled | Exit 0 | [Typecheck](ask-live-memory-typecheck.txt) |
| Repository lint | Exit 0; 0 errors, 2 existing unused-variable warnings in untouched `persist-learnings.ts` | [Lint](ask-live-memory-lint.txt) |
| Unchanged lifetime audit, before and after | 14 pass / 3 fail both times | [Before](ask-live-memory-lifetime-before.txt), [after](ask-live-memory-lifetime-after.txt) |

Commands, run with the assigned absolute worktree as working directory:

```text
node --test tests/live-memory-management.test.mjs
node --experimental-transform-types --test
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js
node --experimental-transform-types --test scripts/audits/ask-lifetime-history.audit.mjs
git diff --check
```

The transform-types flag is required for existing TypeScript parameter properties in the lifetime/full runtime graph under Node 24.19.0. An initial audit invocation without it could not load; the recorded audit uses the correct flag. Lifetime expectations and fixtures are unchanged. Remaining failures are old canonical episodes surviving the 20-row loader window, retrieved episodes retaining sequence/recurrence identity, and the exact separate-episode aggregate, not converted to passes or skipped.

The focused suite transpiles actual route and component source and executes actual loader functions. Auth, storage and fetch are controlled local doubles. Callback tests exercise the real legacy card control, canonical PATCH actions, source/ID collisions, invalid legacy actions, missing IDs, delayed loads, delayed mutation refresh, version remounting, and a pet switch during awaited session lookup. Negative loader/route cases include foreign owners/pets, inactive and expired rows, machine values, invalid scope, storage failure, ineligible correction, canonical conflict, forgotten replay and unique-conflict recovery. These are behavioral checks, not static-only claims. The small hook harness models keyed mount/unmount and deferred promises; it is not React DOM or browser validation.

## Next rollout gates

Runner review and commit ownership remain separate from this local completion. Before rollout, independently verify deployed status columns, status-update grants/RLS, semantic triggers and idempotency replay behavior in an authorized database environment. Exercise actual browser auth changes, pet switching with delayed requests, legacy Forget, canonical correction/confirmation, refresh and redirects. Review any desired stronger cross-storage/paraphrase/concurrency suppression as a separate database-authority task. No local test result here certifies those gates or deployment readiness.
