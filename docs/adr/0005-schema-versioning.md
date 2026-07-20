# ADR 0005 — Incremental schema versions, not a speculative v1

Status: accepted

## Context

The project spans sixteen modules. It is tempting to define every table upfront
so the schema "settles" early.

## Decision

Each schema version introduces only the tables whose shape is actually
understood, because a feature that uses them is being built. Dexie migrations
are additive and cheap; a wrong schema written speculatively is neither.

Version 1 covers games and the position database. Evaluations, repertoire nodes,
endgames, puzzles, notes and training cards arrive with their own modules.

## Rules for changing the schema

1. Never edit a released `version(n)` block. Add `version(n+1)`.
   Dexie replays versions in order for users upgrading from any earlier state;
   editing history means those users migrate through a schema that never existed.
2. Only indexed properties appear in the schema string. Dexie stores whole
   objects, so unindexed fields need no declaration and can be added freely
   without a version bump.
3. Every index must answer a query the application actually makes. Indexes are
   not free — each one costs write throughput on bulk import, which is the
   heaviest operation in the app.
4. Data transformations belong in `.upgrade()`, and must be written to run
   against a large database without exhausting memory.

## Settings

Settings live in `localStorage`, not IndexedDB. They are small, synchronous at
startup, and read before the database opens — reading them from IndexedDB would
make the first paint depend on an asynchronous database handshake. This is the
one place where a non-Dexie store is correct.
