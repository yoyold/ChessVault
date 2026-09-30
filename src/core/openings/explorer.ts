import type { Color, GameResult } from "@/core/domain/game";
import { outcomeFor } from "@/core/domain/game-outcome";
import {
  countOutcome,
  emptyCounts,
  finishTally,
  type OutcomeCounts,
  type OutcomeTally,
} from "@/core/domain/outcome-tally";

// Re-exported: the tally began here and callers still reach for it by this path.
export type { OutcomeTally };

/**
 * One game's passage through a position.
 *
 * Exactly one visit per game: a game that repeats a position still counts once,
 * because the question the explorer answers is "in how many of my games did
 * this happen", not "how many times did it happen". Deduplication belongs to
 * whoever reads the occurrences, since only they can see the plies.
 */
export interface PositionVisit {
  gameId: number;

  /** The move played from this position, or null when the game ended here. */
  san: string | null;

  result: GameResult;

  /** Which side the database owner played, or null for a game they were not in. */
  playerColor: Color | null;
}

/** One continuation from a position, with how the games playing it went. */
export interface ExplorerMove extends OutcomeTally {
  san: string;

  /** Share of the games at this position that continued with this move, 0–1. */
  share: number;
}

/** Everything the explorer knows about one position. */
export interface ExplorerStats extends OutcomeTally {
  /** Games in which the game ended in this position, with no move to follow. */
  ended: number;

  /** Continuations, most played first. */
  moves: ExplorerMove[];
}

/**
 * Aggregate the games that reached a position into a move table.
 *
 * This is the opening-explorer view of a collection: not what one game played,
 * but what has been played here across every game, and how each choice has
 * gone. The record is taken from the database owner's perspective rather than
 * White's, because the collection is their own games — "how do I score in this
 * line" is the question being asked, and it is the same question whichever side
 * they had.
 *
 * Moves are ordered by how often they were played, then alphabetically so the
 * order is stable between renders when two moves are equally common.
 */
export function summarisePosition(visits: readonly PositionVisit[]): ExplorerStats {
  const total = emptyCounts();
  const byMove = new Map<string, OutcomeCounts>();
  let ended = 0;

  for (const visit of visits) {
    const outcome = outcomeFor(visit.playerColor, visit.result);

    countOutcome(total, outcome);

    if (visit.san === null) {
      ended += 1;
      continue;
    }

    const counts = byMove.get(visit.san) ?? emptyCounts();
    countOutcome(counts, outcome);
    byMove.set(visit.san, counts);
  }

  const moves = [...byMove.entries()]
    .map(([san, counts]) => ({
      san,
      ...finishTally(counts),
      share: total.games === 0 ? 0 : counts.games / total.games,
    }))
    .sort((a, b) => b.games - a.games || a.san.localeCompare(b.san));

  return { ...finishTally(total), ended, moves };
}
