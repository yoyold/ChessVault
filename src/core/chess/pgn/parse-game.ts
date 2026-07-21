import type { PositionKey } from "@/core/chess/position-key";
import { mainline, parseGameTree } from "./parse-tree";

export { PgnParseError } from "./errors";

export interface ParsedPosition {
  /** 0 is the position before White's first move. */
  ply: number;
  key: PositionKey;
  /** The move producing this position, in SAN; null at ply 0. */
  san: string | null;
}

export interface ParsedGame {
  headers: Record<string, string>;
  sanMoves: string[];
  positions: ParsedPosition[];
  /** Position after the final move, or the starting position for a game with no moves. */
  finalFen: string;
  plyCount: number;
}

/**
 * Parse a single game's PGN into the data the import pipeline persists.
 *
 * Only the mainline is recorded here. Comments and variations are parsed and
 * available through {@link parseGameTree}, and the original PGN is stored
 * verbatim, so nothing is discarded — but the position database indexes the
 * game as it was actually played, not the analysis around it.
 *
 * @throws PgnParseError if the movetext is not legal chess.
 */
export function parseGame(pgn: string): ParsedGame {
  const tree = parseGameTree(pgn);
  const line = mainline(tree.root);

  return {
    headers: tree.headers,
    sanMoves: line.slice(1).map((node) => node.san as string),
    positions: line.map((node) => ({
      ply: node.ply,
      key: node.key,
      san: node.san,
    })),
    finalFen: line[line.length - 1].fen,
    plyCount: line.length - 1,
  };
}
