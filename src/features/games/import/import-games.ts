import { persistGameBatch } from "@/persistence/repositories/game-repository";
import { inlineParser, type BatchParser, type ImportFailure } from "./batch-parser";

export type { ImportFailure } from "./batch-parser";

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
  /**
   * Where the games are parsed; on this thread unless given.
   *
   * The page passes a worker, so a large file does not freeze it. Closed when
   * the import ends, however it ends.
   */
  parser?: BatchParser;
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
    parser = inlineParser(),
  } = options;

  try {
    const total = await parser.open(text, { ownerNames, now });

    const result: ImportResult = { total, imported: 0, duplicates: 0, failures: [] };

    for (let start = 0; start < total; start += batchSize) {
      const { games, failures } = await parser.parse(start, batchSize);
      result.failures.push(...failures);

      const { insertedIds, duplicates } = await persistGameBatch(games);
      result.imported += insertedIds.length;
      result.duplicates += duplicates;

      onProgress?.({ processed: Math.min(start + batchSize, total), total });
    }

    return result;
  } finally {
    parser.close();
  }
}
