import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence/db";
import { deleteGame, findGamesByPosition } from "@/persistence/repositories/game-repository";
import { positionKeyFromFen } from "@/core/chess/position-key";
import { importPgn } from "./import-games";

const GAME_A = '[Event "A"]\n[White "One"]\n[Black "Two"]\n[Result "1-0"]\n\n1. e4 e5 1-0';
const GAME_B = '[Event "B"]\n[White "Three"]\n[Black "Four"]\n[Result "0-1"]\n\n1. d4 d5 0-1';

const START_KEY = positionKeyFromFen(
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
);

beforeEach(async () => {
  await db.open();
  await Promise.all([db.games.clear(), db.positions.clear(), db.gamePositions.clear()]);
});

describe("importPgn", () => {
  it("imports every game in a multi-game file", async () => {
    const result = await importPgn(`${GAME_A}\n\n${GAME_B}`, { ownerNames: [] });

    expect(result).toMatchObject({ total: 2, imported: 2, duplicates: 0 });
    expect(result.failures).toEqual([]);
    expect(await db.games.count()).toBe(2);
  });

  it("stores each game's positions including the starting position", async () => {
    await importPgn(GAME_A, { ownerNames: [] });

    // Two moves, so three positions: start, after 1.e4, after 1...e5.
    expect(await db.gamePositions.count()).toBe(3);
  });

  it("stores shared positions once across games", async () => {
    // Both games begin from the starting position; deduplication is the point
    // of the position table.
    await importPgn(`${GAME_A}\n\n${GAME_B}`, { ownerNames: [] });

    const startRows = await db.positions.where("key").equals(START_KEY).count();
    expect(startRows).toBe(1);

    const occurrences = await db.gamePositions.where("key").equals(START_KEY).toArray();
    expect(occurrences).toHaveLength(2);
  });

  describe("resilience", () => {
    it("skips a malformed game and imports the rest", async () => {
      // A collection built over years commonly holds a few damaged games. An
      // all-or-nothing import would make the whole file unusable.
      const broken = '[Event "Broken"]\n\n1. e4 e5 2. Kd8 *';
      const result = await importPgn(`${GAME_A}\n\n${broken}\n\n${GAME_B}`, {
        ownerNames: [],
      });

      expect(result.imported).toBe(2);
      expect(result.failures).toHaveLength(1);
      expect(await db.games.count()).toBe(2);
    });

    it("reports where the failure occurred", async () => {
      const broken = '[Event "Broken"]\n\n1. e4 e5 2. Kd8 *';
      const result = await importPgn(`${GAME_A}\n\n${broken}`, { ownerNames: [] });

      expect(result.failures[0].gameNumber).toBe(2);
      expect(result.failures[0].excerpt).toContain("Broken");
    });
  });

  describe("duplicate handling", () => {
    it("does not import the same file twice", async () => {
      await importPgn(GAME_A, { ownerNames: [] });
      const second = await importPgn(GAME_A, { ownerNames: [] });

      expect(second).toMatchObject({ imported: 0, duplicates: 1 });
      expect(await db.games.count()).toBe(1);
    });

    it("imports a game appearing twice within one file only once", async () => {
      const result = await importPgn(`${GAME_A}\n\n${GAME_A}`, { ownerNames: [] });

      expect(result).toMatchObject({ imported: 1, duplicates: 1 });
    });

    it("still imports genuinely different games", async () => {
      await importPgn(GAME_A, { ownerNames: [] });
      const second = await importPgn(GAME_B, { ownerNames: [] });

      expect(second.imported).toBe(1);
      expect(await db.games.count()).toBe(2);
    });

    it("preserves annotations on a position when a later import reaches it", async () => {
      // The reason new positions are added rather than upserted: re-importing a
      // collection must never silently erase notes written against a position.
      await importPgn(GAME_A, { ownerNames: [] });
      await db.positions.update(START_KEY, {
        notes: "my analysis",
        tags: ["studied"],
      });

      await importPgn(GAME_B, { ownerNames: [] });

      const position = await db.positions.get(START_KEY);
      expect(position?.notes).toBe("my analysis");
      expect(position?.tags).toEqual(["studied"]);
    });
  });

  it("attributes the owner's colour", async () => {
    await importPgn(GAME_A, { ownerNames: ["One"] });
    const game = await db.games.toCollection().first();
    expect(game?.playerColor).toBe("white");
  });

  it("reports progress while working through a file", async () => {
    const file = Array.from({ length: 5 }, (_, i) =>
      GAME_A.replace('"One"', `"Player ${i}"`),
    ).join("\n\n");

    const updates: number[] = [];
    await importPgn(file, {
      ownerNames: [],
      batchSize: 2,
      onProgress: ({ processed }) => updates.push(processed),
    });

    expect(updates).toEqual([2, 4, 5]);
  });

  it("handles an empty file without error", async () => {
    const result = await importPgn("", { ownerNames: [] });
    expect(result).toMatchObject({ total: 0, imported: 0 });
  });
});

describe("findGamesByPosition", () => {
  it("finds every game that reached a position", async () => {
    await importPgn(`${GAME_A}\n\n${GAME_B}`, { ownerNames: [] });

    const games = await findGamesByPosition(START_KEY);
    expect(games).toHaveLength(2);
  });
});

describe("deleteGame", () => {
  it("removes the game and its position occurrences", async () => {
    await importPgn(GAME_A, { ownerNames: [] });
    const game = await db.games.toCollection().first();

    await deleteGame(game!.id!);

    expect(await db.games.count()).toBe(0);
    expect(await db.gamePositions.count()).toBe(0);
  });

  it("keeps unique positions and their annotations", async () => {
    // Notes and future engine evaluations attached to a position stay valid
    // after the game that introduced it is gone.
    await importPgn(GAME_A, { ownerNames: [] });
    const game = await db.games.toCollection().first();

    await deleteGame(game!.id!);

    expect(await db.positions.count()).toBeGreaterThan(0);
  });

  it("leaves other games untouched", async () => {
    await importPgn(`${GAME_A}\n\n${GAME_B}`, { ownerNames: [] });
    const first = await db.games.toCollection().first();

    await deleteGame(first!.id!);

    expect(await db.games.count()).toBe(1);
    expect(await db.gamePositions.where("gameId").equals(first!.id!).count()).toBe(0);
    expect(await db.gamePositions.count()).toBeGreaterThan(0);
  });
});
