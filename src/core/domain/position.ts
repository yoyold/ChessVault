import type { PositionKey } from "@/core/chess/position-key";

/**
 * A unique position, stored once no matter how many games reach it.
 *
 * Deduplication is the point: thousands of games share the same opening
 * positions, and transpositions converge. See ADR 0004.
 *
 * Note the absence of an occurrence counter. It would have to be maintained on
 * every import and every deletion, and a denormalised counter that drifts is
 * worse than no counter — the count is derivable from the `key` index on
 * `gamePositions`, which is a bounded index lookup rather than a scan.
 */
export interface PositionRecord {
  key: PositionKey;

  /**
   * Denormalised from the key purely so it can be indexed.
   *
   * IndexedDB indexes stored properties, not computed ones, and filtering
   * training positions by side to move is a routine query.
   *
   * Note the absence of a stored FEN: the key already carries everything that
   * identifies the position, and the missing move counters are by definition
   * not part of that identity. Use `fenFromPositionKey` when a board or the
   * engine needs a complete FEN.
   */
  sideToMove: "w" | "b";

  /** User annotations. Kept on the position so they survive deleting the game that introduced it. */
  notes: string;
  tags: string[];

  firstSeenAt: number;
}
