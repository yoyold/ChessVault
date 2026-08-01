"use client";

import { Chessboard } from "react-chessboard";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  MOVE_SYMBOL_COLOR,
  MOVE_SYMBOL_INK,
  type MoveSymbol,
} from "@/core/analysis/move-symbols";
import { legalTargets } from "@/core/chess/legal-moves";

/**
 * Square colours are deliberately not set here.
 *
 * The library already defaults to the brown board Lichess uses — the same
 * `#f0d9b5` and `#b58863`. Setting them explicitly was not merely redundant:
 * the per-square colour options are applied *after* `squareStyles`, so they
 * overwrote the last-move highlight and it never appeared.
 */

/** Translucent yellow-green Lichess uses to mark the move just played. */
const LAST_MOVE_HIGHLIGHT = "rgba(155, 199, 0, 0.41)";

/** Lichess's default arrow green. */
const ARROW_COLOUR = "rgba(21, 120, 27, 0.8)";

/** The piece waiting for a destination, in the same green as the arrows. */
const SELECTED_HIGHLIGHT = "rgba(21, 120, 27, 0.35)";

/**
 * Where a selected piece may go.
 *
 * Translucent black rather than a colour: it has to read on both the light and
 * the dark squares, and anything with a hue reads as a different mark on each.
 */
const TARGET_MARK = "rgba(0, 0, 0, 0.16)";

/**
 * Squares must fill their grid cell.
 *
 * The board lays its squares out on a grid whose rows are sized from the
 * board's height, but the squares themselves were sized independently and came
 * out about 1.5px shorter. The leftover strip in every row let the page
 * background show through, which read as dark bars ruled across the board.
 */
const SQUARE_STYLE: CSSProperties = { width: "100%", height: "100%" };

/**
 * Divide the board's real width into eight equal columns.
 *
 * The board writes a fixed pixel size per square, derived from a width it
 * measures itself. When the container is a grid column that gets compressed to
 * share space, that measurement is the width the column *asked for*, not the
 * width it received — and the squares overflow, clipping the h-file.
 *
 * Fractional units make the squares divide whatever width the board actually
 * has, so the two can no longer disagree. The container still governs the size;
 * this only stops a mismatch from cutting the board off.
 */
const BOARD_STYLE: CSSProperties = {
  gridTemplateColumns: "repeat(8, 1fr)",
  gridTemplateRows: "repeat(8, 1fr)",
  aspectRatio: "1 / 1",
  height: "auto",
  borderRadius: "0.25rem",
  overflow: "hidden",

  /*
   * Dimmed as a whole rather than by darkening the square colours.
   *
   * The per-square colour options are applied after `squareStyles`, so setting
   * them would overwrite the last-move highlight — that is how the highlight
   * silently stopped working once before. A filter leaves the highlight intact
   * and dims the pieces along with the squares, which is what makes the board
   * sit back rather than glare.
   */
  filter: "brightness(0.93) saturate(0.96)",
};

/**
 * The badge marking the move just played, drawn as SVG.
 *
 * SVG rather than a styled element so it scales with the board on its own: the
 * squares are sized in fractional grid units and have no pixel size to derive a
 * font size from, and a `viewBox` makes the glyph track whatever size the
 * square ends up with. Two-character symbols get a smaller glyph so `?!` fits
 * the same circle `!` does.
 */
function SymbolBadge({ symbol }: { symbol: MoveSymbol }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      style={{
        position: "absolute",
        // Kept fully inside the square rather than overhanging its corner: the
        // board clips its own overflow, so an overhang would be shaved off on
        // the back rank and the h-file and read as a rendering fault.
        top: "0%",
        right: "0%",
        width: "46%",
        height: "46%",
        // The move arrow ends on this very square and is drawn over the pieces
        // at z-index 20, which left the badge buried underneath it. Neither the
        // square nor the wrapper sets a z-index, so neither opens a stacking
        // context and this value is compared against the arrow's directly.
        zIndex: 30,
        // The square is also a drop target; the badge must not swallow the
        // pointer.
        pointerEvents: "none",
      }}
    >
      {/* A ring in the piece outline's own white, so the badge separates from
          the arrow and from whatever piece is standing on the square. */}
      <circle
        cx="50"
        cy="50"
        r="44"
        fill={MOVE_SYMBOL_COLOR[symbol]}
        stroke="#ffffff"
        strokeWidth="8"
      />
      <text
        x="50"
        y="52"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={symbol.length > 1 ? 52 : 68}
        fontWeight={700}
        fill={MOVE_SYMBOL_INK}
      >
        {symbol}
      </text>
    </svg>
  );
}

/**
 * The mark showing a selected piece may move here.
 *
 * A dot on an empty square and a ring around an occupied one, which is how
 * every chess interface distinguishes a move from a capture — the ring reads as
 * surrounding the piece it would take, where a dot would hide it.
 */
function TargetMark({ occupied }: { occupied: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        // The square underneath is the click target; the mark must not take
        // the tap meant for it.
        pointerEvents: "none",
      }}
    >
      {occupied ? (
        <circle cx="50" cy="50" r="44" fill="none" stroke={TARGET_MARK} strokeWidth="11" />
      ) : (
        <circle cx="50" cy="50" r="15" fill={TARGET_MARK} />
      )}
    </svg>
  );
}

export interface AnalysisBoardProps {
  fen: string;
  orientation: "white" | "black";
  /** The move that produced this position, in UCI notation, or null at the start. */
  lastMoveUci: string | null;
  /**
   * Annotation symbol for that move, shown on the square it landed on.
   *
   * Null for an unremarkable move — the marks are only worth anything because
   * they are rare.
   */
  moveSymbol?: MoveSymbol | null;
  /**
   * Called when a move is played, by dragging or by clicking two squares.
   *
   * Supplying this turns both on. Playing a move on the board is how a
   * variation gets written, so the board is only interactive when the caller is
   * prepared to record what is played. Returns whether the move was accepted.
   */
  onMove?: (from: string, to: string) => boolean;
}

/** Split a UCI move into its squares, tolerating a promotion suffix. */
function squaresOf(uci: string | null): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;

  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export function AnalysisBoard({
  fen,
  orientation,
  lastMoveUci,
  moveSymbol,
  onMove,
}: AnalysisBoardProps) {
  const lastMove = squaresOf(lastMoveUci);

  /*
   * The selection remembers which position it was made in.
   *
   * Stepping to another move must not leave a square selected: the piece that
   * was there is gone, and the next click would play a move the player never
   * chose. Storing the position alongside makes a stale selection expire on its
   * own, which needs no effect to clear it and cannot be missed on a path that
   * forgot to.
   */
  const [selection, setSelection] = useState<{ square: string; fen: string } | null>(
    null,
  );
  const selected = selection?.fen === fen ? selection.square : null;

  const targets = useMemo(
    () => (selected ? legalTargets(fen, selected) : []),
    [fen, selected],
  );

  function handleSquareClick({ square }: { square: string }) {
    if (!onMove) return;

    // Clicking the selected piece again puts it back down.
    if (selected === square) {
      setSelection(null);
      return;
    }

    // A move is attempted before a new selection, so that clicking an enemy
    // piece captures it rather than trying to select it.
    if (selected && onMove(selected, square)) {
      setSelection(null);
      return;
    }

    // Only a piece that can actually move is worth selecting. Whether a square
    // holds a piece is the wrong question — the side that is not to move holds
    // plenty, and highlighting one promises a move it cannot offer.
    setSelection(legalTargets(fen, square).length > 0 ? { square, fen } : null);
  }

  // Both a highlight and an arrow: the highlight shows where the piece came
  // from and went, and the arrow makes the direction readable at a glance when
  // skimming a game quickly.
  const squareStyles: Record<string, CSSProperties> = {
    ...(lastMove
      ? {
          [lastMove.from]: { backgroundColor: LAST_MOVE_HIGHLIGHT },
          [lastMove.to]: { backgroundColor: LAST_MOVE_HIGHLIGHT },
        }
      : {}),
    ...(selected ? { [selected]: { backgroundColor: SELECTED_HIGHLIGHT } } : {}),
  };

  const arrows = lastMove
    ? [{ startSquare: lastMove.from, endSquare: lastMove.to, color: ARROW_COLOUR }]
    : [];

  const badge =
    moveSymbol && lastMove ? { square: lastMove.to, symbol: moveSymbol } : null;

  const targetSet = new Set(targets);

  /**
   * Supplying a renderer *replaces* the square the board would have drawn,
   * including the element that carries `squareStyles` — so the renderer has to
   * lay the square's own style back down or the last-move highlight silently
   * disappears. That is the same trap the per-square colour options set once
   * before, which is why the renderer is only installed when there is actually
   * something extra to draw.
   */
  const squareRenderer =
    badge || targetSet.size > 0
      ? ({
          square,
          piece,
          children,
        }: {
          square: string;
          piece: unknown;
          children?: ReactNode;
        }) => (
          <div
            style={{
              ...SQUARE_STYLE,
              position: "relative",
              ...squareStyles[square],
            }}
          >
            {children}
            {targetSet.has(square) ? <TargetMark occupied={piece !== null} /> : null}
            {square === badge?.square ? <SymbolBadge symbol={badge.symbol} /> : null}
          </div>
        )
      : undefined;

  return (
    <Chessboard
      options={{
        position: fen,
        boardOrientation: orientation,
        allowDragging: onMove !== undefined,
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          // A drag supersedes whatever was selected, however it ends.
          setSelection(null);

          return targetSquare !== null && onMove !== undefined
            ? onMove(sourceSquare, targetSquare)
            : false;
        },
        // Clicking a piece and then a square, which is the only way to move on
        // a touch screen where a drag is a scroll. The library fires this for
        // taps as well as clicks.
        onSquareClick: handleSquareClick,
        // Drawing arrows and highlights by hand is how analysis is discussed;
        // right-drag on the board, as in every other chess interface.
        allowDrawingArrows: true,
        clearArrowsOnPositionChange: true,
        arrows,
        squareStyles,
        showNotation: true,
        animationDurationInMs: 150,
        boardStyle: BOARD_STYLE,
        squareStyle: SQUARE_STYLE,
        squareRenderer,
      }}
    />
  );
}
