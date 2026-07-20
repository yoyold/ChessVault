/**
 * An engine score.
 *
 * `cp` is centipawns; `mate` is a distance in moves, negative when the side to
 * move is the one getting mated.
 */
export type Score =
  | { type: "cp"; value: number }
  | { type: "mate"; value: number };

/** One principal variation reported by the engine. */
export interface AnalysisLine {
  /** 1 for the best line; higher for alternatives when MultiPV is enabled. */
  multiPv: number;
  depth: number;
  /**
   * Score **from White's perspective**.
   *
   * UCI reports scores relative to the side to move, which makes an evaluation
   * flip sign every ply and is a persistent source of bugs. Normalising once,
   * at the parsing boundary, means nothing downstream has to remember whose
   * turn it was.
   */
  score: Score;
  /** The variation, in UCI long algebraic notation (`e2e4`). */
  moves: string[];
}

/** A completed analysis of one position. */
export interface PositionAnalysis {
  depth: number;
  /** Ordered by `multiPv`, so the best line is first. */
  lines: AnalysisLine[];
  /** Engine identification, so stored evaluations remain interpretable later. */
  engine: string;
}

/** Convert a score to a number of pawns from White's perspective, for graphing. */
export function scoreToPawns(score: Score, mateCap = 10): number {
  if (score.type === "cp") return score.value / 100;

  // A forced mate has no centipawn value. Clamping to a large but finite number
  // keeps an evaluation graph readable instead of collapsing every other point
  // toward zero, while preserving which side is winning and roughly how quickly.
  return score.value > 0 ? mateCap : -mateCap;
}

/**
 * Human-readable score, always from White's perspective.
 *
 * The sign is explicit even when positive, which is the convention in chess
 * literature and avoids "0.35" being read as neutral.
 */
export function formatScore(score: Score): string {
  if (score.type === "mate") {
    const sign = score.value < 0 ? "-" : "+";
    return `${sign}M${Math.abs(score.value)}`;
  }

  const pawns = score.value / 100;
  const sign = pawns < 0 ? "-" : "+";

  return `${sign}${Math.abs(pawns).toFixed(2)}`;
}
