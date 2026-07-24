import type {
  GameContentRecord,
  GamePositionRecord,
  GameRecord,
} from "@/core/domain/game";
import type { PositionRecord } from "@/core/domain/position";
import type { EvaluationRecord } from "@/core/domain/evaluation";
import { db } from "@/persistence/db";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";

/**
 * Snapshot layout version.
 *
 * Independent of the database schema version: this describes the shape of the
 * envelope, so a future change to how a snapshot is packaged can be detected
 * even when the tables inside are unchanged. A snapshot from a newer format is
 * refused rather than misread.
 */
export const SNAPSHOT_FORMAT = 1;

/**
 * A complete, portable copy of everything the app stores.
 *
 * This is the unit of both backup (write to a file) and sync (write to the
 * user's own cloud storage). It carries the whole database, not a diff, because
 * whole-snapshot last-writer-wins avoids record-level merge — and merge would
 * mean stable cross-device ids, which the auto-increment `games` key is not.
 */
export interface Snapshot {
  format: number;
  /** `db.verno` when the snapshot was written, so a mismatched restore is caught. */
  schemaVersion: number;
  createdAt: number;
  /** Human label of the device that wrote it, for the conflict prompt. */
  device: string;
  data: {
    games: GameRecord[];
    gameContents: GameContentRecord[];
    positions: PositionRecord[];
    gamePositions: GamePositionRecord[];
    evaluations: EvaluationRecord[];
  };
  settings: AppSettings;
}

/** Read the entire database and settings into a portable snapshot. */
export async function createSnapshot(device: string): Promise<Snapshot> {
  const [games, gameContents, positions, gamePositions, evaluations] =
    await db.transaction(
      "r",
      [db.games, db.gameContents, db.positions, db.gamePositions, db.evaluations],
      () =>
        Promise.all([
          db.games.toArray(),
          db.gameContents.toArray(),
          db.positions.toArray(),
          db.gamePositions.toArray(),
          db.evaluations.toArray(),
        ]),
    );

  return {
    format: SNAPSHOT_FORMAT,
    schemaVersion: db.verno,
    createdAt: Date.now(),
    device,
    data: { games, gameContents, positions, gamePositions, evaluations },
    settings: getSettings(),
  };
}

/** Raised when a snapshot cannot be restored, so the caller can explain why. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

/**
 * Validate that an unknown value is a snapshot this build can restore.
 *
 * Restoring wipes the database, so a malformed or incompatible snapshot must be
 * rejected before anything is touched — a half-applied restore is worse than a
 * refused one.
 *
 * @throws SnapshotError with a message suitable for showing the user.
 */
export function assertRestorable(value: unknown): asserts value is Snapshot {
  if (typeof value !== "object" || value === null) {
    throw new SnapshotError("This file is not a ChessVault snapshot.");
  }

  const snapshot = value as Partial<Snapshot>;

  if (snapshot.format === undefined || snapshot.format > SNAPSHOT_FORMAT) {
    throw new SnapshotError(
      "This snapshot was written by a newer version of ChessVault and cannot be read here.",
    );
  }

  if (snapshot.schemaVersion !== db.verno) {
    // Records are stored in their raw shape, and Dexie's migrations run on the
    // live database rather than on imported arrays, so a snapshot from a
    // different schema version cannot be safely written in. Both devices on the
    // same deployed build match; a mismatch means one needs updating first.
    throw new SnapshotError(
      `This snapshot is from a different app version (schema ${snapshot.schemaVersion ?? "unknown"}, this app uses ${db.verno}). Update both devices to the same version first.`,
    );
  }

  if (typeof snapshot.data !== "object" || snapshot.data === null) {
    throw new SnapshotError("This snapshot is missing its data.");
  }

  const tables: (keyof Snapshot["data"])[] = [
    "games",
    "gameContents",
    "positions",
    "gamePositions",
    "evaluations",
  ];
  for (const table of tables) {
    if (!Array.isArray(snapshot.data[table])) {
      throw new SnapshotError(`This snapshot is missing its ${table}.`);
    }
  }
}

/**
 * Replace the entire database and settings with a snapshot.
 *
 * All tables are cleared and rewritten inside one transaction, so the database
 * is never left half-replaced: either the whole snapshot lands or none of it
 * does. Settings are applied only after the transaction commits, so a failed
 * restore does not change them either.
 *
 * @throws SnapshotError if the snapshot is not restorable.
 */
export async function restoreSnapshot(value: unknown): Promise<void> {
  assertRestorable(value);
  const snapshot = value;

  await db.transaction(
    "rw",
    [db.games, db.gameContents, db.positions, db.gamePositions, db.evaluations],
    async () => {
      await Promise.all([
        db.games.clear(),
        db.gameContents.clear(),
        db.positions.clear(),
        db.gamePositions.clear(),
        db.evaluations.clear(),
      ]);

      await Promise.all([
        db.games.bulkAdd(snapshot.data.games),
        db.gameContents.bulkAdd(snapshot.data.gameContents),
        db.positions.bulkAdd(snapshot.data.positions),
        db.gamePositions.bulkAdd(snapshot.data.gamePositions),
        db.evaluations.bulkAdd(snapshot.data.evaluations),
      ]);
    },
  );

  saveSettings(snapshot.settings);
}
