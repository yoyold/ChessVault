import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/core/chess/pgn/game-timeline";
import type { PositionKey } from "@/core/chess/position-key";
import { buildGameReport, type EvaluatedPosition } from "./game-report";
import type { Score } from "./types";

const GAME = '[Event "T"]\n\n1. e4 e5 2. Nf3 Nc6 *';

const cp = (value: number): Score => ({ type: "cp", value });

/** Build an evaluation map from per-ply scores, using the game's own keys. */
function evaluationsFor(
  pgn: string,
  scores: (Score | null)[],
  bestMoves: (string | null)[] = [],
): Map<PositionKey, EvaluatedPosition> {
  const timeline = buildTimeline(pgn);
  const map = new Map<PositionKey, EvaluatedPosition>();

  timeline.forEach((node, index) => {
    const score = scores[index];
    if (score === null || score === undefined) return;

    map.set(node.key, { score, bestMove: bestMoves[index] ?? null });
  });

  return map;
}

describe("buildGameReport", () => {
  it("reports one entry per move", () => {
    const timeline = buildTimeline(GAME);
    const report = buildGameReport(
      timeline,
      evaluationsFor(GAME, [cp(20), cp(15), cp(25), cp(20), cp(30)]),
    );

    expect(report.moves.map((m) => m.san)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
    expect(report.unevaluatedPlies).toEqual([]);
  });

  it("attributes each move to the side that played it", () => {
    const timeline = buildTimeline(GAME);
    const report = buildGameReport(
      timeline,
      evaluationsFor(GAME, [cp(0), cp(0), cp(0), cp(0), cp(0)]),
    );

    expect(report.moves.map((m) => m.moverColour)).toEqual(["w", "b", "w", "b"]);
  });

  it("charges a blunder to the player who made it", () => {
    // Black's first move drops the evaluation from level to −5.00.
    const timeline = buildTimeline(GAME);
    const report = buildGameReport(
      timeline,
      evaluationsFor(GAME, [cp(0), cp(0), cp(500), cp(500), cp(500)]),
    );

    expect(report.black.counts.blunder).toBe(1);
    expect(report.white.counts.blunder).toBe(0);
  });

  it("records what the engine preferred when another move was played", () => {
    const timeline = buildTimeline(GAME);
    const report = buildGameReport(
      timeline,
      evaluationsFor(GAME, [cp(20), cp(20), cp(20), cp(20), cp(20)], ["d2d4"]),
    );

    expect(report.moves[0].betterMove).toBe("d2d4");
  });

  it("does not suggest an alternative when the engine's move was played", () => {
    const timeline = buildTimeline(GAME);
    const report = buildGameReport(
      timeline,
      evaluationsFor(GAME, [cp(20), cp(20), cp(20), cp(20), cp(20)], ["e2e4"]),
    );

    expect(report.moves[0].betterMove).toBeNull();
    expect(report.moves[0].assessment.quality).toBe("best");
  });

  it("averages centipawn loss per side", () => {
    const timeline = buildTimeline(GAME);
    // White: 0 → 0 then 0 → 0 (no loss). Black: 0 → +100 then +100 → +100.
    const report = buildGameReport(
      timeline,
      evaluationsFor(GAME, [cp(0), cp(0), cp(100), cp(100), cp(100)]),
    );

    expect(report.white.averageCentipawnLoss).toBe(0);
    expect(report.black.averageCentipawnLoss).toBe(50);
  });

  describe("partial analysis", () => {
    it("lists plies it could not assess instead of ignoring them", () => {
      // A partially analysed game must not read as cleanly played.
      const timeline = buildTimeline(GAME);
      const report = buildGameReport(
        timeline,
        evaluationsFor(GAME, [cp(20), cp(15), null, null, cp(30)]),
      );

      expect(report.moves).toHaveLength(1);
      expect(report.unevaluatedPlies).toEqual([2, 3, 4]);
    });

    it("produces an empty report when nothing is evaluated", () => {
      const timeline = buildTimeline(GAME);
      const report = buildGameReport(timeline, new Map());

      expect(report.moves).toEqual([]);
      expect(report.unevaluatedPlies).toEqual([1, 2, 3, 4]);
      expect(report.white.averageCentipawnLoss).toBe(0);
    });
  });

  it("counts missed mates and missed wins per side", () => {
    const timeline = buildTimeline(GAME);
    const report = buildGameReport(
      timeline,
      evaluationsFor(GAME, [
        { type: "mate", value: 3 },
        cp(50),
        cp(50),
        cp(50),
        cp(50),
      ]),
    );

    expect(report.white.missedMates).toBe(1);
    expect(report.black.missedMates).toBe(0);
  });

  it("handles a game with no moves", () => {
    const stub = '[Event "A"]\n[Result "1-0"]\n\n1-0';
    const report = buildGameReport(buildTimeline(stub), new Map());

    expect(report.moves).toEqual([]);
    expect(report.unevaluatedPlies).toEqual([]);
  });
});
