# Remembered-details browser acceptance — initial runner attempt

Superseded status: direct desktop execution subsequently passed all 11 browser checks after two fixture corrections. See ask-memory-browser-direct-validation.md for current evidence and remaining limits. The blocked findings below describe the earlier runner attempt and are preserved as historical diagnostics.

2026-09-05. Worktree: `C:/Users/gwara/furvise-runner-validation-next-1/browser-memory-acceptance/worktree`.

**No browser acceptance is claimed.** Chrome could expose a loopback CDP endpoint, but could not evaluate even `1 + 1` on its fresh `about:blank` tab. The final attempt failed the startup probe before navigating to the fixture. The explicit React DOM limitation in `ask-live-memory-management-review.md` therefore remains unresolved. No application defect was demonstrated in a browser and no production repair was made.

## Infrastructure and blocker

Read root AGENTS.md, the previous management review, and bundled Next.js `use-params.md`, testing `playwright.md`, and the relevant route-handler reference. The supplied plugin skill paths were inaccessible; the installed agent-browser package's skill stub and CLI core guide were readable. Inspected the existing agent-browser 0.36.0 CLI and Chrome installation without installing anything. The supplied node_modules junction was created; its target was not edited. Resolution follows an existing junction chain to installed packages under `furvise-ask-reliability-1/node_modules`.

Implemented a dependency-free CDP driver using Node's WebSocket and HTTP server. The first Chrome launches failed with repeated GPU process exit `-1073741790`, followed by `GPU process isn't usable. Goodbye.` and browser exit `2147483651`. Disabling GPU acceleration and using an in-process GPU avoided that fatal exit, but `Runtime.evaluate` timed out. A single-process diagnostic retry also timed out; that flag is not retained. Finally, the minimal arithmetic probe reproduced the timeout without loading the application or fixture. This establishes an infrastructure failure independent of the fixture, without establishing the exact platform cause. The cached agent-browser CLI was inspected, not used to launch a second browser or attach to a user's session.

See [final bounded startup diagnostics](ask-memory-browser-infrastructure.txt). Registry/encryption errors in that output came from Chrome initializing a new empty temporary profile, not from inspecting credentials. No user Chrome profile was used.

Each attempt used one headless browser and a unique generated profile, an ephemeral HTTP listener bound to `127.0.0.1`, and a loopback CDP listener. Node ran with `--max-old-space-size=2048`. The driver samples Node `os.freemem()` every 500 ms and stops its browser/server below 2 GiB. Startup free RAM was approximately 8.7 GiB; sampled retry minima stayed above 8.2 GiB. Final free RAM was approximately 8.6 GiB. Windows CIM RAM inspection was denied, so Node supplied the measurements. Chrome background-network flags, non-loopback DNS rejection, and the fixture's CSP restrict network activity; no external service or provider was requested.

The original unbounded CDP wait was interrupted. Subsequent attempts use bounded startup, fetch and command timeouts and close their owned browser/server in `finally`. All completed attempt profiles were removed. **Automatic approval review rejected cleanup of the first interrupted attempt's generated `tests/.memory-browser-V8rc2G/` directory with “blocked by policy.” That untracked browser profile remains and must be excluded from any runner commit.** Its path was verified inside the assigned worktree; no deletion workaround or approval escalation was attempted. No owned dev server remains; no user/other-agent process was intentionally stopped.

## Reproducible fixture and exact execution boundary

Files: [driver](../scripts/audits/ask-memory-browser.mjs), [browser fixture](../tests/fixtures/ask-memory-browser.js).

From PowerShell:

```powershell
Set-Location -LiteralPath 'C:/Users/gwara/furvise-runner-validation-next-1/browser-memory-acceptance/worktree'
node --max-old-space-size=2048 scripts/audits/ask-memory-browser.mjs --check-bundle
node --max-old-space-size=2048 scripts/audits/ask-memory-browser.mjs
```

No dependency installation, Next build, environment-file loading, or database is needed. The script transpiles the current source on each invocation and parses its 25-module bundle before launching Chrome. `--check-bundle` only verifies bundling/syntax, never behavior. The browser assertions themselves have **not executed successfully here** and may need fixture corrections once infrastructure is available.

The intended browser execution uses installed React 19.2.4 and React DOM `createRoot`, wrapped in Strict Mode. It imports the current production `app/pets/[id]/memories/page.tsx` reexport and `app/dogs/[id]/memories/page.tsx` unchanged, including the real keyed session, effects, card state, and callbacks. It includes the actual `buildRememberedDetails` projection and its freshness, preference-semantics and integrity dependencies, plus the real `app/lib/security/idempotency/client.ts` implementation and browser sessionStorage.

The two production functions `loadDogProfileWithMemoriesForUser` and `loadCanonicalRememberedDetailsForUser` are extracted verbatim from current `app/lib/supabase.ts` and transpiled with their real integrity imports. Extraction avoids initializing the full Supabase module. The rest of that module does not run. These functions receive a synthetic chainable storage double; memory queries deliberately overreturn rows so their defensive owner/pet/status filters can be exercised.

Mocks replace the auth hook/session lookup, Next params/link, app-data version hook, pet-name formatter, and visual shell/primitives. Pet/account transitions change those mock inputs and rerender the real keyed page. They are **not actual Next navigation or Supabase auth events**. Mutation `fetch` is replaced by an in-memory responder that records URL, method, body and idempotency header, updates synthetic rows, and returns 204. No API route, RLS, RPC, trigger, grant, transaction, provider, or database executes in this browser fixture. Production auth has no bypass or modification.

In this environment, **zero production modules ran in Chrome**: the startup probe failed first. The local Node suites below did execute their existing production-source route/loader/component doubles and real projection tests; those remain separate from browser acceptance.

## Pending browser assertions

All are implemented but **unvalidated**, not passes:

- Actual mounted loaders/projection filter foreign pet/account and rejected rows.
- Canonical and legacy rows sharing an ID retain independent cards and Forget routes: PATCH `/api/memories/[id]` versus DELETE `/api/legacy-memories` with captured `petId` and `memoryIds`.
- Legacy cards expose no Edit control; a canonical Forget includes the real client idempotency header.
- Save a correction, refresh same-key card props, then reopen Edit and verify the corrected draft.
- Switch pets while auth is delayed; old mounted callbacks must not dispatch.
- Resolve delayed session lookup as a different principal before the auth UI remount; dispatch must be rejected.
- Switch both account and pet during a dispatched delayed fetch; old completion must not refresh the new DOM or show stale success.
- Resolve delayed old loaders after a new pet mounts; old rows must not replace the new pet's cards.
- No uncaught browser errors or unhandled rejections.

This is a mounted-component fixture, not a full Next application, visual/accessibility sign-off, real auth-timing test, or database-authority sign-off. Screenshots were not generated because no application frame was verified.

## Local validation and preserved audit

| Check | Result | Evidence |
| --- | --- | --- |
| Focused existing management and projection suites | 48 pass, 0 fail, no skips | [Focused output](ask-memory-browser-focused.txt) |
| Full existing default suite | 2281 pass, 0 fail, no skips | [Full output](ask-memory-browser-full.txt) |
| Browser fixture bundle parse | 25 modules, exit 0 | `node --max-old-space-size=2048 scripts/audits/ask-memory-browser.mjs --check-bundle` |
| Scoped ESLint | Exit 0, no warnings | Driver and fixture |
| Original lifetime audit | **14 pass / 3 fail**, exit 1 | [Audit output](ask-memory-browser-lifetime.txt) |
| Browser execution | **Blocked**, exit 1 | [Startup output](ask-memory-browser-infrastructure.txt) |
| Whitespace | `git diff --check`, exit 0 | Local check |

Suite commands used `node --max-old-space-size=2048 --experimental-transform-types --test`, with `tests/live-memory-management.test.mjs tests/remembered-details-canonical.test.mjs` for the focused run and `scripts/audits/ask-lifetime-history.audit.mjs` for the separate audit. Scoped lint used the installed `node_modules/eslint/bin/eslint.js`. No tests were weakened or skipped. No production edits require a fresh application typecheck.

The three original lifetime failures remain old canonical episodes beyond the 20-row loader window, retrieved episode sequence/recurrence identity, and the exact separate-episode aggregate. Original audit source, fixtures and helpers are unchanged. Canonical authority, pet ownership, corrections/history, safety rules, results behavior, SQL and migrations are unchanged. No Docker, database, credentials, live service, dependency installation, other-worktree edit, additional agent, commit, push, merge or deployment was used.
