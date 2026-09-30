# ADR 0007 — Background analysis on the shared engine

Status: accepted

## Context

Measures of move quality — average centipawn loss, blunders by opening,
errors by move number — need an engine evaluation of every position of every
game. Until now a game was analysed only when its owner clicked "Analyse every
move" on it, so any such figure would have described the handful of games that
happened to be analysed rather than the player.

There is one engine: single-threaded Stockfish in a Web Worker (ADR 0002).
Each instance brings seven megabytes of WebAssembly and its own hash tables.
It also serves one request at a time, and the newest request wins: a new
search aborts the one in progress. Two users of the engine at once would
abort each other endlessly.

Measured on a typical laptop, per position: depth 10 about 16 ms, 12 about
27 ms, 14 about 75 ms and 16 about 176 ms. A collection of about a hundred
games has about 7,000 positions, so a full pass takes minutes at depth 10 to
14 and about twenty minutes at 16.

## Options

| Option | Benefit | Cost |
|---|---|---|
| A second engine instance for the batch | The two never interfere | Double the memory; both compete for one core, so neither is faster |
| One engine; the batch gives way to interactive use | One copy in memory; the game the user is looking at always has the engine | The batch must pause and resume cleanly |
| Analyse only on demand, per game | Nothing new to build | Statistics would rest on a sample chosen by accident |

## Decision

One engine for the whole application, created in `AnalysisProvider` above
every page. A background job, `BackgroundAnalysis`, works through the owner's
games newest first and yields to interactive use:

- **Yielding.** A view that analyses what the user is looking at takes a claim
  on the engine for as long as it is mounted (`useInteractiveEngine`). The
  job checks for claims in the same tick as it sends each search, so its next
  search can never pre-empt the user's. A search already running when the
  claim arrives is simply aborted by the user's request; the job waits and
  then repeats that game, skipping the positions it had already saved.
- **Resuming without a progress table.** Each evaluation is saved the moment
  it is made, and each finished game gets a small analysis record. A game is
  done when it has a record at the chosen depth. A game half done has its
  finished positions in the evaluation store, which a restart skips. Pausing,
  reloading or closing the app loses nothing.
- **Per-game records as derived data.** `gameAnalyses` (schema version 6)
  holds each side's totals and the ply of every error. The records are
  stored because rebuilding them for statistics would mean replaying every
  game. Being derived, they are dropped rather than kept in step: when a game
  is edited or deleted, when the database is restored, and they are left out
  of snapshots. The job writes them again, from stored evaluations, without
  engine time.
- **Depth.** Chosen by the owner and remembered in settings, because progress
  is counted against it. The default is 14: good enough to catch the errors
  that matter at club level, at under ten minutes for a hundred games.

The job runs only while the app is open, and only when started. A long,
CPU-bound task on the owner's machine should be the owner's decision. It is
never started automatically, and a sign in the header shows when it is
running.

## Consequences

- The analysis view no longer creates its own engine; opening several games
  in a session reuses one worker.
- Every game analysed in the background also shows its move-quality badges in
  the analysis view, since both read the same stored evaluations.
- At the performance target of 50,000 games the full pass is long: about
  seventeen hours at depth 10 and three days at 14. The job is resumable for
  exactly this reason, and works newest first, so the part that is done
  reflects current play.
