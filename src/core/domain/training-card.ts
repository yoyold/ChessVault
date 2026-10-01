import type { Score } from "@/core/analysis/types";
import type { PositionKey } from "@/core/chess/position-key";
import type { ReviewState } from "@/core/training/scheduler";

/**
 * A position from the owner's own games where they went wrong, to be solved.
 *
 * Self-contained: it carries the position, what was played and what was
 * better, so it stays a sound exercise if the game it came from is edited or
 * deleted. The game is kept only as a reference, to look the moment up.
 */
export interface MistakeCardContent {
  kind: "mistake";
  /**
   * The position and the move played there.
   *
   * Not the game: the same error in the same position, made in two games, is
   * one thing to learn, and it is one card.
   */
  id: string;
  /** The position to solve, with the owner to move. */
  fen: string;
  positionKey: PositionKey;
  /** The move that led to the position, in coordinates, so the board can show it. */
  previousUci: string | null;
  /** What the owner played. */
  playedSan: string;
  /** What the engine preferred. */
  bestUci: string;
  bestSan: string;
  quality: "mistake" | "blunder";
  /**
   * The evaluation before the move, from White's side.
   *
   * What an answer other than the engine's choice is measured against: a
   * different move that keeps the position is a right answer too.
   */
  scoreBefore: Score;
  /** The game it came from — a reference, which may outlive the game. */
  gameId: number;
  gameLabel: string;
  /** When that game was played, `YYYY-MM-DD` or empty. */
  dateIso: string;
  /** The move number the error was made on, for display. */
  moveNumber: number;
}

export interface TrainingCard extends MistakeCardContent, ReviewState {
  createdAt: number;
}

export function mistakeCardId(positionKey: PositionKey, playedSan: string): string {
  return `mistake:${positionKey}:${playedSan}`;
}
