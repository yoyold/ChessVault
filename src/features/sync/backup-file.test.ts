import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/persistence/db";
import { resetSettingsCache, saveSettings } from "@/lib/settings";
import { importPgn } from "@/features/games/import/import-games";
import { addRepertoireMove } from "@/persistence/repositories/repertoire-repository";
import { encrypt } from "./crypto";
import { SnapshotError } from "./snapshot";
import {
  BackupFileError,
  backupFilename,
  downloadBackup,
  getLastBackupAt,
  parseBackup,
  restoreBackup,
} from "./backup-file";

// The browser's download machinery is replaced with a recorder, so a test can
// read back exactly the file a user would have saved.
const written: { parts: BlobPart[]; filename: string; type: string }[] = [];
vi.mock("@/lib/download", () => ({
  downloadFile: (parts: BlobPart[], filename: string, type: string) => {
    written.push({ parts, filename, type });
  },
}));

const GAMES =
  '[Event "A"]\n[White "Dony, Lukas"]\n[Black "Opp"]\n[Result "1-0"]\n\n1.e4 e5 1-0\n\n' +
  '[Event "B"]\n[White "X"]\n[Black "Y"]\n[Result "0-1"]\n\n1.d4 d5 0-1';

async function clearAll() {
  await Promise.all(db.tables.map((table) => table.clear()));
}

/** The text of the last file written, as a user would find it on disk. */
function lastFileText(): string {
  return written[written.length - 1].parts.join("");
}

beforeEach(async () => {
  written.length = 0;
  await db.open();
  await clearAll();
  window.localStorage.clear();
  resetSettingsCache();
});

describe("downloadBackup and restoreBackup", () => {
  it("brings back everything after the database is lost", async () => {
    await importPgn(GAMES, { ownerNames: ["Dony, Lukas"] });
    await addRepertoireMove({
      color: "white",
      fromFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      san: "e4",
    });
    saveSettings({ playerNames: ["Dony, Lukas"] });

    const summary = await downloadBackup();
    expect(summary).toMatchObject({ games: 2, repertoireMoves: 1 });

    // What the backup exists for: the browser clears the site's data.
    await clearAll();
    window.localStorage.clear();
    resetSettingsCache();

    await restoreBackup(parseBackup(lastFileText()));

    expect(await db.games.count()).toBe(2);
    expect(await db.gameContents.count()).toBe(2);
    expect(await db.repertoireMoves.count()).toBe(1);
  });

  it("writes a dated JSON file", async () => {
    await downloadBackup();

    expect(written[0].type).toBe("application/json");
    expect(written[0].filename).toMatch(/^chessvault-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("remembers when this device last made one", async () => {
    expect(getLastBackupAt()).toBeNull();

    const before = Date.now();
    await downloadBackup();

    expect(getLastBackupAt()).toBeGreaterThanOrEqual(before);
  });
});

describe("parseBackup", () => {
  it("names an encrypted sync snapshot for what it is", async () => {
    // Someone who downloads the snapshot from their repository and tries it
    // here should be told where it does restore, not just that it failed.
    const encrypted = await encrypt('{"format":1}', "passphrase");

    expect(() => parseBackup(encrypted)).toThrow(BackupFileError);
    expect(() => parseBackup(encrypted)).toThrow(/encrypted sync snapshot/);
  });

  it("rejects a file that is not JSON", () => {
    expect(() => parseBackup("[Event \"a PGN, not a backup\"]")).toThrow(
      /not a ChessVault backup/,
    );
  });

  it("rejects JSON that is not a snapshot", () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow(SnapshotError);
  });

  it("changes nothing when it refuses a file", async () => {
    await importPgn(GAMES, { ownerNames: [] });

    expect(() => parseBackup("garbage")).toThrow();

    expect(await db.games.count()).toBe(2);
  });
});

describe("backupFilename", () => {
  it("stamps the day it was made", () => {
    expect(backupFilename(new Date("2026-09-28T10:00:00Z"))).toBe(
      "chessvault-backup-2026-09-28.json",
    );
  });
});
