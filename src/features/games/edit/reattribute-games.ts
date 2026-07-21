import { matchesAnyPlayer } from "@/core/chess/player-identity";
import { opponentPerspective, parseElo } from "@/core/domain/player-perspective";
import type { Color, GameRecord } from "@/core/domain/game";
import { db } from "@/persistence/db";

/** Games are rewritten in bounded batches so a large collection cannot exhaust memory. */
const BATCH_SIZE = 500;

export interface ReattributionResult {
  examined: number;
  /** Games whose attribution actually changed. */
  updated: number;
}

/**
 * Recompute which side the owner played, for games already stored.
 *
 * Attribution is decided at import time from the names configured in settings.
 * A collection imported before those names were set — or before a spelling was
 * added — is stored with no colour, and therefore no opponent, no opponent
 * rating, and no win or loss. Nothing in the file changed, so re-importing
 * would not help; the projection simply needs redoing.
 *
 * Ratings are re-read from the stored headers at the same time, since they feed
 * the same derived fields.
 *
 * @param ownerNames Names the owner plays under, from settings.
 */
export async function reattributeGames(
  ownerNames: readonly string[],
): Promise<ReattributionResult> {
  let examined = 0;
  let updated = 0;
  let lastId = 0;

  for (;;) {
    const batch = await db.games.where(":id").above(lastId).limit(BATCH_SIZE).toArray();
    if (batch.length === 0) break;

    lastId = batch[batch.length - 1].id as number;
    examined += batch.length;

    const contents = await db.gameContents.bulkGet(
      batch.map((game) => game.id as number),
    );

    const changed: GameRecord[] = [];

    batch.forEach((game, index) => {
      const headers = contents[index]?.headers ?? {};

      let playerColor: Color | null = null;
      if (matchesAnyPlayer(game.white, ownerNames)) playerColor = "white";
      else if (matchesAnyPlayer(game.black, ownerNames)) playerColor = "black";

      const whiteElo = parseElo(headers.WhiteElo) ?? game.whiteElo;
      const blackElo = parseElo(headers.BlackElo) ?? game.blackElo;

      const perspective = opponentPerspective(
        playerColor,
        { white: game.white, black: game.black },
        { whiteElo, blackElo },
      );

      const next: GameRecord = { ...game, playerColor, whiteElo, blackElo, ...perspective };

      // Only rewritten when something actually differs: an unnecessary write
      // costs index maintenance on every row and would make the operation look
      // like it changed far more than it did.
      const differs =
        next.playerColor !== game.playerColor ||
        next.opponent !== game.opponent ||
        next.opponentElo !== game.opponentElo ||
        next.playerElo !== game.playerElo ||
        next.whiteElo !== game.whiteElo ||
        next.blackElo !== game.blackElo;

      if (differs) changed.push(next);
    });

    if (changed.length > 0) {
      await db.games.bulkPut(changed);
      updated += changed.length;
    }
  }

  return { examined, updated };
}
