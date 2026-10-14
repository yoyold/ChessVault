import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence/db";
import { getSettings, resetSettingsCache, saveSettings } from "@/lib/settings";
import { importPgn } from "@/features/games/import/import-games";
import { fakeImportWorker } from "@/features/games/import/fake-import-worker";
import { workerIndexer } from "@/features/games/import/worker-parser";
import {
  getAllNotes,
  saveGameNotes,
  savePositionNote,
} from "@/persistence/repositories/notes-repository";
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
    expect(snapshot.settings.playerNames).toEqual(["Dony, Lukas"]);
  });

  it("leaves out the position index, which the games rebuild", async () => {
    await seed();
    expect(await db.gamePositions.count()).toBeGreaterThan(0);

    const snapshot = await createSnapshot("Laptop");

    expect(snapshot.data).not.toHaveProperty("gamePositions");
    expect(snapshot.data.positions).toEqual([]);
  });

  it("keeps the positions the owner annotated", async () => {
    await seed();
    await db.positions.update(START_KEY, { notes: "Every game starts here", tags: ["start"] });

    const snapshot = await createSnapshot("Laptop");

    expect(snapshot.data.positions).toEqual([
      expect.objectContaining({ key: START_KEY, notes: "Every game starts here", tags: ["start"] }),
    ]);
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

describe("rebuilding the position index on restore", () => {
  /** Everything the index holds, comparable across a restore. */
  async function index() {
    const rows = await db.gamePositions.toArray();
    const keys = (await db.positions.toArray()).map((position) => position.key);
    return {
      rows: rows.map((row) => `${row.gameId}:${row.ply}:${row.key}:${row.san}`).sort(),
      keys: keys.sort(),
    };
  }

  it("rebuilds exactly what the import built", async () => {
    await seed();
    const before = await index();
    const snapshot = await createSnapshot("Laptop");

    await clearAll();
    await restoreSnapshot(JSON.parse(JSON.stringify(snapshot)));

    expect(await index()).toEqual(before);
  });

  it("keeps annotations, even on a position no game reaches any more", async () => {
    await seed();
    const orphan = positionKeyFromFen("8/8/8/4k3/8/8/4K3/8 w - - 0 1");
    await db.positions.put({
      key: orphan,
      sideToMove: "w",
      notes: "Opposition",
      tags: ["endgame"],
      firstSeenAt: 1,
    });
    await db.positions.update(START_KEY, { notes: "Every game starts here" });
    const snapshot = await createSnapshot("Laptop");

    await clearAll();
    await restoreSnapshot(snapshot);

    expect(await db.positions.get(orphan)).toMatchObject({ notes: "Opposition", firstSeenAt: 1 });
    expect(await db.positions.get(START_KEY)).toMatchObject({ notes: "Every game starts here" });
    // The annotated start position is still linked to both games.
    expect(await db.gamePositions.where("key").equals(START_KEY).count()).toBe(2);
  });

  it("brings every note back to the notes page", async () => {
    await seed();
    await savePositionNote(START_KEY, { notes: "Every game starts here", tags: ["start"] }, 10);
    const [game] = await db.games.toArray();
    await saveGameNotes(game.id as number, "Won on time", 20);
    const snapshot = await createSnapshot("Laptop");

    await clearAll();
    await restoreSnapshot(JSON.parse(JSON.stringify(snapshot)));

    const notes = await getAllNotes();
    expect(notes.positions).toEqual([
      expect.objectContaining({ key: START_KEY, notes: "Every game starts here", notedAt: 10 }),
    ]);
    expect(notes.games.map((entry) => entry.game.notes)).toEqual(["Won on time"]);
    expect(notes.repertoire.map((entry) => entry.move.note)).toEqual(["my main line"]);
  });

  it("rebuilds through the worker, and lets it go afterwards", async () => {
    await seed();
    const before = await index();
    const snapshot = await createSnapshot("Laptop");
    const worker = fakeImportWorker();

    await clearAll();
    await restoreSnapshot(snapshot, { indexer: () => workerIndexer(() => worker) });

    expect(await index()).toEqual(before);
    expect(worker.terminated).toBe(true);
  });

  it("changes nothing when the rebuild fails", async () => {
    await seed();
    const snapshot = await createSnapshot("Laptop");
    await clearAll();
    await importPgn(GAME_B, { ownerNames: [] });
    const failing = { index: () => Promise.reject(new Error("No memory")), close() {} };

    await expect(restoreSnapshot(snapshot, { indexer: () => failing })).rejects.toThrow(
      "No memory",
    );

    expect(await db.games.count()).toBe(1);
  });

  it("restores a format 1 snapshot, which carried the index itself", async () => {
    await seed();
    const before = await index();
    const current = await createSnapshot("Laptop");
    const formatOne = {
      ...current,
      format: 1,
      data: {
        ...current.data,
        positions: await db.positions.toArray(),
        gamePositions: await db.gamePositions.toArray(),
      },
    };

    await clearAll();
    // It carries the index, so nothing needs parsing: no indexer is started.
    await restoreSnapshot(formatOne, {
      indexer: () => {
        throw new Error("Not needed for a format 1 snapshot");
      },
    });

    expect(await index()).toEqual(before);
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

  it("requires the position index in a format 1 snapshot", () => {
    const data: Partial<Snapshot["data"]> = { ...validSnapshot().data };
    delete data.gamePositions;
    expect(() => assertRestorable({ ...validSnapshot(), format: 1, data })).toThrow(
      /gamePositions/,
    );
    expect(() => assertRestorable({ ...validSnapshot(), data })).not.toThrow();
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

describe("training progress in snapshots", () => {
  const card = {
    kind: "mistake" as const,
    id: "mistake:k:Nf6",
    fen: "k 0 3",
    positionKey: "k" as never,
    previousUci: null,
    playedSan: "Nf6",
    bestUci: "g7g6",
    bestSan: "g6",
    quality: "blunder" as const,
    scoreBefore: { type: "cp" as const, value: 40 },
    gameId: 1,
    gameLabel: "game",
    dateIso: "2026-01-01",
    moveNumber: 3,
    due: 5,
    interval: 3,
    ease: 2.3,
    streak: 2,
    lapses: 1,
    reviews: 4,
    firstReviewedAt: 1,
    lastReviewedAt: 4,
    createdAt: 1,
  };

  it("carries the review history, which nothing else could rebuild", async () => {
    await clearAll();
    await db.trainingCards.clear();
    await db.trainingCards.add(card);

    const snapshot = JSON.parse(JSON.stringify(await createSnapshot("device")));
    await db.trainingCards.clear();
    await restoreSnapshot(snapshot);

    expect(await db.trainingCards.get(card.id)).toEqual(card);
  });

  it("restores a snapshot from before training existed, with no cards", async () => {
    await db.trainingCards.clear();
    await db.trainingCards.add(card);

    const old = JSON.parse(JSON.stringify(await createSnapshot("device")));
    delete old.data.trainingCards;
    await restoreSnapshot(old);

    expect(await db.trainingCards.count()).toBe(0);
  });

  it("refuses training cards that are not a list", async () => {
    const broken = JSON.parse(JSON.stringify(await createSnapshot("device")));
    broken.data.trainingCards = "oops";

    expect(() => assertRestorable(broken)).toThrow(/training cards/);
  });
});
