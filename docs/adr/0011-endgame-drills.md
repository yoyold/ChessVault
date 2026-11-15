# ADR 0011 — Endgame drills against the engine

Status: accepted

## Context

The endgame module should teach the endgames every player needs: the basic
mates, king and pawn endings, Lucena and Philidor, and a few more. They are
learned by playing them out against resistance until the technique is
automatic, not by reading about them.

The usual judge for an endgame is a tablebase. Syzygy tables run to
gigabytes, and the online services break the app's promise to work offline
and to keep the owner's activity on their device. Neither fits.

## Decision

**A fixed catalogue of drills, played out against the bundled engine.** Each
drill is a position with the player to move and one of three goals:

- **Mate.** Deliver checkmate.
- **Promote.** Make a queen and keep the win.
- **Draw.** Hold the draw for a number of moves.

The engine defends with its best move at depth 16 and the drill is judged in
three steps (`core/endgames/judge.ts`):

1. **The rules first.** A mate ends any drill. A draw by the rules (stalemate,
   insufficient material, repetition, fifty moves) is the goal of a drawing
   drill and the end of any other.
2. **Then the engine's score of the position after the player's move.** That
   score already counts the defender's best reply.
   - A promoting drill succeeds once the player has a queen and the score is
     still decisive (at least +5). It fails as soon as the score falls to +1
     or below.
   - A drawing drill fails at −4 or below.
3. **Mating drills ignore the score.** At these depths the bundled engine
   does not see the mate in rook or bishop endings: it scores the rook mate
   at about +4 and the bishop mate at about +2.4. Only the rules can say
   whether the job is done.

**The catalogue is verified, not trusted.** Every position was checked with
the engine at depth 20 before it went in: the wins are clear wins and the
draws sit near 0.00. The check caught three bad positions:

- a „distant opposition“ draw that is a lost position (+81);
- an opposition win that only wins with the other side to move;
- a „Lucena“ whose defending king did not cut the attacker off, so the drill
  could be won without the technique it was meant to teach. The engine's main
  line showed it.

The catalogue test can only check that each position is legal and still in
play, not what the engine thinks of it. A changed or added drill has to be
checked the same way.

**Drills are cards.** They join the training cards and the scheduler
(ADR 0008) as a third kind, one card per drill, kept in line with the
catalogue like the opening cards with the repertoire.

- Only the first attempt in a session is graded; starting over after a miss is
  practice.
- Free practice from the catalogue is not graded at all.
- Three new drills a day: a drill is a game, not a single move.

## Consequences

- The defence is as good as the engine at depth 16. That is enough for these
  endings, but not perfect in long ones; a tablebase would be.
- A drill can be passed by any method that reaches the goal, not only the
  textbook one. The idea behind each drill is offered on request to point at
  the technique.
- Endgames from the owner's own games are not drills yet. The analysis could
  supply them: positions where the owner went wrong with few pieces left.
