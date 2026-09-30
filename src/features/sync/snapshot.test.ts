import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence/db";
import { getSettings, resetSettingsCache, saveSettings } from "@/lib/settings";
import { importPgn } from "@/features/games/import/import-games";
import { saveEvaluation } from "@/persistence/repositories/evaluation-repository";
import { addRepertoireMove } from "@/persistence/repositories/repertoire-repository";
import { positionKeyFromFen } from "@/core/chess/position-key";
import {
  assertRestorable,
  createSnapshot,
  restoreSnapshot,
  SNAPSHOT_FORMAT,
  SnapshotError,
  type Snapshot,
} from "./snapshot";

const GAME_A =
  '[Event "A"]\n[White "Dony, Lukas"]\n[Black "Opp"]\n[Result "1-0"]\n\n1.e4 e5 1-0';
const GAME_B = '[Event "B"]\n[White "X"]\n[Black "Y"]\n[Result "0-1"]\n\n1.d4 d5 0-1';

const START_KEY = positionKeyFromFen(
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
);

async function clearAll() {
  await Promise.all([
    db.games.clear(),
    db.gameContents.clear(),
    db.positions.clear(),
    db.gamePositions.clear(),
    db.evaluations.clear(),
    db.repertoireMoves.clear(),
  ]);
}

beforeEach(async () => {
  await db.open();
  await clearAll();
  window.localStorage.clear();
  resetSettingsCache();
});

/** Seed a representative database: two games, an evaluation, and settings. */
async function seed() {
  await importPgn(`${GAME_A}\n\n${GAME_B}`, { ownerNames: ["Dony, Lukas"] });
  await saveEvaluation(START_KEY, {
    depth: 20,
    engine: "Test",
    lines: [{ multiPv: 1, depth: 20, score: { type: "cp", value: 30 }, moves: ["e2e4"] }],
  });
  await addRepertoireMove({
    color: "white",
    fromFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    san: "e4",
    note: "my main line",
  });
  saveSettings({ playerNames: ["Dony, Lukas"] });
}

describe("createSnapshot", () => {
  it("captures every table and the settings", async () => {
    await seed();
    const snapshot = await createSnapshot("Laptop");

    expect(snapshot.format).toBe(SNAPSHOT_FORMAT);
    expect(snapshot.schemaVersion).toBe(db.verno);
    expect(snapshot.device).toBe("Laptop");
    expect(snapshot.data.games).toHaveLength(2);
    expect(snapshot.data.gameContents).toHaveLength(2);
    expect(snapshot.data.evaluations).toHaveLength(1);
    expect(snapshot.data.positions.length).toBeGreaterThan(0);
    expect(snapshot.settings.playerNames).toEqual(["Dony, Lukas"]);
  });

  it("produces a snapshot that serialises to JSON", async () => {
    // The transport writes it as a file or an API body, so it must survive a
    // JSON round trip with nothing lost.
    await seed();
    const snapshot = await createSnapshot("Laptop");

    const roundTripped = JSON.parse(JSON.stringify(snapshot));
    expect(roundTripped).toEqual(snapshot);
  });
});

describe("restore round trip", () => {
  it("reproduces the database exactly", async () => {
    await seed();
    const snapshot = await createSnapshot("Laptop");

    await clearAll();
    window.localStorage.clear();
    resetSettingsCache();

    await restoreSnapshot(snapshot);

    expect(await db.games.count()).toBe(2);
    expect(await db.gameContents.count()).toBe(2);
    expect(await db.evaluations.count()).toBe(1);
    expect(getSettings().playerNames).toEqual(["Dony, Lukas"]);
  });

  it("replaces existing data rather than merging into it", async () => {
    // A restore is "make this device look like the snapshot", not "add to what
    // is here"; leftover games would be a silent corruption.
    const snapshot = await createSnapshot("Empty");

    await seed();
    expect(await db.games.count()).toBe(2);

    await restoreSnapshot(snapshot);
    expect(await db.games.count()).toBe(0);
  });

  it("carries the repertoire, which a device would otherwise silently lose", async () => {
    // A table added to the schema but forgotten here would vanish on the next
    // sync, with nothing to signal it had gone.
    await seed();
    const snapshot = await createSnapshot("Laptop");

    await clearAll();
    await restoreSnapshot(snapshot);

    const moves = await db.repertoireMoves.toArray();
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ san: "e4", note: "my main line" });
  });

  it("preserves the game content, not only the counts", async () => {
    await seed();
    const before = (await db.gameContents.toArray()).map((c) => c.pgn).sort();

    const snapshot = await createSnapshot("Laptop");
    await clearAll();
    await restoreSnapshot(snapshot);

    const after = (await db.gameContents.toArray()).map((c) => c.pgn).sort();
    expect(after).toEqual(before);
  });
});

describe("rejecting incompatible snapshots", () => {
  function validSnapshot(): Snapshot {
    return {
      format: SNAPSHOT_FORMAT,
      schemaVersion: db.verno,
      createdAt: 0,
      device: "d",
      data: {
        games: [],
        gameContents: [],
        positions: [],
        gamePositions: [],
        evaluations: [],
        repertoireMoves: [],
      },
      settings: { playerNames: [], focusMode: false, analysisDepth: 14 },
    };
  }

  it("accepts a well-formed snapshot", () => {
    expect(() => assertRestorable(validSnapshot())).not.toThrow();
  });

  it("rejects a newer format it cannot understand", () => {
    expect(() => assertRestorable({ ...validSnapshot(), format: SNAPSHOT_FORMAT + 1 })).toThrow(
      SnapshotError,
    );
  });

  it("rejects a snapshot from a newer schema", () => {
    // Newer records may carry fields this build does not know, and writing
    // them in would silently drop them.
    expect(() => assertRestorable({ ...validSnapshot(), schemaVersion: db.verno + 1 })).toThrow(
      /newer version/,
    );
  });

  it("accepts a snapshot from an older schema", () => {
    // Refusing these would turn every backup into dead weight at the next
    // schema change; restore carries them forward instead.
    expect(() => assertRestorable({ ...validSnapshot(), schemaVersion: 1 })).not.toThrow();
  });

  it("rejects a snapshot that does not say which version wrote it", () => {
    for (const schemaVersion of [undefined, 0, 2.5, "5"]) {
      expect(() =>
        assertRestorable({ ...validSnapshot(), schemaVersion: schemaVersion as never }),
      ).toThrow(/which app version/);
    }
  });

  it("rejects a non-object", () => {
    expect(() => assertRestorable("not a snapshot")).toThrow(SnapshotError);
    expect(() => assertRestorable(null)).toThrow(SnapshotError);
  });

  it("rejects a snapshot missing a table", () => {
    const broken = validSnapshot();
    // @ts-expect-error deliberately removing a required table
    delete broken.data.evaluations;
    expect(() => assertRestorable(broken)).toThrow(/evaluations/);
  });

  it("does not touch the database when the snapshot is invalid", async () => {
    await seed();
    const before = await db.games.count();

    await expect(restoreSnapshot({ format: 99 })).rejects.toThrow(SnapshotError);

    // A refused restore must leave everything as it was.
    expect(await db.games.count()).toBe(before);
  });
});

describe("restoring across schema versions", () => {
  it("carries an older snapshot forward to the current schema", async () => {
    await clearAll();

    // A game as the first schema stored it: text inline, missing date as null.
    const legacy = {
      format: SNAPSHOT_FORMAT,
      schemaVersion: 1,
      createdAt: 0,
      device: "old laptop",
      data: {
        games: [
          {
            id: 3,
            pgn: '[White "Dony, Lukas"]\n[Black "Opp"]\n\n1. e4 e5 1-0',
            headers: { White: "Dony, Lukas", Black: "Opp", BlackElo: "1400" },
            contentHash: "legacy",
            white: "Dony, Lukas",
            black: "Opp",
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
            notes: "",
            plyCount: 2,
            finalFen: "8/8/8/8/8/8/8/8 w - - 0 1",
            searchTokens: [],
            importedAt: 1,
            updatedAt: 1,
          },
        ],
        gameContents: [],
        positions: [],
        gamePositions: [],
        evaluations: [],
        repertoireMoves: [],
      },
      settings: { playerNames: ["Dony, Lukas"], focusMode: false },
    };

    await restoreSnapshot(legacy);

    const game = await db.games.get(3);
    expect(game?.dateIso).toBe("");
    expect(game?.opponentElo).toBe(1400);
    expect((await db.gameContents.get(3))?.pgn).toContain("1. e4 e5");
  });
});

describe("what a snapshot must never contain", () => {
  it("leaves the GitHub token out", async () => {
    // A backup file travels — attached to a mail, copied to a stick. The token
    // lives under its own storage key precisely so it cannot ride along.
    window.localStorage.setItem(
      "chessvault.sync.config",
      JSON.stringify({ token: "github_pat_SECRET_VALUE", owner: "o", repo: "r" }),
    );

    const json = JSON.stringify(await createSnapshot("device"));

    expect(json).not.toContain("github_pat_SECRET_VALUE");
    window.localStorage.removeItem("chessvault.sync.config");
  });
});
