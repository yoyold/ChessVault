"use client";

import { Chessboard } from "react-chessboard";
import type { CSSProperties } from "react";

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
};

export interface AnalysisBoardProps {
  fen: string;
  orientation: "white" | "black";
  /** The move that produced this position, in UCI notation, or null at the start. */
  lastMoveUci: string | null;
}

/** Split a UCI move into its squares, tolerating a promotion suffix. */
function squaresOf(uci: string | null): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;

  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export function AnalysisBoard({ fen, orientation, lastMoveUci }: AnalysisBoardProps) {
  const lastMove = squaresOf(lastMoveUci);

  // Both a highlight and an arrow: the highlight shows where the piece came
  // from and went, and the arrow makes the direction readable at a glance when
  // skimming a game quickly.
  const squareStyles = lastMove
    ? {
        [lastMove.from]: { backgroundColor: LAST_MOVE_HIGHLIGHT },
        [lastMove.to]: { backgroundColor: LAST_MOVE_HIGHLIGHT },
      }
    : {};

  const arrows = lastMove
    ? [{ startSquare: lastMove.from, endSquare: lastMove.to, color: ARROW_COLOUR }]
    : [];

  return (
    <Chessboard
      options={{
        position: fen,
        boardOrientation: orientation,
        // The board is for reading a finished game, not for playing moves.
        allowDragging: false,
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
      }}
    />
  );
}
