import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import type { GameRecord } from "@/core/domain/game";
import { positionKeyFromFen } from "@/core/chess/position-key";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function makeGame(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    contentHash: "0000000000000001",
    white: "Carlsen, Magnus",
    black: "Nepomniachtchi, Ian",
    result: "1-0",
    dateIso: "2024-03-15",
    event: "Club",
    site: null,
    round: null,
    eco: "C20",
    opening: "King's Pawn Game",
    timeControl: "300+3",
    playerColor: "white",
    tags: ["sharp", "must-review"],
    notes: "",
    plyCount: 2,
    finalFen: START_FEN,
    searchTokens: ["carlsen", "magnus", "nepomniachtchi", "ian", "club"],
    importedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.games.clear(),
    db.gameContents.clear(),
    db.positions.clear(),
    db.gamePositions.clear(),
  ]);
});

describe("schema", () => {
  it("opens at the current version with the expected tables", async () => {
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      "gameContents",
      "gamePositions",
      "games",
      "positions",
    ]);
  });
});

describe("games indexes", () => {
  it("queries by a single-value index", async () => {
    await db.games.bulkAdd([makeGame(), makeGame({ eco: "B12" })]);
    expect(await db.games.where("eco").equals("C20").count()).toBe(1);
  });

  it("queries tags through the multi-entry index", async () => {
    await db.games.bulkAdd([
      makeGame({ tags: ["sharp"] }),
      makeGame({ tags: ["endgame"] }),
      makeGame({ tags: ["sharp", "endgame"] }),
    ]);

    // Multi-entry indexes each array element separately, so a game matches if
    // any of its tags matches — without this the query would need a full scan.
    expect(await db.games.where("tags").equals("sharp").count()).toBe(2);
  });

  it("supports prefix search over the token index", async () => {
    await db.games.bulkAdd([makeGame(), makeGame({ searchTokens: ["firouzja"] })]);

    const hits = await db.games.where("searchTokens").startsWith("carl").toArray();
    expect(hits).toHaveLength(1);
    expect(hits[0].white).toBe("Carlsen, Magnus");
  });

  it("queries the compound colour+result index used by win-rate statistics", async () => {
    await db.games.bulkAdd([
      makeGame({ playerColor: "white", result: "1-0" }),
      makeGame({ playerColor: "white", result: "0-1" }),
      makeGame({ playerColor: "black", result: "1-0" }),
    ]);

    const wins = await db.games
      .where("[playerColor+result]")
      .equals(["white", "1-0"])
      .count();
    expect(wins).toBe(1);
  });
});

describe("position deduplication", () => {
  it("stores one row per unique position regardless of how many games reach it", async () => {
    const key = positionKeyFromFen(START_FEN);
    const record = {
      key,
      sideToMove: "w" as const,
      notes: "",
      tags: [],
      firstSeenAt: 1,
    };

    // Two separate imports reaching the same position.
    await db.positions.put(record);
    await db.positions.put({ ...record, firstSeenAt: 2 });

    expect(await db.positions.count()).toBe(1);
  });

  it("finds every game that reached a position via the key index", async () => {
    const key = positionKeyFromFen(START_FEN);
    await db.gamePositions.bulkAdd([
      { gameId: 1, ply: 0, key, san: null },
      { gameId: 2, ply: 0, key, san: null },
      { gameId: 2, ply: 1, key, san: "e4" },
    ]);

    const occurrences = await db.gamePositions.where("key").equals(key).toArray();
    expect(new Set(occurrences.map((o) => o.gameId))).toEqual(new Set([1, 2]));
  });
});

describe("gamePositions compound primary key", () => {
  it("treats [gameId+ply] as the identity, so re-import replaces rather than duplicates", async () => {
    const key = positionKeyFromFen(START_FEN);
    await db.gamePositions.put({ gameId: 1, ply: 0, key, san: null });
    await db.gamePositions.put({ gameId: 1, ply: 0, key, san: "corrected" });

    expect(await db.gamePositions.count()).toBe(1);
    expect((await db.gamePositions.get([1, 0]))?.san).toBe("corrected");
  });

  it("deletes all rows of one game without touching another", async () => {
    const key = positionKeyFromFen(START_FEN);
    await db.gamePositions.bulkAdd([
      { gameId: 1, ply: 0, key, san: null },
      { gameId: 1, ply: 1, key, san: "e4" },
      { gameId: 2, ply: 0, key, san: null },
    ]);

    await db.gamePositions.where("gameId").equals(1).delete();

    expect(await db.gamePositions.count()).toBe(1);
    expect((await db.gamePositions.toArray())[0].gameId).toBe(2);
  });
});
