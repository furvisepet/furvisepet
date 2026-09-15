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

The initial checkpoint began signed out. The resumed authenticated results below close part of this gate. Still needed:

- Consumer signup, verification delivery, sign-in, recovery, and CAPTCHA behavior with a disposable account.
- Switch pets and confirm no cross-pet contamination in a multi-pet account; this Free account correctly permits only one pet.
- Mixed-history and failure/retry checks on the current release; the ordinary no-save Ask and credit settlement passed in the resumed flow.
- Account export after reauthentication; Vet Brief generation, confirmation, reload and physical PDF download passed in the resumed flow.
- Verify the new footer, compact navigation, keyboard, and composer on a real iPhone and Android browser.
- Send one authorized support report with a screenshot and confirm inbox delivery/reply address, not just provider acceptance.

Existing September 15 Ask reports document substantial earlier testing and repairs, but explicitly describe iterative runs across deployments rather than a clean first-attempt sweep of this release. They also record noticeable latency (roughly 13–66 seconds in the five-question follow-up). Do not reinterpret those reports as universal reliability or a new mobile acceptance pass.

## Production activity interpretation

In the preceding 24 hours: 96 Ask usage events completed, 50 released, and 3 Vet Brief events completed. These include testing; released events are not necessarily failed answers. Operational events include earlier Ask errors, with the latest recorded errors before the afternoon UI deployments. There are no operational events after approximately 13:30 UTC in the inspected dataset. The exact deployment runtime-error query returned no rows. These observations do **not** establish a zero-error rate under new production traffic.

## Next completion sequence

1. Complete remaining authentication, multi-pet and account export checks; see the successful authenticated smoke results below.
2. Reconcile the stale credit with authoritative evidence and verify failure/retry behavior.
3. Complete the isolated payment lifecycle and support delivery checks.
4. Record password protection, backup/restore, alerting, and real-device acceptance receipts.
5. Reassess a limited public beta using those receipts; retain the rollback/emergency plan.

## Resumed authenticated audit — September 15, 2026, approximately 20:10–20:30 UTC

The browser resumed signed in to a Free account with no pets. This does not establish that signup, verification email or password recovery was exercised. Created only clearly synthetic QA records through normal product UI; no real customer record was changed, no payment was made, and no email was sent.

| Check | Observed result |
|---|---|
| Onboarding | Created Maple QA, a synthetic four-year-old female mixed-breed dog, profile weight 15 kg. |
| Today write | Saved an owner note about a 20-minute walk at 7:30 AM on September 15, normal breakfast, and no observed vomiting. Reload preserved the exact text. Database contains exactly one matching entry. |
| Ask retrieval/no-save | Asked for walk duration, time and whether vomiting was reported, explicitly prohibiting saving. Answer correctly said 20 minutes, 7:30 AM, and no vomiting. Answer survived reload; care entry count stayed one. |
| Draft preservation | An unsent follow-up survived navigation to Pets/Membership and reopening its specific conversation. The draft was then cleared without submitting. |
| Free limit | A second pet was blocked. Membership displayed 14 of 15 Asks remaining, the unused lifetime Vet Brief generation before use, and CA$8.48/month Plus. No upgrade was attempted. |
| Footer | On the desktop Ask empty state, viewport height, document height and footer bottom all measured 936 px; no space remained below the footer. Not a mobile-device acceptance test. |
| Vet Brief | Generated a routine-visit brief preserving the note's event date, walk time/duration, breakfast and negative vomiting observation. The profile weight was explicitly labelled undated. Confirmed and reloaded successfully. One confirmed database brief exists. |
| PDF | Clicked Download PDF. Browser event listener timed out, but the newly generated 431,245-byte PDF synchronized successfully. Inspected its extracted text and rendered single Letter page: correct content, readable type, no clipping or overlapping sections. |
| Settlement | New account has exactly one completed Ask and one completed Vet Brief usage event, both disposition `complete`. No new stranded reservation was found for this account. |
| Cost | Recorded provider-cost total increased from 1,719,402 to 1,787,567 microdollars: $0.068165 across these live checks ($0.026275 Ask; $0.041890 Vet Brief). No broad paid benchmark was repeated. |

### Repairs found during this run

- Conversation auto-title incorrectly read “Maple QA's vomiting” despite a question asking whether it was reported and an answer saying none was observed. Removed assertion-generating keyword titles across all topic branches; topics are now neutral. Unclassified titles preserve the owner's question wording instead of stripping interrogatives or substituting the selected pet for a pronoun. Existing saved or user-renamed titles are not rewritten. Negated, hypothetical and other-pet mentions have regression coverage.
- Vet Brief's sparse-history guidance still directed users to add notes in Ask. It now links to Today for the same pet, matching the current note-entry workflow.
- Local validation: 27 focused title/workflow tests, ESLint for modified title files and TypeScript passed. Full release CI remains the merge gate.

### Remaining limits

The old September 13 reserved credit is unchanged. Its stored response is a failed preparation (503); one brief was confirmed on the same account within the following hour, but that alone cannot establish whether it came from this request. No credit disposition was guessed or balance changed. Payment sandbox, password protection, authentication recovery, multi-pet live isolation, support attachment delivery, account export, external operator receipts and actual iPhone/Android checks remain outstanding. These are specific acceptance gaps, not a requirement to solve every possible pet-care question.

## Launch-gate closure — September 15, 2026, 20:41 UTC onward

This section supersedes the earlier unresolved-credit finding.

- **Legacy credit resolved:** the confirmed brief's complete JSON exactly matched a different, later 200 response with its own completed credit. The original 05:59:51 reservation matched only a 503 `VET_BRIEF_PREPARATION_FAILED` response without a document or resource ID. The guarded operator transaction in `docs/operations/reconcile-failed-vet-brief-2026-09-15.sql` recorded an explicit release decision and called the existing private settlement function. Read-back confirms `released`, zero credits used, and disposition `release`. Readiness now reports `(20260915071109,0,0,0)` — no stale credits, missing dispositions or deletion reconciliation backlog. No automatic age-based refund policy was added.
- **Account reauthentication repair:** Data & privacy previously displayed a fresh-sign-in error without an actionable route. Export/deletion now expose a sign-in link only for `RECENT_AUTH_REQUIRED`. A dedicated `account-data` login mode avoids redirecting an already signed-in user away from the login form, then returns to Data & privacy. It never automatically exports or deletes; deletion confirmation is still required. Server-side freshness checks are unchanged. Local validation: 32 focused auth tests, modified-page lint and TypeScript passed.
- **Live billing configuration verified read-only:** active monthly Price `price_1UFCnOFZUuSMatnoHCEW22H0` exposes CAD 848 and USD 848 minor units. Enabled webhook `we_1U4X8dFZUuSMatnol5fzIBwr` targets `https://www.furvise.com/api/billing/webhook` and subscribes to checkout completion plus subscription created/updated/deleted. The connected Stripe account is live only. No test account or sandbox key is available, and no real charge was attempted. These configuration reads do not close checkout/cancellation/recovery E2E.
- **Password-protection limitation clarified:** the Supabase organization is on the Free plan. Current official password-security documentation says leaked-password protection requires Pro or above. The disabled advisor finding therefore needs a plan/security decision, not a claimed one-click code repair. The connector does not expose Auth configuration updates. No paid plan was purchased. Source: https://supabase.com/docs/guides/auth/password-security
- **Remaining access limits:** the browser exposes no device-emulation capability and cannot prove physical iPhone/Android keyboard behavior. Account export still needs interactive reauthentication to exercise the completed download. Email recovery/support inbox delivery requires secure account/inbox access; no outgoing support message was sent without explicit send authorization. Backup/restore and alert-delivery receipts remain unverified, not represented as failures.

### Export completeness repair

A deterministic server-cap reproduction found that a single `.limit(5001)` query returned only 2 of 5 rows when the API capped responses at 2, silently omitting data and failing to detect a section above the application limit. Export now reads owner-filtered, primary-key-ordered pages against exact counts, including AI usage. It rejects changed/missing counts, incomplete pages, query failures and oversized output; it never returns a known partial export. The existing 5,000-row/96 KiB support-assisted limits remain explicit. Three regression cases failed before repair and passed after; 22 top-level export/security checks, lint and TypeScript passed. This is a deterministic API-cap test, not an assertion that a specific production account previously downloaded truncated data.

Additional read-only verification: the live Stripe customer portal is active, permits payment-method updates and cancellation at period end. A production RLS transaction using the synthetic account identity returned one own pet and zero foreign pets, care entries or briefs; transaction rolled back. No cross-account records were exposed. PR481 passed all CI gates and deployment `dpl_4b1PB5L4tt7UctuAG4SdZ5HY3Dq4` became READY at merge `de7d8075246773950a365ff01334c1712944e8d4`.
