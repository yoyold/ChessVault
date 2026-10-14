# ADR 0009 — Derived data out of snapshots, parsing off the main thread

Status: accepted

## Context

A snapshot (backup file and sync) carried every table whole. The largest by
far is the position index. `gamePositions` holds one row per ply of every
game, and `positions` one row per distinct position. Both are computed from
the PGN text on import, and neither holds anything the games do not.
Positions can carry the owner's notes and tags, but only a handful ever will.
For 94 games the index was most of the file; for the 50,000-game target it
would be millions of rows. It made backups slow and sync files too large.

Import parsed every game on the main thread. Checking every move for legality
and keying every position is the expensive part. On a large file the page
froze until the import was done.

The games table also kept a multi-entry `searchTokens` index. Search had
moved to substring matching on the players' names, so nothing read it any
more, but every import still paid to write it.

## Decision

**Snapshots carry only what cannot be rebuilt.** From snapshot format 2:

- `gamePositions` is left out.
- `positions` holds only rows with notes or tags.
- On restore, the index is rebuilt by parsing each game's PGN with the same
  function import uses. The annotated positions are then laid over the
  result, which keeps annotations on positions no game reaches any more.
- The rebuild runs before the restore transaction. The restore stays
  all-or-nothing, and the transaction is never held open waiting on the CPU.
- Format 1 snapshots still restore through the old path, using the index
  they carry.

`gameAnalyses` was already excluded on the same grounds (ADR 0007).

**Import parses in a Web Worker.** The worker splits the file and parses
games. The page asks for one batch at a time and writes it, so the worker
never runs ahead of what is stored, and memory stays bounded by the batch
size. Writing stays on the page, which holds the database connection and the
live queries that update as games arrive. The same parsing code runs either
way. If the worker cannot start, the import falls back to parsing on the
page. A failure halfway through a file is reported instead of retried,
since part of the file is already stored.

**Schema version 8 drops `searchTokens`**, the index and the field.

## Consequences

- Backups and sync files shrink to the games, evaluations, repertoire,
  training cards and annotations.
- A restore takes longer, as long as parsing the collection does. The
  rebuild runs in the same worker as import, a chunk of games at a time, so
  the page stays usable meanwhile; without a worker it runs on the page.
  Measured with 940 games: a 2.5 MB backup instead of 10.2 MB, restored in
  about 20 seconds, almost all of it parsing. Parsing has since become about
  13 times faster (ADR 0010); the same restore takes about 5 seconds.
- The restored rows are written in chunks inside the one transaction. Each
  add is copied into IndexedDB on the main thread when it is issued, and
  issuing a whole collection at once held the page for seconds.
- An app older than format 2 refuses a format 2 snapshot, as it should: it
  would restore the games without their position index.
- The offline service worker (ADR 0006) answers worker scripts with a copy of
  the cached response that has no URL of its own. A worker takes its location
  from the response that started it, and Turbopack's worker bootstrap reads
  its configuration from the fragment of the URL it was started with. Served
  from the cache as is, under the cache key without a fragment, it fails to
  start.
