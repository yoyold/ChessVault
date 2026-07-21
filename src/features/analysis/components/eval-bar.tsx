"use client";

import { winProbability } from "@/core/analysis/move-quality";
import { formatScore, type Score } from "@/core/analysis/types";

/**
 * The two halves of the bar stand for the chess colours, not for the interface.
 *
 * Fixed rather than theme tokens: bound to the theme, the dark half took the
 * near-white foreground colour in dark mode and the whole bar read as white.
 */
const WHITE_SIDE = "#f0f0f0";
const BLACK_SIDE = "#3a3733";

interface EvalBarProps {
  /** Evaluation from White's perspective, or null when the position is unevaluated. */
  score: Score | null;
  /** Which colour is at the bottom of the board; the bar follows it. */
  orientation: "white" | "black";
}

/**
 * Vertical evaluation bar beside the board, as Lichess and Chess.com show.
 *
 * The bar is divided by **winning probability**, not by centipawns. A linear
 * centipawn scale would need an arbitrary clamp, and would make the difference
 * between +6 and +9 look as important as the difference between 0.0 and +3.0 —
 * when the first is two ways of being completely winning and the second decides
 * the game.
 */
export function EvalBar({ score, orientation }: EvalBarProps) {
  // An unevaluated position is shown level rather than blank: a bar that
  // disappears between moves is more distracting than one that sits still.
  const whiteShare = score ? winProbability(score) : 0.5;

  // White's share always grows from White's own end of the board.
  const whiteAtBottom = orientation === "white";

  // The number belongs to whichever side is ahead and sits at that side's end,
  // so it is always on top of that side's colour.
  const whiteIsBetter = whiteShare >= 0.5;
  const labelAtWhiteEnd = whiteIsBetter;

  return (
    // No height of its own: it stretches to whatever the board beside it is,
    // so the two always line up however the board is sized.
    <div
      className="relative w-6 shrink-0 self-stretch overflow-hidden rounded border"
      style={{ backgroundColor: BLACK_SIDE }}
      role="img"
      aria-label={
        score ? `Evaluation ${formatScore(score)}` : "Position not yet evaluated"
      }
    >
      <div
        className="absolute inset-x-0 transition-[height] duration-200"
        style={{
          height: `${whiteShare * 100}%`,
          backgroundColor: WHITE_SIDE,
          ...(whiteAtBottom ? { bottom: 0 } : { top: 0 }),
        }}
      />

      {score ? (
        <span
          className="absolute inset-x-0 text-center text-[0.5rem] font-semibold tabular-nums"
          style={{
            color: labelAtWhiteEnd ? "#111111" : "#eeeeee",
            ...(labelAtWhiteEnd === whiteAtBottom ? { bottom: 2 } : { top: 2 }),
          }}
        >
          {formatScore(score)}
        </span>
      ) : null}
    </div>
  );
}
