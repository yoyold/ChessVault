import Dexie, { type EntityTable, type Table } from "dexie";
import type { GamePositionRecord, GameRecord } from "@/core/domain/game";
import type { PositionRecord } from "@/core/domain/position";

/**
 * The IndexedDB database backing the entire application.
 *
 * Schema rules are documented in ADR 0005. In short: never edit a released
 * `version(n)` block, add `version(n+1)`; only indexed properties belong in the
 * schema string; every index must answer a query the app actually makes.
 */
class ChessVaultDatabase extends Dexie {
  games!: EntityTable<GameRecord, "id">;
  positions!: EntityTable<PositionRecord, "key">;

  /** Compound primary key `[gameId+ply]`, so the key type is a tuple. */
  gamePositions!: Table<GamePositionRecord, [number, number]>;

  constructor() {
    super("chessvault");

    /**
     * Version 1 — games and the position database.
     *
     * The index set on `games` maps one-to-one onto the filters the game list
     * offers (opening, ECO, colour, result, date, opponent, tags, tournament,
     * time control). Indexes are not free: each one costs write throughput
     * during bulk import, which is by far the heaviest operation in the app,
     * so speculative indexes are omitted until a query needs them.
     *
     * `*tags` and `*searchTokens` are multi-entry: they index each array
     * element separately, which is what allows tag filtering and prefix search
     * to use an index instead of scanning.
     *
     * `[playerColor+result]` is compound because win-rate statistics filter on
     * both together; two separate indexes would force Dexie to intersect large
     * result sets in memory.
     */
    this.version(1).stores({
      games: [
        "++id",
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

      // `gameId` is indexed separately so deleting a game can find its rows;
      // `key` is the index that answers "which games reached this position?".
      gamePositions: "[gameId+ply], gameId, key",
    });
  }
}

/**
 * Process-wide database handle.
 *
 * Constructing a Dexie instance does not touch IndexedDB — the connection is
 * opened lazily on first query. That matters because this module is imported
 * during the static export build, where no IndexedDB exists. Any code that
 * *queries* the database must therefore run in the browser only (inside an
 * effect or event handler), never during render of a prerendered page.
 */
export const db = new ChessVaultDatabase();

export type { ChessVaultDatabase };
