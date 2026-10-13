import type {
  GameContentRecord,
  GamePositionRecord,
  GameRecord,
} from "@/core/domain/game";
import type { PositionRecord } from "@/core/domain/position";
import type { EvaluationRecord } from "@/core/domain/evaluation";
import type { RepertoireMove } from "@/core/domain/repertoire";
import type { TrainingCard } from "@/core/domain/training-card";
import { sideToMoveOf } from "@/core/chess/position-key";
import {
  indexerWithFallback,
  inlineIndexer,
  type GameIndexer,
} from "@/features/games/import/batch-parser";
import { workerIndexer } from "@/features/games/import/worker-parser";
import type { Table } from "dexie";
import { db } from "@/persistence/db";
import { upgradeRows } from "@/persistence/schema-upgrade";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";

/**
 * Snapshot layout version.
 *
 * Independent of the database schema version: this describes the shape of the
 * envelope, so a future change to how a snapshot is packaged can be detected
 * even when the tables inside are unchanged. A snapshot from a newer format is
 * refused rather than misread.
 */
export const SNAPSHOT_FORMAT = 2;

/**
 * A complete, portable copy of everything the app stores.
 *
 * This is the unit of both backup (write to a file) and sync (write to the
 * user's own cloud storage). It carries the whole database, not a diff, because
 * whole-snapshot last-writer-wins avoids record-level merge — and merge would
 * mean stable cross-device ids, which the auto-increment `games` key is not.
 *
 * Whole, but not everything stored: what can be rebuilt from the games is
 * left out and rebuilt on restore. The position index — every position of
 * every game — is by far the largest part of the database and entirely
 * derived from the PGN text, so carrying it made backups several times larger
 * than the games they protect, and too large to sync.
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
    /**
     * Positions the owner annotated. The rest are rebuilt from the games.
     *
     * Format 1 carried every position, annotated or not; those restore as
     * they always did.
     */
    positions: PositionRecord[];
    /** Present only in format 1. From format 2 on, rebuilt from the games. */
    gamePositions?: GamePositionRecord[];
    evaluations: EvaluationRecord[];
    repertoireMoves: RepertoireMove[];
    /**
     * Training progress. Absent from snapshots written before training
     * existed, which restore as having no cards rather than being refused.
     */
    trainingCards?: TrainingCard[];
  };
  settings: AppSettings;
}

/** Read the entire database and settings into a portable snapshot. */
export async function createSnapshot(device: string): Promise<Snapshot> {
  const [games, gameContents, positions, evaluations, repertoireMoves, trainingCards] =
    await db.transaction(
      "r",
      [
        db.games,
        db.gameContents,
        db.positions,
        db.evaluations,
        db.repertoireMoves,
        db.trainingCards,
      ],
      () =>
        Promise.all([
          db.games.toArray(),
          db.gameContents.toArray(),
          // Only what the owner wrote: a position without notes or tags is
          // nothing but a key, which the games give back on restore.
          db.positions.filter((position) => position.notes !== "" || position.tags.length > 0).toArray(),
          db.evaluations.toArray(),
          db.repertoireMoves.toArray(),
          // The review history cannot be derived from anything else, so unlike
          // the per-game analysis it travels with the snapshot.
          db.trainingCards.toArray(),
        ]),
    );

  return {
    format: SNAPSHOT_FORMAT,
    schemaVersion: db.verno,
    createdAt: Date.now(),
    device,
    data: {
      games,
      gameContents,
      positions,
      evaluations,
      repertoireMoves,
      trainingCards,
    },
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

  if (
    typeof snapshot.schemaVersion !== "number" ||
    !Number.isInteger(snapshot.schemaVersion) ||
    snapshot.schemaVersion < 1
  ) {
    throw new SnapshotError("This snapshot does not say which app version wrote it.");
  }

  if (snapshot.schemaVersion > db.verno) {
    // An older snapshot is carried forward on restore, but a newer one cannot
    // be carried back: its records may hold fields this build has never heard
    // of, and writing them in would drop what it does not understand.
    throw new SnapshotError(
      `This snapshot was written by a newer version of ChessVault (schema ${snapshot.schemaVersion}, this app uses ${db.verno}). Update this app first.`,
    );
  }

  if (typeof snapshot.data !== "object" || snapshot.data === null) {
    throw new SnapshotError("This snapshot is missing its data.");
  }

  const tables: (keyof Snapshot["data"])[] = [
    "games",
    "gameContents",
    "positions",
    "evaluations",
    "repertoireMoves",
    // Format 1 carried the position index; later formats rebuild it.
    ...(snapshot.format === 1 ? (["gamePositions"] as const) : []),
  ];
  for (const table of tables) {
    if (!Array.isArray(snapshot.data[table])) {
      throw new SnapshotError(`This snapshot is missing its ${table}.`);
    }
  }

  // Optional, being newer than the format; but present and malformed is wrong.
  if (snapshot.data.trainingCards !== undefined && !Array.isArray(snapshot.data.trainingCards)) {
    throw new SnapshotError("This snapshot's training cards are unreadable.");
  }
}

/** Games handed to the indexer at a time when rebuilding the position index. */
const REBUILD_CHUNK = 250;

/**
 * Rebuild the position index from the games' PGN, as an import builds it.
 *
 * Annotated positions from the snapshot are laid over the rebuilt ones, so
 * their notes and tags survive — including on positions no game reaches any
 * more, whose annotations outlived the game that introduced them.
 *
 * Done before the restore transaction, never inside it: parsing thousands of
 * games is slow, and a transaction left waiting on it would be closed by the
 * browser.
 */
async function rebuildPositionIndex(
  gameContents: readonly GameContentRecord[],
  annotated: readonly PositionRecord[],
  indexer: GameIndexer,
): Promise<{ positions: PositionRecord[]; gamePositions: GamePositionRecord[] }> {
  const now = Date.now();
  const positions = new Map<string, PositionRecord>();
  const gamePositions: GamePositionRecord[] = [];

  for (let start = 0; start < gameContents.length; start += REBUILD_CHUNK) {
    const chunk = gameContents
      .slice(start, start + REBUILD_CHUNK)
      .map(({ gameId, pgn }) => ({ gameId, pgn }));

    for (const game of await indexer.index(chunk)) {
      for (const { ply, key, san } of game.positions) {
        gamePositions.push({ gameId: game.gameId, ply, key, san });
        if (!positions.has(key)) {
          positions.set(key, {
            key,
            sideToMove: sideToMoveOf(key),
            notes: "",
            tags: [],
            firstSeenAt: now,
          });
        }
      }
    }
  }

  for (const position of annotated) positions.set(position.key, position);

  return { positions: [...positions.values()], gamePositions };
}

/** Rows handed to IndexedDB at once while restoring. */
const WRITE_CHUNK = 5000;

/**
 * Add rows a chunk at a time, inside the caller's transaction.
 *
 * Every row added is copied into IndexedDB on the main thread, synchronously,
 * when the add is issued. One call for a whole collection's position index —
 * millions of rows at the target size — would hold the page for minutes;
 * waiting for each chunk before issuing the next lets it draw in between.
 * The transaction stays open throughout, since a request is always pending.
 */
async function addInChunks<Row>(table: Table<Row>, rows: readonly Row[]): Promise<void> {
  for (let start = 0; start < rows.length; start += WRITE_CHUNK) {
    await table.bulkAdd(rows.slice(start, start + WRITE_CHUNK));
  }
}

/**
 * Parse in a worker where there is one, so a restore does not freeze the
 * page — parsing a large collection takes minutes — and on the page where
 * there is not, or it fails.
 */
function defaultIndexer(): GameIndexer {
  return typeof Worker === "function"
    ? indexerWithFallback(() => workerIndexer(), inlineIndexer)
    : inlineIndexer();
}

/**
 * Replace the entire database and settings with a snapshot.
 *
 * All tables are cleared and rewritten inside one transaction, so the database
 * is never left half-replaced: either the whole snapshot lands or none of it
 * does. Settings are applied only after the transaction commits, so a failed
 * restore does not change them either.
 *
 * A snapshot from an older schema is brought up to date first, away from the
 * live database, so the one transaction that does touch it only ever writes
 * rows already in the current shape.
 *
 * @param options.indexer Where the position index is rebuilt; a worker where
 *   the browser has one.
 * @throws SnapshotError if the snapshot is not restorable.
 */
export async function restoreSnapshot(
  value: unknown,
  options: { indexer?: () => GameIndexer } = {},
): Promise<void> {
  assertRestorable(value);
  const snapshot: Snapshot =
    value.schemaVersion < db.verno
      ? {
          ...value,
          schemaVersion: db.verno,
          data: (await upgradeRows(value.data, value.schemaVersion)) as Snapshot["data"],
        }
      : value;

  // Read from the snapshot as written: an upgraded snapshot has every table,
  // the position index included, just empty.
  let { positions, gamePositions = [] } = snapshot.data;
  if (!Array.isArray(value.data.gamePositions)) {
    const indexer = (options.indexer ?? defaultIndexer)();
    try {
      ({ positions, gamePositions } = await rebuildPositionIndex(
        snapshot.data.gameContents,
        snapshot.data.positions,
        indexer,
      ));
    } finally {
      indexer.close();
    }
  }

  await db.transaction(
    "rw",
    [
      db.games,
      db.gameContents,
      db.positions,
      db.gamePositions,
      db.evaluations,
      db.repertoireMoves,
      db.gameAnalyses,
      db.trainingCards,
    ],
    async () => {
      await Promise.all([
        db.games.clear(),
        db.gameContents.clear(),
        db.positions.clear(),
        db.gamePositions.clear(),
        db.evaluations.clear(),
        db.repertoireMoves.clear(),
        // Derived from the games and evaluations being replaced, and keyed by
        // game ids that now belong to other games. Not carried in a snapshot;
        // the background analysis writes them again from the restored
        // evaluations.
        db.gameAnalyses.clear(),
        db.trainingCards.clear(),
      ]);

      await addInChunks(db.games, snapshot.data.games);
      await addInChunks(db.gameContents, snapshot.data.gameContents);
      await addInChunks(db.positions, positions);
      await addInChunks(db.gamePositions, gamePositions);
      await addInChunks(db.evaluations, snapshot.data.evaluations);
      await addInChunks(db.repertoireMoves, snapshot.data.repertoireMoves);
      await addInChunks(db.trainingCards, snapshot.data.trainingCards ?? []);
    },
  );

  saveSettings(snapshot.settings);
}
