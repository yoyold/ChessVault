import { downloadFile } from "@/lib/download";
import { isEncrypted } from "./crypto";
import {
  assertRestorable,
  createSnapshot,
  restoreSnapshot,
  type Snapshot,
} from "./snapshot";
import { loadSyncConfig } from "./sync-config";

/**
 * A backup is the same snapshot the sync writes, saved as a file instead.
 *
 * One format for both is deliberate: a backup restores through exactly the code
 * a sync restore takes, so neither can drift into writing something the other
 * cannot read. The file is plain JSON rather than encrypted — it stays on the
 * owner's own disk, and a backup that cannot be opened because a passphrase was
 * forgotten is not a backup. It never contains the GitHub token, which lives
 * under its own storage key for that reason.
 */

const LAST_BACKUP_KEY = "chessvault.backup.lastAt";

/** Raised when a file cannot be restored, with a message fit to show. */
export class BackupFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupFileError";
  }
}

/** What a backup holds, for the confirmation shown before it replaces anything. */
export interface BackupSummary {
  games: number;
  evaluations: number;
  repertoireMoves: number;
  createdAt: number;
  device: string;
}

export function summariseSnapshot(snapshot: Snapshot): BackupSummary {
  return {
    games: snapshot.data.games.length,
    evaluations: snapshot.data.evaluations.length,
    repertoireMoves: snapshot.data.repertoireMoves.length,
    createdAt: snapshot.createdAt,
    device: snapshot.device,
  };
}

/** Named by date, so a folder of backups sorts itself in the order they were made. */
export function backupFilename(date: Date = new Date()): string {
  return `chessvault-backup-${date.toISOString().slice(0, 10)}.json`;
}

/**
 * When this device last wrote a backup, or null if it never has.
 *
 * Per device and kept out of the settings on purpose: settings travel inside
 * snapshots, and a date copied over from another machine would claim a backup
 * this one never made.
 */
export function getLastBackupAt(): number | null {
  if (typeof window === "undefined") return null;

  try {
    const value = Number(window.localStorage.getItem(LAST_BACKUP_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Write the whole database to a file the browser downloads. */
export async function downloadBackup(): Promise<BackupSummary> {
  const snapshot = await createSnapshot(loadSyncConfig().device || "Backup file");

  downloadFile([JSON.stringify(snapshot)], backupFilename(), "application/json");

  try {
    window.localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  } catch {
    // Recording the date is a convenience; the file is already written.
  }

  return summariseSnapshot(snapshot);
}

/**
 * Read and validate a backup file without touching the database.
 *
 * Kept apart from restoring so the caller can show what the file holds and ask
 * before anything is replaced. Every way a file can be unusable is reported
 * here, while nothing has been changed yet.
 *
 * @throws BackupFileError or SnapshotError, each with a message fit to show.
 */
export function parseBackup(text: string): Snapshot {
  if (isEncrypted(text)) {
    throw new BackupFileError(
      "This is an encrypted sync snapshot, not a backup file. Restore it with “Restore from cloud”, which asks for its passphrase.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupFileError("This file is not a ChessVault backup.");
  }

  assertRestorable(parsed);
  return parsed;
}

/**
 * Replace the database with a backup.
 *
 * All or nothing, as every restore is: the tables are rewritten in a single
 * transaction, so a failure part-way leaves the database exactly as it was.
 */
export async function restoreBackup(snapshot: Snapshot): Promise<void> {
  await restoreSnapshot(snapshot);
}
