import type { AnalysisLine, Score } from "./types";

/**
 * Parse a UCI `info` line into an analysis line.
 *
 * Returns null for lines that carry no usable evaluation: informational
 * progress reports (`info depth 1 currmove ...`), and — importantly — bounded
 * scores.
 *
 * **Bounded scores are discarded.** During a search the engine emits
 * `lowerbound` and `upperbound` scores from an aspiration window that failed
 * high or low. They are not evaluations, only proofs that the true value lies
 * beyond some threshold, and they are often wildly off. Treating them as real
 * makes an evaluation bar jump violently before settling, and would poison any
 * stored evaluation or mistake classification derived from it.
 *
 * @param sideToMove Whose turn it is in the analysed position. UCI reports
 *   scores relative to the side to move, so this is required to normalise them
 *   to White's perspective.
 */
export function parseInfoLine(
  line: string,
  sideToMove: "w" | "b",
): AnalysisLine | null {
  if (!line.startsWith("info ")) return null;

  const tokens = line.split(/\s+/);

  const scoreIndex = tokens.indexOf("score");
  const pvIndex = tokens.indexOf("pv");

  // Both are required: a line without a score carries no evaluation, and one
  // without a variation tells us nothing about how the score is reached.
  if (scoreIndex === -1 || pvIndex === -1) return null;

  const scoreType = tokens[scoreIndex + 1];
  const rawValue = Number(tokens[scoreIndex + 2]);

  if ((scoreType !== "cp" && scoreType !== "mate") || !Number.isFinite(rawValue)) {
    return null;
  }

  // The bound marker follows the value.
  const bound = tokens[scoreIndex + 3];
  if (bound === "lowerbound" || bound === "upperbound") return null;

  const depth = readNumber(tokens, "depth");
  if (depth === null) return null;

  const score: Score = {
    type: scoreType,
    // Negate for Black to move, so every score downstream reads from White's
    // perspective and no consumer has to track whose turn it was.
    value: sideToMove === "w" ? rawValue : -rawValue,
  };

  return {
    multiPv: readNumber(tokens, "multipv") ?? 1,
    depth,
    score,
    moves: tokens.slice(pvIndex + 1).filter((token) => token !== ""),
  };
}

function readNumber(tokens: string[], key: string): number | null {
  const index = tokens.indexOf(key);
  if (index === -1) return null;

  const value = Number(tokens[index + 1]);

  return Number.isFinite(value) ? value : null;
}

/**
 * Merge a newly reported line into the current best set, keyed by MultiPV slot.
 *
 * The engine reports each slot repeatedly as the search deepens. Keeping the
 * deepest report per slot means the displayed lines stay stable and only ever
 * improve, rather than flickering between depths as reports arrive.
 */
export function mergeLine(
  current: readonly AnalysisLine[],
  incoming: AnalysisLine,
): AnalysisLine[] {
  const merged = current.filter((line) => line.multiPv !== incoming.multiPv);

  const existing = current.find((line) => line.multiPv === incoming.multiPv);

  // A shallower report for a slot already filled at greater depth is stale:
  // engines re-report lower depths when MultiPV slots are re-searched.
  if (existing && existing.depth > incoming.depth) return [...current];

  merged.push(incoming);

  return merged.sort((a, b) => a.multiPv - b.multiPv);
}

/** Whether a UCI line signals the end of a search. */
export function isSearchComplete(line: string): boolean {
  return line.startsWith("bestmove");
}
