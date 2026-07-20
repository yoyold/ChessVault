import { Chess } from "chess.js";

/**
 * A normalised, transposition-safe identifier for a chess position.
 *
 * Format: the first four FEN fields — piece placement, side to move, castling
 * rights, en-passant square — separated by spaces. The halfmove clock and
 * fullmove number are omitted: they describe the path taken to a position, not
 * the position itself, and including them would defeat deduplication entirely.
 *
 * The branded type prevents a raw FEN from being passed where a key is
 * expected; the two are similar enough to confuse and differ in exactly the way
 * that breaks deduplication silently.
 */
export type PositionKey = string & { readonly __brand: "PositionKey" };

/**
 * Derive the position key from a game instance.
 *
 * Prefer this over {@link positionKeyFromFen} when replaying a game: it reuses
 * the existing instance rather than re-parsing a FEN for every ply.
 *
 * Correctness of this key depends on the en-passant square being set only when
 * an en-passant capture is genuinely legal — otherwise identical positions
 * reached by different move orders would produce different keys and
 * transposition detection would silently fail (see ADR 0004). chess.js
 * guarantees this on FEN output, including the case where the capturing pawn is
 * pinned. `position-key.test.ts` asserts that guarantee, so a change in that
 * behaviour fails the build rather than quietly corrupting the database.
 */
export function positionKey(chess: Chess): PositionKey {
  const [placement, sideToMove, castling, epSquare] = chess.fen().split(" ");
  return `${placement} ${sideToMove} ${castling} ${epSquare}` as PositionKey;
}

/**
 * Derive the position key from a FEN string.
 *
 * Round-tripping through chess.js is deliberate: it normalises the en-passant
 * field of a hand-written or third-party FEN, which may set the square even
 * when no capture is available.
 *
 * @throws if the FEN does not describe a valid position.
 */
export function positionKeyFromFen(fen: string): PositionKey {
  return positionKey(new Chess(fen));
}

/** The side to move encoded in a position key. */
export function sideToMoveOf(key: PositionKey): "w" | "b" {
  return key.split(" ")[1] as "w" | "b";
}
