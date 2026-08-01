import { Chess, type Square } from "chess.js";

/**
 * The squares a piece may legally move to.
 *
 * Needed to show where a selected piece can go. Clicking a piece and then a
 * square is a guess without it — the player has to know what the selection
 * offers before choosing, which is the whole difference between picking a move
 * and trying one.
 *
 * Returns nothing rather than throwing for a position or square it cannot
 * read: this answers a question about the interface, and a board that shows no
 * hints is a smaller failure than one that will not render.
 */
export function legalTargets(fen: string, from: string): string[] {
  try {
    const board = new Chess(fen);

    // Deduplicated because a promotion is four moves to the same square, and
    // the square is what is being asked about. The cast is checked at runtime
    // by chess.js, which throws for a square name it does not recognise.
    const moves = board.moves({ square: from as Square, verbose: true });

    return [...new Set(moves.map((move) => move.to))];
  } catch {
    return [];
  }
}
