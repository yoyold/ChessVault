import type { PositionKey } from "@/core/chess/position-key";
import type { Color, GameRecord } from "@/core/domain/game";
import {
  summarisePosition,
  type ExplorerStats,
  type PositionVisit,
} from "@/core/openings/explorer";
import { db } from "@/persistence/db";
import { compareForSort } from "./game-query";

export interface ExplorerScope {
  /**
   * Restrict to games the database owner played with this colour.
   *
   * Left out, every game in the collection counts, including any imported game
   * the owner was not in. Those still say what is played here; they simply
   * contribute nothing to the record, which has no meaning without a side.
   */
  color?: Color;
}

export interface ExplorerPosition {
  stats: ExplorerStats;

  /**
   * The games that reached the position, newest first and capped.
   *
   * A popular position is reached by thousands of games and no one reads a
   * list that long; `stats.games` is the honest total, this is what is worth
   * putting on screen.
   */
  games: GameRecord[];
}

/**
 * How many games are returned for the list beneath the move table.
 *
 * The records are already in memory — they had to be read to compute the
 * record — so the cap is about what the interface can usefully show, not about
 * what it costs to fetch.
 */
export const EXPLORER_GAME_LIMIT = 100;

/**
 * Keys read per `bulkGet`, so a position reached by the entire collection
 * cannot build one enormous request.
 */
const LOOKUP_CHUNK_SIZE = 500;

/**
 * `bulkGet` in bounded chunks, preserving the order of the keys.
 *
 * Typed structurally rather than against Dexie's `Table`, because the two
 * tables read here are keyed differently — one by a number, one by a
 * `[gameId+ply]` tuple — and this only needs the one method they share.
 */
async function bulkGetChunked<T, K>(
  table: { bulkGet(keys: K[]): Promise<(T | undefined)[]> },
  keys: readonly K[],
): Promise<(T | undefined)[]> {
  const results: (T | undefined)[] = [];

  for (let offset = 0; offset < keys.length; offset += LOOKUP_CHUNK_SIZE) {
    const chunk = keys.slice(offset, offset + LOOKUP_CHUNK_SIZE);
    results.push(...(await table.bulkGet(chunk)));
  }

  return results;
}

/**
 * What the collection has played from one position.
 *
 * This is the opening-explorer query: given a position, which moves have
 * followed it, in how many games, and with what record. It reads the position
 * index rather than parsing PGN — `gamePositions` was built at import for
 * exactly this — so the answer costs two index lookups and a batch of game
 * records rather than a walk over every game in the database.
 *
 * The move played from the position is not stored on the position's own row:
 * `san` records the move that *produced* a position, so the continuation is the
 * row one ply later in the same game. That is a primary-key lookup, which is
 * why the ply is carried through rather than the key alone.
 *
 * A game that reaches the position twice — a repetition, or a transposition
 * back — is counted once, at its first arrival. Counting it twice would inflate
 * the position's popularity, and taking the later arrival would report a move
 * the game had already chosen against.
 */
export async function getExplorerPosition(
  key: PositionKey,
  scope: ExplorerScope = {},
): Promise<ExplorerPosition> {
  const occurrences = await db.gamePositions.where("key").equals(key).toArray();

  const firstPly = new Map<number, number>();

  for (const row of occurrences) {
    const seen = firstPly.get(row.gameId);
    if (seen === undefined || row.ply < seen) firstPly.set(row.gameId, row.ply);
  }

  const ids = [...firstPly.keys()];
  const loaded = await bulkGetChunked(db.games, ids);

  // Filtered before the follow-up lookup, so a narrow scope also narrows the
  // heavier half of the query rather than only the numbers at the end.
  const games = loaded.filter(
    (game): game is GameRecord =>
      game !== undefined &&
      (scope.color === undefined || game.playerColor === scope.color),
  );

  const followers = await bulkGetChunked(
    db.gamePositions,
    games.map((game): [number, number] => [
      game.id as number,
      (firstPly.get(game.id as number) as number) + 1,
    ]),
  );

  const visits: PositionVisit[] = games.map((game, index) => ({
    gameId: game.id as number,
    // No later row means the game ended here — checkmate, resignation, or
    // simply where the recorded moves stop.
    san: followers[index]?.san ?? null,
    result: game.result,
    playerColor: game.playerColor,
  }));

  const listed = [...games]
    .sort((a, b) => compareForSort(a, b, "date"))
    .slice(0, EXPLORER_GAME_LIMIT);

  return { stats: summarisePosition(visits), games: listed };
}
