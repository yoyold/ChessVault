import type { Color, GameResult } from "@/core/domain/game";
import { outcomeFor, type GameOutcome } from "@/core/domain/game-outcome";
import {
  countOutcome,
  emptyCounts,
  finishTally,
  type OutcomeTally,
} from "@/core/domain/outcome-tally";

export interface FormGame {
  result: GameResult;
  playerColor: Color;
  playerElo: number | null;
}

export interface Form {
  tally: OutcomeTally;
  /** The owner's rating in the most recent game that records one. */
  rating: number | null;
  /**
   * How far the rating moved across these games: the newest recorded rating
   * minus the oldest. Null with fewer than two ratings to compare.
   */
  ratingChange: number | null;
  /** The run of equal results the newest games end on, if longer than one. */
  streak: { outcome: GameOutcome; games: number } | null;
}

/**
 * How the owner is doing lately, from their most recent games, newest first.
 *
 * Unfinished games count as games but not as results, and do not break a
 * streak: an adjourned game says nothing about the run either side of it.
 */
export function recentForm(games: readonly FormGame[]): Form {
  const counts = emptyCounts();
  const outcomes: GameOutcome[] = [];

  for (const game of games) {
    const outcome = outcomeFor(game.playerColor, game.result);
    countOutcome(counts, outcome);
    if (outcome) outcomes.push(outcome);
  }

  const ratings = games.flatMap((game) => (game.playerElo === null ? [] : [game.playerElo]));
  const rating = ratings[0] ?? null;
  const ratingChange = ratings.length >= 2 ? ratings[0] - ratings[ratings.length - 1] : null;

  let run = 0;
  while (run < outcomes.length && outcomes[run] === outcomes[0]) run += 1;

  return {
    tally: finishTally(counts),
    rating,
    ratingChange,
    streak: run > 1 ? { outcome: outcomes[0], games: run } : null,
  };
}
