import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { ChessVaultDatabase } from "./db";

/**
 * Migrations are the one piece of persistence code that cannot be re-run if it
 * is wrong: it rewrites data in place, on a database the developer never sees.
 * These tests build a genuine version 1 database, then open it with the current
 * schema and assert the upgrade moved everything intact.
 */

/** The version 1 schema, reproduced verbatim as it shipped. */
function openLegacyDatabase(name: string) {
  const legacy = new Dexie(name);

  legacy.version(1).stores({
    games: [
      "++id",
      "contentHash",
      "importedAt",
      "dateIso",
      "eco",
      "opening",
      "result",
      "playerColor",
      "white",
      "black",
      "event",
      "timeControl",
      "*tags",
      "*searchTokens",
      "[playerColor+result]",
    ].join(", "),
    positions: "key, firstSeenAt, sideToMove, *tags",
    gamePositions: "[gameId+ply], gameId, key",
  });

  return legacy;
}

function legacyGame(index: number) {
  return {
    pgn: `[Event "Round ${index}"]\n[White "Player ${index}"]\n\n1. e4 e5 1-0`,
    contentHash: `hash-${index}`,
    headers: { Event: `Round ${index}`, White: `Player ${index}` },
    white: `Player ${index}`,
    black: "Opponent",
    result: "1-0",
    dateIso: "2024-03-15",
    event: `Round ${index}`,
    site: null,
    round: null,
    eco: "C20",
    opening: null,
    timeControl: null,
    playerColor: "white",
    tags: ["reviewed"],
    notes: `note ${index}`,
    plyCount: 2,
    finalFen: "8/8/8/8/8/8/8/8 w - - 0 1",
    searchTokens: [`player`, `${index}`],
    importedAt: 1_700_000_000_000 + index,
    updatedAt: 1_700_000_000_000 + index,
  };
}

/** Seed a version 1 database and close it, leaving it on disk to be upgraded. */
async function seedLegacyDatabase(name: string, gameCount: number) {
  const legacy = openLegacyDatabase(name);
  await legacy.open();

  await legacy
    .table("games")
    .bulkAdd(Array.from({ length: gameCount }, (_, index) => legacyGame(index)));

  legacy.close();
}

let counter = 0;
/** Each test needs its own database: migrations are one-way. */
const uniqueName = () => `chessvault-migration-test-${counter++}`;

describe("version 1 to 2", () => {
  it("moves PGN text and headers into the companion table", async () => {
    const name = uniqueName();
    await seedLegacyDatabase(name, 3);

    const db = new ChessVaultDatabase(name);
    await db.open();

    expect(await db.gameContents.count()).toBe(3);

    const content = await db.gameContents.get(1);
    expect(content?.pgn).toContain("Round 0");
    expect(content?.headers.White).toBe("Player 0");

    db.close();
  });

  it("strips the moved fields from the metadata record", async () => {
    // If the text stayed behind, the split would cost storage without
    // delivering the cheaper filtering it exists for.
    const name = uniqueName();
    await seedLegacyDatabase(name, 1);

    const db = new ChessVaultDatabase(name);
    await db.open();

    const game = await db.games.get(1);
    expect(game).not.toHaveProperty("pgn");
    expect(game).not.toHaveProperty("headers");

    db.close();
  });

  it("preserves every other field", async () => {
    // A migration that quietly drops notes or tags destroys work the user
    // cannot recover.
    const name = uniqueName();
    await seedLegacyDatabase(name, 1);

    const db = new ChessVaultDatabase(name);
    await db.open();

    const game = await db.games.get(1);
    expect(game).toMatchObject({
      contentHash: "hash-0",
      white: "Player 0",
      result: "1-0",
      dateIso: "2024-03-15",
      eco: "C20",
      playerColor: "white",
      tags: ["reviewed"],
      notes: "note 0",
      plyCount: 2,
    });

    db.close();
  });

  it("replaces null dates with an empty string", async () => {
    // IndexedDB does not index null, so a game left with one would drop out of
    // the date index and become invisible when browsing by date.
    const name = uniqueName();
    const legacy = openLegacyDatabase(name);
    await legacy.open();
    await legacy.table("games").add({ ...legacyGame(0), dateIso: null });
    legacy.close();

    const db = new ChessVaultDatabase(name);
    await db.open();

    expect((await db.games.get(1))?.dateIso).toBe("");

    // The decisive assertion: the game is reachable through the date index.
    const viaIndex = await db.games.orderBy("dateIso").primaryKeys();
    expect(viaIndex).toContain(1);

    db.close();
  });

  it("keeps indexes usable after the rewrite", async () => {
    const name = uniqueName();
    await seedLegacyDatabase(name, 3);

    const db = new ChessVaultDatabase(name);
    await db.open();

    expect(await db.games.where("eco").equals("C20").count()).toBe(3);
    expect(await db.games.where("tags").equals("reviewed").count()).toBe(3);
    expect(await db.games.where("contentHash").equals("hash-1").count()).toBe(1);

    db.close();
  });

  it(
    "migrates a collection larger than one chunk",
    // Generous timeout: rewriting indexed rows is roughly twenty times slower
    // under fake-indexeddb than under a real implementation, measured at about
    // 250ms per thousand games in a browser against six seconds here. The cost
    // is a property of the test double, not of the migration.
    { timeout: 30_000 },
    async () => {
      // The upgrade pages through the table rather than reading it into memory,
      // so the paging needs exercising past a chunk boundary.
      const name = uniqueName();
      await seedLegacyDatabase(name, 600);

      const db = new ChessVaultDatabase(name);
      await db.open();

      expect(await db.games.count()).toBe(600);
      expect(await db.gameContents.count()).toBe(600);

      // Spot-check either side of the boundary rather than only the first row.
      for (const id of [1, 500, 501, 600]) {
        const content = await db.gameContents.get(id);
        expect(content?.pgn).toContain(`Round ${id - 1}`);
      }

      db.close();
    },
  );

  it("opens an empty database without error", async () => {
    const name = uniqueName();
    await seedLegacyDatabase(name, 0);

    const db = new ChessVaultDatabase(name);
    await db.open();

    expect(await db.gameContents.count()).toBe(0);

    db.close();
  });
});

describe("fresh installation", () => {
  it("creates every table directly without running any upgrade", async () => {
    const db = new ChessVaultDatabase(uniqueName());
    await db.open();

    expect(await db.games.count()).toBe(0);
    expect(await db.gameContents.count()).toBe(0);
    expect(await db.evaluations.count()).toBe(0);

    db.close();
  });
});

describe("upgrading across several versions at once", () => {
  it("brings a version 1 database fully up to date", async () => {
    // A user returning after several releases upgrades through every version
    // in one open, which is the path least likely to be exercised by hand.
    const name = uniqueName();
    await seedLegacyDatabase(name, 2);

    const db = new ChessVaultDatabase(name);
    await db.open();

    expect(await db.gameContents.count()).toBe(2);
    expect(await db.evaluations.count()).toBe(0);
    expect((await db.games.get(1))).not.toHaveProperty("pgn");

    db.close();
  });
});
