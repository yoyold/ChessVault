# ADR 0001 — Hosting constraints shape the architecture

Status: accepted

## Context

The application is hosted on GitHub Pages: static file serving only. No backend,
no server runtime, no custom HTTP response headers, no database.

Three consequences are not obvious and drive decisions elsewhere.

### Dynamic routes are impossible

`output: 'export'` pre-renders every route at build time. Entities live in
IndexedDB in the user's browser, so the build has no knowledge of a single game
id and `generateStaticParams` has nothing to enumerate. A route like
`/games/[id]` therefore cannot exist.

Detail views use search parameters (`/games?id=…`) against a single static
shell, resolved client-side. This keeps URLs deep-linkable and the back button
correct. Hash-based routing was rejected because it fights the App Router, and
SPA 404-fallback tricks were rejected because they produce a visible 404 flash
on first load.

### Asset URLs need an explicit prefix

Project sites are served from `https://<user>.github.io/<repo>/`. Imports and
`next/link` are rewritten by the bundler, but hand-built URL strings are not —
specifically the service worker scope and the engine WASM URL. Those resolve
against the domain root and 404 in production unless prefixed.

All such URLs go through `src/lib/paths.ts`. The prefix comes from
`NEXT_PUBLIC_BASE_PATH`, set only in CI, so local development still serves from
the root.

### Jekyll strips underscore directories

GitHub Pages runs content through Jekyll by default, which ignores paths
beginning with an underscore — including Next's `_next/` bundle directory. The
symptom is a deployed site that loads a blank page with no obvious error.
`public/.nojekyll` disables that processing.

## Consequences

- No route may depend on build-time knowledge of user data.
- Any new hand-built asset URL must go through `asset()`.
- The CI workflow derives the base path from the repository name and correctly
  emits an empty prefix for user sites (`<name>.github.io`), which are served
  from the domain root.
