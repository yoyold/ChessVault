"use client";

import { winProbability } from "@/core/analysis/move-quality";
import { formatScore, type Score } from "@/core/analysis/types";

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
 *
 * The bar follows the board's orientation, so the side you are playing is
 * always the one at the bottom.
 */
export function EvalBar({ score, orientation }: EvalBarProps) {
  // An unevaluated position is shown level rather than blank: a bar that
  // disappears between moves is more distracting than one that sits still.
  const whiteShare = score ? winProbability(score) : 0.5;

  const bottomShare = orientation === "white" ? whiteShare : 1 - whiteShare;

  // The label belongs to whichever side is ahead, and sits at that side's end.
  const whiteIsBetter = whiteShare >= 0.5;
  const labelAtBottom = orientation === "white" ? whiteIsBetter : !whiteIsBetter;

  return (
    // No height of its own: it stretches to whatever the board beside it is,
    // so the two always line up however the board is sized.
    <div
      className="bg-foreground relative w-6 shrink-0 self-stretch overflow-hidden rounded"
      role="img"
      aria-label={
        score ? `Evaluation ${formatScore(score)}` : "Position not yet evaluated"
      }
    >
      {/* The bottom side's share grows from the bottom edge. */}
      <div
        className="absolute inset-x-0 bottom-0 bg-[#f0f0f0] transition-[height] duration-200"
        style={{ height: `${bottomShare * 100}%` }}
      />

      {score ? (
        <span
          className={`absolute inset-x-0 text-center text-[0.5rem] font-semibold tabular-nums ${
            labelAtBottom ? "bottom-0.5 text-black" : "top-0.5 text-white"
          }`}
        >
          {formatScore(score)}
        </span>
      ) : null}
    </div>
  );
}
