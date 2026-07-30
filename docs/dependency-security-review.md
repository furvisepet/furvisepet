# Dependency security review

Evidence date: 2026-07-30. This review describes repository and local clean-install evidence. It does not prove that GitHub, Vercel, or another deployment has consumed these files.

## Baseline

- Runtime: Node `24.17.0`, npm `11.18.0`, Windows 11 Home 64-bit `10.0.26200`.
- Lockfile: npm lockfile version 3, committed `package-lock.json`, no package-manager declaration or Node engine policy before S2E.
- Direct production packages: `@supabase/ssr 0.10.0`, `@supabase/supabase-js 2.108.2`, `@upstash/redis 1.38.0`, `next 16.2.9`, `openai 6.44.0`, `pdf-lib 1.17.1`, `react 19.2.4`, and `react-dom 19.2.4`.
- Direct development packages: `@tailwindcss/postcss 4.3.1`, `@types/node 20.19.43`, `@types/react 19.2.17`, `@types/react-dom 19.2.3`, `eslint 9.39.4`, `eslint-config-next 16.2.9`, `tailwindcss 4.3.1`, and `typescript 5.9.3`.
- Important transitives: Next supplied `postcss 8.4.31` and optional `sharp 0.34.5`; Tailwind supplied `postcss 8.5.15`.
- `npm audit`: 6 high, 0 critical. `npm audit --omit=dev`: 3 high, 0 critical. The unchanged raw reports are retained in `dependency-audit-baseline.json` and `dependency-audit-production-baseline.json`.
- `npm ls --depth=0` had no invalid, extraneous, or peer-dependency errors. The S2D production build passed on Next 16.2.9 before dependency changes.

## High production findings

### Next.js 16.2.9

Path: direct `furvise -> next`. Furvise uses the App Router, root `proxy.ts`, route handlers, static public pages, dynamic private layouts, `next/image`, and production Webpack builds.

The July security release fixed these high advisories in 16.2.11; 16.2.12 is the newest registry-published 16.2.x and adds non-security backports:

| Advisory | CVE | Prerequisite and Furvise reachability | Resolution |
|---|---|---|---|
| [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24) | CVE-2026-64642 | Proxy bypass requires App Router, Turbopack, and single-locale i18n. Furvise relies on proxy protection, so authorization impact is relevant, although Furvise explicitly uses Webpack and has no `i18n` config. Server-side user checks reduce but do not replace the framework fix. | Next 16.2.12, plus private-route regression tests. |
| [GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj) | CVE-2026-64641 | App Router Server Action CPU denial. Repository search found no Server Actions, so the documented exploit prerequisite is absent. | Next 16.2.12. |
| [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x) | CVE-2026-64649 | Server Action forwarding on custom/unpinned hosts. Furvise has neither Server Actions nor a custom Next server, and its origin policy restricts forwarded-host trust. | Next 16.2.12. |
| [GHSA-p9j2-gv94-2wf4](https://github.com/advisories/GHSA-p9j2-gv94-2wf4) | CVE-2026-64645 | SSRF through rewrites whose destination hostname can be attacker-controlled. Furvise defines fixed host redirects and no rewrites. | Next 16.2.12. |

The same Next release also resolves the five moderate advisories in the baseline: request-body cache confusion, invalid UTF-8 cache confusion, Edge Server Action body bounds, SVG image-optimizer denial of service, and Server Function endpoint disclosure. Sources: [official July security release](https://nextjs.org/blog/july-2026-security-release), [16.2.11 release](https://github.com/vercel/next.js/releases/tag/v16.2.11), and [16.2.12 release](https://github.com/vercel/next.js/releases/tag/v16.2.12).

### PostCSS

Paths before remediation: production `furvise -> next -> postcss 8.4.31`; development `furvise -> @tailwindcss/postcss -> postcss 8.5.15`.

- [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93), moderate XSS in stringified CSS, affected `<8.5.10`.
- [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), CVE-2026-45623, high arbitrary file read through an attacker-controlled source map, affected `<=8.5.11`.
- [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849), high source-map path traversal, affected `<=8.5.17`.

Furvise processes repository-owned CSS at build time and does not accept user CSS, which removes the normal remote input prerequisite but does not make a compromised build input safe. `@tailwindcss/postcss` and Tailwind were normally updated to 4.3.3, resolving their path to PostCSS 8.5.25. Next 16.2.12 still pins 8.4.31, so the root applies a narrowly scoped `next -> postcss 8.5.18` override. PostCSS 8.5 keeps the API used by Next's CSS pipeline; global CSS, Tailwind output, lint, all tests, and repeated production builds passed. Remove the override when a Next 16.2.x or approved successor declares PostCSS `>=8.5.18` itself.

### Sharp

Path before remediation: optional production `furvise -> next -> sharp 0.34.5`. Furvise invokes Next image optimization for local brand and onboarding assets. Remote image origins are not configured, local/private network optimization is not enabled, and user uploads are not passed to the optimizer; these boundaries reduce untrusted-image reachability but native image processing is still runtime reachable.

[GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) covers inherited libvips vulnerabilities, including CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, and CVE-2026-35591, in Sharp `<0.35.0`. Next 16.2.12 still declares `^0.34.5`. A scoped `next -> sharp 0.35.3` override supplies the maintainer-recommended current patch and libvips 8.18.3. Next uses stable Sharp constructor, metadata, transform, and concurrency APIs; the native Windows binding loaded, local image optimization worked, hostile image parameters were rejected, and the production build passed. Remove the override when Next declares Sharp `>=0.35.0`.

## Development-only findings

The baseline also contained `brace-expansion` denial-of-service findings and `js-yaml` quadratic merge processing through ESLint tooling. Updating ESLint 9.39.5 and its resolved dependencies installed `js-yaml 4.3.0`; updating brace resolutions installed 5.0.8 where supported.

The final full audit reports nine high entries propagated from one remaining development-only chain: ESLint and eslint-config-next plugins use `minimatch 3.1.5`, which requires the legacy `brace-expansion 1.x` API. The new unbounded-expansion advisory includes every 1.x release and has no compatible 1.x patch. Forcing brace-expansion 5.0.8 would change CommonJS exports and break the parent contract; forcing minimatch 10 would cross multiple unsupported major APIs. The runtime production audit is clean because these packages are omitted from production.

Temporary handling: CI uses fixed repository glob/config inputs and runs `npm audit --omit=dev --audit-level=high`; Dependabot will surface a compatible eslint/plugin release. Review weekly and remove this risk when the parent packages support a patched minimatch/brace chain. This is not an acceptance of a production vulnerability.

## Versions after remediation

| Package | Before | After | Method |
|---|---:|---:|---|
| next | 16.2.9 | 16.2.12 | exact patch |
| eslint-config-next | 16.2.9 | 16.2.12 | matching exact patch |
| @tailwindcss/postcss | 4.3.1 | 4.3.3 | normal patch |
| tailwindcss | 4.3.1 | 4.3.3 | normal patch |
| eslint | 9.39.4 | 9.39.5 | normal patch |
| Next PostCSS | 8.4.31 | 8.5.18 | scoped override |
| Tailwind PostCSS | 8.5.15 | 8.5.25 | normal resolution |
| Next Sharp | 0.34.5 | 0.35.3 | scoped override |
| React / React DOM | 19.2.4 | 19.2.4 | unchanged and matched |

No direct package was removed. Repository-wide usage review found every direct production dependency in application or build scripts; build-only Tailwind, ESLint, types, and TypeScript remain development dependencies. OpenAI 7, Supabase SSR 0.12, TypeScript 7, ESLint 10, React 19.2.8, and unrelated minor updates were deliberately excluded from S2E.

## Install scripts and package provenance

Baseline install-script metadata identified Sharp 0.34.5 (`install`) and `unrs-resolver 1.12.2` (`postinstall`). Sharp 0.35.3 uses registry-hosted optional native packages and no longer presents that install script; its SHA-512 integrity lock entries and native runtime were verified. `unrs-resolver` is development-only through Next ESLint resolution and its postinstall delegates to `napi-postinstall` to select a platform binding. npm 11 left it unapproved; lint works using the locked optional platform package, so S2E did not authorize the script.

All resolved lock entries use `https://registry.npmjs.org/` and SHA-512 integrity. No Git or local-file dependency was found. No unsupported claim is made about maintainer trust or ownership history.

## Verification record

The final locked tree passed `npm ci`, lint, TypeScript, 80 focused S2A-S2E security tests, 982 full tests, and the Next.js 16.2.12 production build. `npm audit --omit=dev` reports zero findings; the full audit retains the documented development-only legacy ESLint chain. Local production-server checks verified proxy redirects and private cache headers on normal, RSC, prefetch, `.rsc`, and `_next/data` private-route forms, plus accepted local image optimization and rejected external, loopback, malformed, oversized, and missing image requests.

Authoritative GitHub repository settings, Dependabot activation, Vercel Node selection, and production deployment remain external checks.
