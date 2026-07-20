import type { GameContentRecord, GameRecord } from "@/core/domain/game";
import type { PositionRecord } from "@/core/domain/position";
import type { ParsedPosition } from "@/core/chess/pgn/parse-game";
import { sideToMoveOf } from "@/core/chess/position-key";
import { db } from "@/persistence/db";

/** A game ready to be written, together with its text and the positions it reached. */
export interface GameWithPositions {
  record: GameRecord;
  content: Omit<GameContentRecord, "gameId">;
  positions: readonly ParsedPosition[];
}

export interface PersistBatchResult {
  insertedIds: number[];
  /** Games skipped because an identical PGN was already stored. */
  duplicates: number;
}

/**
 * Write a batch of games, their text and their positions in one transaction.
 *
 * Batching is what makes large imports viable: IndexedDB transaction overhead
 * dominates per-game writes, and a file of several thousand games written one
 * transaction at a time is an order of magnitude slower. A batch also gives
 * clean failure semantics — a batch either lands completely or not at all,
 * never leaving a game stored without its text or its positions.
 */
export async function persistGameBatch(
  batch: readonly GameWithPositions[],
): Promise<PersistBatchResult> {
  if (batch.length === 0) return { insertedIds: [], duplicates: 0 };

  return db.transaction(
    "rw",
    [db.games, db.gameContents, db.positions, db.gamePositions],
    async () => {
      const fresh = await rejectDuplicates(batch);
      const duplicates = batch.length - fresh.length;

      if (fresh.length === 0) return { insertedIds: [], duplicates };

      const insertedIds = (await db.games.bulkAdd(
        fresh.map((entry) => entry.record),
        { allKeys: true },
      )) as number[];

      await Promise.all([
        db.gameContents.bulkAdd(
          fresh.map((entry, index) => ({
            gameId: insertedIds[index],
            ...entry.content,
          })),
        ),
        insertNewPositions(fresh),
        insertOccurrences(fresh, insertedIds),
      ]);

      return { insertedIds, duplicates };
    },
  );
}

/**
 * Drop games already present in the database, and duplicates within the batch.
 *
 * The stored hash narrows candidates; actual PGN text decides. A hash collision
 * therefore costs one string comparison, and can never discard a genuinely
 * different game.
 *
 * Only the handful of games sharing a hash have their text loaded, which is why
 * the hash lives on the metadata record: the lookup that rules out the vast
 * majority never touches the large table.
 */
async function rejectDuplicates(
  batch: readonly GameWithPositions[],
): Promise<GameWithPositions[]> {
  const hashes = [...new Set(batch.map((entry) => entry.record.contentHash))];

  const candidates = await db.games.where("contentHash").anyOf(hashes).toArray();

  const candidateTexts = await db.gameContents.bulkGet(
    candidates.map((game) => game.id as number),
  );

  const storedPgnByHash = new Map<string, Set<string>>();

  candidates.forEach((game, index) => {
    const pgn = candidateTexts[index]?.pgn;
    if (pgn === undefined) return;

    const bucket = storedPgnByHash.get(game.contentHash) ?? new Set<string>();
    bucket.add(pgn);
    storedPgnByHash.set(game.contentHash, bucket);
  });

  const fresh: GameWithPositions[] = [];

  for (const entry of batch) {
    const bucket =
      storedPgnByHash.get(entry.record.contentHash) ?? new Set<string>();

    if (bucket.has(entry.content.pgn)) continue;

    // Record it so a file containing the same game twice imports it once.
    bucket.add(entry.content.pgn);
    storedPgnByHash.set(entry.record.contentHash, bucket);
    fresh.push(entry);
  }

  return fresh;
}

/**
 * Add positions this batch reached that are not already stored.
 *
 * Deliberately `bulkAdd` of the missing ones rather than `bulkPut` of all:
 * positions carry user notes and tags, and re-importing a game must never
 * overwrite annotations written against a position it happens to reach.
 */
async function insertNewPositions(
  batch: readonly GameWithPositions[],
): Promise<void> {
  const keys = [
    ...new Set(batch.flatMap((entry) => entry.positions.map((p) => p.key))),
  ];

  const existing = await db.positions.bulkGet(keys);

  const now = Date.now();
  const missing: PositionRecord[] = [];

  keys.forEach((key, index) => {
    if (existing[index]) return;

    missing.push({
      key,
      sideToMove: sideToMoveOf(key),
      notes: "",
      tags: [],
      firstSeenAt: now,
    });
  });

  if (missing.length > 0) await db.positions.bulkAdd(missing);
}

/** Link each stored game to the positions it reached, ply by ply. */
async function insertOccurrences(
  batch: readonly GameWithPositions[],
  insertedIds: readonly number[],
): Promise<void> {
  const occurrences = batch.flatMap((entry, index) =>
    entry.positions.map((position) => ({
      gameId: insertedIds[index],
      ply: position.ply,
      key: position.key,
      san: position.san,
    })),
  );

  await db.gamePositions.bulkAdd(occurrences);
}

/** A game together with its text, as needed by the detail view. */
export interface FullGame {
  record: GameRecord;
  content: GameContentRecord;
}

/** Load one game including its PGN. Returns null if it does not exist. */
export async function getFullGame(id: number): Promise<FullGame | null> {
  const [record, content] = await Promise.all([
    db.games.get(id),
    db.gameContents.get(id),
  ]);

  if (!record || !content) return null;

  return { record, content };
}

/**
 * Delete a game, its text and its position occurrences.
 *
 * Unique positions are intentionally left in place: notes, tags and future
 * engine evaluations attached to a position stay valid after the game that
 * introduced it is gone. Orphaned positions are cheap; lost annotations are not.
 */
export async function deleteGame(id: number): Promise<void> {
  await db.transaction(
    "rw",
    [db.games, db.gameContents, db.gamePositions],
    async () => {
      await db.gamePositions.where("gameId").equals(id).delete();
      await db.gameContents.delete(id);
      await db.games.delete(id);
    },
  );
}

/** Games that reached a given position, most recently imported first. */
export async function findGamesByPosition(key: string): Promise<GameRecord[]> {
  const occurrences = await db.gamePositions.where("key").equals(key).toArray();
  const ids = [...new Set(occurrences.map((o) => o.gameId))];

  const games = await db.games.bulkGet(ids);

  return games
    .filter((game): game is GameRecord => game !== undefined)
    .sort((a, b) => b.importedAt - a.importedAt);
}
