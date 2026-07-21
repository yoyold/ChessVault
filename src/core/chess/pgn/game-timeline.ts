import { mainline, parseGameTree, type TreeNode } from "./parse-tree";

export type { TreeNode } from "./parse-tree";

/**
 * The mainline of a game, one entry per ply.
 *
 * A convenience over {@link parseGameTree} for callers that only step through
 * the game as played. Each node still carries its comments, glyphs and
 * children, so a view can offer the variations at any point without reparsing.
 *
 * @throws PgnParseError if the movetext is not legal chess.
 */
export function buildTimeline(pgn: string): TreeNode[] {
  return mainline(parseGameTree(pgn).root);
}

/** Render a ply number as a move number with colour, e.g. `12...` for Black's 12th. */
export function formatMoveNumber(ply: number): string {
  if (ply === 0) return "";

  const moveNumber = Math.ceil(ply / 2);

  return ply % 2 === 1 ? `${moveNumber}.` : `${moveNumber}...`;
}

/**
 * Standard symbol for a numeric annotation glyph.
 *
 * Only the glyphs that appear in practice are mapped; anything else is shown as
 * its raw `$n`, which is still more informative than dropping it.
 */
const NAG_SYMBOLS: Record<number, string> = {
  1: "!",
  2: "?",
  3: "!!",
  4: "??",
  5: "!?",
  6: "?!",
  10: "=",
  13: "∞",
  14: "⩲",
  15: "⩱",
  16: "±",
  17: "∓",
  18: "+−",
  19: "−+",
  22: "⨀",
  36: "↑",
  40: "→",
  44: "⇆",
};

export function formatNag(nag: number): string {
  return NAG_SYMBOLS[nag] ?? `$${nag}`;
}
