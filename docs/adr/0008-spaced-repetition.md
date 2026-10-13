# ADR 0008 — Spaced repetition for mistakes and openings

Status: accepted

## Context

The background analysis (ADR 0007) finds every mistake and blunder the owner
has made. Seeing them in a report helps little on its own. Positions are
learned by solving them, at growing intervals, until the right move comes
without thinking. The same mechanism will serve the opening trainer next.

A scheduler needs per-card state: when the card is next due, how fast its
intervals grow, and its history. That state is the only part of training that
cannot be derived from the games. It is the owner's work.

## Options

| Option | Benefit | Cost |
|---|---|---|
| SM-2 (SuperMemo 2, as in early Anki) | Simple, well understood, needs no data to start | Fixed curve; intervals are a rough fit to any one person |
| FSRS | Fits intervals to the learner's measured memory | Weights are fitted from a review history, which a new collection does not have; the default weights are tuned for flashcards, not chess positions |
| Leitner boxes | Simplest of all | Coarse; no notion of how hard a card is |

## Decision

**SM-2, with day-granular due dates** (`core/training/scheduler.ts`). A card
answered right moves to the start of a later day: 1, then 3 days, then the
interval times the card's ease. A card answered wrong comes back after ten
minutes and loses some ease. Day boundaries rather than exact times mean a
card learned in the evening is due the next morning, not the next evening.
Intervals are capped at a year. FSRS can replace the scheduler later without
a schema change, once real review histories exist to fit it to.

**Grading is two-valued.** The answer is a move on the board, judged by the
engine, so there is no "hard" or "easy" to ask about: a move that holds is
"good" and one that does not is "again".

**Judging.** The engine's choice is correct without a search. Any other move
is searched to depth 12 and accepted if it gives up no more than a move rated
"good" would. This is the same win-probability yardstick that found the
mistake. Sound alternatives are common, and rejecting them would teach the
engine's taste rather than the position. The session claims the engine like
any interactive view, so the background analysis pauses while training and
resumes afterwards.

**Card identity.** A mistake card is the position plus the move played in it
(`mistake:<position key>:<san>`). The same slip in two games is one card,
pointing at the more recent game. A card survives editing or deleting its
game, because it carries the position and the answer itself.

**Cards are user data.** They live in `trainingCards` (schema version 7,
index `[kind+due]` for "what is due of this kind") and travel in backups and
sync snapshots. When a game is re-analysed, its cards' content is refreshed,
but their schedule is kept.

**Incremental creation.** Cards are created from analysis records written
since the last pass, tracked by a per-device watermark in localStorage. A
device behind the watermark only re-reads games whose cards it already has.

**Opening cards** are the positions in a repertoire where the owner is to
move, one per position, with the prepared moves as answers. Any prepared
move counts, since an alternative the owner prepared is part of the
repertoire. Answers are judged against the repertoire, not the engine:
the point is to know one's own choices. The repertoire stays the source of
truth, so the cards are rebuilt from it in full on every visit to the
trainer. It holds hundreds of moves, not millions, and an edit anywhere can
change what is reachable. A position that leaves the repertoire loses its
card. A card whose answers changed starts over, because what was learned
for it is now the wrong move. Each card carries the shortest line to its
position, found in one breadth-first pass, so transpositions are asked once.

**New cards per day: ten per deck.** Mistakes come blunders first and recent
games first; openings come shallowest first. The first analysis of a
collection turns up hundreds of positions at once, and without a limit they
would bury the reviews.

## Consequences

- Both trainers share the table, the scheduler and the session; a further
  kind of card only brings its own way of building and judging cards.
- Removing a card is offered only for mistakes. An opening card would come
  back on the next visit; it goes by removing the move from the repertoire.
- A card removed by the owner comes back if its game is analysed again at a
  depth that still finds the mistake. That is acceptable: the new analysis has
  reconsidered it.
- Mistakes found at a shallow depth may be engine artefacts; removing a card
  is one click in the session.
