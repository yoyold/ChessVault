# ADR 0003 — Layering and where abstraction is worth its cost

Status: accepted

## Decision

Four layers, with dependencies pointing strictly inward:

```
app/          route composition, thin
features/     feature modules: services, hooks, components
persistence/  Dexie database, schema versions, repositories
core/         pure domain: chess logic, entities, algorithms
```

`core/` imports nothing from the rest of the project — no React, no Dexie, no
Next. It is plain TypeScript and fully unit-testable without a DOM or a
database. Chess rules, position identity and spaced-repetition scheduling live
there because they are the parts most worth protecting from framework churn.

The rule is enforced by `no-restricted-imports` in the ESLint config rather than
by convention. A layering rule that is only documented erodes; one that fails
the build does not.

## On repository interfaces

Deliberately omitted. Defining an interface with exactly one implementation is
the "unnecessary abstraction" this project is meant to avoid. The usual argument
for the seam is testability, but the persistence tests run against
`fake-indexeddb`, exercising genuine index and transaction semantics — which is
where storage bugs actually occur. A hand-written in-memory fake behind an
interface would test less, not more.

Repositories are therefore concrete modules that own Dexie access, strictly
separated from UI. If a second storage backend ever becomes real, extracting the
interface then is mechanical.

`EngineService` is the deliberate exception: multiple implementations genuinely
exist (single-threaded, potentially multi-threaded, and a test stub), so the
port earns its cost. See ADR 0002.
