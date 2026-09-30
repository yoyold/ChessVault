import type { GameAnalysisRecord } from "@/core/domain/game-analysis";
import { db } from "@/persistence/db";

export interface GameToAnalyse {
  id: number;
  white: string;
  black: string;
  dateIso: string;
}

/**
 * The games the background analysis works through: the owner's, newest first.
 *
 * Only the owner's, because everything the analysis feeds is about their own
 * play — a master game in the collection has nothing to say about it. Newest
 * first, because a partly analysed collection is most useful when the part
 * that is done is the part that reflects how they play now.
 */
export async function listGamesToAnalyse(): Promise<GameToAnalyse[]> {
  const games: GameToAnalyse[] = [];

  await db.games
    .where("playerColor")
    .anyOf("white", "black")
    .each((game) => {
      games.push({ id: game.id as number, white: game.white, black: game.black, dateIso: game.dateIso });
    });

  // Undated games sort last: an empty string is smaller than any date.
  return games.sort((a, b) => b.dateIso.localeCompare(a.dateIso) || b.id - a.id);
}

export async function saveGameAnalysis(record: GameAnalysisRecord): Promise<void> {
  await db.gameAnalyses.put(record);
}

/**
 * Every analysis record, by game.
 *
 * Read whole: one small record per game is what the statistics add up and what
 * the background analysis checks its progress against, and both want all of
 * them at once.
 */
export async function getGameAnalyses(): Promise<Map<number, GameAnalysisRecord>> {
  const records = await db.gameAnalyses.toArray();
  return new Map(records.map((record) => [record.gameId, record]));
}
