import { beforeEach, describe, expect, it } from "vitest";
import type { GameRecord } from "@/core/domain/game";
import { db } from "@/persistence/db";
import { getRecentGames } from "./dashboard-repository";

function game(overrides: Partial<GameRecord>): GameRecord {
  return {
    contentHash: `hash-${Math.random()}`,
    white: "Owner",
    black: "Opp",
    result: "1-0",
    dateIso: "2026-01-01",
    event: null,
    site: null,
    round: null,
    eco: null,
    opening: null,
    timeControl: null,
    playerColor: "white",
    whiteElo: null,
    blackElo: null,
    opponent: "Opp",
    opponentElo: null,
    playerElo: null,
    tags: [],
    notes: "",
    plyCount: 0,
    finalFen: "",
    importedAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const SIDE = {
  counts: { best: 20, good: 5, inaccuracy: 2, mistake: 1, blunder: 0 },
  averageCentipawnLoss: 31,
  missedMates: 0,
  missedWins: 0,
};

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("getRecentGames", () => {
  it("lists the owner's games newest first", async () => {
    await db.games.bulkAdd([
      game({ opponent: "Middle", dateIso: "2026-03-01" }),
      game({ opponent: "Undated", dateIso: "" }),
      game({ opponent: "Newest", dateIso: "2026-09-30" }),
      game({ opponent: "Not mine", dateIso: "2026-10-01", playerColor: null }),
      game({ opponent: "Oldest", dateIso: "2025-12-24" }),
    ]);

    const recent = await getRecentGames(10);

    expect(recent.map((entry) => entry.opponent)).toEqual([
      "Newest",
      "Middle",
      "Oldest",
      "Undated",
    ]);
  });

  it("stops at the limit", async () => {
    await db.games.bulkAdd([
      game({ dateIso: "2026-01-01" }),
      game({ dateIso: "2026-01-02" }),
      game({ dateIso: "2026-01-03" }),
    ]);

    expect(await getRecentGames(2)).toHaveLength(2);
  });

  it("brings the owner's side of the analysis along", async () => {
    const id = (await db.games.add(game({ playerColor: "black", result: "0-1" }))) as number;
    const blackSide = { ...SIDE, averageCentipawnLoss: 18 };
    await db.gameAnalyses.put({
      gameId: id,
      depth: 14,
      engine: "Stockfish",
      analysedAt: 1,
      plies: 40,
      unevaluatedPlies: 0,
      white: SIDE,
      black: blackSide,
      errors: [],
    });
    await db.games.add(game({ dateIso: "2025-01-01" }));

    const [analysed, unanalysed] = await getRecentGames(5);

    expect(analysed.analysis).toEqual(blackSide);
    expect(unanalysed.analysis).toBeNull();
  });
});
