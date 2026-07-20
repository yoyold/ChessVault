# ChessVault

A personal chess improvement platform: game database, engine analysis, opening
repertoire, endgame and tactical training, and a linked knowledge base.

Local-first. Everything runs in the browser and all data stays in IndexedDB on
the machine it was entered on. There is no backend, no account, and no network
dependency beyond loading the app itself.

## Development

```bash
npm run dev        # development server
npm test           # unit and persistence tests
npm run test:watch
npm run typecheck
npm run lint
npm run build      # static export to out/
npm run preview    # serve the built export
```

## Architecture

Dependencies point strictly inward. The rule is enforced by ESLint, not by
convention — see `eslint.config.mjs`.

```
src/app/          route composition, deliberately thin
src/features/     feature modules: services, hooks, components
src/persistence/  Dexie database, schema versions, repositories
src/core/         pure domain: chess logic, entities, algorithms
src/lib/          cross-cutting helpers
```

`src/core/` imports no framework and no storage library. Chess rules, position
identity and spaced-repetition scheduling live there because they are the parts
most worth insulating from framework churn, and they are testable without a DOM
or a database.

## Decisions

Non-obvious decisions are recorded in `docs/adr/`. Worth reading before making
structural changes:

| ADR | Subject |
|---|---|
| [0001](docs/adr/0001-hosting-constraints.md) | How static hosting constrains routing and asset URLs |
| [0002](docs/adr/0002-engine-threading.md) | Why the engine is single-threaded, and the seam that makes that reversible |
| [0003](docs/adr/0003-layering.md) | Layering, and where abstraction is and is not worth its cost |
| [0004](docs/adr/0004-position-identity.md) | Position identity and deduplication |
| [0005](docs/adr/0005-schema-versioning.md) | Incremental schema versions |

Three constraints are easy to violate by accident:

- **No route may depend on build-time knowledge of user data.** Static export
  pre-renders every route, and user data lives in the browser, so dynamic
  segments cannot work. Detail views use search parameters.
- **Hand-built asset URLs must go through `asset()`** in `src/lib/paths.ts`.
  Under a project-site base path they otherwise resolve against the domain root
  and 404 only in production.
- **Never edit a released schema version.** Add a new one. Dexie replays
  versions in order for users upgrading from any earlier state.

## Deployment

Pushing to `main` builds a static export and publishes it to GitHub Pages. Lint,
typecheck and tests all gate the deploy. The base path is derived from the
repository name automatically, including the case of a user site served from the
domain root.
