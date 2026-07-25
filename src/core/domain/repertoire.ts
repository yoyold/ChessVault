import { positionKeyFromFen, type PositionKey } from "@/core/chess/position-key";
import type { Color } from "./game";

/**
 * The position every repertoire is rooted at.
 *
 * Derived rather than written out, so it cannot drift from whatever the key
 * format is: a hand-copied string would silently stop matching if the key ever
 * gained or lost a field.
 */
export const REPERTOIRE_ROOT: PositionKey = positionKeyFromFen(
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
);

/**
 * One move in a personal opening repertoire.
 *
 * A repertoire is stored as a set of edges keyed by the position they start
 * from, not as a literal tree. Two lines that reach the same position therefore
 * share that position's outgoing moves automatically — transpositions, which a
 * plain move tree would duplicate and let drift out of sync, are deduplicated
 * for free. This is the same content-addressed idea as the position database
 * (see ADR 0004).
 *
 * Direction is not stored: whether a move is the owner's own choice or an
 * opponent reply to be prepared for is fully determined by whose turn it is in
 * the starting position and which colour the repertoire is for. See
 * {@link isOwnerToMove}.
 */
export interface RepertoireMove {
  /** Which repertoire this belongs to: the owner's White or Black repertoire. */
  color: Color;

  /** Position the move is played from. */
  fromKey: PositionKey;

  /** The move in SAN, and the position it reaches. */
  san: string;
  uci: string;
  toKey: PositionKey;

  /** The owner's note on this move. */
  note: string;

  /**
   * Ordering weight among sibling moves, higher first.
   *
   * At an owner-to-move position this marks the main line versus alternatives;
   * at an opponent position it marks which replies are most important to know.
   */
  priority: number;

  addedAt: number;
}

/**
 * Whether the side to move in a position is the repertoire's owner.
 *
 * In the White repertoire the owner is on the move in White-to-move positions;
 * in the Black repertoire, in Black-to-move positions. This is what separates
 * "the move I intend to play" from "the reply I must be ready for".
 */
export function isOwnerToMove(color: Color, sideToMove: "w" | "b"): boolean {
  return color === "white" ? sideToMove === "w" : sideToMove === "b";
}
