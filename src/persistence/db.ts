import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  GameContentRecord,
  GamePositionRecord,
  GameRecord,
} from "@/core/domain/game";
import type { PositionRecord } from "@/core/domain/position";
import type { EvaluationRecord } from "@/core/domain/evaluation";
import { opponentPerspective, parseElo } from "@/core/domain/player-perspective";

/**
 * Records are moved between tables in bounded chunks during migration.
 *
 * A migration must run on a database holding tens of thousands of games
 * without exhausting memory, which rules out reading the table into an array.
 */
const MIGRATION_CHUNK_SIZE = 500;

/**
 * Shape of a game record as version 1 stored it: text inline, and a null date
 * where the PGN gave none.
 */
interface GameRecordV1 extends Omit<GameRecord, "dateIso"> {
  pgn: string;
  headers: Record<string, string>;
  dateIso: string | null;
}

/**
 * The IndexedDB database backing the entire application.
 *
 * Schema rules are documented in ADR 0005. In short: never edit a released
 * `version(n)` block, add `version(n+1)`; only indexed properties belong in the
 * schema string; every index must answer a query the app actually makes.
 */
export class ChessVaultDatabase extends Dexie {
  games!: EntityTable<GameRecord, "id">;
  gameContents!: EntityTable<GameContentRecord, "gameId">;
  positions!: EntityTable<PositionRecord, "key">;
  evaluations!: EntityTable<EvaluationRecord, "key">;

  /** Compound primary key `[gameId+ply]`, so the key type is a tuple. */
  gamePositions!: Table<GamePositionRecord, [number, number]>;

  /**
   * @param name Overridable so migration tests can open an isolated database
   *   under a throwaway name. Application code always uses the default.
   */
  constructor(name = "chessvault") {
    super(name);

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
        // Not unique: it narrows candidates for the duplicate check, which then
        // compares PGN text. A unique index would let a hash collision reject a
        // genuinely different game.
        "contentHash",
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

    /**
     * Version 2 — move PGN text and headers out of `games`, and replace null
     * dates with an empty string.
     *
     * IndexedDB drives a query from a single index, so any combination of
     * filters leaves Dexie deserialising candidate records to evaluate the
     * remaining predicates. With multi-kilobyte PGN text in the row, every
     * filter change paid to deserialise text the list never shows. Splitting it
     * out keeps the filtered table small and the list responsive at the game
     * counts this project targets.
     *
     * `gameContents` needs no secondary indexes: it is only ever read by
     * primary key, when a single game is opened.
     *
     * The date rewrite fixes a correctness bug rather than a performance one:
     * IndexedDB does not index null, so games imported without a usable date
     * were absent from the date index and disappeared from the list entirely
     * when browsing by date. See GameRecord.dateIso.
     */
    this.version(2)
      .stores({ gameContents: "gameId" })
      .upgrade(async (tx) => {
        const games = tx.table<GameRecordV1, number>("games");
        const contents = tx.table<GameContentRecord, number>("gameContents");

        // Paged by primary key rather than by offset: `offset(n)` makes
        // IndexedDB walk from the start of the table on each call, which is
        // quadratic over the whole table. Seeking past the last id read keeps
        // it linear. Chunking also bounds memory, so this survives a database
        // far larger than fits in one array.
        //
        // The dominant cost is not the paging but rewriting `games`, since
        // every updated row means deleting and reinserting its index entries
        // across fifteen indexes. Measured against real IndexedDB that is
        // roughly 250ms per thousand games, so a very large collection spends
        // some seconds inside this upgrade on first open after the update.
        // (Under fake-indexeddb in tests it is about twenty times slower, which
        // is a property of that implementation rather than of this code.)
        let lastId = 0;

        for (;;) {
          const batch = await games
            .where(":id")
            .above(lastId)
            .limit(MIGRATION_CHUNK_SIZE)
            .toArray();

          if (batch.length === 0) break;

          lastId = batch[batch.length - 1].id as number;

          await contents.bulkPut(
            batch.map((game) => ({
              gameId: game.id as number,
              pgn: game.pgn,
              headers: game.headers,
            })),
          );

          await games.bulkPut(
            batch.map((game) => {
              const metadata: Partial<GameRecordV1> = { ...game };
              delete metadata.pgn;
              delete metadata.headers;
              metadata.dateIso = game.dateIso ?? "";
              return metadata as GameRecordV1;
            }),
          );
        }
      });

    /**
     * Version 3 — stored engine evaluations.
     *
     * Purely additive, so no upgrade function is needed: Dexie creates the
     * table and existing data is untouched.
     *
     * `depth` is indexed to support finding positions worth re-analysing more
     * deeply. `evaluatedAt` is indexed so evaluations from a superseded engine
     * build can be found and refreshed.
     */
    this.version(3).stores({
      evaluations: "key, depth, evaluatedAt",
    });

    /**
     * Version 4 — player ratings and the derived opponent.
     *
     * `opponent` and `opponentElo` are derived from which side the owner played,
     * and are stored rather than computed because IndexedDB can only index a
     * stored property, and both are filtered and sorted on.
     *
     * Existing games are backfilled from their PGN headers. Those headers were
     * kept verbatim on import precisely so that a projection added later can be
     * recovered without asking the user to import everything again.
     */
    this.version(4)
      .stores({
        games: [
          "++id",
          "contentHash",
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
          "opponent",
          "opponentElo",
          "*tags",
          "*searchTokens",
          "[playerColor+result]",
        ].join(", "),
      })
      .upgrade(async (tx) => {
        const games = tx.table<GameRecord & { id: number }, number>("games");
        const contents = tx.table<GameContentRecord, number>("gameContents");

        let lastId = 0;

        for (;;) {
          const batch = await games
            .where(":id")
            .above(lastId)
            .limit(MIGRATION_CHUNK_SIZE)
            .toArray();

          if (batch.length === 0) break;

          lastId = batch[batch.length - 1].id;

          const texts = await contents.bulkGet(batch.map((game) => game.id));

          await games.bulkPut(
            batch.map((game, index) => {
              const headers = texts[index]?.headers ?? {};

              const whiteElo = parseElo(headers.WhiteElo);
              const blackElo = parseElo(headers.BlackElo);

              return {
                ...game,
                whiteElo,
                blackElo,
                ...opponentPerspective(game.playerColor, game, { whiteElo, blackElo }),
              };
            }),
          );
        }
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
