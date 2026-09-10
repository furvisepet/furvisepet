# Furvise

Furvise is a Next.js App Router application for pet profiles, care history,
contextual Ask conversations and printable Vet Briefs. Supabase owns identity
and persisted data; Stripe owns subscription events; Redis supports abuse,
concurrency and AI spending controls. Products currently shows a coming-soon
screen, with catalogue APIs and ingestion tooling retained.

## Development

Use Node 24 (`.nvmrc`) and npm with the committed `package-lock.json`.
Install with `npm ci`. Configure a separate development environment using
`.env.example`; keep real secrets out of Git. Read `AGENTS.md` and the installed
Next.js guides under `node_modules/next/dist/docs/` before changing framework code.

`npm run dev` starts development. `npm run build` and `npm start` build and run
production output locally. Ordinary builds do not upload Sentry artifacts
unless explicitly enabled.

## Verification

The CI contract is `npm run lint`, `npm run typecheck`, `npm run test:security`,
`npm test`, `npm audit --omit=dev --audit-level=high` and `npm run build`.
`npm ls --all` also checks installation consistency. Follow the placeholder
public environment setup in `.github/workflows/ci.yml` for isolated builds.

For offline tests, preload `scripts/audits/offline-network-guard.mjs` through
`NODE_OPTIONS=--import=<absolute file URL to the guard>`. Use an absolute URL:
some tests run child processes from temporary directories. The guard permits
loopback fetches for mocked HTTP providers and rejects external fetches; it is
not an operating-system network sandbox. Do not load live credentials.
Scripts named `*.live.mjs` are separately invoked provider benchmarks, not the
default offline suite.

The optional local runner has nine Python unit tests:
`python -m unittest test_runner.py -q` from `scripts/local-runner`.
SQL and isolated browser checks have requirements beyond the Node test suite.

## Database and operations

Apply the complete ordered `supabase/migrations/` history. `supabase/schema.sql`
is a historical partial schema, not a fresh-install substitute. Keep existing
data and migration-ledger parity when upgrading. Use isolated fixtures for
validation, never production data.

See [deployment and rollback](docs/deployment-and-rollback.md),
[production operations](docs/production-operations.md),
[scheduled maintenance](docs/scheduled-maintenance.md),
[billing sandbox](docs/billing-sandbox-e2e.md), and
[catalogue ingestion](docs/product-ingestion.md).
No scheduler is configured in the repository. Maintenance and ingestion
commands are operator entry points and may mutate external systems when applied.

## V1 cleanup audit

[Feature inventory](docs/v1-cleanup/feature-inventory.md),
[audit and validation](docs/v1-cleanup/README.md), and the
[complete file manifest](docs/v1-cleanup/file-classification.csv) record the
cleanup scope, evidence, preserved features and outstanding decisions.
