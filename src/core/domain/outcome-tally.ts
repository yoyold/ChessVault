import type { GameOutcome } from "./game-outcome";

/**
 * How a set of games turned out for the database owner.
 *
 * `games` counts every game, `scored` only those that have an answer: a game
 * still in progress, or one between two other people, has no result from the
 * owner's point of view. Keeping the two apart is what stops a line played
 * twice and decided once from being quoted as though it had a record.
 */
export interface OutcomeTally {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;

  /**
   * Average points from the owner's perspective: 1 a win, ½ a draw, 0 a loss.
   *
   * Zero when nothing is scored, which callers must not present as a 0% record
   * — there is no record. Check `scored` first.
   */
  score: number;
}

/** A tally still being counted. Finish it with {@link finishTally}. */
export interface OutcomeCounts {
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

export function emptyCounts(): OutcomeCounts {
  return { games: 0, wins: 0, draws: 0, losses: 0 };
}

/** Count one game. A null outcome still counts as a game, just not as a result. */
export function countOutcome(counts: OutcomeCounts, outcome: GameOutcome | null): void {
  counts.games += 1;

  if (outcome === "win") counts.wins += 1;
  else if (outcome === "draw") counts.draws += 1;
  else if (outcome === "loss") counts.losses += 1;
}

export function finishTally(counts: OutcomeCounts): OutcomeTally {
  const scored = counts.wins + counts.draws + counts.losses;

  return {
    ...counts,
    scored,
    score: scored === 0 ? 0 : (counts.wins + counts.draws / 2) / scored,
  };
}
