import { beforeEach, describe, expect, it } from "vitest";
import type { GameAnalysisRecord } from "@/core/domain/game-analysis";
import { parseGameTree } from "@/core/chess/pgn/parse-tree";
import { db } from "@/persistence/db";
import { deleteGame } from "@/persistence/repositories/game-repository";
import {
  getGameAnalyses,
  saveGameAnalysis,
} from "@/persistence/repositories/game-analysis-repository";
import { createSnapshot, restoreSnapshot } from "@/features/sync/snapshot";
import { persistGame } from "./edit/save-game";
import { importPgn } from "./import/import-games";

/**
 * A game's analysis record describes one particular sequence of moves. These
 * tests pin down every way that sequence can stop being the game's, and check
 * the record goes with it — a stale one would put the old game's errors into
 * the statistics of the new.
 */

const GAME = '[Event "A"]\n[White "Dony, Lukas"]\n[Black "Opp"]\n[Result "1-0"]\n\n1.e4 e5 2.Nf3 1-0';

function analysisOf(gameId: number): GameAnalysisRecord {
  const side = {
    counts: { best: 1, good: 0, inaccuracy: 0, mistake: 0, blunder: 1 },
    averageCentipawnLoss: 150,
    missedMates: 0,
    missedWins: 0,
  };
  return {
    gameId,
    depth: 14,
    engine: "Stockfish",
    analysedAt: 1,
    plies: 3,
    unevaluatedPlies: 0,
    white: side,
    black: side,
    errors: [{ ply: 3, quality: "blunder" }],
  };
}

async function importOne(): Promise<number> {
  await importPgn(GAME, { ownerNames: ["Dony, Lukas"] });
  const [game] = await db.games.toArray();
  return game.id as number;
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("a game's analysis record", () => {
  it("is dropped when the game is edited", async () => {
    const id = await importOne();
    await saveGameAnalysis(analysisOf(id));

    const tree = parseGameTree(GAME);
    await persistGame({ headers: tree.headers, root: tree.root, ownerNames: [], gameId: id });

    expect((await getGameAnalyses()).has(id)).toBe(false);
  });

  it("is dropped when the game is deleted", async () => {
    const id = await importOne();
    await saveGameAnalysis(analysisOf(id));

    await deleteGame(id);

    expect((await getGameAnalyses()).size).toBe(0);
  });

  it("is dropped when the database is restored", async () => {
    // After a restore the same id can belong to a different game.
    const id = await importOne();
    const snapshot = await createSnapshot("device");
    await saveGameAnalysis(analysisOf(id));

    await restoreSnapshot(JSON.parse(JSON.stringify(snapshot)));

    expect((await getGameAnalyses()).size).toBe(0);
  });

  it("is not carried in a snapshot, being rebuildable", async () => {
    const id = await importOne();
    await saveGameAnalysis(analysisOf(id));

    const snapshot = await createSnapshot("device");

    expect(Object.keys(snapshot.data)).not.toContain("gameAnalyses");
  });

  it("survives other games being imported", async () => {
    const id = await importOne();
    await saveGameAnalysis(analysisOf(id));

    await importPgn('[Event "B"]\n\n1.d4 d5 *', { ownerNames: [] });

    expect((await getGameAnalyses()).has(id)).toBe(true);
  });
});
