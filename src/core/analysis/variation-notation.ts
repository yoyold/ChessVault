import { Chess } from "chess.js";
import { formatMoveNumber } from "@/core/chess/pgn/game-timeline";

/**
 * Engine variations, written the way a player reads them.
 *
 * The engine speaks in coordinates — `g1f3` — which says where a piece went but
 * not what went there. Turning that into `Nf3` means knowing what stands on g1,
 * and knowing whether another knight could also have reached f3, so the line
 * has to be replayed on a board. There is no shortcut: the notation is a
 * property of the position, not of the move.
 */

/** Plies worth showing. Past a dozen the line is speculative anyway. */
const DEFAULT_MAX_PLIES = 12;

/**
 * The ply the side to move is about to play, counting from 1.
 *
 * Read from the FEN's own move counter rather than taken from the game: an
 * engine line can start anywhere, including inside a variation that has no
 * numbering of its own.
 */
export function plyFromFen(fen: string): number {
  const [, sideToMove, , , , fullMove] = fen.split(" ");
  const parsed = Number(fullMove);
  const counted = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

  return (counted - 1) * 2 + (sideToMove === "b" ? 2 : 1);
}

/**
 * Replay a UCI variation and return it in standard algebraic notation.
 *
 * Stops at the first move that will not play rather than throwing. A variation
 * arrives in fragments while the engine searches, and one left over from the
 * previous position can still be in hand when this runs — neither is worth
 * failing a render over, and a line cut short is honest about how much of it
 * could be read.
 */
export function variationToSan(
  fen: string,
  uciMoves: readonly string[],
  maxPlies: number = DEFAULT_MAX_PLIES,
): string[] {
  let board: Chess;

  try {
    board = new Chess(fen);
  } catch {
    return [];
  }

  const san: string[] = [];

  for (const uci of uciMoves.slice(0, maxPlies)) {
    if (uci.length < 4) break;

    try {
      const move = board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        // A fifth character is the piece a pawn promoted to.
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      san.push(move.san);
    } catch {
      break;
    }
  }

  return san;
}

/** A variation as one readable string, e.g. `24. Rf1 Kg7 25. Qe3`. */
export function formatVariation(
  fen: string,
  uciMoves: readonly string[],
  maxPlies?: number,
): string {
  const start = plyFromFen(fen);

  return variationToSan(fen, uciMoves, maxPlies)
    .map((move, index) => {
      // A number before every White move, and before the first move whatever
      // its colour: a line opening with Black's reply would otherwise read as
      // though White had played it.
      const numbered = (start + index) % 2 === 1 || index === 0;

      return numbered ? `${formatMoveNumber(start + index)} ${move}` : move;
    })
    .join(" ");
}
