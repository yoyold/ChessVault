import { beforeEach, describe, expect, it } from "vitest";
import type { GameAnalysisRecord } from "@/core/domain/game-analysis";
import { db } from "@/persistence/db";
import { getGameAnalyses, saveGameAnalysis } from "./game-analysis-repository";

function record(gameId: number, depth = 14): GameAnalysisRecord {
  const side = {
    counts: { best: 10, good: 5, inaccuracy: 1, mistake: 0, blunder: 0 },
    averageCentipawnLoss: 25,
    missedMates: 0,
    missedWins: 0,
  };
  return {
    gameId,
    depth,
    engine: "Stockfish",
    analysedAt: 1,
    plies: 32,
    unevaluatedPlies: 0,
    white: side,
    black: side,
    errors: [{ ply: 17, quality: "inaccuracy" }],
  };
}

beforeEach(async () => {
  await db.open();
  await db.gameAnalyses.clear();
});

describe("game analysis records", () => {
  it("round-trips a record", async () => {
    await saveGameAnalysis(record(3));

    expect((await getGameAnalyses()).get(3)).toEqual(record(3));
  });

  it("keeps one record per game, replacing an older analysis", async () => {
    await saveGameAnalysis(record(3, 12));
    await saveGameAnalysis(record(3, 16));

    const all = await getGameAnalyses();
    expect(all.size).toBe(1);
    expect(all.get(3)?.depth).toBe(16);
  });

  it("returns an empty map when nothing is analysed", async () => {
    expect((await getGameAnalyses()).size).toBe(0);
  });
});
