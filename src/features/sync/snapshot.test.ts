import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence/db";
import { getSettings, resetSettingsCache, saveSettings } from "@/lib/settings";
import { importPgn } from "@/features/games/import/import-games";
import { saveEvaluation } from "@/persistence/repositories/evaluation-repository";
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
      data: { games: [], gameContents: [], positions: [], gamePositions: [], evaluations: [] },
      settings: { playerNames: [] },
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

  it("rejects a different schema version", () => {
    // Imported records are not migrated, so cross-version restore is unsafe.
    expect(() => assertRestorable({ ...validSnapshot(), schemaVersion: db.verno + 1 })).toThrow(
      /different app version/,
    );
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
