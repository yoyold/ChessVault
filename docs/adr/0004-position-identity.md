# ADR 0004 — Position identity and deduplication

Status: accepted

## Context

Every imported game must yield a reusable position database. Stored naively,
50,000 games at roughly 80 plies each is about 4,000,000 rows, overwhelmingly
duplicates: thousands of games share `1.e4 e5`, and transpositions reach
identical positions by different move orders.

## Decision

Split storage in two:

- `positions` — one row per **unique** position, keyed by a normalised position key
- `gamePositions` — one row per **occurrence**, linking game and ply to that key

This collapses the shared opening tree to a single row per distinct position and
turns "which of my games reached this position?" into one index lookup instead
of a scan. It is also what makes the stated target of 500,000+ positions
reachable on a realistic personal collection.

## The position key

The key is the FEN with the halfmove clock and fullmove number removed, since
those describe the path taken rather than the position itself.

One subtlety materially affects correctness: **the en-passant square must only
be included when an en-passant capture is actually legal.**

Many FEN generators set the square after any double pawn push, whether or not a
capture is available. Two positions identical in every other respect would then
produce different keys purely because of how a pawn arrived, silently breaking
transposition detection and undercounting related games. This matches the
reasoning behind EPD and Zobrist conventions used by engines and opening books.

chess.js already performs this normalisation on FEN output, including the case
where the capturing pawn is pinned and the capture is therefore illegal. An
earlier draft of this module reimplemented the check; it was removed once
measured against the library, because redundant logic in the hottest path of
import costs throughput and invites divergence.

The behaviour is consequently an *assumption*, not an implementation detail we
own. `position-key.test.ts` asserts it explicitly — spurious square, legal
capture, and pinned capturer — so that a change in library behaviour fails the
build instead of quietly splitting identical positions into separate rows, which
would be near-impossible to diagnose from the data alone.

## Alternatives considered

**Store every ply as its own row.** Simplest to write, but multiplies storage,
makes position search a table scan, and provides no transposition detection.

**Store no positions; recompute from PGN on demand.** Minimal storage, but
position search would require replaying every game in the database, which cannot
meet the interactive latency the project targets.

**Zobrist hash as key.** Smaller and faster to compare, but collisions are
silent and unrecoverable, and the key stops being human-readable — a real cost
when debugging a personal database that is meant to last years. The normalised
FEN string is self-describing and directly usable to set up a board.

## Consequences

- Deleting a game must delete its occurrence rows. Unique positions are retained
  deliberately: notes, tags and evaluations attached to a position stay valid
  even after the game that introduced it is gone.
- Position keys are stable across imports and safe to reference from notes,
  repertoire nodes and training cards.
