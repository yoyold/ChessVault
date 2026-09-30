import { beforeEach, describe, expect, it } from "vitest";
import type { Color, GameRecord } from "@/core/domain/game";
import { db } from "@/persistence/db";
import { loadStatisticsSource } from "./statistics-repository";

function record(playerColor: Color | null, overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    contentHash: Math.random().toString(16),
    white: "Dony, Lukas",
    black: "Opponent",
    result: "1-0",
    dateIso: "2026-05-24",
    event: "Club",
    site: null,
    round: null,
    eco: "A45",
    opening: "Indian Defense",
    timeControl: null,
    playerColor,
    whiteElo: 1518,
    blackElo: 1244,
    opponent: playerColor ? "Opponent" : null,
    opponentElo: playerColor ? 1244 : null,
    playerElo: playerColor ? 1518 : null,
    tags: ["reviewed"],
    notes: "a long private note",
    plyCount: 40,
    finalFen: "8/8/8/8/8/8/8/8 w - - 0 1",
    searchTokens: [],
    importedAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all([db.games.clear(), db.gameAnalyses.clear()]);
});

describe("loadStatisticsSource", () => {
  it("loads the owner's games in the shape the statistics read", async () => {
    const id = (await db.games.add(record("white"))) as number;

    const { games } = await loadStatisticsSource();

    expect(games).toEqual([
      {
        id,
        result: "1-0",
        playerColor: "white",
        dateIso: "2026-05-24",
        eco: "A45",
        opening: "Indian Defense",
        event: "Club",
        playerElo: 1518,
        opponentElo: 1244,
      },
    ]);
  });

  it("leaves out everything a statistic does not need", async () => {
    // Notes, tags and the board are the bulk of a record; none is a statistic.
    await db.games.add(record("black"));

    const [game] = (await loadStatisticsSource()).games;

    expect(game).not.toHaveProperty("notes");
    expect(game).not.toHaveProperty("tags");
    expect(game).not.toHaveProperty("finalFen");
  });

  it("counts games the owner did not play instead of mixing them in", async () => {
    await db.games.bulkAdd([record("white"), record("black"), record(null), record(null)]);

    const source = await loadStatisticsSource();

    expect(source.games).toHaveLength(2);
    expect(source.unattributed).toBe(2);
  });

  it("is empty for an empty database", async () => {
    expect(await loadStatisticsSource()).toEqual({ games: [], unattributed: 0, analyses: new Map() });
  });
});
