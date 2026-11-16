# Furvise

Furvise is a journal-first companion for pets and their owners. AI is an optional part of everyday use; a functional Ask is required in Furvise V1.

Use Node 24 (`.nvmrc`) and the npm version pinned in `package.json`.

```sh
npm ci
npm run dev
npm run test:release
npm run typecheck
npm run lint
npm run build
```

`test:release` runs the maintained journal/account/profile/navigation regression selection serially, disables AI, clears the provider key in child processes and blocks external fetch. It never runs live benchmark scripts. `npm test` remains the unfiltered historical suite.

Environment names are documented in `.env.example`. Never commit local environment files. Set `FURVISE_AI_ENABLED=false` to pause optional generation; journal and History remain usable. The default analysis model remains Mini. A credit-exhaustion pause is not V1 launch approval: Ask still requires fresh signed-in online qualification before production.

The current integration decisions, pinned PR inventory, deployment gates and recovery boundaries are in [the journal-first release record](docs/releases/journal-first-20261116.md). Do not bulk merge the Ask draft stack or treat a preview as production qualification.
