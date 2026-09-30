/**
 * Rating arithmetic: what a result was worth against the opposition it came
 * against.
 *
 * A bare score says little. Sixty percent against players two hundred points
 * weaker is a poor return, and forty percent against players two hundred
 * points stronger is a good one. Every figure here puts a score next to the
 * strength it was achieved against.
 */

/**
 * The score the Elo model expects, from 0 to 1.
 *
 * The standard logistic curve: equal ratings expect half the points, and every
 * 400 points of difference multiplies the odds by ten.
 */
export function expectedScore(ownRating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - ownRating) / 400));
}

/**
 * A score fraction can only be inverted strictly between 0 and 1: a clean
 * sweep has no finite rating that "explains" it. Clamping to one percent either
 * side caps the performance at about 800 points above or below the opposition,
 * which is the convention rating lists use for the same reason.
 */
const MIN_FRACTION = 0.01;

/**
 * The rating at which the achieved score would have been exactly the expected
 * one — the usual "performance rating".
 *
 * Computed by inverting the expectation curve rather than with the "plus 400
 * per net win" shortcut. The shortcut is linear and drifts badly for lopsided
 * scores, while this is the same model the expectation itself uses, so the two
 * agree: performing at your own rating means scoring exactly what was expected.
 *
 * @param score Points per game, 0 to 1.
 */
export function performanceRating(averageOpponent: number, score: number): number {
  const fraction = Math.min(1 - MIN_FRACTION, Math.max(MIN_FRACTION, score));

  return Math.round(averageOpponent - 400 * Math.log10(1 / fraction - 1));
}
