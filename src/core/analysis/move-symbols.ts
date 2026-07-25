import type { MoveQuality } from "./move-quality";

/** The six annotation symbols chess literature actually uses. */
export type MoveSymbol = "!!" | "!" | "!?" | "?!" | "?" | "??";

/**
 * Colour for each symbol, from exceptional through to losing.
 *
 * Fixed rather than theme tokens, for the same reason the board and evaluation
 * bar are: these stand for a judgement about a move, not for interface
 * furniture, and must read identically in light and dark. They also have to
 * work on the board, where the background is the square colour rather than the
 * page.
 *
 * `!?` deliberately sits outside the good-to-bad scale. It marks a move as
 * double-edged rather than better or worse, so a blue reads correctly where a
 * green or yellow would imply a verdict the symbol does not make.
 */
/**
 * Ink for a symbol drawn on its own colour.
 *
 * One dark ink for all six rather than white. The palette runs from a light
 * yellow to a mid red, and white falls well below a readable contrast on the
 * lighter half of it while a near-black clears it comfortably on every one.
 */
export const MOVE_SYMBOL_INK = "#1c1c1c";

export const MOVE_SYMBOL_COLOR: Record<MoveSymbol, string> = {
  "!!": "#1baca6",
  "!": "#95bb4a",
  "!?": "#6b9bd1",
  "?!": "#f7c631",
  "?": "#ff9f43",
  "??": "#fa412d",
};

/**
 * Numeric annotation glyphs, as the PGN standard numbers them.
 *
 * Only the six that map onto a symbol appear here; positional assessments like
 * `$14` describe the resulting position rather than the move, and marking a
 * square with them would say something the glyph does not.
 */
const NAG_SYMBOLS: Record<number, MoveSymbol> = {
  1: "!",
  2: "?",
  3: "!!",
  4: "??",
  5: "!?",
  6: "?!",
};

export function symbolForNag(nag: number): MoveSymbol | null {
  return NAG_SYMBOLS[nag] ?? null;
}

/**
 * The symbol for an engine verdict, or null when the move is unremarkable.
 *
 * `best` and `good` deliberately produce nothing. A badge on every move is a
 * badge on no move: what makes the marks useful is that they appear only where
 * something went wrong.
 */
export function symbolForQuality(quality: MoveQuality): MoveSymbol | null {
  if (quality === "inaccuracy") return "?!";
  if (quality === "mistake") return "?";
  if (quality === "blunder") return "??";

  return null;
}

/**
 * The one symbol to show for a move.
 *
 * An annotator's own glyph wins over the engine's verdict: it is a deliberate
 * statement someone wrote down, where the verdict is derived and can be
 * recomputed at any time. Only one can be shown on a square, and overwriting a
 * human judgement with a machine one is the wrong way round.
 */
export function symbolForMove(
  nags: readonly number[],
  quality: MoveQuality | undefined,
): MoveSymbol | null {
  for (const nag of nags) {
    const symbol = symbolForNag(nag);
    if (symbol) return symbol;
  }

  return quality ? symbolForQuality(quality) : null;
}
