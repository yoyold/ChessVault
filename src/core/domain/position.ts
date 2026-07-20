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
   * A full FEN for this position, from the first game that reached it.
   *
   * The key omits move counters, so a complete FEN is kept to set up a board or
   * hand a position to the engine. The counters are informational only: any two
   * games reaching this position agree on everything the key covers.
   */
  fen: string;

  sideToMove: "w" | "b";

  /** User annotations. Kept on the position so they survive deleting the game that introduced it. */
  notes: string;
  tags: string[];

  firstSeenAt: number;
}
