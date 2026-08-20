import type { Color, GameResult } from "@/core/domain/game";
import { outcomeFor, type GameOutcome } from "@/core/domain/game-outcome";

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

const EMPTY_TALLY = { games: 0, wins: 0, draws: 0, losses: 0 };

type Counts = typeof EMPTY_TALLY;

function count(counts: Counts, outcome: GameOutcome | null): void {
  counts.games += 1;

  if (outcome === "win") counts.wins += 1;
  else if (outcome === "draw") counts.draws += 1;
  else if (outcome === "loss") counts.losses += 1;
}

function finish(counts: Counts): OutcomeTally {
  const scored = counts.wins + counts.draws + counts.losses;

  return {
    ...counts,
    scored,
    score: scored === 0 ? 0 : (counts.wins + counts.draws / 2) / scored,
  };
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
  const total: Counts = { ...EMPTY_TALLY };
  const byMove = new Map<string, Counts>();
  let ended = 0;

  for (const visit of visits) {
    const outcome = outcomeFor(visit.playerColor, visit.result);

    count(total, outcome);

    if (visit.san === null) {
      ended += 1;
      continue;
    }

    const counts = byMove.get(visit.san) ?? { ...EMPTY_TALLY };
    count(counts, outcome);
    byMove.set(visit.san, counts);
  }

  const moves = [...byMove.entries()]
    .map(([san, counts]) => ({
      san,
      ...finish(counts),
      share: total.games === 0 ? 0 : counts.games / total.games,
    }))
    .sort((a, b) => b.games - a.games || a.san.localeCompare(b.san));

  return { ...finish(total), ended, moves };
}
