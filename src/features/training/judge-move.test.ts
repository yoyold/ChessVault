import { describe, expect, it, vi } from "vitest";
import type { Score } from "@/core/analysis/types";
import type { MistakeCardContent } from "@/core/domain/training-card";
import type { EngineService } from "@/features/analysis/engine/engine-service";
import { judgeMove } from "./judge-move";

// After 1.e4 e5 2.Qh5 Nc6 3.Bc4, Black to move; 3...Nf6?? allows Qxf7#.
const FEN = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";

const card: MistakeCardContent = {
  kind: "mistake",
  id: "mistake:x:Nf6",
  fen: FEN,
  positionKey: "x" as never,
  previousUci: "f1c4",
  playedSan: "Nf6",
  bestUci: "g7g6",
  bestSan: "g6",
  quality: "blunder",
  // Roughly level, from White's side.
  scoreBefore: { type: "cp", value: 30 },
  gameId: 1,
  gameLabel: "vs Opp, 2026",
  dateIso: "2026-05-24",
  moveNumber: 3,
};

/** An engine that reports one score, from White's side, for whatever it is asked. */
function engineScoring(score: Score) {
  const analyse = vi.fn(async () => ({
    depth: 12,
    engine: "Fake",
    lines: [{ multiPv: 1, depth: 12, score, moves: [] }],
  }));
  const engine: EngineService = { analyse, stop() {}, dispose() {} };
  return { engine, analyse };
}

describe("judgeMove", () => {
  it("accepts the engine's choice without searching again", async () => {
    const { engine, analyse } = engineScoring({ type: "cp", value: 0 });

    expect(await judgeMove(engine, card, { from: "g7", to: "g6" })).toEqual({
      outcome: "best",
      san: "g6",
    });
    expect(analyse).not.toHaveBeenCalled();
  });

  it("accepts a different move that keeps the position", async () => {
    // 3...Qe7 also defends f7; the engine finds it barely worse.
    const { engine } = engineScoring({ type: "cp", value: 45 });

    expect(await judgeMove(engine, card, { from: "d8", to: "e7" })).toEqual({
      outcome: "also-good",
      san: "Qe7",
    });
  });

  it("rejects a move that loses, and says how badly", async () => {
    // The original blunder itself: White mates next move.
    const { engine } = engineScoring({ type: "mate", value: 1 });

    expect(await judgeMove(engine, card, { from: "g8", to: "f6" })).toMatchObject({
      outcome: "wrong",
      san: "Nf6",
      quality: "blunder",
    });
  });

  it("checks the alternative in the position after it", async () => {
    const { engine, analyse } = engineScoring({ type: "cp", value: 40 });

    await judgeMove(engine, card, { from: "d8", to: "e7" });

    const [request] = analyse.mock.calls[0] as unknown as [{ fen: string; multiPv: number }];
    expect(request.fen.split(" ")[1]).toBe("w");
    expect(request.multiPv).toBe(1);
  });

  it("refuses an illegal move", async () => {
    const { engine } = engineScoring({ type: "cp", value: 0 });

    await expect(judgeMove(engine, card, { from: "e8", to: "e6" })).rejects.toThrow();
  });
});
