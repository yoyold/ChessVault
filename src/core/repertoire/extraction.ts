import { sideToMoveOf, type PositionKey } from "@/core/chess/position-key";
import type { Color, GameResult } from "@/core/domain/game";
import { outcomeFor } from "@/core/domain/game-outcome";
import { isOwnerToMove } from "@/core/domain/repertoire";

/** One game, reduced to what extraction needs. */
export interface ExtractionGame {
  /** Which side the database owner played. */
  playerColor: Color;
  result: GameResult;
  /** Positions in ply order; index 0 is the start and carries no move. */
  positions: readonly { key: PositionKey; san: string | null }[];
}

/** A move the owner has actually played or faced, with how it has gone. */
export interface RepertoireCandidate {
  color: Color;
  fromKey: PositionKey;
  san: string;
  toKey: PositionKey;

  /** Games in which this move appeared. */
  played: number;

  /**
   * Average points from the owner's perspective: 1 a win, 0.5 a draw, 0 a loss.
   *
   * Games still in progress are excluded from the average rather than counted
   * as draws, so an unfinished game cannot drag a line's record towards the
   * middle. `scored` says how many games the average rests on — a line played
   * ten times but decided twice is much weaker evidence than the score alone
   * suggests.
   */
  score: number;
  scored: number;

  /** Shallowest ply at which the move was seen, counting from one. */
  ply: number;

  /**
   * Whether the owner chose this move, or met it.
   *
   * Both belong in a repertoire — what to play, and what to be ready for — but
   * they are adopted with different intent, so the distinction is carried out.
   */
  ownMove: boolean;
}

export interface ExtractionOptions {
  /**
   * How deep to look, in plies.
   *
   * Past the opening the same position stops recurring across games, so every
   * move would appear once and the frequency signal — the whole point of
   * extraction — would carry no information. Twenty plies is ten moves a side,
   * comfortably beyond where most repertoires end.
   */
  maxPly?: number;
}

const DEFAULT_MAX_PLY = 20;

const POINTS: Record<"win" | "draw" | "loss", number> = {
  win: 1,
  draw: 0.5,
  loss: 0,
};

/**
 * Aggregate the moves the owner has actually played into repertoire candidates.
 *
 * Extraction answers a question the game list cannot: not "what did I play in
 * this game" but "what do I play, and how has it gone". A move appearing in
 * fifteen games with a poor record is exactly the line worth preparing
 * differently — and it is invisible until the games are aggregated by position.
 *
 * Only games the owner played are meaningful here, so a caller must filter
 * those first; a game with no attributed colour has no owner perspective to
 * score from.
 *
 * Results are ordered shallowest first, then by how often the move was played,
 * so the moves that shape the most games come first.
 */
export function extractCandidates(
  games: readonly ExtractionGame[],
  options: ExtractionOptions = {},
): RepertoireCandidate[] {
  const maxPly = options.maxPly ?? DEFAULT_MAX_PLY;
  const byEdge = new Map<string, RepertoireCandidate>();

  for (const game of games) {
    const outcome = outcomeFor(game.playerColor, game.result);
    const limit = Math.min(game.positions.length - 1, maxPly);

    for (let ply = 1; ply <= limit; ply += 1) {
      const from = game.positions[ply - 1];
      const to = game.positions[ply];

      if (!from || !to || to.san === null) continue;

      const id = `${game.playerColor}|${from.key}|${to.san}`;
      const existing = byEdge.get(id);

      if (existing) {
        existing.played += 1;
        // A shallower sighting of the same move is the one worth reporting: it
        // is where the decision is actually made.
        existing.ply = Math.min(existing.ply, ply);

        if (outcome) {
          existing.score =
            (existing.score * existing.scored + POINTS[outcome]) / (existing.scored + 1);
          existing.scored += 1;
        }

        continue;
      }

      byEdge.set(id, {
        color: game.playerColor,
        fromKey: from.key,
        san: to.san,
        toKey: to.key,
        played: 1,
        score: outcome ? POINTS[outcome] : 0,
        scored: outcome ? 1 : 0,
        ply,
        ownMove: isOwnerToMove(game.playerColor, sideToMoveOf(from.key)),
      });
    }
  }

  return [...byEdge.values()].sort(
    (a, b) => a.ply - b.ply || b.played - a.played || a.san.localeCompare(b.san),
  );
}
