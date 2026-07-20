"use client";

import { scoreToPawns, type Score } from "@/core/analysis/types";

interface EvalGraphProps {
  /** One entry per ply, null where the position was not evaluated. */
  scores: (Score | null)[];
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
 */
export function EvalGraph({ scores, currentPly, onSelectPly }: EvalGraphProps) {
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

  return (
    <svg
      viewBox={`0 0 ${width - 1} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="bg-muted h-16 w-full cursor-pointer rounded"
      role="img"
      aria-label="Evaluation over the course of the game"
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - bounds.left) / bounds.width;
        onSelectPly(Math.round(ratio * (scores.length - 1)));
      }}
    >
      <polygon points={area} className="fill-foreground/20" />
      <polyline points={points} className="stroke-foreground/60" fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <line
        x1={0}
        y1={HEIGHT / 2}
        x2={width - 1}
        y2={HEIGHT / 2}
        className="stroke-foreground/30"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
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
  );
}
