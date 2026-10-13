import { parseGame, PgnParseError, type ParsedPosition } from "@/core/chess/pgn/parse-game";
import { splitPgnGames } from "@/core/chess/pgn/split-pgn";
import type { GameWithPositions } from "@/persistence/repositories/game-repository";
import { projectGame } from "./project-game";

export interface ImportFailure {
  /** Position of the game within the file, 1-based, so it can be located by hand. */
  gameNumber: number;
  reason: string;
  /** Opening characters of the offending game, to make it recognisable in a large file. */
  excerpt: string;
}

export interface ParsedBatch {
  games: GameWithPositions[];
  failures: ImportFailure[];
}

export interface ParseOptions {
  ownerNames: readonly string[];
  now: number;
}

/**
 * Parse a run of games from a file, ready to be written.
 *
 * A game that cannot be read is reported and skipped, never allowed to cost
 * the rest of the batch.
 *
 * @param firstGameNumber The 1-based number of the first game, for reports.
 */
export function parseBatch(
  rawGames: readonly string[],
  firstGameNumber: number,
  { ownerNames, now }: ParseOptions,
): ParsedBatch {
  const batch: ParsedBatch = { games: [], failures: [] };

  rawGames.forEach((pgn, offset) => {
    try {
      const parsed = parseGame(pgn);
      const projected = projectGame(pgn, parsed, { ownerNames, now });
      batch.games.push({
        record: projected.record,
        content: projected.content,
        positions: parsed.positions,
      });
    } catch (error) {
      batch.failures.push({
        gameNumber: firstGameNumber + offset,
        reason:
          error instanceof PgnParseError ? error.message : "Unexpected error while parsing",
        excerpt: pgn.slice(0, 120),
      });
    }
  });

  return batch;
}

/**
 * Where an import's games are parsed.
 *
 * Parsing is the expensive part of an import — every move of every game is
 * checked for legality and every position keyed — so it can be moved off the
 * main thread. Writing stays with the caller, which asks for one batch at a
 * time: the parser never runs ahead of what has been stored, so a large file
 * is never held parsed in memory all at once.
 */
export interface BatchParser {
  /** Take a file, returning how many games it holds. */
  open(text: string, options: ParseOptions): Promise<number>;
  /** Parse games `start` to `start + count` of the open file. */
  parse(start: number, count: number): Promise<ParsedBatch>;
  /** Release whatever the parser holds. */
  close(): void;
}

/** Parse on the calling thread. */
export function inlineParser(): BatchParser {
  let rawGames: string[] = [];
  let options: ParseOptions = { ownerNames: [], now: 0 };

  return {
    async open(text, parseOptions) {
      rawGames = splitPgnGames(text);
      options = parseOptions;
      return rawGames.length;
    },
    async parse(start, count) {
      return parseBatch(rawGames.slice(start, start + count), start + 1, options);
    },
    close() {
      rawGames = [];
    },
  };
}

/**
 * Use one parser, or another if the first cannot even start.
 *
 * For the worker: should a browser refuse to run it, the import still goes
 * ahead on the page — slower to look at, but done. Only a failure to open
 * falls back; one in the middle of a file is reported, since part of it is
 * already stored and starting again elsewhere would only hide what went wrong.
 */
export function withFallback(
  primary: () => BatchParser,
  fallback: () => BatchParser,
): BatchParser {
  let active: BatchParser | null = null;

  return {
    async open(text, options) {
      try {
        active = primary();
        return await active.open(text, options);
      } catch {
        active?.close();
        active = fallback();
        return active.open(text, options);
      }
    },
    parse(start, count) {
      if (!active) return Promise.reject(new Error("Nothing to parse: no file is open."));
      return active.parse(start, count);
    },
    close() {
      active?.close();
      active = null;
    },
  };
}

/** A stored game's text, to find its positions again. */
export interface GameText {
  gameId: number;
  pgn: string;
}

export interface IndexedGame {
  gameId: number;
  /** Every position along the game, as an import records them. */
  positions: ParsedPosition[];
}

/**
 * The positions of each game, for rebuilding the position index.
 *
 * A game whose text cannot be read gets none: it was imported or edited from
 * that same text, so this does not happen in practice, and if it ever does,
 * losing the game itself would be worse than not finding it by position.
 */
export function indexGames(games: readonly GameText[]): IndexedGame[] {
  return games.map(({ gameId, pgn }) => {
    try {
      return { gameId, positions: parseGame(pgn).positions };
    } catch {
      return { gameId, positions: [] };
    }
  });
}

/** Where stored games are parsed again, the counterpart of {@link BatchParser}. */
export interface GameIndexer {
  index(games: readonly GameText[]): Promise<IndexedGame[]>;
  close(): void;
}

/** Index on the calling thread, pausing after each call so the page can draw. */
export function inlineIndexer(): GameIndexer {
  return {
    async index(games) {
      const indexed = indexGames(games);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return indexed;
    },
    close() {},
  };
}

/**
 * Use one indexer, or another from the first call that fails.
 *
 * Unlike an import, indexing can switch at any point: it only reads the games
 * it is given and stores nothing, so a chunk that failed in the worker is
 * simply indexed again on the page.
 */
export function indexerWithFallback(
  primary: () => GameIndexer,
  fallback: () => GameIndexer,
): GameIndexer {
  let active: GameIndexer | null = null;
  let fellBack = false;

  return {
    async index(games) {
      if (!fellBack) {
        try {
          active ??= primary();
          return await active.index(games);
        } catch {
          active?.close();
          fellBack = true;
          active = fallback();
        }
      }
      active ??= fallback();
      return active.index(games);
    },
    close() {
      active?.close();
      active = null;
    },
  };
}
