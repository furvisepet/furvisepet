# Launch flow audit — 2026-09-11

This is a production flow audit using the existing internal QA account and synthetic pets. It is not certification of fresh consumer signup, real payment settlement, or native browser download delivery.

## Fixed and verified

- Removed Rowan's specifically authorized incorrect synthetic entry `344b7ea6-bec7-4757-a4dd-6c798bfda578` through History. `deleted_at=2026-09-11T08:24:06.99078Z`; provenance remains. No other Rowan records were modified.
- Vet Brief generation created a request key under one scope and cleared another. Completed keys are now retired from their originating scope; identical pending retries retain their key; changed dates or edits get a different operation.
- Confirming a brief now navigates to its saved version URL. Reload restores that confirmed document rather than generating a fresh draft. Confirmation retains the generation timestamp so a retry has an identical payload.
- Saved records expose their verified source IDs to their owner. Reopening and revising a document preserves those references.
- A global unique `(owner, pet, version)` index rejected every second independent document at version 1. Replaced it with a nonunique lookup index. The existing immutable-document trigger, parent/version validation, ownership/source checks, primary key and owner/idempotency unique index remain intact.
- Five legacy timestamp triggers now pin `search_path=pg_catalog`. Browser roles cannot execute the operator-installed automatic-RLS event function. Its event trigger remains active.
- The readiness fingerprint still named the pre-alias Ask episode reader. Updated only the exact reviewed hash after confirming the local tested body and deployed body match. Altering the function still fails the check; no owner/role checks were removed.
- Generated downloads now attach their anchor and defer object-URL revocation until the browser has had time to consume the file. Shared by Vet Brief and account export. The UI reports that the file is ready, rather than asserting that it reached the user's device.

## Live receipts

Application repair PR309: `93e9d3442390bd7c6a77f6c686ae7b639a5395bd`, merge `886d39d9a036acb4d72a02f7bc685b67069a1ee7`. Vercel deployment `dpl_F8i2J9DRRCMoXriRt8679ARkcbp7` READY and assigned to www.furvise.com.

Sable (`618343ec-7fa5-40bc-ab86-2f9a850d1d07`):

1. Opened Vet Brief from the pet profile. Default date range contained no records, correctly.
2. Changed range to 2024-01-01 through 2024-12-31. After committing native date-input changes, the generated timeline contained exactly the four known opening/resolution notes, dated February 1, February 3, June 9 and June 11.
3. Edited the title, saved a local draft, and reloaded. Title, date range and timeline survived.
4. Confirmed document `17741e9c-7e13-4fdf-acf3-0a3b195de038`, version 1. URL includes its ID; reload remains confirmed.
5. Reopened and confirmed version 2, `60633afc-5d7b-4b6c-96e4-4bafdeef7295`, with version 1 as parent. Both records retain all four identical source IDs. Version 1's title is unchanged.
6. Print opened a separate document tab showing the correct revised title, version 2, range and four dated sources.
7. PDF endpoint completed and the UI reported success. The browser download event did not arrive in this session; physical file delivery is not certified. The final production export handoff was retested: the page reports "PDF ready. Check your browser downloads." but no download event arrived within 15 seconds. Console diagnostics showed browser-extension metadata communication errors; this does not prove an application failure or successful physical delivery.

One earlier empty synthetic brief (`09b1584b-96dd-4920-b54a-7a558582990d`) remains as a test receipt. No clinical data was invented or added by the brief tests.

## Database migrations

- `20260911083950_launch_trigger_security_hardening`
- `20260911084246_align_reviewed_ask_reader_readiness`
- `20260911084713_allow_independent_vet_brief_documents`

All applied through Supabase's tracked migration API. Local PostgreSQL tests covered: automatic RLS after grant revocation; timestamp trigger execution; absent legacy functions; exact reader acceptance and changed-body rejection; independent roots and both version chains; invalid version rejection; immutable confirmed fields; duplicate idempotency rejection. Local SQL transactions were rolled back.

Production compatibility contract v2 returned `failed_checks: []` after alignment. Security advisors no longer report mutable function search paths or an anonymous-callable security definer.

## Validation

PR309 GitHub Security CI run 34580113435: full suite 2,145 passed; focused security 160 passed; lint, TypeScript, production dependency audit and production build passed. These counts overlap. Initial npm install reported a development-tree advisory; the production dependency audit reported zero vulnerabilities.

Additional local checks: 47 focused billing/Vet Brief tests, 13 readiness tests, and 30 export/security tests passed (overlapping). TypeScript and changed-file ESLint passed. Follow-up PR310 head `f637c40f64565597f4282f3b471da86e7da45d55` passed Security CI run 34581352043: 2,146 full tests, 160 focused security tests, lint, TypeScript, production dependency audit (zero vulnerabilities), and production build. It merged as `5415e3ee30134443df8ce7b03a1a554dbf57a6ce`; deployment `dpl_8HRaJmpJFfEu5noxLiQkw2zozmMW` is READY and assigned to www.furvise.com. Final reload preserves the confirmed revised document.

## Billing and account evidence

Read-only Stripe checks on the Furvise live account:

- Active monthly price `price_1U4WiOFZUuSMatnoQugLFpgy`: CAD 5.49 and USD 5.49.
- Enabled webhook `we_1U4X8dFZUuSMatnol5fzIBwr`: correct www.furvise.com endpoint and Checkout-completed/subscription-created/updated/deleted events.
- Active default portal supports payment-method updates, invoice history and cancellation at period end.

No live charge, cancellation or entitlement override was performed. Membership correctly displays internal testing access, which cannot establish consumer paid-plan behavior. Account details, login/security and data/privacy screens load. Clicking Download data returned "Sign in again before exporting your data." The existing session did not satisfy the export reauthentication requirement; no account export delivery is certified. The owner account was not signed out or modified.

## Remaining launch gates

1. Run the documented Stripe sandbox lifecycle against disposable local Supabase and a localhost app: purchase, entitlement grant, reload, cancellation, grace, recovery and webhook replay/order. Only the live Stripe account is available here; no sandbox credentials or local Docker daemon are available. Existing billing tests and live configuration checks do not replace this gate.
2. Fresh consumer account signup, verification email, sign-in, reset/recovery, CAPTCHA expiry/reuse and data export must be tested with a disposable account. Do not test by changing or deleting the active owner's account.
3. Enable and verify Supabase leaked-password protection. Advisor: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . No Auth configuration mutation capability is exposed in the connected Supabase tools.
4. Complete dated operator evidence in `docs/production-operator-checklist.md`: backups/restore, SMTP/auth delivery, production secret separation, budget and error alerts, emergency controls and deployment protections. Repository checks alone do not prove these settings.
5. Confirm a downloaded PDF and account-export file on a supported user browser. Print view is verified; this session's missing download event is recorded rather than treated as a successful download.

Other advisor findings: `pg_trgm` remains in public (known legacy installation; existing migrations explicitly avoid relocating the shared extension); 13 authenticated security-definer notices correspond to exposed RPCs and require their existing owner/role checks, not blanket revocation. The 21 RLS-without-policy informational findings describe closed internal tables. These findings must not be "fixed" by granting browser access.

The app is improved and the reproduced blockers above are addressed. Launch readiness remains conditional on these external verification gates; no 10/10 or zero-fault claim is made.
