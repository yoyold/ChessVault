import type { PositionKey } from "@/core/chess/position-key";
import type { AnalysisLine } from "@/core/analysis/types";

/**
 * A stored engine evaluation of a position.
 *
 * Keyed by position rather than by game: an evaluation is a property of the
 * position itself, so analysing one game makes its evaluations available to
 * every other game that transposes into the same positions. On a personal
 * collection with a consistent opening repertoire that avoids a great deal of
 * repeated work.
 */
export interface EvaluationRecord {
  key: PositionKey;

  /** Depth actually reached. Deeper evaluations supersede shallower ones. */
  depth: number;

  /** How many variations were requested. Stored so partial results are interpretable. */
  multiPv: number;

  /** Variations, best first. Scores are from White's perspective. */
  lines: AnalysisLine[];

  /**
   * Which engine produced this.
   *
   * Evaluations from different engines or network versions are not directly
   * comparable, and a stored number without this context is not interpretable
   * years later.
   */
  engine: string;

  evaluatedAt: number;
}
