# Furvise Public V1 Cutover Plan

Status: planning only. No production change.

## Frozen candidate

- Review branch: `launch/public-v1-rc`
- RC SHA: `8c4577f38b98b593e53f25840f6b8ca2ffc04010`
- RC tree: `aac9fd48da5fbfa1168c48656688b3a86be95b34`
- RC Vercel deployment: `dpl_C6V8f4ShgCCUQtAcaDRV3WQ9tX4R`
- RC preview: `furvise-lihix80lp-furvise-0e3fe5ef.vercel.app`
- Vercel state at freeze: READY
- Focused V1 gate: 145/145
- Security gate: 160/160
- Lifecycle/read-boundary regression gate after freeze refinement: 77/77

## Current main and production rollback anchor

- GitHub `main`: `e2ab3a05690d115bff6c58719570ea1859920655`
- Main tree: `58d00911047beacbd8eaaa805653cefe158e1837`
- The RC and main histories do not share a common ancestor. Do not merge the RC branch into main.
- Latest READY production deployment observed before cutover planning:
  - deployment: `dpl_4RXtka8GMetUR6emZrZnC7AKuj1t`
  - URL: `furvise-iryctmofd-furvise-0e3fe5ef.vercel.app`
  - target: production
  - source: Vercel CLI
- That production deployment has no Git SHA in its Vercel metadata. Treat the deployment ID, not a guessed Git commit, as the application rollback anchor.

## Production runtime baseline before cutover

- Current production deployment `dpl_4RXtka8GMetUR6emZrZnC7AKuj1t` became READY at 2026-09-24T20:46:23Z.
- Vercel reports no grouped runtime errors from 2026-09-24T20:46:24Z through this planning check.
- A provider/schema failure group at 2026-09-24T20:17:37Z belongs to an older deployment (`dpl_DoTUosTkbeQ9UbgdgaPJ5nWgWKtM`) and predates the current production rollback anchor. Do not attribute it to the cutover candidate.

## Preferred integration strategy: snapshot transplant

Do not reconstruct the RC by replaying eight commits and do not merge unrelated histories.

The main-descended cutover artifact has already been rehearsed.

After runtime acceptance:

1. Re-read `main` and require it still points to `e2ab3a05690d115bff6c58719570ea1859920655`. If main moved, stop and re-plan.
2. Re-read `launch/public-v1-cutover-rehearsal` and require it still points to `747a9154a3fdb7e3ace2a6396c67eb6d4a2b1b5a`.
3. Verify that commit's tree is still exactly `aac9fd48da5fbfa1168c48656688b3a86be95b34`, identical to the frozen RC tree.
4. Run the stranger smoke against the rehearsal preview itself, not a newly rebuilt artifact.
5. If the smoke passes, move `main` forward to the rehearsal commit using a fast-forward-only Git operation. Never force-update main.
6. Promote the already-READY rehearsal Vercel deployment `dpl_CwS5wqeYVQgEFLowk5fi5E9N9apn` to production using Vercel's existing-deployment promotion flow. Promotion must reuse the existing artifact and must not rebuild it.
7. Verify production immediately with health/runtime logs and the production smoke matrix.
8. If a launch blocker appears, use Vercel's rollback flow to return production traffic to known-good deployment `dpl_4RXtka8GMetUR6emZrZnC7AKuj1t`.

Do not create a fresh production build unless promotion of the accepted artifact is unavailable. Rebuilding would discard the strongest property of this rehearsal: production can receive the exact artifact that passed acceptance.

This produces normal main ancestry while preserving the exact frozen application snapshot.

## Database rule

The public V1 freeze from `2e4e8745...` to `8c4577f...` contains no Supabase migration changes.

Cutover must not introduce a database migration merely to solve Git ancestry.

Before production promotion, verify the live database already satisfies the schema required by the frozen RC. If schema parity is uncertain, stop before writes and perform compatibility checks only.


## Cutover rehearsal evidence

A real main-descended rehearsal has already been created without touching main:

- rehearsal branch: `launch/public-v1-cutover-rehearsal`
- rehearsal commit: `747a9154a3fdb7e3ace2a6396c67eb6d4a2b1b5a`
- parent: `e2ab3a05690d115bff6c58719570ea1859920655` (current main)
- tree: `aac9fd48da5fbfa1168c48656688b3a86be95b34` (exact RC tree)
- Git comparison: one commit ahead of main
- Vercel deployment: `dpl_CwS5wqeYVQgEFLowk5fi5E9N9apn`
- Vercel state: READY

This proves the ancestry repair can be done as a one-commit snapshot transplant without merging unrelated histories.

## Live Supabase compatibility evidence

Read-only production inspection on 2026-09-25 established:

- the live migration history contains 129 recorded migrations;
- thirteen RC migration filenames differ only by timestamp from already-applied migrations with the same names;
- seven RC migrations dated 2026-09-23 are not present in live migration history:
  - `canonical_append_items`
  - `preserve_canonical_replace_body_fidelity`
  - `isolate_canonical_ask_sql_inference`
  - `bind_ask_suggestions_to_canonical_jobs`
  - `generalize_canonical_replace_targets`
  - `canonical_care_history_remove`
  - `canonical_pet_remove_receipt_survival`
- those seven migrations implement the deferred Ask-write/canonical mutation surface;
- frozen V1 Ask mutations are disabled at the server capability boundary;
- retained V1 history reads use the existing live functions:
  - `read_ask_history_candidates`
  - `read_ask_history_candidates_latest`
  - `read_ask_history_correction_page`
- retained explicit UI writes use the existing live boundaries:
  - owned insert into `pet_care_entries`
  - `update_my_care_entry`
  - `remove_my_care_entry`
  - `delete_pet_profile_for_user`
- the history candidate RPCs resolve caller identity through `ask_history_request_owner()`, which returns `auth.uid()`, and then independently re-check pet and row ownership;
- the live entitlement resolver matches launch limits: Free 1 pet, Plus 5 pets.

Therefore the seven unapplied September 23 migrations are not required to operate the frozen public-V1 surface.

### V1 database deployment rule

**Do not run `supabase db push` as part of the public-V1 application cutover.**

The repository intentionally contains post-V1/V2 schema work that is not live. A generic migration push would apply those migrations and would turn an application-only V1 release into a database release.

For this cutover:
- application artifact only;
- zero new database migrations;
- no migration repair;
- no migration-history edits;
- no schema cleanup;
- no V2 canonical-write activation.

If a future V2 release needs those migrations, handle them as a separately reviewed database change.



## Live idempotency, credit, and billing authority evidence

Read-only production inspection confirmed:

- idempotency mutation functions (`claim_idempotency_operation`, `complete_idempotency_operation`, `fail_idempotency_operation`, `abandon_idempotency_operation`) are executable by `service_role` only;
- AI credit settlement functions (`reserve_ai_credit`, `complete_ai_credit`, `release_ai_credit`, `set_ai_credit_disposition`, `reconcile_ai_credit`) are executable by `service_role` only;
- user-facing `get_my_ask_allowance_status()` and `get_my_entitlements()` are not callable by `anon`, are callable by `authenticated`, and bind identity through `auth.uid()`;
- billing checkout single-flight functions (`claim_billing_checkout_single_flight_v2`, `complete_billing_checkout_single_flight`, `abandon_billing_checkout_single_flight`, `reset_billing_checkout_single_flight`) are service-role-only;
- Stripe customer/subscription projection functions used by the server are also service-role-only.

The frozen RC source additionally binds idempotency operations to both authenticated `userId` and payload hash, and Stripe checkout uses its own single-flight attempt plus Stripe idempotency key.

These checks do not replace runtime retry acceptance, but they establish that normal clients cannot directly bypass the server-owned idempotency, credit-settlement, or checkout state machines.

## Rollback

Application rollback is the first response to a bad cutover.

Rollback triggers include:
- login/session breakage
- cross-account or cross-pet exposure
- failed UI care round-trip
- Ask mutation leak
- arithmetic publication leak
- new Vet Brief generation leak
- duplicate write or duplicate credit on retry
- sustained 5xx on the core stranger journey

Rollback procedure:
1. Stop further promotion or feature work.
2. Roll the application back to READY production deployment `dpl_4RXtka8GMetUR6emZrZnC7AKuj1t` or the immediately preceding verified production deployment recorded at deployment time.
3. Do not reverse database state blindly.
4. If any writes occurred under the new build, prefer a reviewed forward repair for data/schema issues.
5. Preserve request/deployment IDs and inspect only after user-facing safety is restored.

## Runtime launch gate before transplant

The frozen RC must pass, using ordinary product UI:

1. sign in
2. create/select pet
3. add a note through Today/History UI
4. verify the note appears in History
5. Ask for that saved fact
6. Ask earliest/latest
7. edit the note through UI and verify the edit persists
8. remove the note through UI and verify the removed state does not return as effective history
9. create/select a second pet
10. switch pets and verify no cross-pet read/write leakage
11. ask for an average/calculation and verify no arithmetic answer is published
12. ask Ask to save/change/delete and verify no Ask mutation executes
13. try to start a new Vet Brief and verify generation is unavailable
14. refresh/retry the retained UI write path and verify no duplicate record
15. retry/reload Ask and verify no duplicate charge/provider execution for committed work
16. exercise a current emergency phrase and verify terminal emergency behavior without mutation

A fail-closed V2 request is not a release blocker. A leak, incorrect persisted file state, ownership failure, duplicate effect, or incorrect charge is.

## Production smoke after promotion

Repeat a minimal version of the same journey using a dedicated test account and no customer data:
- auth
- pet selection
- one care add/read/edit/remove round-trip
- one factual Ask read
- one unsupported calculation
- one disabled Ask mutation
- one second-pet isolation check
- one refresh/retry
- health/readiness and credit settlement

## Freeze discipline

After the cutover branch is created, only these may change before first public users:
- security / tenant isolation
- data corruption
- incorrect factual publication on reachable V1 paths
- incorrect explicit UI mutation
- billing/credit/idempotency failure
- broken auth/core journey

Everything else is post-launch.

H-M, positive calculation execution, Ask mutations, new Vet Brief generation, episode sophistication, and broad full-suite cleanup remain outside public V1.


## Cutover execution status — 2026-09-25

The cutover has entered production staging:

- `main` was fast-forwarded, without force, from `e2ab3a05690d115bff6c58719570ea1859920655` to rehearsal commit `747a9154a3fdb7e3ace2a6396c67eb6d4a2b1b5a`.
- The resulting Git-triggered Vercel deployment is `dpl_HpWnLCJrdX8wFG2CFJGdKFaF6v3C`.
- That deployment is READY, target=production, and reports Git SHA `747a9154a3fdb7e3ace2a6396c67eb6d4a2b1b5a`.
- Build completed successfully through TypeScript and 43/43 static pages.
- No Supabase migrations were applied.
- The deployment is staged, not yet live on the custom domain.
- `www.furvise.com` is still serving the previous public surface and current production traffic is observed on `dpl_4RXtka8GMetUR6emZrZnC7AKuj1t`.

### Correct live rollback anchor

The verified live rollback anchor immediately before promotion is:

`dpl_4RXtka8GMetUR6emZrZnC7AKuj1t`

Do **not** use `dpl_4RXtka8GMetUR6emZrZnC7AKuj1t` as the primary rollback anchor for this cutover. That deployment is READY and production-targeted but was not the deployment receiving current custom-domain traffic at the cutover checkpoint.

Promotion must point live production traffic to `dpl_HpWnLCJrdX8wFG2CFJGdKFaF6v3C`. After promotion, immediately verify that custom-domain traffic moves from `dpl_4RXtka8GMetUR6emZrZnC7AKuj1t` to the new deployment.


## Production cutover evidence — live

Production is now serving the frozen V1 release artifact.

- `main`: `747a9154a3fdb7e3ace2a6396c67eb6d4a2b1b5a`
- tree: `aac9fd48da5fbfa1168c48656688b3a86be95b34`
- live Vercel deployment: `dpl_HpWnLCJrdX8wFG2CFJGdKFaF6v3C`
- source branch: `main`
- deployment state: READY
- custom-domain traffic in the final verification window: only `dpl_HpWnLCJrdX8wFG2CFJGdKFaF6v3C`
- no runtime error groups observed after cutover
- no Supabase migration was applied

Verified production public surface:
- homepage body uses the frozen V1 copy;
- `/login` returns normally;
- `/terms` returns normally;
- `/membership` redirects to login when unauthenticated;
- unauthenticated `/vet-brief` is not publicly usable.

Verified live QA database semantics under an authenticated QA identity:
- history candidate RPC earliest/latest reads remained confined to the requested pet;
- cross-account history read failed with SQLSTATE `42501` / `Pet unavailable`;
- `update_my_care_entry` succeeded inside a rollback-only transaction and the original row was unchanged afterward;
- `remove_my_care_entry` succeeded inside a rollback-only transaction and the original row was unchanged afterward;
- authenticated care-row insertion succeeded inside a rollback-only transaction and persisted zero rows;
- QA entitlement/allowance reads are coherent.

Primary rollback deployment immediately before cutover:
`dpl_4RXtka8GMetUR6emZrZnC7AKuj1t`

### Public-copy follow-up

Two copy artifacts still refer to deferred behavior:
- homepage/SEO metadata description still mentions preparing a summary to review with a vet;
- the dated 2026-09-15 release notes describe the earlier Ask-save and Vet Brief behavior.

These are copy-cleanup items. They did not activate the deferred runtime capabilities and are not a runtime rollback trigger, but they should be reconciled with the frozen V1 promise surface.
