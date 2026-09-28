import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { db } from "./db";
import { upgradeRows } from "./schema-upgrade";

/**
 * A game as schema version 1 stored it: text and headers inline, and a missing
 * date as null. Versions 2 and 4 both rewrite this shape, so restoring it
 * proves the upgrade functions really ran rather than the rows being copied.
 */
function versionOneGame() {
  return {
    id: 7,
    pgn: '[White "Dony, Lukas"]\n[Black "Barth, Horst"]\n\n1. e4 e5 1-0',
    headers: { White: "Dony, Lukas", Black: "Barth, Horst", WhiteElo: "1518", BlackElo: "1244" },
    contentHash: "hash-7",
    white: "Dony, Lukas",
    black: "Barth, Horst",
    result: "1-0",
    dateIso: null,
    event: null,
    site: null,
    round: null,
    eco: null,
    opening: null,
    timeControl: null,
    playerColor: "white",
    tags: [],
    notes: "kept",
    plyCount: 2,
    finalFen: "8/8/8/8/8/8/8/8 w - - 0 1",
    searchTokens: [],
    importedAt: 1,
    updatedAt: 1,
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("upgradeRows", () => {
  it("runs the upgrades between the snapshot's version and today's", async () => {
    const upgraded = await upgradeRows(
      { games: [versionOneGame()], positions: [], gamePositions: [] },
      1,
    );

    const [game] = upgraded.games as Record<string, unknown>[];

    // Version 2 moved the text out of the game record…
    expect(game.pgn).toBeUndefined();
    expect(upgraded.gameContents).toEqual([
      expect.objectContaining({ gameId: 7, pgn: expect.stringContaining("1. e4 e5") }),
    ]);
    // …and replaced a missing date, which IndexedDB cannot index, with "".
    expect(game.dateIso).toBe("");

    // Version 4 derived the ratings and the opponent from the headers.
    expect(game).toMatchObject({
      whiteElo: 1518,
      blackElo: 1244,
      opponent: "Barth, Horst",
      opponentElo: 1244,
    });

    // What no upgrade touches arrives unchanged.
    expect(game.notes).toBe("kept");
  });

  it("returns every current table, including ones the old version lacked", async () => {
    const upgraded = await upgradeRows({ games: [], positions: [], gamePositions: [] }, 1);

    expect(Object.keys(upgraded).sort()).toEqual(db.tables.map((t) => t.name).sort());
    expect(upgraded.repertoireMoves).toEqual([]);
  });

  it("passes rows from the current version through untouched", async () => {
    const evaluation = { key: "k", depth: 16, lines: [], engine: "sf", evaluatedAt: 1 };

    const upgraded = await upgradeRows({ evaluations: [evaluation] }, db.verno);

    expect(upgraded.evaluations).toEqual([evaluation]);
  });

  it("never touches the live database", async () => {
    await db.games.add({ ...versionOneGame(), id: 99, dateIso: "2024-01-01" } as never);

    await upgradeRows({ games: [versionOneGame()], positions: [], gamePositions: [] }, 1);

    expect(await db.games.count()).toBe(1);
    expect((await db.games.get(99))?.contentHash).toBe("hash-7");
  });

  it("leaves no staging database behind", async () => {
    await upgradeRows({ games: [versionOneGame()], positions: [], gamePositions: [] }, 1);

    const names = await Dexie.getDatabaseNames();
    expect(names.filter((name) => name.startsWith("chessvault-upgrade-"))).toEqual([]);
  });
});
