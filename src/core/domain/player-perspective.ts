import type { Color } from "./game";

/**
 * Parse a rating tag.
 *
 * Absent, empty, non-numeric and non-positive values all mean "unknown".
 * Ratings appear as `""`, `"0"` and `"?"` in real files, and treating any of
 * those as a real rating would corrupt averages and rating filters.
 */
export function parseElo(raw: string | undefined | null): number | null {
  if (!raw) return null;

  const value = Number.parseInt(raw.trim(), 10);

  return Number.isFinite(value) && value > 0 ? value : null;
}

export interface OpponentPerspective {
  /** The other player's name, or null for a game the owner did not play. */
  opponent: string | null;
  opponentElo: number | null;
  /** The owner's own rating in this game. */
  playerElo: number | null;
}

/**
 * Work out who the opponent was, from the owner's point of view.
 *
 * Shared by import and by schema migration so the two cannot drift apart and
 * produce differently-shaped records for the same game.
 *
 * For a game the owner did not play, "opponent" has no meaning and every field
 * is null — rather than arbitrarily naming one side, which would quietly
 * pollute an opponent filter with players the user never faced.
 */
export function opponentPerspective(
  playerColor: Color | null,
  players: { white: string; black: string },
  ratings: { whiteElo: number | null; blackElo: number | null },
): OpponentPerspective {
  if (playerColor === "white") {
    return {
      opponent: players.black || null,
      opponentElo: ratings.blackElo,
      playerElo: ratings.whiteElo,
    };
  }

  if (playerColor === "black") {
    return {
      opponent: players.white || null,
      opponentElo: ratings.whiteElo,
      playerElo: ratings.blackElo,
    };
  }

  return { opponent: null, opponentElo: null, playerElo: null };
}
