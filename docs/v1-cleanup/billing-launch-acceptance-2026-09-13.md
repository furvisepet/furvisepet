# Billing launch acceptance — September 13, 2026

Released through PR #384: https://github.com/furvisepet/furvisepet/pull/384

Production commit: `796a33ebe507807578043beac5a623f056e02d19`
Deployment: `dpl_4entoyEiowdrjipYFaJ6PwP7hkc9`, READY, aliased to https://www.furvise.com and furvise.com.
CI run: `34759062877`, successful on release head `5786ee1911365f4e648b2554622e624ccf9a4d3e`.

## Released behavior

- Free includes one Vet Brief generation per account lifetime, with no monthly reset.
- Failed attempts release allowance. Simultaneous requests and request replays cannot create another allowance slot.
- Free users can save, reopen, and export their brief after consuming the trial. Upgrading and downgrading does not restore the lifetime allowance.
- Plus includes four monthly Vet Brief generations, 55 Asks, and up to 10 pets at 8.48 CAD/USD for new subscriptions.
- Existing subscriptions retain their original price. Legacy and new prices remain recognized by webhooks.
- Checkout validates both configured currency amounts. Old open offers expire before their single-flight state is cleared.
- Membership copy avoids instant-autosave and universal-language claims. Six tested report languages are named and English document headings are disclosed.

## Configuration and verification

The user completed Vercel browser sign-in. `STRIPE_PLUS_NEW_PRICE_ID=price_1UFCnOFZUuSMatnoHCEW22H0` was saved for Production and Preview, with the success message and environment scope verified in the dashboard. Existing price configuration was preserved. Stripe returned 848 minor units for both CAD and USD on the new monthly price.

Three migrations were applied: `add_vet_brief_monthly_allowance`, `add_free_vet_brief_trial`, and `register_vet_brief_allowance_reader`. The new self-reader is registered by exact signature and reviewed body hash. Production compatibility contract v2 returned an empty failed-check list after deployment.

- 2,310 automated tests passed; focused security tests, TypeScript, production build, and dependency audit passed. Audit reported zero vulnerabilities. Lint: zero errors, nine existing warnings.
- PostgreSQL/WASM applied all 116 migrations and passed both quota suites.
- Both SQL suites also passed on live PostgreSQL in rolled-back transactions. Checks covered reservations, fifth-Plus/second-Free rejection, release, settlement, replay, period transitions, legacy usage, lifetime non-reset after upgrade/downgrade, and confirmed-email enforcement.
- Actual authenticated-role RLS admitted saving/reading the owner's Free brief and denied cross-owner writes/reads. All temporary test users were absent afterward.
- Post-deployment browser verification: Membership loaded successfully on the existing internal-QA account. The saved Japanese brief `4e025bac-d428-4d35-a642-7a0c1c9d4c34` reopened; Download PDF completed with “PDF ready.” The downloaded file was 3,335,801 bytes.
- No paid AI generations or customer charges were made for this work.

## Verification limits

The current browser account has internal-QA access, so its Membership view intentionally hides consumer pricing cards. Free enforcement was verified through the real database and RLS, not by generating a new report in a Free browser account. No new subscription purchase or end-to-end payment was submitted. These checks are not a native concurrent-load benchmark.

Security advisors retain their prior baseline and add one intentional authenticated self-reader notice, whose owner scoping and exact definition are checked. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

Tax configuration remains unchanged; this release does not establish tax readiness or guaranteed net margins. The prior benchmark's approximately $0.143 model cost per Vet Brief is still a sample average, not total business cost.
