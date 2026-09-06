# Review of live memory management

Reviewed locally against starting commit `183d084590cf4b6fc563db093d136c3ad2b760ed` (the preceding repair), on 2026-09-05. This review found and fixed four reproducible gaps; it is not a database or browser acceptance sign-off.

## Scope and verified authority

Read root AGENTS.md, `docs/ask-live-memory-management.md`, and bundled Next.js `route.md` and `use-params.md` before framework edits. All commands used the explicit absolute assigned worktree directory. Created only the authorized node_modules junction to `C:/Users/gwara/furvise-ask-remaining-reliability/node_modules`; did not edit its target or install dependencies. No additional agents, external services, credentials, database execution, Docker, commits, pushes, merges or deployments were used. The preserved draft was not needed or treated as authority.

The actual mounted `/pets/[id]/memories` page reexports the dog memories page. That page loads the owned profile and canonical/legacy rows, projects them with `buildRememberedDetails`, and passes source-bearing details to card callbacks. Canonical and legacy IDs can collide without sharing React keys or mutation routes: canonical actions use PATCH `/api/memories/[id]`; legacy Forget uses DELETE `/api/legacy-memories` with the captured pet ID. Legacy edit/confirm and absent detail IDs are rejected. Existing behavioral regressions continue to cover these paths.

Reviewed the profile, canonical/legacy and optional compatibility loaders: they apply user/pet query constraints and defensive returned-row filtering. Profile identity must match; legacy rows must explicitly be active and eligible; canonical scope must be the selected pet or a global owner preference, with active status, eligibility and expiry checks. The page requires a loaded owned profile before showing groups. These checks and their adversarial tests remain intact.

Canonical PATCH continues to query the authenticated user's memory, validate eligible corrections, and delegate to `manage_furvise_memory`. Its endpoint contract has no selected-pet parameter: ownership is enforced by the route/database authority, while the management UI selects the loaded detail and captures the original pet session. It is not accurate to claim this route independently enforces a browser's selected pet. Canonical Ask suggestions still use `saveMemorySuggestion` and `save_ask_memory_suggestion`, including expected pet identity. Neither authority nor SQL was changed. Remembered-details correction/history projection, canonical precedence, freshness and eligibility are unchanged; the existing projection and suggestion tests pass in the full suite.

## Demonstrated issues fixed

Four added tests failed against the preceding repair before production edits: [before evidence](ask-live-memory-review-before.txt), 27 pass / 4 fail.

1. **Replay source IDs:** with an overreturning storage double, a forgotten/missing receipt ID was replaced in `saved` by an unrelated active row belonging to the same owner and pet. Replay now checks membership in the original receipt ID set as well as owner, pet, active status and eligibility. This is defense against unexpected storage output, not evidence that normal PostgREST ignores `.in()`.
2. **Malformed receipt:** a persisted successful response containing `saved: [null]` threw while extracting IDs. Replay now rejects missing/invalid UUID identities with 503 before querying. This is a malformed stored-response regression, not a claim that normal writes produce null rows.
3. **Account transition during session lookup:** the displayed user's still-mounted callback accepted a token for a different account before the auth UI remounted. It now requires the returned session user ID to match the displayed user before dispatch. Server ownership already limits writes; this fix prevents dispatching the stale UI action under a different principal. Existing pet-switch and delayed-refresh protections remain tested.
4. **Stale correction editor:** a canonical card with unchanged source/ID retained its initial editor value when refreshed props contained a corrected value. Reopening Edit could submit the older text. Opening Edit now initializes the draft from the current `editableValue`. The regression preserves hook state across changed card props and executes the actual Edit callback.

Only the legacy route and mounted page changed in production. Existing test assertions were retained; the session double now includes the user identity supplied by real Supabase sessions. The harness gained card-prop refresh support and four additional regressions. No tests were skipped or expectations weakened.

## Forgotten rows and asynchronous behavior

DELETE retains owner/pet-scoped rejected tombstones; repeat deletion is harmless. POST checks all statuses with an exact inventory count and suppresses normalized existing text, including rejected and superseded rows. Missing/truncated inventory fails closed. Completed successful receipts are rechecked against current active eligible scoped rows, now also against receipt IDs. Tests cover forgotten same-key replay, new-key normalized suppression, distinct eligible writes, failed storage, unique-conflict recovery, and wrong-owner/pet rows.

The keyed page session includes auth/user, pet and app-data version. Cleanup and refresh generations prevent old loads and mutation refreshes replacing a new pet's rows. Delayed auth lookup is checked again before dispatch; the added identity check covers a different account arriving before remount. An already-dispatched request remains bound to its original source, ID and pet. The editor fix covers reopening after changed props, not concurrent edits in another browser.

These are bounded application guarantees. They do not establish transactional insert/forget ordering, semantic-paraphrase suppression, suppression across canonical and legacy stores, or elimination of preexisting duplicate rows under distinct IDs. Forget acts on the selected storage identity; a separately stored duplicate can remain or become visible. No broader semantic deletion authority was introduced.

## Actual validation

| Check | Result | Evidence |
| --- | --- | --- |
| Added regressions before fixes | 27 pass / 4 fail | [Before](ask-live-memory-review-before.txt) |
| Focused actual route/loader/component tests | 31 pass / 0 fail | [Focused](ask-live-memory-review-focused.txt) |
| Full suite | 2281 pass / 0 fail, no skips | [Full](ask-live-memory-review-full.txt) |
| Typecheck, incremental disabled | Exit 0 | [Typecheck](ask-live-memory-review-typecheck.txt) |
| Repository lint | Exit 0, zero errors; two existing unused `supabase` warnings in untouched `persist-learnings.ts` | [Lint](ask-live-memory-review-lint.txt) |
| Original lifetime audit before and after | Both 14 pass / 3 fail, exit 1 | [Before](ask-live-memory-review-lifetime-before.txt), [after](ask-live-memory-review-lifetime-after.txt) |
| Diff whitespace check | Exit 0 | `git diff --check` |

Commands: `node --test tests/live-memory-management.test.mjs`; `node --experimental-transform-types --test`; `node node_modules/typescript/bin/tsc --noEmit --incremental false`; `node node_modules/eslint/bin/eslint.js`; `node --experimental-transform-types --test scripts/audits/ask-lifetime-history.audit.mjs`.

The unchanged lifetime failures are old canonical episodes surviving the 20-row loader window, retrieved episodes retaining sequence/recurrence identity, and the exact separate-episode aggregate. Audit source, fixtures and helpers were not edited. They remain failures, separate from the passing default suite.

Reviewed the preceding repair's commit file list and this review's diff: neither introduces a retired results feature, results-memory endpoint or results migration. Current `ResultsPage` mounts `ResultsRedirect`; `ResultsPageContent` remains unmounted. The preexisting chronology-repair migration whose name contains `results` is unrelated and unchanged. No changes to results, canonical Ask routes, canonical lifecycle routes, migrations or audit files appear in this review.

## Explicit unvalidated limits

All behavioral execution was local with controlled auth/storage/fetch doubles. The focused tests transpile actual source, but their hook harness is not React DOM: keyed mount/unmount and state preservation are modeled explicitly, and the page harness substitutes the display projection. The separate existing remembered-details suite exercises actual projection behavior. No browser navigation, real React effect scheduling, auth event timing, deployed RLS/grants/triggers, database idempotency storage or concurrent transactions were validated. The replay harness invokes the reconciliation callback directly; source inspection confirms the existing idempotency implementation calls it on persisted replay. Actual database/browser verification requires a separately authorized environment. These limitations remain unresolved rollout gates, not claims of local deployment readiness.
