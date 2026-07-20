import type { Color, GameRecord, GameResult } from "@/core/domain/game";
import { db } from "@/persistence/db";

/**
 * Derived rather than written out: the primary key is optional on the record,
 * so Dexie's own collection type carries `number | undefined` and a hand-built
 * annotation drifts out of agreement with it.
 */
type GameCollection = ReturnType<typeof db.games.toCollection>;

export interface GameFilter {
  /** Prefix match against the token index, covering players, event, site and opening. */
  text?: string;
  eco?: string;
  opening?: string;
  colour?: Color;
  result?: GameResult;
  event?: string;
  timeControl?: string;
  tag?: string;
  /** Matches either side, since the opponent may have had either colour. */
  opponent?: string;
  /** Inclusive `YYYY-MM-DD` bounds. */
  dateFrom?: string;
  dateTo?: string;
}

export type GameSort = "date" | "imported";

const SORT_INDEX: Record<GameSort, keyof GameRecord & string> = {
  date: "dateIso",
  imported: "importedAt",
};

/**
 * Fields the driving index has already applied, so the in-memory predicate can
 * skip them.
 */
type Applied = Set<keyof GameFilter>;

function isEmpty(filter: GameFilter): boolean {
  return Object.values(filter).every(
    (value) => value === undefined || value === "",
  );
}

/**
 * Pick the index that drives the query.
 *
 * IndexedDB can use exactly one index per query, so one filter is served by an
 * index and the rest are evaluated in memory over what it returns. The order
 * here is by expected selectivity: a text search or a tag usually narrows a
 * collection far more than a result or a colour, and the narrower the driving
 * index, the fewer records are deserialised for the remaining predicates.
 */
function selectDrivingCollection(
  filter: GameFilter,
): { collection: GameCollection; applied: Applied } {
  const applied: Applied = new Set();

  if (filter.text) {
    applied.add("text");
    // Stored tokens are already lowercased, so a lowercased prefix matches
    // through the index rather than through a case-insensitive scan.
    return {
      collection: db.games
        .where("searchTokens")
        .startsWith(filter.text.toLowerCase()),
      applied,
    };
  }

  if (filter.tag) {
    applied.add("tag");
    return { collection: db.games.where("tags").equals(filter.tag), applied };
  }

  if (filter.eco) {
    applied.add("eco");
    return { collection: db.games.where("eco").equals(filter.eco), applied };
  }

  if (filter.event) {
    applied.add("event");
    return { collection: db.games.where("event").equals(filter.event), applied };
  }

  if (filter.dateFrom || filter.dateTo) {
    applied.add("dateFrom");
    applied.add("dateTo");
    // Open-ended bounds use the extremes of the stored format rather than
    // undefined, so a one-sided range still uses the index.
    return {
      collection: db.games
        .where("dateIso")
        .between(filter.dateFrom ?? "0000-01-01", filter.dateTo ?? "9999-12-31", true, true),
      applied,
    };
  }

  if (filter.colour && filter.result) {
    applied.add("colour");
    applied.add("result");
    // The compound index avoids intersecting two large sets in memory.
    return {
      collection: db.games
        .where("[playerColor+result]")
        .equals([filter.colour, filter.result]),
      applied,
    };
  }

  if (filter.colour) {
    applied.add("colour");
    return {
      collection: db.games.where("playerColor").equals(filter.colour),
      applied,
    };
  }

  if (filter.result) {
    applied.add("result");
    return { collection: db.games.where("result").equals(filter.result), applied };
  }

  if (filter.timeControl) {
    applied.add("timeControl");
    return {
      collection: db.games.where("timeControl").equals(filter.timeControl),
      applied,
    };
  }

  if (filter.opening) {
    applied.add("opening");
    return {
      collection: db.games.where("opening").equals(filter.opening),
      applied,
    };
  }

  // Nothing indexable: walk the whole table.
  return { collection: db.games.toCollection(), applied };
}

/** Predicate for every filter the driving index did not already apply. */
function buildPredicate(filter: GameFilter, applied: Applied) {
  return (game: GameRecord): boolean => {
    if (!applied.has("eco") && filter.eco && game.eco !== filter.eco) return false;
    if (!applied.has("opening") && filter.opening && game.opening !== filter.opening) {
      return false;
    }
    if (!applied.has("colour") && filter.colour && game.playerColor !== filter.colour) {
      return false;
    }
    if (!applied.has("result") && filter.result && game.result !== filter.result) {
      return false;
    }
    if (!applied.has("event") && filter.event && game.event !== filter.event) {
      return false;
    }
    if (
      !applied.has("timeControl") &&
      filter.timeControl &&
      game.timeControl !== filter.timeControl
    ) {
      return false;
    }
    if (!applied.has("tag") && filter.tag && !game.tags.includes(filter.tag)) {
      return false;
    }

    // An undated game (empty string) satisfies no range: it cannot be shown to
    // fall inside one, and including it would misrepresent the filter.
    if (!applied.has("dateFrom") && filter.dateFrom) {
      if (game.dateIso === "" || game.dateIso < filter.dateFrom) return false;
    }
    if (!applied.has("dateTo") && filter.dateTo) {
      if (game.dateIso === "" || game.dateIso > filter.dateTo) return false;
    }

    if (!applied.has("text") && filter.text) {
      const needle = filter.text.toLowerCase();
      if (!game.searchTokens.some((token) => token.startsWith(needle))) return false;
    }

    if (filter.opponent) {
      // Either side: the opponent's colour is not known in advance, and for a
      // game the owner did not play, "opponent" simply means either player.
      const needle = filter.opponent.toLowerCase();
      const matches =
        game.white.toLowerCase().includes(needle) ||
        game.black.toLowerCase().includes(needle);
      if (!matches) return false;
    }

    return true;
  };
}

/**
 * Ids of the games matching a filter, in display order.
 *
 * Ids rather than records: the list is virtualised, so it needs the full
 * ordered set to size the scrollbar and map a scroll position to a row, but
 * only the handful of visible rows as records. Fetching those is
 * {@link getGamesByIds}.
 *
 * With no filter this reads the sort index alone and never materialises a
 * record, which is the common case of simply browsing the collection.
 */
export async function queryGameIds(
  filter: GameFilter = {},
  sort: GameSort = "date",
): Promise<number[]> {
  const index = SORT_INDEX[sort];

  if (isEmpty(filter)) {
    // Newest first. `primaryKeys` walks the index without reading records.
    return (await db.games.orderBy(index).reverse().primaryKeys()) as number[];
  }

  const { collection, applied } = selectDrivingCollection(filter);

  const matches = await collection.filter(buildPredicate(filter, applied)).toArray();

  // Sorting happens here rather than through an index because the driving
  // index is chosen for selectivity, not for order. This is affordable only
  // because the metadata table holds no PGN text; see GameRecord.
  matches.sort((a, b) => compareForSort(a, b, sort));

  return matches.map((game) => game.id as number);
}

/**
 * Order used when a filter forces sorting in memory.
 *
 * Must agree with the index-only path, which reverses ascending order: an
 * empty date sorts before every real one ascending, so it lands last here.
 */
function compareForSort(a: GameRecord, b: GameRecord, sort: GameSort): number {
  if (sort === "imported") return b.importedAt - a.importedAt;

  if (a.dateIso === b.dateIso) return b.importedAt - a.importedAt;

  // Undated games last, rather than treated as ancient and buried under
  // everything else.
  if (a.dateIso === "") return 1;
  if (b.dateIso === "") return -1;

  return a.dateIso < b.dateIso ? 1 : -1;
}

/** Load the records for a window of ids, preserving the given order. */
export async function getGamesByIds(ids: readonly number[]): Promise<GameRecord[]> {
  if (ids.length === 0) return [];

  const games = await db.games.bulkGet([...ids]);

  return games.filter((game): game is GameRecord => game !== undefined);
}

/** Distinct values of a field, for populating filter dropdowns. */
export async function distinctValues(
  field: "eco" | "event" | "timeControl" | "opening",
): Promise<string[]> {
  // `uniqueKeys` reads the index directly and never touches a record.
  const keys = await db.games.orderBy(field).uniqueKeys();

  return keys.filter((key): key is string => typeof key === "string" && key !== "");
}

/** All tags in use, for the tag filter. */
export async function distinctTags(): Promise<string[]> {
  const keys = await db.games.orderBy("tags").uniqueKeys();

  return keys.filter((key): key is string => typeof key === "string");
}
