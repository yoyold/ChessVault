import { beforeEach, describe, expect, it } from "vitest";
import type { GameAnalysisRecord } from "@/core/domain/game-analysis";
import { db } from "@/persistence/db";
import { saveEvaluation } from "@/persistence/repositories/evaluation-repository";
import { saveGameAnalysis } from "@/persistence/repositories/game-analysis-repository";
import { deleteGame } from "@/persistence/repositories/game-repository";
import { getCards, recordReview } from "@/persistence/repositories/training-repository";
import { importPgn } from "@/features/games/import/import-games";
import { syncMistakeCards } from "./sync-mistake-cards";

// The owner, with Black, walks into mate with 3...Nf6.
const GAME =
  '[Event "Club"]\n[Date "2026.05.24"]\n[White "Opp"]\n[Black "Dony, Lukas"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';

const NOW = new Date(2026, 9, 7, 12, 0).getTime();

async function importAndAnalyse(analysedAt: number, bestUci = "g7g6"): Promise<number> {
  if ((await db.games.count()) === 0) {
    await importPgn(GAME, { ownerNames: ["Dony, Lukas"] });
  }
  const [game] = await db.games.toArray();
  const id = game.id as number;

  const before = await db.gamePositions.get([id, 5]);
  await saveEvaluation(
    before!.key,
    {
      depth: 14,
      engine: "Stockfish",
      lines: [{ multiPv: 1, depth: 14, score: { type: "cp", value: 30 }, moves: [bestUci] }],
    },
    { force: true },
  );

  const side = {
    counts: { best: 3, good: 0, inaccuracy: 0, mistake: 0, blunder: 1 },
    averageCentipawnLoss: 300,
    missedMates: 0,
    missedWins: 0,
  };
  const analysis: GameAnalysisRecord = {
    gameId: id,
    depth: 14,
    engine: "Stockfish",
    analysedAt,
    plies: 7,
    unevaluatedPlies: 0,
    white: side,
    black: side,
    errors: [{ ply: 6, quality: "blunder" }],
  };
  await saveGameAnalysis(analysis);
  return id;
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  window.localStorage.clear();
});

describe("syncMistakeCards", () => {
  it("turns an analysed game's errors into cards", async () => {
    const id = await importAndAnalyse(100);

    expect(await syncMistakeCards(NOW)).toEqual({ added: 1, updated: 0 });

    const [card] = await getCards("mistake");
    expect(card).toMatchObject({
      playedSan: "Nf6",
      bestSan: "g6",
      quality: "blunder",
      gameId: id,
      gameLabel: "vs Opp, 2026",
      previousUci: "f1c4",
      reviews: 0,
    });
  });

  it("reads only games analysed since the last sync", async () => {
    await importAndAnalyse(100);
    await syncMistakeCards(NOW);

    expect(await syncMistakeCards(NOW)).toEqual({ added: 0, updated: 0 });
  });

  it("refreshes a re-analysed game's cards without losing progress", async () => {
    await importAndAnalyse(100);
    await syncMistakeCards(NOW);
    const [card] = await getCards("mistake");
    await recordReview(card.id, "good", NOW);

    // Deeper analysis, a different recommendation.
    await importAndAnalyse(200, "d8e7");
    expect(await syncMistakeCards(NOW)).toEqual({ added: 0, updated: 1 });

    const [refreshed] = await getCards("mistake");
    expect(refreshed).toMatchObject({ bestSan: "Qe7", reviews: 1 });
  });

  it("keeps a card when its game is deleted", async () => {
    // The card carries the position and the answer; it is still a sound
    // exercise without the game behind it.
    const id = await importAndAnalyse(100);
    await syncMistakeCards(NOW);

    await deleteGame(id);

    expect(await getCards("mistake")).toHaveLength(1);
  });
});
