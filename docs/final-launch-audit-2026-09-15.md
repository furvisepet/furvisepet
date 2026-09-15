# Furvise prelaunch audit — September 15, 2026

## Decision

**Public launch is not cleared yet.** This is an evidence checkpoint, not a claim that the product is fundamentally broken or must answer every conceivable question. Reliable saving, honest failure recovery, owner isolation, authentication, payment entitlements, and usable mobile flows are the acceptance gates.

Audited production source: `e432958bb0b895d442466b973f80c2fbad107bfc` (PR479). Production deployment: `dpl_GLwg5NBGnBxo3qV37uNBHQG9SwTZ`, READY. Checks below were collected around 19:50–20:00 UTC. No paid AI requests, customer payments, emails, or production data mutations were performed during this audit checkpoint.

## Verified in this audit

| Area | Evidence | Limits |
|---|---|---|
| Release CI | Exact released code passed lint, TypeScript, focused security tests, full tests, dependency audit, and production build in run 34974276298. | Automated checks do not replace actual user flows. |
| Focused regressions | 16 top-level tests passed, including subprocess suites for Ask request contracts, launch blockers, and production repair; also contact validation/delivery mocks, owner dashboard security, Vet Brief credit preflight, and price transitions. | These overlap CI. They are not 16 real model questions. An initial direct invocation of the case files failed to load TypeScript; the documented test wrappers then passed. |
| API authorization | Signed-out Ask, care entry, Vet Brief listing/drafting, checkout, portal, and owner dashboard requests return 401. Internal note worker rejects missing authorization with 401. Operator readiness returns 404 without its secret. | Cross-account live browser checks are still outstanding. |
| Webhook boundary | Unsigned billing webhook request returns 400, `Invalid webhook signature.` | Does not prove valid payment webhook delivery or entitlement updates. |
| Database authority | Every public table has RLS enabled. Live compatibility contract v2 returns `failed_checks: []`. No anonymous-executable public security-definer functions or authenticated-readable public views without security-invoker protection were found. | Intentional authenticated RPCs still rely on their owner checks and compatibility tests. |
| Internal data | Browser roles cannot directly read or write billing accounts, account grants, owner operational events, provider costs, or enrichment jobs. | Does not certify all external platform settings. |
| Public navigation | Homepage → Contact → Privacy → Terms → Release notes works in the browser. Contact has one footer, its expected fields, screenshot control, and correct support email. No horizontal overflow or unloaded images on inspected Contact desktop state. | Browser viewport is desktop; no mobile emulation capability is exposed. |
| Contact boundary | Empty JSON returns 400 with a validation error. | No message was sent; real screenshot delivery to inbox is not established by this check. |
| Indexing/security headers | robots.txt and sitemap.xml return 200; robots disallows private app routes. HSTS and nosniff are present on tested responses. | CSP is report-only, not enforced. |
| Note enrichment scheduling | Scheduled worker is active every minute; 60 scheduler runs in the preceding hour succeeded. No pending/processing job backlog; jobs are completed or superseded. | No work was due, so no HTTP callbacks were recorded in that hour. Scheduler success alone does not prove a fresh job can traverse the whole worker flow. |

## Findings requiring closure

### 1. Unsettled Vet Brief reservation

One Vet Brief usage event from `2026-09-13T05:59:51Z` remains `reserved`, with one credit and no settlement disposition. Its exact request key matches an idempotency record in `failed_retryable` state with response status 503. Live readiness reports `stale_credit_count: 1` and `missing_credit_disposition_count: 1`.

This is an unresolved ledger item, not proof that every current Vet Brief fails. Reserved usage counts toward the allowance. Current code intentionally does not invent a settlement decision for an ambiguous operation. Its recovery/cleanup functions require an authoritative disposition. Do not blindly mark it completed or refund it based solely on age. Review the failed attempt and any durable output, reconcile through the existing credit authority, then recheck readiness and exercise failure/retry on the current build. No balance was changed in this audit.

### 2. Password protection and external security evidence

Supabase reports leaked-password protection disabled. Enable and verify it through supported Auth configuration before approving launch. The connected SQL/advisor capability does not provide Auth configuration mutation.

Other advisor results: 27 RLS-without-policy informational notices, 14 authenticated security-definer notices, and public-schema extension warnings for pg_trgm/pg_net. These are not automatically data leaks; closed internal tables should not receive browser policies merely to silence the advisor. The compatibility and privilege checks above passed. Extension relocation requires a reviewed migration rather than a blanket last-minute change.

CSP is report-only. Review production reports and third-party auth/payment requirements before enforcing it. Backup/restore, production secret separation/rotation, provider budget alerts, alert delivery, and emergency controls still lack current dated operator receipts. In particular, confirm rotation of any credential previously shared in chat; do not repeat it in reports.

### 3. Paid lifecycle gate cannot run in the current workspace

The sandbox verifier fails closed with `BILLING_SANDBOX_CONFIG_MISSING:STRIPE_SECRET_KEY`. No sandbox environment file is present. Live billing projection currently contains one Free/no-subscription account; that is not evidence of a completed consumer paid lifecycle.

Configure the isolated Stripe test/local Supabase setup and verify checkout → signed webhook → Plus entitlement → reload → cancellation → grace/recovery → replay/out-of-order events. Do not charge a live customer to substitute for the sandbox gate. The current code/verifier contract is **8.48 CAD/USD monthly**. This audit corrected stale 5.49 amounts and a historical fixed Price ID in `docs/billing-sandbox-e2e.md`; current live Stripe price configuration was not independently re-read here.

### 4. Fresh authenticated walkthrough and real devices

The audit browser starts signed out. Still needed on the current release:

- Consumer signup, verification delivery, sign-in, recovery, and CAPTCHA behavior with a disposable account.
- Save a Today note, reload it, switch pets, and confirm no cross-pet contamination.
- Ask ordinary and mixed-history questions; verify answer content, no-save intent, failure recovery, and correct credit settlement.
- Generate, confirm, reopen, and actually download a Vet Brief; test account export after reauthentication.
- Verify the new footer, compact navigation, keyboard, and composer on a real iPhone and Android browser.
- Send one authorized support report with a screenshot and confirm inbox delivery/reply address, not just provider acceptance.

Existing September 15 Ask reports document substantial earlier testing and repairs, but explicitly describe iterative runs across deployments rather than a clean first-attempt sweep of this release. They also record noticeable latency (roughly 13–66 seconds in the five-question follow-up). Do not reinterpret those reports as universal reliability or a new mobile acceptance pass.

## Production activity interpretation

In the preceding 24 hours: 96 Ask usage events completed, 50 released, and 3 Vet Brief events completed. These include testing; released events are not necessarily failed answers. Operational events include earlier Ask errors, with the latest recorded errors before the afternoon UI deployments. There are no operational events after approximately 13:30 UTC in the inspected dataset. The exact deployment runtime-error query returned no rows. These observations do **not** establish a zero-error rate under new production traffic.

## Next completion sequence

1. Obtain secure browser sign-in and complete the authenticated smoke flow.
2. Reconcile the stale credit with authoritative evidence and verify failure/retry behavior.
3. Complete the isolated payment lifecycle and support delivery checks.
4. Record password protection, backup/restore, alerting, and real-device acceptance receipts.
5. Reassess a limited public beta using those receipts; retain the rollback/emergency plan.
