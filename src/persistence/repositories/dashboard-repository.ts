import type { ColourSummary } from "@/core/analysis/game-report";
import type { Color, GameResult } from "@/core/domain/game";
import { db } from "@/persistence/db";

export interface RecentGame {
  id: number;
  result: GameResult;
  playerColor: Color;
  opponent: string | null;
  opponentElo: number | null;
  playerElo: number | null;
  /** `YYYY-MM-DD`, or empty when the game carries no usable date. */
  dateIso: string;
  opening: string | null;
  eco: string | null;
  /** How the owner's own moves went, once the game is analysed. */
  analysis: ColourSummary | null;
}

/**
 * The owner's most recent games, newest first, with how they played in each.
 *
 * Walked down the date index and stopped as soon as enough are found, so the
 * cost is the handful shown, not the size of the collection. Games without a
 * date sort before every dated one, so walking backwards reaches them last.
 */
export async function getRecentGames(limit: number): Promise<RecentGame[]> {
  const games = await db.games
    .orderBy("dateIso")
    .reverse()
    .filter((game) => game.playerColor !== null)
    .limit(limit)
    .toArray();

  const analyses = await db.gameAnalyses.bulkGet(games.map((game) => game.id as number));

  return games.map((game, index) => {
    const playerColor = game.playerColor as Color;
    return {
      id: game.id as number,
      result: game.result,
      playerColor,
      opponent: game.opponent,
      opponentElo: game.opponentElo,
      playerElo: game.playerElo,
      dateIso: game.dateIso,
      opening: game.opening,
      eco: game.eco,
      analysis: analyses[index]?.[playerColor] ?? null,
    };
  });
}
