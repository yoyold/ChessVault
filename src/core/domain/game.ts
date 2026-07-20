import type { PositionKey } from "@/core/chess/position-key";

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export type Color = "white" | "black";

/**
 * The searchable, filterable metadata of a game.
 *
 * Every field here is a projection of the PGN, denormalised so the game list
 * can filter and sort without reparsing. The PGN itself lives in
 * {@link GameContentRecord}, deliberately: IndexedDB can drive a query from
 * only one index, so any combination of filters means Dexie deserialises
 * candidate records to evaluate the rest in memory. Keeping multi-kilobyte PGN
 * text in this table would make every filter change pay for text the list never
 * displays. Splitting it keeps the hot table roughly an order of magnitude
 * smaller.
 *
 * If a projection and the PGN ever disagree, the PGN wins and the projection is
 * rebuilt.
 */
export interface GameRecord {
  id?: number;

  /**
   * Fingerprint of the PGN text, used to recognise a game already imported.
   *
   * Indexed but not unique: it narrows the candidates for a duplicate check,
   * which then compares actual PGN text. A unique index would make a hash
   * collision reject a legitimately different game outright.
   *
   * Kept in this table rather than alongside the PGN so the duplicate lookup
   * itself never touches the large table.
   */
  contentHash: string;

  white: string;
  black: string;
  result: GameResult;

  /**
   * Sortable date as `YYYY-MM-DD`, or `""` when the PGN gave none.
   *
   * PGN dates are frequently partial (`2024.??.??`). Unknown components are
   * zero-filled to `YYYY-01-01` so the field stays lexicographically sortable
   * and range-queryable as a plain indexed string. This loses precision, which
   * is why the raw `Date` tag is retained in the headers — the projection is
   * for querying, the header for truth.
   *
   * Absence is an empty string rather than null because **IndexedDB does not
   * index null**: a null here would drop the game out of the date index
   * entirely, making undated games invisible when browsing by date rather than
   * merely unordered. An empty string is indexed, and sorts before every real
   * date, so in the newest-first order the list presents it lands last — which
   * is where an unknown date belongs.
   */
  dateIso: string;

  event: string | null;
  site: string | null;
  round: string | null;

  eco: string | null;
  opening: string | null;
  timeControl: string | null;

  /** Which side the database owner played, or null for games they were not in. */
  playerColor: Color | null;

  tags: string[];
  notes: string;

  plyCount: number;

  /** Position after the final move; lets the list render a thumbnail without replaying. */
  finalFen: string;

  /**
   * Lowercased tokens from players, event, site and opening.
   *
   * IndexedDB has no full-text search. A multi-entry index over tokens gives
   * prefix matching through a real index instead of scanning every record,
   * which is what keeps search interactive at the target collection size.
   * Rebuilt whenever the fields it derives from change.
   */
  searchTokens: string[];

  importedAt: number;
  updatedAt: number;
}

/**
 * The full text of a game, kept apart from its metadata.
 *
 * Read only when a single game is opened, never while filtering or listing.
 * See the note on {@link GameRecord} for why the split exists.
 */
export interface GameContentRecord {
  /** Primary key, matching the `id` of the corresponding {@link GameRecord}. */
  gameId: number;

  /** The original PGN text of this single game, exactly as imported. */
  pgn: string;

  /**
   * All PGN tag pairs, preserved losslessly including non-standard ones.
   *
   * The typed fields on {@link GameRecord} cover what the application filters
   * on; this keeps everything else (Annotator, Variant, clock tags,
   * site-specific ratings) available for export and future features without a
   * schema change.
   */
  headers: Record<string, string>;
}

/**
 * One occurrence of a position within a game.
 *
 * Primary key is `[gameId+ply]`, which makes a game's occurrences contiguous
 * and cheap to delete as a range.
 */
export interface GamePositionRecord {
  gameId: number;

  /** 0 is the initial position, before White's first move. */
  ply: number;

  key: PositionKey;

  /**
   * The move that produced this position in SAN, or null at ply 0.
   *
   * Storing it here lets repertoire extraction and line reconstruction walk
   * games through the index without reparsing PGN.
   */
  san: string | null;
}
