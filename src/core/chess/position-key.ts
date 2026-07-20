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
 * Derive the position key from a FEN string of unknown origin.
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

/**
 * Derive the position key from a FEN that chess.js itself produced.
 *
 * Only valid for FENs emitted by chess.js (`fen()`, or the `before`/`after`
 * fields of a verbose history entry), which are already en-passant normalised.
 * It skips parsing entirely, which matters because import calls this once per
 * ply — millions of times across a large collection.
 *
 * For any FEN that came from a file, a user, or another library, use
 * {@link positionKeyFromFen} instead: passing an unnormalised FEN here would
 * silently produce a key that fails to match its transpositions.
 */
export function positionKeyFromEngineFen(fen: string): PositionKey {
  const [placement, sideToMove, castling, epSquare] = fen.split(" ");
  return `${placement} ${sideToMove} ${castling} ${epSquare}` as PositionKey;
}

/** The side to move encoded in a position key. */
export function sideToMoveOf(key: PositionKey): "w" | "b" {
  return key.split(" ")[1] as "w" | "b";
}

/**
 * Expand a position key into a complete FEN, for setting up a board or handing
 * the position to the engine.
 *
 * The halfmove clock and fullmove number are set to `0 1` because the position
 * database does not model them: they are not part of a position's identity, so
 * every game reaching this position — with whatever clock — maps to the same
 * row. Storing one arbitrary game's counters would imply a precision the shared
 * row cannot have.
 *
 * Where the counters genuinely matter — fifty-move adjudication when analysing
 * one specific game — use that game's own FEN from replaying its PGN, not this.
 */
export function fenFromPositionKey(key: PositionKey): string {
  return `${key} 0 1`;
}
