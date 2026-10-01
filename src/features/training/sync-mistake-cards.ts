import { mistakeCards } from "@/core/training/mistake-cards";
import { getGameAnalyses } from "@/persistence/repositories/game-analysis-repository";
import {
  loadMistakeSources,
  upsertCards,
  type UpsertResult,
} from "@/persistence/repositories/training-repository";

const WATERMARK_KEY = "chessvault.training.mistakesSyncedAt";

function readWatermark(): number {
  try {
    const value = Number(window.localStorage.getItem(WATERMARK_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeWatermark(value: number): void {
  try {
    window.localStorage.setItem(WATERMARK_KEY, String(value));
  } catch {
    // Without it the next sync simply looks at everything again; nothing is lost.
  }
}

/**
 * Turn newly analysed games into training cards.
 *
 * Incremental: only games analysed since the last sync are read, tracked by
 * the time each analysis was written. Reading every analysed game on every
 * visit would be fine for a hundred games and not for fifty thousand.
 *
 * The mark is kept per device, which is safe in both directions. Behind — on
 * a device that received cards through sync — it re-reads games whose cards
 * already exist, and the upsert leaves their progress alone. Ahead is not
 * possible for cards that matter: anything that replaces the analysis records,
 * a restore included, writes them again with a newer time than the mark.
 */
export async function syncMistakeCards(now: number = Date.now()): Promise<UpsertResult> {
  const since = readWatermark();
  const fresh = [...(await getGameAnalyses()).values()].filter(
    (analysis) => analysis.analysedAt > since,
  );

  if (fresh.length === 0) return { added: 0, updated: 0 };

  const sources = await loadMistakeSources(fresh);
  const result = await upsertCards(sources.flatMap(mistakeCards), now);

  writeWatermark(Math.max(...fresh.map((analysis) => analysis.analysedAt)));
  return result;
}
