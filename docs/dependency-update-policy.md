# Dependency update policy

## Supported toolchain

- npm is the only package manager. `packageManager` pins npm 11.18.0 and `package-lock.json` version 3 is authoritative.
- Node policy is `>=24.0.0 <25`; `.nvmrc` selects major 24. Local S2E verification used 24.17.0. CI reads `.nvmrc`. Vercel must be configured and independently verified to use a supported Node 24 runtime.
- CI, local release checks, and production verification use `npm ci`, not an unlocked install.

Review Node support monthly and before a Next minor/major change. Move the range only to an active production-supported LTS after Next, Vercel, native dependencies, CI, and clean-install evidence all agree.

## Update process

1. Read the installed Next version-matched documentation and authoritative advisories/release notes.
2. Capture `npm ls`, both audit scopes, outdated packages, and affected paths.
3. Prefer a direct parent patch/minor that naturally selects fixed transitives.
4. Keep React and React DOM identical and within the selected Next peer range.
5. Apply one coherent dependency group with normal npm installation; never edit the lockfile manually.
6. Run `npm ls`, both audits, lint, TypeScript, focused tests, full tests, build, and `git diff --check`.
7. Remove only `node_modules`, run `npm ci`, and repeat the release matrix before merge.
8. Review bundle contents, lifecycle scripts, registry origins, integrity fields, and lockfile diff.

Do not use `npm audit fix --force`, `--legacy-peer-deps`, package-manager migration, or an uncontrolled major upgrade to clear a scanner result.

## Overrides

Overrides are exceptional and must be scoped to the vulnerable parent, list a removal condition, and have runtime/build compatibility evidence. Current overrides:

- `next -> postcss 8.5.18`: remove when Next declares a version at or above 8.5.18.
- `next -> sharp 0.35.3`: remove when Next declares Sharp at or above 0.35.0.

Dependabot patches/minors must not delete or broaden these overrides without rerunning image and CSS verification. Native packages must not be overridden across a major merely on audit advice.

## Dependabot

`.github/dependabot.yml` requests weekly npm checks, limits open pull requests to five, and groups production and development patch/minor updates separately. Major updates are not grouped. GitHub security updates are repository behavior outside this file and must be enabled/verified in repository settings.

The repository has a GitHub remote, but these files do not become active until pushed and enabled by GitHub. Branch protection, required checks, secret scanning, and Dependabot security updates remain operator configuration.

## Emergency rollback

If a dependency update causes a production regression, roll back the deployment to the last verified artifact and revert the specific dependency commit through normal review. Do not delete the lockfile or reinstall floating versions. A rollback that restores a known vulnerability is temporary: record the advisory, disable the affected entry point if practical, set an owner and deadline, and prepare a tested patched release immediately.
