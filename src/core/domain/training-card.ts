import type { Score } from "@/core/analysis/types";
import type { PositionKey } from "@/core/chess/position-key";
import type { ReviewState } from "@/core/training/scheduler";
import type { Color } from "./game";

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

/**
 * A position from the owner's opening repertoire where they are to move.
 *
 * Built from the repertoire, which stays the source of truth: the card follows
 * it, and goes when the position leaves the repertoire.
 */
export interface OpeningCardContent {
  kind: "opening";
  /** The repertoire and the position — one card per decision to know. */
  id: string;
  color: Color;
  /** The position to answer, with the owner to move. */
  fen: string;
  positionKey: PositionKey;
  /** The last move of the line, in coordinates, so the board can show it. */
  previousUci: string | null;
  /** The shortest prepared line from the starting position, in SAN. */
  line: string[];
  /**
   * The owner's prepared moves here, in SAN, main line first.
   *
   * Any of them is a right answer: an alternative the owner prepared is part
   * of the repertoire, not a mistake.
   */
  answers: string[];
}

export type TrainingCardContent = MistakeCardContent | OpeningCardContent;

/** A card's content with its place in the schedule. */
export type TrainingCard<Content extends TrainingCardContent = TrainingCardContent> = Content &
  ReviewState & { createdAt: number };

export type MistakeCard = TrainingCard<MistakeCardContent>;
export type OpeningCard = TrainingCard<OpeningCardContent>;

export function mistakeCardId(positionKey: PositionKey, playedSan: string): string {
  return `mistake:${positionKey}:${playedSan}`;
}

export function openingCardId(color: Color, positionKey: PositionKey): string {
  return `opening:${color}:${positionKey}`;
}
