import type { Color, GameResult } from "./game";

export type GameOutcome = "win" | "draw" | "loss";

/**
 * How a game turned out for the database owner.
 *
 * Returns null when the question does not apply: an unfinished game has no
 * outcome, and a game the owner did not play has no "their" result at all.
 * Colouring such rows by the bare result would say "you won" about a game
 * between two other people.
 */
export function outcomeFor(
  playerColor: Color | null,
  result: GameResult,
): GameOutcome | null {
  if (playerColor === null) return null;
  if (result === "*") return null;
  if (result === "1/2-1/2") return "draw";

  const ownerWon = playerColor === "white" ? result === "1-0" : result === "0-1";

  return ownerWon ? "win" : "loss";
}
