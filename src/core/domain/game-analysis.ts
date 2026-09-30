import type { ColourSummary } from "@/core/analysis/game-report";
import type { MoveQuality } from "@/core/analysis/move-quality";

/** The verdicts worth counting as errors. */
export type ErrorQuality = Extract<MoveQuality, "inaccuracy" | "mistake" | "blunder">;

/**
 * What an engine analysis of one whole game came to, kept per game.
 *
 * Derived data: everything here can be rebuilt from the stored evaluations and
 * the game's moves. It is stored anyway because rebuilding it means replaying
 * every game move by move, which is seconds for a hundred games and minutes for
 * fifty thousand — far too slow to do each time the statistics page opens.
 * Reading one small record per game is not.
 *
 * Being derived, it is discarded rather than kept in step whenever its inputs
 * change — the game is edited, or deleted, or the database restored — and the
 * background analysis simply writes it again.
 */
export interface GameAnalysisRecord {
  gameId: number;
  /** The depth every position in the game was searched to, at least. */
  depth: number;
  engine: string;
  analysedAt: number;
  /** Moves in the game as played. */
  plies: number;
  /** Moves that could not be judged, for a position with no evaluation. */
  unevaluatedPlies: number;
  white: ColourSummary;
  black: ColourSummary;
  /**
   * Every inaccuracy, mistake and blunder, by ply.
   *
   * Kept individually so errors can be grouped by move number; which side made
   * one follows from the ply — odd plies are White's moves.
   */
  errors: { ply: number; quality: ErrorQuality }[];
}
