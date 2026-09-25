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
  - deployment: `dpl_8QtkjZQxdhSieGy6amzX5sRKDbCa`
  - URL: `furvise-iryctmofd-furvise-0e3fe5ef.vercel.app`
  - target: production
  - source: Vercel CLI
- That production deployment has no Git SHA in its Vercel metadata. Treat the deployment ID, not a guessed Git commit, as the application rollback anchor.

## Production runtime baseline before cutover

- Current production deployment `dpl_8QtkjZQxdhSieGy6amzX5sRKDbCa` became READY at 2026-09-24T20:46:23Z.
- Vercel reports no grouped runtime errors from 2026-09-24T20:46:24Z through this planning check.
- A provider/schema failure group at 2026-09-24T20:17:37Z belongs to an older deployment (`dpl_DoTUosTkbeQ9UbgdgaPJ5nWgWKtM`) and predates the current production rollback anchor. Do not attribute it to the cutover candidate.

## Preferred integration strategy: snapshot transplant

Do not reconstruct the RC by replaying eight commits and do not merge unrelated histories.

After runtime acceptance of the frozen RC:

1. Re-read `main` and require it still points to `e2ab3a05690d115bff6c58719570ea1859920655`. If main moved, stop and re-plan.
2. Create `launch/public-v1-cutover` from current main.
3. Create one Git commit whose parent is current main and whose Git tree is exactly the frozen RC tree `aac9fd48da5fbfa1168c48656688b3a86be95b34`.
4. Verify the cutover commit tree SHA equals the RC tree SHA byte-for-byte.
5. Do not add migrations, feature work, cleanup, or copy changes in the transplant.
6. Let Vercel build that main-descended cutover branch.
7. Re-run the focused V1 gate, security gate, typecheck/build, and stranger smoke against the cutover preview.
8. Only after those gates pass, advance main to the cutover commit by fast-forward. Never force-push main.
9. Deploy/promote that exact cutover commit to production.
10. Run the production smoke matrix immediately.

This produces normal main ancestry while preserving the exact frozen application snapshot.

## Database rule

The public V1 freeze from `2e4e8745...` to `8c4577f...` contains no Supabase migration changes.

Cutover must not introduce a database migration merely to solve Git ancestry.

Before production promotion, verify the live database already satisfies the schema required by the frozen RC. If schema parity is uncertain, stop before writes and perform compatibility checks only.

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
2. Roll the application back to READY production deployment `dpl_8QtkjZQxdhSieGy6amzX5sRKDbCa` or the immediately preceding verified production deployment recorded at deployment time.
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
