import type { Score } from "./types";

export type MoveQuality =
  | "best"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export interface MoveAssessment {
  quality: MoveQuality;
  /** Winning chances given up by the mover, 0 to 1. */
  winProbabilityLoss: number;
  /** Centipawns given up by the mover. Reported for display, not used to classify. */
  centipawnLoss: number;
  /** The mover had a forced mate available and did not play into it. */
  missedMate: boolean;
  /** The mover held a winning position before the move and no longer does. */
  missedWin: boolean;
}

/**
 * Convert an evaluation into a winning probability for White, 0 to 1.
 *
 * The logistic constant is the one derived from large samples of real games by
 * Lichess; it maps roughly +1.00 to a 60% expected score, which matches how
 * evaluations actually translate into results far better than treating
 * centipawns as linear.
 */
export function winProbability(score: Score): number {
  if (score.type === "mate") {
    // A forced mate is a decided game, whichever side is delivering it.
    return score.value > 0 ? 1 : 0;
  }

  return 1 / (1 + Math.exp(-0.00368208 * score.value));
}

/**
 * Thresholds in lost winning chances, not centipawns.
 *
 * Centipawn loss is a poor measure of how much a move mattered. Dropping from
 * +15.0 to +10.0 loses 500 centipawns and changes nothing — the game is still
 * completely won. Dropping from 0.0 to −5.0 loses the same 500 centipawns and
 * throws the game away. Winning probability captures that difference directly,
 * so a "blunder" here means a move that genuinely damaged the result rather
 * than one that moved a large number.
 *
 * The values are Lichess's, which were derived from large samples of real
 * games. Lichess expresses winning chances on a −1 to +1 scale with thresholds
 * of 0.06, 0.15 and 0.30; halved here because this module works with a 0 to 1
 * probability instead. Thresholds chosen by intuition rather than data proved
 * far too lenient in testing — a two-pawn drop from equality came out as a mere
 * inaccuracy.
 */
const THRESHOLDS = {
  inaccuracy: 0.03,
  mistake: 0.075,
  blunder: 0.15,
} as const;

/** A position counts as winning once the side to move is this close to certain. */
const WINNING_THRESHOLD = 0.85;

export interface AssessMoveInput {
  /** Evaluation before the move, with best play. White's perspective. */
  before: Score;
  /** Evaluation after the move actually played. White's perspective. */
  after: Score;
  /** Who played the move. */
  moverColour: "w" | "b";
  /** Whether the move played was the engine's first choice. */
  wasBestMove: boolean;
}

/**
 * Classify how much a played move cost the player who made it.
 */
export function assessMove({
  before,
  after,
  moverColour,
  wasBestMove,
}: AssessMoveInput): MoveAssessment {
  // Winning chances are computed for White, then read from the mover's point of
  // view, so a loss is always a positive number regardless of colour.
  const beforeForMover =
    moverColour === "w" ? winProbability(before) : 1 - winProbability(before);
  const afterForMover =
    moverColour === "w" ? winProbability(after) : 1 - winProbability(after);

  // Clamped at zero: an engine at limited depth can report a position as better
  // after a move than before it, which is search noise rather than the player
  // having gained something.
  const winProbabilityLoss = Math.max(0, beforeForMover - afterForMover);

  const centipawnLoss = Math.max(
    0,
    centipawnsForMover(before, moverColour) - centipawnsForMover(after, moverColour),
  );

  const missedMate =
    before.type === "mate" &&
    isMateFor(before, moverColour) &&
    !(after.type === "mate" && isMateFor(after, moverColour));

  const missedWin =
    beforeForMover >= WINNING_THRESHOLD && afterForMover < WINNING_THRESHOLD;

  return {
    quality: classify(winProbabilityLoss, wasBestMove),
    winProbabilityLoss,
    centipawnLoss,
    missedMate,
    missedWin,
  };
}

function classify(loss: number, wasBestMove: boolean): MoveQuality {
  if (loss >= THRESHOLDS.blunder) return "blunder";
  if (loss >= THRESHOLDS.mistake) return "mistake";
  if (loss >= THRESHOLDS.inaccuracy) return "inaccuracy";

  // "Best" is reserved for the engine's actual first choice. A move that loses
  // nothing measurable is still only "good": at limited depth several moves
  // score identically, and calling them all best would be overclaiming.
  return wasBestMove ? "best" : "good";
}

/** Whether a mate score means the given colour is the one delivering it. */
function isMateFor(score: Score, colour: "w" | "b"): boolean {
  if (score.type !== "mate") return false;

  return colour === "w" ? score.value > 0 : score.value < 0;
}

/**
 * Centipawns from the mover's perspective, with mates mapped to a large finite
 * value so the subtraction stays meaningful.
 */
function centipawnsForMover(score: Score, colour: "w" | "b"): number {
  const forWhite = score.type === "cp" ? score.value : score.value > 0 ? 10_000 : -10_000;

  return colour === "w" ? forWhite : -forWhite;
}
