# ADR 0010 — Replaying games with chessops

Status: accepted

## Context

Every import, every restore (ADR 0009) and every game opened for analysis
replays each move of each game, variations included, to key its positions.
chessops already parsed the PGN; chess.js replayed the moves. It was chosen
for that because the position keys derive from its FEN output, and those
keys are the identity everything is stored under (ADR 0004).

Measured on the owner's 94 games (12,199 moves with variations), replaying
was nearly all of the cost:

| Step | Time |
|---|---|
| chessops parsing the PGN | 4 ms |
| chess.js replaying the moves | 795 ms |

That is about 8.4 seconds per 1,000 games in Node and about 20 in the
browser. At the 50,000-game target, an import or a restore took a quarter of
an hour.

## Decision

**chessops replays the moves.** chess.js keeps two jobs:

- **The starting position.** It sets up and normalises a FEN taken from the
  file.
- **Moves chessops will not read.** chessops' SAN parser is stricter: it
  rejects castling written with zeros, for one. Any move it cannot read goes
  to chess.js, so no game that imported before is refused now.

Every node's FEN, key, SAN, UCI and side to move must come out exactly as
chess.js produced them, or stored positions, evaluations and notes would no
longer be found. Both libraries write the en-passant square only when the
capture is legal, pins included. chessops writes castling as the king taking
its own rook, so castling moves are converted back to the king's move
(`e1g1`).

`parse-tree.reference.test.ts` keeps the old replay as a reference and
compares the whole tree against it on the cases where the two could differ:

- en passant: available, impossible, and pinned
- castling, with letters and with zeros
- promotion, with and without `=`, and underpromotion
- check and mate
- ambiguous knight moves
- branching variations, and a broken variation beside a sound one

The same comparison over the owner's 94 games, as a fingerprint of all
12,199 nodes, came out identical.

## Consequences

- Parsing is about 13 times faster: 60 ms instead of 795 ms for the 94 games.
- In the browser, with 940 games:
  - import takes 7 seconds instead of 20
  - restore takes 5 seconds instead of 20

  Writing to IndexedDB is now most of what is left.
- ADR 0004's assumption about en passant now holds for chessops as well as
  chess.js. The reference test is where a disagreement would show.
