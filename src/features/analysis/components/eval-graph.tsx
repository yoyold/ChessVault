"use client";

import { useState } from "react";
import { formatMoveNumber } from "@/core/chess/pgn/game-timeline";
import { formatScore, scoreToPawns, type Score } from "@/core/analysis/types";

interface EvalGraphProps {
  /** One entry per ply, null where the position was not evaluated. */
  scores: (Score | null)[];
  /** Move played at each ply, for labelling. Index 0 is the starting position. */
  moves: (string | null)[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
}

const HEIGHT = 64;
/** Evaluations beyond this are clamped: past it the game is decided anyway. */
const CLAMP_PAWNS = 6;

/**
 * Evaluation over the course of the game, from White's perspective.
 *
 * Drawn as an area chart around a centre line, the convention in chess
 * software: above the line White is better, below it Black is. Values are
 * clamped because a single forced mate would otherwise flatten every other
 * point in the game into the centre line.
 *
 * Hovering names the move under the cursor, so the graph can be read without
 * counting plies across to the move list.
 */
export function EvalGraph({ scores, moves, currentPly, onSelectPly }: EvalGraphProps) {
  const [hoverPly, setHoverPly] = useState<number | null>(null);

  if (scores.length < 2) return null;

  const width = scores.length;

  const toY = (score: Score | null) => {
    if (score === null) return HEIGHT / 2;

    const clamped = Math.max(-CLAMP_PAWNS, Math.min(CLAMP_PAWNS, scoreToPawns(score)));

    // Positive evaluations rise, so the y axis is inverted.
    return HEIGHT / 2 - (clamped / CLAMP_PAWNS) * (HEIGHT / 2);
  };

  const points = scores.map((score, ply) => `${ply},${toY(score)}`).join(" ");
  const area = `0,${HEIGHT / 2} ${points} ${width - 1},${HEIGHT / 2}`;

  /** Map a pointer position onto the nearest ply. */
  const plyAt = (event: React.MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;

    return Math.max(0, Math.min(scores.length - 1, Math.round(ratio * (scores.length - 1))));
  };

  const hovered = hoverPly === null ? null : hoverPly;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width - 1} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="bg-muted h-16 w-full cursor-pointer rounded"
        role="img"
        aria-label="Evaluation over the course of the game"
        onClick={(event) => onSelectPly(plyAt(event))}
        onMouseMove={(event) => setHoverPly(plyAt(event))}
        onMouseLeave={() => setHoverPly(null)}
      >
        <polygon points={area} className="fill-foreground/20" />
        <polyline
          points={points}
          className="stroke-foreground/60"
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={0}
          y1={HEIGHT / 2}
          x2={width - 1}
          y2={HEIGHT / 2}
          className="stroke-foreground/30"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />

        {hovered !== null ? (
          <line
            x1={hovered}
            y1={0}
            x2={hovered}
            y2={HEIGHT}
            className="stroke-foreground/40"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        <line
          x1={currentPly}
          y1={0}
          x2={currentPly}
          y2={HEIGHT}
          className="stroke-primary"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {hovered !== null ? (
        <HoverLabel
          ply={hovered}
          total={scores.length}
          san={moves[hovered] ?? null}
          score={scores[hovered] ?? null}
        />
      ) : null}
    </div>
  );
}

/**
 * Floating label naming the hovered move.
 *
 * Positioned as a percentage of the graph width and nudged back inside at the
 * edges, so the label for the first or last move is not clipped.
 */
function HoverLabel({
  ply,
  total,
  san,
  score,
}: {
  ply: number;
  total: number;
  san: string | null;
  score: Score | null;
}) {
  const ratio = total > 1 ? ply / (total - 1) : 0;

  return (
    <div
      className="bg-popover text-popover-foreground pointer-events-none absolute -top-8 z-10 rounded border px-2 py-0.5 text-xs whitespace-nowrap shadow-sm"
      style={{
        left: `${ratio * 100}%`,
        transform: `translateX(${ratio < 0.1 ? "0" : ratio > 0.9 ? "-100%" : "-50%"})`,
      }}
    >
      {ply === 0 ? (
        "Start"
      ) : (
        <>
          <span className="font-medium">
            {formatMoveNumber(ply)} {san ?? ""}
          </span>
          {score ? (
            <span className="text-muted-foreground ml-2 tabular-nums">
              {formatScore(score)}
            </span>
          ) : (
            <span className="text-muted-foreground ml-2">not analysed</span>
          )}
        </>
      )}
    </div>
  );
}
