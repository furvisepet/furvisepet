# CI security checks

`.github/workflows/ci.yml` prepares a non-deploying verification workflow for pushes to `main` and pull requests.

## Contract

- Workflow token permissions are limited to `contents: read`.
- Official checkout and Node setup actions are pinned to their reviewed major versions.
- Node comes from `.nvmrc`; npm comes from the package-manager policy.
- `npm ci` consumes the committed lockfile.
- Lint, TypeScript, the S2A-S2E focused security suite, all tests, the production-only high-severity audit, and the production build must pass.
- Only non-secret Supabase-shaped placeholders are present so a clean CI build can evaluate public configuration paths. There are no production credentials, write permissions, deployment permissions, or secret references.
- Pull requests from forks receive no repository secrets because the workflow requests none.

The production audit gate is intentionally `npm audit --omit=dev --audit-level=high`. The full audit currently reports a development-only legacy minimatch/brace chain with no compatible parent patch; it is documented in `dependency-security-review.md` and remains visible to Dependabot and manual weekly review.

## Activation checks

After pushing the workflow:

1. Confirm GitHub parses both YAML files and runs on a test pull request.
2. Require the CI job through branch protection.
3. Enable Dependabot alerts, Dependabot security updates, dependency graph, and secret scanning where the repository plan supports them.
4. Confirm no organization policy grants broader implicit permissions.
5. Confirm the Linux clean install selects the expected Sharp 0.35.3/libvips platform packages and passes the image checks.

None of these external settings are claimed active by S2E.
