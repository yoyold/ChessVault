import { parseGame, PgnParseError } from "@/core/chess/pgn/parse-game";
import { splitPgnGames } from "@/core/chess/pgn/split-pgn";
import {
  persistGameBatch,
  type GameWithPositions,
} from "@/persistence/repositories/game-repository";
import { projectGame } from "./project-game";

export interface ImportFailure {
  /** Position of the game within the file, 1-based, so it can be located by hand. */
  gameNumber: number;
  reason: string;
  /** Opening characters of the offending game, to make it recognisable in a large file. */
  excerpt: string;
}

export interface ImportProgress {
  processed: number;
  total: number;
}

export interface ImportResult {
  total: number;
  imported: number;
  /** Games skipped because an identical PGN was already stored. */
  duplicates: number;
  failures: ImportFailure[];
}

export interface ImportOptions {
  ownerNames: readonly string[];
  /** Injected for deterministic tests. */
  now?: number;
  /**
   * Games per transaction.
   *
   * Trades memory against transaction overhead. Large enough that per-batch
   * cost is amortised, small enough that a batch's parsed positions stay a
   * bounded amount of memory regardless of file size.
   */
  batchSize?: number;
  onProgress?: (progress: ImportProgress) => void;
}

const DEFAULT_BATCH_SIZE = 200;

/**
 * Import every game in a PGN file.
 *
 * A single malformed game must never cost the user the rest of the file —
 * collections assembled over years routinely contain a few damaged entries, and
 * an all-or-nothing import would make them unusable. Failures are therefore
 * collected per game and reported, while valid games are stored.
 *
 * The file is processed in batches rather than parsed wholesale so that peak
 * memory depends on batch size, not file size. Progress is reported per batch,
 * which is what allows a long import to show movement instead of appearing hung.
 */
export async function importPgn(
  text: string,
  options: ImportOptions,
): Promise<ImportResult> {
  const {
    ownerNames,
    now = Date.now(),
    batchSize = DEFAULT_BATCH_SIZE,
    onProgress,
  } = options;

  const rawGames = splitPgnGames(text);

  const result: ImportResult = {
    total: rawGames.length,
    imported: 0,
    duplicates: 0,
    failures: [],
  };

  for (let start = 0; start < rawGames.length; start += batchSize) {
    const slice = rawGames.slice(start, start + batchSize);
    const batch: GameWithPositions[] = [];

    slice.forEach((pgn, offset) => {
      const gameNumber = start + offset + 1;

      try {
        const parsed = parseGame(pgn);
        batch.push({
          record: projectGame(pgn, parsed, { ownerNames, now }),
          positions: parsed.positions,
        });
      } catch (error) {
        result.failures.push({
          gameNumber,
          reason:
            error instanceof PgnParseError
              ? error.message
              : "Unexpected error while parsing",
          excerpt: pgn.slice(0, 120),
        });
      }
    });

    const { insertedIds, duplicates } = await persistGameBatch(batch);
    result.imported += insertedIds.length;
    result.duplicates += duplicates;

    onProgress?.({
      processed: Math.min(start + batchSize, rawGames.length),
      total: rawGames.length,
    });
  }

  return result;
}
