# Journal-first release — 2026-11-16

Canonical integration branch: `release/journal-first-20261116`, based on remotely verified main `0b4259a821413e8655d9a43ec435bf2aec68a770`.

G's updated V1 gate requires functional Ask alongside Journal, Today, History and profiles. The credit-exhaustion pause is temporary staging behavior, not a V1 product scope cut. NO-GO for production V1 until the selected Mini-backed Ask candidate passes fresh signed-in online qualification after recharge. No paid calls are authorized now.
The current source retains main's Ask engine; the latest stacked Ask rewrite is NOT integrated or launch-qualified by this PR. Selecting/consolidating and qualifying that engine remains explicit release work, not a post-launch deferral.

## Release matrix

| Decision | Scope | Evidence / boundary |
|---|---|---|
| KEEP | Existing profiles, journal, Today, mobile navigation, auth/account, privacy and ownership controls | Retained main behavior; 46-file journal release regression command |
| KEEP / CONSOLIDATE | History note editing, opened-revision RPC, draft retention, private responses and revision-bound idempotency | Extracted only the coherent care paths from PR #511 at `68ea9ba78ec505fa7fccc57dd7f34ed76f2f9d9a`; old production already contains this source family |
| KEEP | Owner-only backend/configuration predicates | PR #511 source; never returns keys or credential values |
| KEEP | Production PT409 incident source migration and guarded reconciliation | PR #530 source; live function read-only verified PT409 in both stale branches; no migration executed |
| REFACTOR | AI availability and memory extraction gate | One global switch now also stops optional enrichment; Ask shows an unavailable state and stops POST before credits/conversation writes |
| REFACTOR | Release validation | One serial, external-fetch-blocked command, shared TypeScript test loader, two-worker build |
| KEEP / UPDATE | Dependencies | Next/eslint-config-next 16.4.6, sharp override 0.35.5; compatible transitive zod/source-map-js updates; provider, React, Supabase and billing APIs unchanged |
| REQUIRED IN V1 / INTEGRATION AND LIVE GATE PENDING | Full Ask draft stack #514, #516, #519–530, #532–535 | Unqualified live holdout; no paid tests, model upgrade or bulk merge |
| DEFER | PR #531 experimental runner | Separate work; untouched |
| DEFER | Blanket dependency group merges #508/#518 and remaining drafts | Selective remediation only; no automatic upgrades across auth/provider/React APIs |
| ARCHIVE PROPOSAL ONLY | Superseded branches, PRs, live worktrees and historical reports | Inventory below; no deletion or closure while ownership/dependencies/recovery need review |

## Production and rollback identity

Project `prj_EAXd47KC0F6qcgBP67iIjwoA4hix`, team `team_C8ruxvb5OCoHXk0N2oRncrVm`.
Existing production/rollback: `dpl_FG9JqKxxG9n4tU3oq8bnAedp7rx5`, READY, CLI source, Git SHA unknown.
Project alias: `furvise-furvise-0e3fe5ef.vercel.app`.
The actual public domains `www.furvise.com` and `furvise.vercel.app` instead point to READY CLI deployment `dpl_4Rd7ysXy4yRkRVatNby8vqmM7Frg` (`furvise-n74dko8e5-furvise-0e3fe5ef.vercel.app`), also with unknown Git SHA. Preserve BOTH rollback mappings; the single project alias is not the whole production routing state. `furvise.com` is configured as a 308 redirect to `www.furvise.com`.
Do not label the CLI deployment as main or a PR SHA. Of the 400 returned source-file fingerprints, 391 match PR #511; four differ and five are absent there. This is partial provenance, not exact source identity.

Production must be staged using production env without assigning domains, tested, then promoted through ordinary protections. A READY preview alone is not approval. Production V1 additionally requires functional Ask, explicit Mini model selection, fresh independent online cohort and holdout qualification, and no critical clinical/ownership/citation incident. Credits are exhausted; do not probe or benchmark the provider.
No merge/promotion or V1 publication is permitted while these gates remain unmet.

## Data / migration boundaries

No owner care/profile or schema writes are part of this release. Six profiles and 628 care entries were fingerprinted read-only; private fingerprints stay in local evidence.
The live migration ledger reports `20261005082038 furvise_release_201c8a37`, `20261024184418 qualify_source_semantics_readiness`, and `20261113094342 fix_care_entry_stale_conflict_no_retry`.
The older migration timestamps can be rollout aliases/aggregates; this release does not repair or replay them. The new reconciliation file is source-only and not applied.

## Hygiene baseline

- Canonical remote main: 1,702 tracked files (the user's 1,647 figure was the other shared branch).
- 32 open PRs; source inventory pinned below.
- Shared checkout: 221 dirty entries, preserved. No resets/cleans.
- Prior user cleanup left 78 registered worktrees, zero prunable; not pruned again.
- 158 operator workspaces were checked; zero active/uncertain jobs at intake.
- No dead-code deletion was justified by the review. Identical route-layout wrappers are live Next entry points, not dead modules. Historical artifacts and recovery branches remain intact.

## Initial open PR ownership / dependency inventory

All author-owned branches remain preserved. “Defer” means not included wholesale; selected file extraction does not merge the PR or erase its remaining work.

| PR | Author | Head SHA | Base | Head branch | Disposition |
|---|---|---|---|---|---|
| [#535](https://github.com/furvisepet/furvisepet/pull/535) | furvisepet | `866582c4671e85d1b0cd1bfca082b3e702ad1b5c` | `codex/ask-live-repair-1115c` | `codex/ask-identity-continuation-1115` | defer; preserve |
| [#534](https://github.com/furvisepet/furvisepet/pull/534) | furvisepet | `bf7e8a0543ac6c00848b3946562227209c44c51f` | `codex/ask-v1-repair-1115a` | `codex/ask-live-repair-1115c` | defer; preserve |
| [#533](https://github.com/furvisepet/furvisepet/pull/533) | furvisepet | `01241239afc835e11ee0b8c34c21dc110cc24b21` | `codex/ask-lane-reservations-1114v` | `codex/ask-v1-repair-1115a` | defer; preserve |
| [#532](https://github.com/furvisepet/furvisepet/pull/532) | furvisepet | `189044c36a93a0ec04fc52d55faed95cb06c7b96` | `codex/ask-grounding-1113p` | `codex/ask-lane-reservations-1114v` | defer; preserve |
| [#531](https://github.com/furvisepet/furvisepet/pull/531) | furvisepet | `ef665e1a81e8bfebf148a91bf7722b26970255c1` | `main` | `infra/furvise-runner-first-pass-20261113` | experimental; untouched |
| [#530](https://github.com/furvisepet/furvisepet/pull/530) | furvisepet | `34fc80dceb7fe687662330e5e177f7defd7f9b39` | `codex/ask-followthrough-1113n` | `codex/ask-grounding-1113p` | PT409 source only; remainder defer |
| [#529](https://github.com/furvisepet/furvisepet/pull/529) | furvisepet | `c2549bccc8e2e44c2d71bf45728795bfe22e16ba` | `codex/ask-components-1112j` | `codex/ask-followthrough-1113n` | defer; preserve |
| [#528](https://github.com/furvisepet/furvisepet/pull/528) | furvisepet | `f4fbb3c2c608a9938249b069ff85e1b4c78b9383` | `codex/ask-components-1112j` | `codex/ask-collection-1112m` | defer; preserve |
| [#527](https://github.com/furvisepet/furvisepet/pull/527) | furvisepet | `4b2e69a54167bae2c4f9f84c83df85c78a87365e` | `codex/ask-finish-1112h` | `codex/ask-components-1112j` | defer; preserve |
| [#526](https://github.com/furvisepet/furvisepet/pull/526) | furvisepet | `c09d13e7ca9ec2d555d61d33a1d81beef4d07d29` | `codex/ask-owner-journeys-1111f` | `codex/ask-finish-1112h` | defer; preserve |
| [#525](https://github.com/furvisepet/furvisepet/pull/525) | furvisepet | `88e51706e64cdad193c6d3a4229941cf37288e99` | `codex/ask-clinical-1111e` | `codex/ask-owner-journeys-1111f` | defer; preserve |
| [#524](https://github.com/furvisepet/furvisepet/pull/524) | furvisepet | `6601fc706f785c7afd341108edbfc21b5891efdf` | `codex/ask-benchmark-1111d` | `codex/ask-clinical-1111e` | defer; preserve |
| [#523](https://github.com/furvisepet/furvisepet/pull/523) | furvisepet | `813faa048c10325740a0102f89b9a0842fbb042e` | `codex/ask-acquisition-1111c` | `codex/ask-benchmark-1111d` | defer; preserve |
| [#522](https://github.com/furvisepet/furvisepet/pull/522) | furvisepet | `e8d3ae7799abc3f6561f392ffaf73c7b104849ef` | `codex/ask-publication-1111b` | `codex/ask-acquisition-1111c` | defer; preserve |
| [#521](https://github.com/furvisepet/furvisepet/pull/521) | furvisepet | `6bdc79127f3ec0d1a3e278807003534513920b8b` | `codex/ask-reference-role-1111a` | `codex/ask-publication-1111b` | defer; preserve |
| [#520](https://github.com/furvisepet/furvisepet/pull/520) | furvisepet | `d8264b93af731661f6bd96823f05a643d9e63413` | `codex/ask-evidence-goals-1110c` | `codex/ask-reference-role-1111a` | defer; preserve |
| [#519](https://github.com/furvisepet/furvisepet/pull/519) | furvisepet | `1b70c79bb55da4f37be94383c66b6dc1c3780750` | `codex/v27-reliability-1108aa` | `codex/ask-evidence-goals-1110c` | defer; preserve |
| [#518](https://github.com/furvisepet/furvisepet/pull/518) | app/dependabot | `9bdb07d1514fb40389d850f7a9fb5a90042f82d7` | `main` | `dependabot/npm_and_yarn/development-patch-and-minor-cf1e574635` | defer; preserve |
| [#517](https://github.com/furvisepet/furvisepet/pull/517) | furvisepet | `e08bdabf47cd3c7de16e7184898d5d493a569b86` | `main` | `ops/ci-minute-guard-1108` | defer; preserve |
| [#516](https://github.com/furvisepet/furvisepet/pull/516) | furvisepet | `4d94cf5e97e34f473f836926e7727e71ce75ce82` | `codex/v27-stage1-review-1107` | `codex/v27-reliability-1108aa` | defer; preserve |
| [#514](https://github.com/furvisepet/furvisepet/pull/514) | furvisepet | `cd77d6730adf99d2a13bc25de008e2e9863d4f26` | `main` | `codex/v27-stage1-review-1107` | defer; preserve |
| [#513](https://github.com/furvisepet/furvisepet/pull/513) | furvisepet | `bb673c5192481d7dbeba5f5ae7b0d608bb4ac273` | `main` | `codex/year-clarification-1103-a` | defer; preserve |
| [#512](https://github.com/furvisepet/furvisepet/pull/512) | furvisepet | `ae3b518184c22edefd33b54feef3e54a5a445e39` | `main` | `waraich/mx-eh-privacy-deps-20261028` | defer; preserve |
| [#511](https://github.com/furvisepet/furvisepet/pull/511) | furvisepet | `68ea9ba78ec505fa7fccc57dd7f34ed76f2f9d9a` | `main` | `waraich/jx-eh-note-edit-privacy-20261024` | selected care paths; remainder defer |
| [#510](https://github.com/furvisepet/furvisepet/pull/510) | furvisepet | `5a0257e7b4d998cf5220aa2e9d8cd9279fc36cd9` | `waraich/gf-gc-eof-20261021` | `v26/release-bindings-20261024` | defer; preserve |
| [#509](https://github.com/furvisepet/furvisepet/pull/509) | furvisepet | `46137f1b781b98024d736658d9d787f0bd09c8ae` | `main` | `waraich/gf-gc-eof-20261021` | defer; preserve |
| [#508](https://github.com/furvisepet/furvisepet/pull/508) | app/dependabot | `f1d81db6b91bad910e13541562454476d5891ac9` | `main` | `dependabot/npm_and_yarn/production-patch-and-minor-1105916146` | defer; preserve |
| [#507](https://github.com/furvisepet/furvisepet/pull/507) | furvisepet | `2bc78d259fedf067e286029e426c9c730cc1e412` | `main` | `waraich/di-r2-ask-20261018` | defer; preserve |
| [#504](https://github.com/furvisepet/furvisepet/pull/504) | furvisepet | `4419bff7369f20db4531da74f988b8d034b569d1` | `main` | `codex/human-core-architecture-v1` | defer; preserve |
| [#490](https://github.com/furvisepet/furvisepet/pull/490) | furvisepet | `fb0f535d2f26c245a3bb08b1c47629bd59671611` | `main` | `codex/ask-conversation-note-save` | defer; preserve |
| [#413](https://github.com/furvisepet/furvisepet/pull/413) | app/dependabot | `253a586911d5c28616a33fe1100fdae76dc2f3e6` | `main` | `dependabot/npm_and_yarn/openai-7.15.0` | defer; preserve |
| [#412](https://github.com/furvisepet/furvisepet/pull/412) | app/dependabot | `e0b902fc9cf147958215b40cfc948286a9ebaf34` | `main` | `dependabot/npm_and_yarn/types/node-26.5.1` | defer; preserve |
| [#411](https://github.com/furvisepet/furvisepet/pull/411) | app/dependabot | `278d23ade74c181e7f8720bf93982feeeedfc8f5` | `main` | `dependabot/npm_and_yarn/eslint-10.10.0` | defer; preserve |

## Local checks before staging

- npm ci: passed.
- Journal release tests: 311 passed, zero failures/skips, external fetch blocked.
- TypeScript: passed.
- ESLint: zero errors, 119 warnings repository-wide; existing warnings are not silently labeled clean.
- Production dependency audit: 4 vulnerable packages before (1 critical, 3 high), zero afterward.
- Local production build: passed, Next 16.4.6, two workers.
- Existing focused security selection: 162 passed, zero failures/skips; Sharp 0.35.5 / libvips 8.18.7 bindings loaded.
- Paid provider calls: zero during this release task.
- Online signed-in staging, production-env build, CI receipts and post-deploy checks remain separate gates; append exact receipts before promotion.

## V1 announcement update

The actual public `https://www.furvise.com/release-notes` returned HTTP 200 and a September 15, 2026 **Public beta** article, not an existing V1 announcement. The source was inline `app/release-notes/page.tsx`; there was no CMS or release data file. G subsequently authorized removing that article from the public experience. Its exact article source is archived at `docs/releases/archive/2026-09-15-public-beta.md`; the route, metadata and sitemap no longer expose the beta update.

Canonical V1 copy now lives in `app/lib/release-notes.ts`, status **draft**, release date **null**. It is visible only in preview, explicitly “Draft — not released,” with noindex metadata. Production excludes it until a reviewed launch commit marks the final verified copy published and supplies the actual release date. Homepage “Public beta” branding remains until then. The draft includes Ask, not “coming soon,” and makes no reliability percentage or unsupported feature claim.

V1-draft update validation: 311 release tests passed; TypeScript and focused notes lint passed; production-mode build with preview environment passed. See [the complete V1 launch gates](v1-launch-gates.md).

## Authorized beta removal and existing-runner update

The September beta article is removed from the candidate's public release page. Production gets a neutral release-notes page until a real release is published; no fake date or V1 launch announcement is introduced. Preview alone shows the explicitly unpublished V1 draft. The release-notes sitemap entry now depends on an actual published release/date, and the Git archive is not a public route.

The existing runner is reused by a separate trusted-branch-only workflow; original PR workflows/check names remain unchanged. See [the runner scope and bounds](trusted-runner-20261116.md). This update passed 319 release tests, 162 focused security tests, TypeScript and scoped lint locally before push. CI and final build receipts remain separate, exact-SHA evidence in PR #536.
