import type { Color } from "@/core/domain/game";
import type { GameAnalysisRecord } from "@/core/domain/game-analysis";
import type { StatGame } from "@/core/statistics/statistics";
import { db } from "@/persistence/db";

export interface StatisticsSource {
  /** Every game the owner played, reduced to what the statistics read. */
  games: StatGame[];
  /**
   * Games in the database the owner is not recorded as playing.
   *
   * Stated rather than silently left out: a collection imported before the
   * owner's names were set has nothing attributed, and statistics built on
   * none of it would otherwise look like an empty record.
   */
  unattributed: number;
  /**
   * The engine analysis of each game that has one, by game id.
   *
   * Loaded in the same query as the games, so a statistics page left open
   * fills in as the background analysis finishes game after game.
   */
  analyses: Map<number, GameAnalysisRecord>;
}

/**
 * Load the games the statistics are built from.
 *
 * Read through the `playerColor` index, so games between other people are
 * never loaded at all, and streamed with `each` into slim objects, so a large
 * collection is never held as full records — the text of a game, its tags and
 * notes are the bulk of a record and none of them is a statistic.
 */
export async function loadStatisticsSource(): Promise<StatisticsSource> {
  const games: StatGame[] = [];

  await db.games
    .where("playerColor")
    .anyOf("white", "black")
    .each((game) => {
      games.push({
        id: game.id as number,
        result: game.result,
        playerColor: game.playerColor as Color,
        dateIso: game.dateIso,
        eco: game.eco,
        opening: game.opening,
        event: game.event,
        playerElo: game.playerElo,
        opponentElo: game.opponentElo,
      });
    });

  const [total, analyses] = await Promise.all([db.games.count(), db.gameAnalyses.toArray()]);

  return {
    games,
    unattributed: total - games.length,
    analyses: new Map(analyses.map((record) => [record.gameId, record])),
  };
}
