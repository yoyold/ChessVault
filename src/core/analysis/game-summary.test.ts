import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/core/chess/pgn/game-timeline";
import type { PositionKey } from "@/core/chess/position-key";
import { buildGameReport, type EvaluatedPosition } from "./game-report";
import { summariseGameReport } from "./game-summary";

const GAME = '[Event "T"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';
const META = { gameId: 7, depth: 14, engine: "Stockfish", analysedAt: 5, plies: 7 };

function report(scores: number[]) {
  const timeline = buildTimeline(GAME);
  const evaluations = new Map<PositionKey, EvaluatedPosition>();
  timeline.forEach((node, index) => {
    if (scores[index] !== undefined) {
      evaluations.set(node.key, { score: { type: "cp", value: scores[index] }, bestMove: null });
    }
  });
  return buildGameReport(timeline, evaluations);
}

describe("summariseGameReport", () => {
  it("keeps each side's totals as the report computed them", () => {
    const full = report([20, 20, 20, 0, 0, 0, -300, 2000]);
    const summary = summariseGameReport(full, META);

    expect(summary.white).toEqual(full.white);
    expect(summary.black).toEqual(full.black);
    expect(summary).toMatchObject(META);
  });

  it("keeps the errors, by ply, and nothing else per move", () => {
    // 3... Nf6 walks into mate: Black's blunder at ply 6.
    const summary = summariseGameReport(report([20, 20, 20, 0, 0, 0, 2000, 2000]), META);

    expect(summary.errors).toContainEqual({ ply: 6, quality: "blunder" });
    expect(summary.errors.every((error) => error.quality !== ("best" as never))).toBe(true);
  });

  it("records how many moves could not be judged", () => {
    const summary = summariseGameReport(report([20, 20, 20]), META);

    // Seven moves, two judged.
    expect(summary.unevaluatedPlies).toBe(5);
  });
});
